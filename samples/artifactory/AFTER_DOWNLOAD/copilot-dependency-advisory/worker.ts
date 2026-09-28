import { PlatformContext } from 'jfrog-workers';
import { AfterDownloadRequest, AfterDownloadResponse } from './types';

// Artifact properties (set on the artifact itself in Artifactory, e.g. via `jf rt sp` or the UI)
// that opt an artifact into this advisory. An artifact without both is a NOP - this worker never
// picks a target repo on its own.
const REPO_PROPERTY = 'copilot.advisor.repo'; // e.g. "myorg/dependency-catalog"
const BASE_BRANCH_PROPERTY = 'copilot.advisor.repoBaseBranch'; // e.g. "main"
// Written back onto the artifact once an issue has been opened for it, so dedupe lives on the
// artifact itself rather than in the worker's own state (which is capped at a handful of small
// key-value pairs - not a fit for "remember every artifact ever downloaded").
const NOTIFIED_PROPERTY = 'copilot.advisor.notified';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // Configurable via the worker's "properties" (manifest.json / Platform UI); fall back to this default if unset
    // or if the platform errors out on an unknown property key instead of returning undefined.
    const githubApiUrl = getProperty(context, 'githubApiUrl', 'https://api.github.com');
    const githubApiVersion = getProperty(context, 'githubApiVersion', '2022-11-28');

    const repoPath = data.metadata?.repoPath;
    if (!repoPath) {
        return { message: 'Missing repoPath metadata on the download request.' };
    }

    let artifactProperties: Record<string, string[]>;
    try {
        artifactProperties = await getArtifactProperties(context, repoPath.key, repoPath.path, [REPO_PROPERTY, BASE_BRANCH_PROPERTY, NOTIFIED_PROPERTY]);
    } catch (error: any) {
        console.error(`Failed to read artifact properties: ${error.message}`);
        return { message: `Failed to read artifact properties: ${error.message}` };
    }

    const githubRepo = artifactProperties[REPO_PROPERTY]?.[0];
    const githubBaseBranch = artifactProperties[BASE_BRANCH_PROPERTY]?.[0];
    if (!githubRepo || !githubBaseBranch) {
        return { message: `Artifact is not opted in (missing '${REPO_PROPERTY}' and/or '${BASE_BRANCH_PROPERTY}' property); skipped Copilot advisory.` };
    }

    // ponytail: no locking, so two downloads of the same never-before-notified artifact within the
    // same instant could both pass this check and each open an issue. Narrow, per-artifact race -
    // add a conditional/atomic property write if that duplicate is ever a real problem.
    if (artifactProperties[NOTIFIED_PROPERTY]?.[0] === 'true') {
        return { message: 'Artifact already notified before; skipped Copilot advisory.' };
    }

    const githubToken = context.secrets.get('GitHubToken');
    if (!githubToken) {
        return { message: 'New dependency detected but GitHubToken secret is not configured; skipped Copilot advisory.' };
    }

    const artifactName = repoPath.path.slice(repoPath.path.lastIndexOf('/') + 1);
    const downloadedBy = `${data.userContext?.isToken ? 'token' : 'user'} ${data.userContext?.id}`;

    let issueNumber: number;
    try {
        issueNumber = await createGithubIssue(context, githubApiUrl, githubApiVersion, githubToken, githubRepo, artifactName, repoPath.key, downloadedBy);
    } catch (error: any) {
        console.error(`Failed to open a GitHub issue: ${error.message}`);
        return { message: `New dependency detected but failed to open a GitHub issue: ${error.message}` };
    }

    // The issue exists at this point regardless of what happens next, so record that on the
    // artifact now - a failed Copilot assignment (or a failure here) shouldn't be retried as a
    // brand new issue on the next download of this same artifact.
    try {
        await setNotifiedProperty(context, repoPath.key, repoPath.path);
    } catch (error: any) {
        console.warn(`Failed to record '${NOTIFIED_PROPERTY}' on the artifact: ${error.message}`);
    }

    try {
        await assignToCopilot(context, githubApiUrl, githubApiVersion, githubToken, githubRepo, issueNumber, githubBaseBranch);
        return { message: `New dependency detected: opened issue #${issueNumber} in ${githubRepo} and assigned it to Copilot.` };
    } catch (error: any) {
        console.warn(`Failed to assign issue #${issueNumber} to Copilot: ${error.message}`);
        return { message: `New dependency detected: opened issue #${issueNumber} in ${githubRepo}, but failed to assign it to Copilot.` };
    }
}

