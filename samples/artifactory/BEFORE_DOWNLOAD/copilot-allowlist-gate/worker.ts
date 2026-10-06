import { PlatformContext } from 'jfrog-workers';
import { BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus, RepoPath } from './types';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    // Configurable via the worker's "properties" (manifest.json / Platform UI); fall back to these defaults if unset.
    const githubRepo = getProperty(context, 'githubRepo', '');
    const githubBranch = getProperty(context, 'githubBranch', 'main');
    const githubApiUrl = getProperty(context, 'githubApiUrl', 'https://api.github.com');
    const githubApiVersion = getProperty(context, 'githubApiVersion', '2022-11-28');
    // Artifact property written onto a blocked artifact once a review issue has been opened for it, so later
    // downloads point at the same issue instead of opening a new one each time.
    const issueProperty = getProperty(context, 'issueProperty', 'copilot.allowlist.issue');
    // What to do when the allowlist can't be read (GitHub down, rate limited, invalid file): WARN lets the
    // download through with a warning, STOP blocks it.
    const failStatus = getProperty(context, 'failMode', 'WARN').toUpperCase() === 'STOP' ? DownloadStatus.DOWNLOAD_STOP : DownloadStatus.DOWNLOAD_WARN;

    const repoPath = data.repoPath ?? data.metadata?.repoPath;
    if (!repoPath) {
        return { status: DownloadStatus.DOWNLOAD_WARN, message: 'Missing repoPath on the download request; allowlist not checked.' };
    }
    if (repoPath.isFolder) {
        return { status: DownloadStatus.DOWNLOAD_PROCEED, message: 'Folder request; allowlist not checked.' };
    }

    const githubToken = context.secrets.get('GitHubToken');
    if (!githubRepo || !githubToken) {
        return { status: DownloadStatus.DOWNLOAD_WARN, message: "Worker is not configured (missing 'githubRepo' property and/or 'GitHubToken' secret); allowlist not checked." };
    }

    const github: GithubTarget = { apiUrl: githubApiUrl, apiVersion: githubApiVersion, token: githubToken, repo: githubRepo, branch: githubBranch };
    const allowlistPath = getProperty(context, 'allowlistPath', 'approved-dependencies.json').replace('{repoKey}', repoPath.key);
    const artifact = `${repoPath.key}/${repoPath.path}`;

    let allowlist: string[];
    try {
        allowlist = await fetchAllowlist(context, github, allowlistPath);
    } catch (error: any) {
        console.error(`Failed to read allowlist ${githubRepo}/${allowlistPath}@${githubBranch}: ${error.message}`);
        return { status: failStatus, message: `Could not read allowlist ${githubRepo}/${allowlistPath}: ${error.message}` };
    }

    if (allowlist.some((pattern) => globToRegExp(pattern).test(artifact))) {
        return { status: DownloadStatus.DOWNLOAD_PROCEED, message: `${artifact} is allowlisted.` };
    }

    // Not allowlisted: the download is blocked whatever happens below; the rest only decides which
    // review issue the message points the user to.
    const blocked = `${artifact} is not in allowlist ${githubRepo}/${allowlistPath}`;

    let existingIssue: string | undefined;
    try {
        existingIssue = await getIssueProperty(context, repoPath, issueProperty);
    } catch (error: any) {
        console.error(`Failed to read '${issueProperty}' on ${artifact}: ${error.message}`);
        return { status: DownloadStatus.DOWNLOAD_STOP, message: `${blocked}.` };
    }
    if (existingIssue) {
        return { status: DownloadStatus.DOWNLOAD_STOP, message: `${blocked}; review pending in ${existingIssue}` };
    }

    let issue: { number: number, url: string };
    try {
        issue = await createReviewIssue(context, github, allowlistPath, artifact);
    } catch (error: any) {
        console.error(`Failed to open a review issue: ${error.message}`);
        return { status: DownloadStatus.DOWNLOAD_STOP, message: `${blocked}; failed to open a review issue: ${error.message}` };
    }

    try {
        await setIssueProperty(context, repoPath, issueProperty, issue.url);
    } catch (error: any) {
        console.warn(`Failed to record '${issueProperty}' on ${artifact}: ${error.message}`);
    }

    try {
        await assignToCopilot(context, github, issue.number);
        return { status: DownloadStatus.DOWNLOAD_STOP, message: `${blocked}; opened ${issue.url} and assigned it to Copilot.` };
    } catch (error: any) {
        console.warn(`Failed to assign issue #${issue.number} to Copilot: ${error.message}`);
        return { status: DownloadStatus.DOWNLOAD_STOP, message: `${blocked}; opened ${issue.url}, but failed to assign it to Copilot.` };
    }
}

