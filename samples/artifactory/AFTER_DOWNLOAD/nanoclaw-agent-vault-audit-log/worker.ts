import { PlatformContext } from 'jfrog-workers';
import { AfterDownloadRequest, AfterDownloadResponse, RepoType } from './types';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // MODIFY TO FIT YOUR NEEDS
    const AUDIT_SINK_URL_PROPERTY = 'auditSinkUrl';
    // Comma-separated allowlist of the Artifactory token identities registered in the OneCLI Agent
    // Vault for your NanoClaw agent groups (`onecli secrets create --value <token> ...`). Left empty
    // (the default), every download from a filtered repo is audited - set this only if that repo is
    // shared with non-NanoClaw traffic and you want to audit NanoClaw's activity specifically.
    const NANOCLAW_IDENTITIES_PROPERTY = 'nanoclawIdentities';
    const SECRET_NAME = 'auditSinkBearerToken';

    let message = 'NanoClaw registry download successfully audited';
    try {
        const repoPath = data.metadata?.repoPath;
        const repoType = data.metadata?.repoType !== undefined ? RepoType[data.metadata.repoType] : 'UNKNOWN';

        const configuredIdentities = (context.properties.get(NANOCLAW_IDENTITIES_PROPERTY) || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
        if (configuredIdentities.length > 0 && !configuredIdentities.includes(data.userContext?.id ?? '')) {
            return {
                message: `Download identity '${data.userContext?.id}' is not a configured NanoClaw identity; skipping audit`,
            };
        }

        const auditSinkUrl = context.properties.get(AUDIT_SINK_URL_PROPERTY);
        if (!auditSinkUrl) {
            return { message: `Worker property '${AUDIT_SINK_URL_PROPERTY}' is not set; skipping audit` };
        }

        // userContext.id is the identity the OneCLI Agent Vault injected into the agent
        // container's outbound request - i.e. the credential shared by a NanoClaw agent
        // group, not a per-session/per-container id. See the README for the full flow.
        const auditRecord = {
            source: 'nanoclaw-agent-vault',
            registryIdentity: data.userContext?.id,
            isToken: data.userContext?.isToken,
            repoKey: repoPath?.key,
            artifactPath: repoPath?.path,
            repoType,
            downloadedAt: new Date().toISOString(),
        };

        const res = await context.clients.axios.post(auditSinkUrl, auditRecord, {
            headers: {
                Authorization: `Bearer ${context.secrets.get(SECRET_NAME)}`,
            },
        });

        if (res.status === 200) {
            console.log(`Audited NanoClaw download of '${repoPath?.id}' by '${auditRecord.registryIdentity}'`);
        } else {
            console.warn(`Failed to audit NanoClaw download. Status code: ${res.status}`);
            message = 'Failed to audit NanoClaw download';
        }
    } catch (error) {
        console.error(`Failed to audit NanoClaw download, caused by: ${(error as Error).message}`);
        message = 'Failed to audit NanoClaw download';
    }

    return {
        message,
    };
};
