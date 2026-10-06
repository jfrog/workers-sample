import { PlatformContext } from 'jfrog-workers';
import { BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from './types';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    // Configurable via the worker's "properties" (manifest.json / Platform UI); fall back to these defaults if unset
    // or if the platform errors out on an unknown property key instead of returning undefined.
    const maxCriticalIssues = parseInt(getProperty(context, 'maxCriticalIssues', '0'), 10);
    const claudeModel = getProperty(context, 'claudeModel', 'claude-haiku-4-5-20251001'); // fast model: this call is on the download path
    const claudeMaxTokens = parseInt(getProperty(context, 'claudeMaxTokens', '200'), 10);
    const claudeApiUrl = getProperty(context, 'claudeApiUrl', 'https://api.anthropic.com/v1/messages');
    const claudeApiVersion = getProperty(context, 'claudeApiVersion', '2023-06-01');

    if (!data.metadata?.repoPath) {
        return warn('Missing repoPath metadata on the download request. Download will proceed with warning.');
    }

    const isXrayAvailable = await checkIfXrayAvailable(context);
    if (!isXrayAvailable) {
        return warn('Could not check for Xray scans because Xray is not available. Download will proceed with warning.');
    }

    const repoPath = data.metadata.repoPath.path;
    const repoKey = data.metadata.repoPath.key;
    const artifactName = repoPath.slice(repoPath.lastIndexOf('/') + 1);
    const expectedRepoFullPath = `${repoKey}/${repoPath}`;

    let critical: number;
    try {
        const res = await context.clients.platformHttp.get(`/xray/api/v1/artifacts?repo=${repoKey}&search=${artifactName}&num_of_rows=100`);
        const responseData: XrayArtifactsSearchResponse = res.data;
        const scanResult = responseData?.data?.find(artifact => artifact.repo_full_path === expectedRepoFullPath);
        if (!scanResult) {
            return warn('Could not find an Xray scan result matching this artifact. Download will proceed with warning.');
        }
        critical = scanResult.sec_issues?.critical || 0;
    } catch (error: any) {
        console.error(`Xray artifact search failed: ${error.message}`);
        return warn('Error during scan check. Download will proceed with warning.');
    }

    // The decision is deterministic: Claude never decides whether a download is blocked, it only explains it.
    if (critical <= maxCriticalIssues) {
        return { status: DownloadStatus.DOWNLOAD_PROCEED, message: `Artifact has ${critical} critical security issues (limit ${maxCriticalIssues}): proceed with the download.`, headers: {} };
    }

    const blockedMessage = `DOWNLOAD STOPPED: ${expectedRepoFullPath} has ${critical} critical security issues (limit ${maxCriticalIssues}).`;

    // Clients send HEAD and checksum requests too; only spend a Claude call on the actual download.
    if (data.metadata.headOnly || data.metadata.checksum) {
        return stop(blockedMessage);
    }

    let message = blockedMessage;
    const anthropicApiKey = context.secrets.get('AnthropicApiKey');
    if (!anthropicApiKey) {
        console.warn('AnthropicApiKey secret not configured; returning the static block message.');
    } else {
        try {
            const issues = await getCriticalIssues(context, repoKey, repoPath);
            const explanation = await askClaudeToExplainBlock(context, anthropicApiKey, claudeModel, claudeMaxTokens, claudeApiUrl, claudeApiVersion, artifactName, critical, maxCriticalIssues, issues);
            message = `${blockedMessage} ${explanation}`;
        } catch (error: any) {
            console.error(`Failed to generate AI explanation: ${error.message}`);
        }
    }

    // Many clients only show the HTTP status of a blocked download, so also send the explanation to Slack.
    await notifySlack(context, `${data.userContext?.isToken ? 'Token' : 'User'} ${data.userContext?.id}`, message);
    return stop(message);
}

async function notifySlack(context: PlatformContext, blockedFor: string, message: string): Promise<void> {
    const slackWebhookUrl = context.secrets.get('Slack_URL');
    if (!slackWebhookUrl) {
        return;
    }
    try {
        await context.clients.axios.post(slackWebhookUrl, { text: `*Download blocked* for ${blockedFor}\n${message}` });
    } catch (error: any) {
        console.warn(`Failed to post block notification to Slack: ${error.message}`);
    }
}

function warn(message: string): BeforeDownloadResponse {
    return { status: DownloadStatus.DOWNLOAD_WARN, message, headers: {} };
}