// Some platform versions throw instead of returning undefined when a property key isn't set yet
// (server-side bug, fixed but not deployed everywhere) - treat that the same as "unset".
function getProperty(context: PlatformContext, key: string, defaultValue: string): string {
    try {
        return context.properties.get(key) || defaultValue;
    } catch (error: any) {
        console.warn(`Failed to read property '${key}', using default '${defaultValue}': ${error.message}`);
        return defaultValue;
    }
}

// Reads the given properties off the downloaded artifact via Artifactory's Item Properties API:
// https://jfrog.com/help/r/jfrog-rest-apis/item-properties
// Artifactory returns 404 when none of the requested properties are set on this item - that's a
// normal "not opted in" outcome here, not an error.
async function getArtifactProperties(context: PlatformContext, repoKey: string, path: string, keys: string[]): Promise<Record<string, string[]>> {
    try {
        const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${repoKey}/${path}?properties=${keys.join(',')}`);
        return res.data?.properties || {};
    } catch (error: any) {
        if (error.status === 404) {
            return {};
        }
        throw error;
    }
}

// Writes the notified marker back onto the artifact via Artifactory's Set Item Properties API
// (same endpoint family as the read above): https://jfrog.com/help/r/jfrog-rest-apis/item-properties
async function setNotifiedProperty(context: PlatformContext, repoKey: string, path: string): Promise<void> {
    await context.clients.platformHttp.put(`/artifactory/api/storage/${repoKey}/${path}?properties=${NOTIFIED_PROPERTY}=true`);
}

async function createGithubIssue(
    context: PlatformContext,
    githubApiUrl: string,
    githubApiVersion: string,
    githubToken: string,
    githubRepo: string,
    artifactName: string,
    repoKey: string,
    downloadedBy: string
): Promise<number> {
    const res = await context.clients.axios.post(`${githubApiUrl}/repos/${githubRepo}/issues`, {
        title: `New dependency pulled: ${artifactName}`,
        body: `\`${artifactName}\` was downloaded from Artifactory repository \`${repoKey}\` for the first time (by ${downloadedBy}).\n\n` +
              `Could you vet this dependency - confirm it's an approved package, and add or update its usage notes in this repo if needed?`
    }, {
        headers: githubHeaders(githubToken, githubApiVersion)
    });

    const issueNumber = res.data?.number;
    if (!issueNumber) {
        throw new Error('GitHub response did not contain an issue number.');
    }
    return issueNumber;
}

// Assigning an issue to Copilot's coding agent is a dedicated endpoint, not a field on issue
// creation - see https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api.
// Requires a personal access token (Copilot usage is billed per-user); a GitHub App token won't work.
async function assignToCopilot(
    context: PlatformContext,
    githubApiUrl: string,
    githubApiVersion: string,
    githubToken: string,
    githubRepo: string,
    issueNumber: number,
    githubBaseBranch: string
): Promise<void> {
    await context.clients.axios.post(`${githubApiUrl}/repos/${githubRepo}/issues/${issueNumber}/assignees`, {
        assignees: ['copilot-swe-agent[bot]'],
        agent_assignment: {
            target_repo: githubRepo,
            base_branch: githubBaseBranch
        }
    }, {
        headers: githubHeaders(githubToken, githubApiVersion)
    });
}

function githubHeaders(githubToken: string, githubApiVersion: string): Record<string, string> {
    return {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': githubApiVersion
    };
}