type GithubTarget = { apiUrl: string, apiVersion: string, token: string, repo: string, branch: string };

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

// Reads the allowlist - a JSON array of globs - straight from the repo via the Contents API, using the raw
// media type so the body is the file itself rather than base64: https://docs.github.com/en/rest/repos/contents
// A missing file is an empty allowlist (everything blocked), so the first Copilot PR can create it.
// ponytail: one GitHub call per download, no cache. Mind the 5000 req/h PAT limit on busy repos; cache the
// file in context.state keyed by ETag if that becomes a problem.
async function fetchAllowlist(context: PlatformContext, github: GithubTarget, allowlistPath: string): Promise<string[]> {
    let body: any;
    try {
        const res = await context.clients.axios.get(`${github.apiUrl}/repos/${github.repo}/contents/${allowlistPath}?ref=${encodeURIComponent(github.branch)}`, {
            headers: { ...githubHeaders(github), 'Accept': 'application/vnd.github.raw+json' }
        });
        body = res.data;
    } catch (error: any) {
        if ((error.status ?? error.response?.status) === 404) {
            return [];
        }
        throw error;
    }

    const allowlist = typeof body === 'string' ? JSON.parse(body) : body;
    if (!Array.isArray(allowlist) || !allowlist.every((entry) => typeof entry === 'string')) {
        throw new Error('allowlist must be a JSON array of strings');
    }
    return allowlist;
}

// Matches "<repoKey>/<path>": "**" spans folders, "*" stays within one path segment, "?" is one character.
function globToRegExp(glob: string): RegExp {
    const source = glob
        .split('**')
        .map((part) => part
            .split('*')
            .map((sub) => sub.split('?').map(escapeRegExp).join('[^/]'))
            .join('[^/]*'))
        .join('.*');
    return new RegExp(`^${source}$`);
}

function escapeRegExp(text: string): string {
    return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

// Item Properties API: https://jfrog.com/help/r/jfrog-rest-apis/item-properties
// Artifactory returns 404 when the requested property isn't set - that just means no issue yet.
async function getIssueProperty(context: PlatformContext, repoPath: RepoPath, issueProperty: string): Promise<string | undefined> {
    try {
        const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${repoPath.key}/${repoPath.path}?properties=${issueProperty}`);
        return res.data?.properties?.[issueProperty]?.[0];
    } catch (error: any) {
        if (error.status === 404) {
            return undefined;
        }
        throw error;
    }
}

async function setIssueProperty(context: PlatformContext, repoPath: RepoPath, issueProperty: string, issueUrl: string): Promise<void> {
    await context.clients.platformHttp.put(`/artifactory/api/storage/${repoPath.key}/${repoPath.path}?properties=${issueProperty}=${encodeURIComponent(issueUrl)}`);
}

async function createReviewIssue(context: PlatformContext, github: GithubTarget, allowlistPath: string, artifact: string): Promise<{ number: number, url: string }> {
    const res = await context.clients.axios.post(`${github.apiUrl}/repos/${github.repo}/issues`, {
        title: `Allowlist review: ${artifact}`,
        body: `A download of \`${artifact}\` from Artifactory was blocked because it doesn't match any entry in \`${allowlistPath}\`.\n\n` +
              `Please vet this dependency (license, maintenance, known vulnerabilities). If it is acceptable, open a PR against \`${github.branch}\` ` +
              `that adds a glob matching it to \`${allowlistPath}\` (a JSON array of strings; \`*\` matches within a path segment, \`**\` across segments), ` +
              `and summarize your findings in the PR description. If it is not acceptable, explain why in this issue and don't open a PR.`
    }, {
        headers: githubHeaders(github)
    });

    const { number, html_url } = res.data ?? {};
    if (!number || !html_url) {
        throw new Error('GitHub response did not contain an issue number and URL.');
    }
    return { number, url: html_url };
}

// Assigning an issue to Copilot's coding agent is a dedicated endpoint, not a field on issue
// creation - see https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api.
// Requires a personal access token (Copilot usage is billed per-user); a GitHub App token won't work.
async function assignToCopilot(context: PlatformContext, github: GithubTarget, issueNumber: number): Promise<void> {
    await context.clients.axios.post(`${github.apiUrl}/repos/${github.repo}/issues/${issueNumber}/assignees`, {
        assignees: ['copilot-swe-agent[bot]'],
        agent_assignment: {
            target_repo: github.repo,
            base_branch: github.branch
        }
    }, {
        headers: githubHeaders(github)
    });
}

function githubHeaders(github: GithubTarget): Record<string, string> {
    return {
        'Authorization': `Bearer ${github.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': github.apiVersion
    };
}