function stop(message: string): BeforeDownloadResponse {
    return { status: DownloadStatus.DOWNLOAD_STOP, message, headers: {} };
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

async function checkIfXrayAvailable(context: PlatformContext): Promise<boolean> {
    try {
        const response = await context.clients.platformHttp.get('/xray/api/v1/system/ping');
        return response.data?.status === 'pong';
    } catch (error: any) {
        console.log(`Encountered error ${error.message} while checking for Xray readiness.`);
        return false;
    }
}

// The artifacts search only returns counts; the summary API gives the CVEs, and each issue summary states the
// affected version range (e.g. "jackson-databind before 2.9.10"), which is what Claude needs to suggest an upgrade.
// Best effort: Claude can still explain from counts alone.
async function getCriticalIssues(context: PlatformContext, repoKey: string, repoPath: string): Promise<string[]> {
    try {
        const res = await context.clients.platformHttp.post('/xray/api/v1/summary/artifact', { paths: [`default/${repoKey}/${repoPath}`] });
        const summary: XrayArtifactSummaryResponse = res.data;
        const artifact = summary?.artifacts?.[0];
        const issues = (artifact?.issues || [])
            .filter(issue => issue.severity === 'Critical')
            // All of them: an upgrade advised from a partial list can still be vulnerable. Capped only to bound the prompt.
            .slice(0, 30)
            .map(issue => {
                const cves = (issue.cves || []).map(c => c.cve).filter(Boolean).join(', ');
                return `${cves || issue.issue_id}: ${(issue.summary || '').slice(0, 300)}`;
            });
        const componentId = artifact?.general?.component_id;
        return componentId && issues.length ? [`Component: ${componentId}`, ...issues] : issues;
    } catch (error: any) {
        console.warn(`Xray artifact summary failed, explaining from counts only: ${error.message}`);
        return [];
    }
}

async function askClaudeToExplainBlock(
    context: PlatformContext,
    anthropicApiKey: string,
    claudeModel: string,
    claudeMaxTokens: number,
    claudeApiUrl: string,
    claudeApiVersion: string,
    artifactName: string,
    critical: number,
    maxCriticalIssues: number,
    issues: string[]
): Promise<string> {
    const prompt = `A developer's download of an artifact from JFrog Artifactory was just blocked by a security policy. Their package manager will print your answer as the error message. In at most 2 short sentences and plain text (no markdown, no line breaks), tell them the main reason and the most useful next step. Only recommend a specific version if it is above every affected version range listed below (a range "through X" includes X); otherwise tell them to upgrade to the latest release. Do not invent CVEs or versions that are not listed below.\n\nArtifact: ${artifactName}\nPolicy: at most ${maxCriticalIssues} critical security issues allowed\nCritical security issues found: ${critical}\n${issues.length ? `Details:\n- ${issues.join('\n- ')}` : 'No further details available.'}`;

    // No client-side timeout: the Workers runtime rejects axios' 'timeout' option and has no clearTimeout,
    // and a pending timer promise left by Promise.race fails the execution. Latency is bounded by the fast
    // model, the small max_tokens, and the platform's execution time limit.
    const res = await context.clients.axios.post(claudeApiUrl, {
        model: claudeModel,
        max_tokens: claudeMaxTokens,
        messages: [{ role: 'user', content: prompt }]
    }, {
        headers: {
            'x-api-key': anthropicApiKey,
            'anthropic-version': claudeApiVersion,
            'content-type': 'application/json'
        }
    });

    const text = res.data?.content?.[0]?.text;
    if (!text) {
        throw new Error('Claude response did not contain any text content.');
    }
    // The message ends up in a client error output: keep it on one line.
    return text.replace(/\s+/g, ' ').trim();
}

// Declared here rather than in types.ts: 'jf worker deploy' only uploads worker.ts and compiles it
// against the platform's own event types.
interface XrayArtifact {
    name: string;
    repo_path: string;
    repo_full_path: string;
    sec_issues: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        total: number;
    };
    violations: number;
}

interface XrayArtifactsSearchResponse {
    data: XrayArtifact[];
    offset: number;
}

/** Subset of POST /xray/api/v1/summary/artifact used by this worker */
interface XrayArtifactSummaryResponse {
    artifacts: Array<{
        general?: { component_id?: string };
        issues: Array<{
            issue_id: string;
            summary: string;
            severity: string;
            cves?: Array<{ cve?: string }>;
        }>;
    }>;
}
