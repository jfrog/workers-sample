import { PlatformContext } from 'jfrog-workers';
import { AfterDownloadRequest, AfterDownloadResponse } from './types';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // Configurable via the worker's "properties" (manifest.json / Platform UI); fall back to these defaults if unset
    // or if the platform errors out on an unknown property key instead of returning undefined.
    const minIssuesForAiSummary = parseInt(getProperty(context, 'minIssuesForAiSummary', '1'), 10);
    const claudeModel = getProperty(context, 'claudeModel', 'claude-sonnet-5'); // e.g. 'claude-haiku-4-5-20251001' to cut cost
    const claudeMaxTokens = parseInt(getProperty(context, 'claudeMaxTokens', '300'), 10); // response is a short summary, keep this small
    const claudeApiUrl = getProperty(context, 'claudeApiUrl', 'https://api.anthropic.com/v1/messages');
    const claudeApiVersion = getProperty(context, 'claudeApiVersion', '2023-06-01');

    if (!data.metadata?.repoPath) {
        return { message: 'Missing repoPath metadata on the download request.' };
    }

    const isXrayAvailable = await checkIfXrayAvailable(context);
    if (!isXrayAvailable) {
        return { message: 'Could not check for Xray scans because Xray is not available.' };
    }

    const repoPath = data.metadata.repoPath.path;
    const repoKey = data.metadata.repoPath.key;
    const artifactName = repoPath.slice(repoPath.lastIndexOf('/') + 1);
    const expectedRepoFullPath = `${repoKey}/${repoPath}`;

    let scanResult;
    try {
        const res = await context.clients.platformHttp.get(`/xray/api/v1/artifacts?repo=${repoKey}&search=${artifactName}&num_of_rows=100`);
        const responseData: XrayArtifactsSearchResponse = res.data;
        scanResult = responseData?.data?.find(artifact => artifact.repo_full_path === expectedRepoFullPath);
    } catch (error: any) {
        console.error(`Xray artifact search failed: ${error.message}`);
    }

    if (!scanResult) {
        return { message: 'Could not find an Xray scan result matching this artifact.' };
    }

    const critical = scanResult.sec_issues?.critical || 0;
    const high = scanResult.sec_issues?.high || 0;
    const medium = scanResult.sec_issues?.medium || 0;
    const low = scanResult.sec_issues?.low || 0;
    const violations = scanResult.violations || 0;

    if (critical + high + medium + low + violations < minIssuesForAiSummary) {
        return { message: 'No security issues or violations found for this artifact; skipped AI risk advisory.' };
    }

    const rawStats = `Artifact: ${artifactName}\nRepository: ${repoKey}\nSecurity issues: ${critical} critical, ${high} high, ${medium} medium, ${low} low\nPolicy violations: ${violations}`;
    const downloadedBy = `${data.userContext?.isToken ? 'token' : 'user'} ${data.userContext?.id}`;

    const anthropicApiKey = context.secrets.get('AnthropicApiKey');
    let advisoryText: string;
    let message: string;
    let aiSummarySucceeded = false;

    if (!anthropicApiKey) {
        advisoryText = rawStats;
        message = 'AnthropicApiKey secret not configured; posted raw Xray stats instead of an AI summary.';
    } else {
        try {
            advisoryText = await askClaudeForRiskSummary(context, anthropicApiKey, claudeModel, claudeMaxTokens, claudeApiUrl, claudeApiVersion, artifactName, repoKey, { critical, high, medium, low }, violations);
            message = 'AI risk summary generated';
            aiSummarySucceeded = true;
        } catch (error: any) {
            console.error(`Claude API call failed: ${error.message}`);
            advisoryText = rawStats;
            message = 'Failed to generate AI risk summary; posted raw Xray stats to Slack instead.';
        }
    }

    const slackWebhookUrl = context.secrets.get('Slack_URL');
    if (!slackWebhookUrl) {
        return { message: aiSummarySucceeded ? `${message}; Slack_URL not configured, logged only.` : message };
    }

    try {
        await context.clients.axios.post(slackWebhookUrl, {
            text: `*Download risk advisory*\nArtifact \`${expectedRepoFullPath}\` downloaded by ${downloadedBy}:\n${advisoryText}`
        });
        return { message: aiSummarySucceeded ? `${message} and posted to Slack.` : message };
    } catch (error: any) {
        console.warn(`Failed to post advisory to Slack: ${error.message}`);
        return { message };
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

async function checkIfXrayAvailable(context: PlatformContext): Promise<boolean> {
    try {
        const response = await context.clients.platformHttp.get('/xray/api/v1/system/ping');
        return response.data?.status === 'pong';
    } catch (error: any) {
        console.log(`Encountered error ${error.message} while checking for Xray readiness.`);
        return false;
    }
}

async function askClaudeForRiskSummary(
    context: PlatformContext,
    anthropicApiKey: string,
    claudeModel: string,
    claudeMaxTokens: number,
    claudeApiUrl: string,
    claudeApiVersion: string,
    artifactName: string,
    repoKey: string,
    secIssues: { critical: number; high: number; medium: number; low: number },
    violations: number
): Promise<string> {
    const prompt = `An artifact was just downloaded from JFrog Artifactory. Summarize the risk for someone who is not a security expert, in 2-3 sentences, then give one line of recommended action.\n\nArtifact: ${artifactName}\nRepository: ${repoKey}\nSecurity issues: ${secIssues.critical} critical, ${secIssues.high} high, ${secIssues.medium} medium, ${secIssues.low} low\nPolicy violations: ${violations}`;

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
    return text;
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
