import { PlatformContext } from 'jfrog-workers';
import { AfterDownloadRequest, AfterDownloadResponse, RepoType } from './types';
import { AxiosRequestConfig } from 'axios';

export default async (context: PlatformContext, data: AfterDownloadRequest): Promise<AfterDownloadResponse> => {
    // MODIFY TO FIT YOUR NEEDS
    const AUDIT_SINK_URL_PROPERTY = 'auditSinkUrl';
    const SECRET_NAME = 'auditSinkBearerToken';

    let message = 'NemoClaw skill install successfully audited';
    try {
        const auditSinkUrl = context.properties.get(AUDIT_SINK_URL_PROPERTY);
        if (!auditSinkUrl) {
            return { message: `Worker property '${AUDIT_SINK_URL_PROPERTY}' is not set; skipping audit` };
        }

        const repoPath = data.metadata?.repoPath;
        const [slug, version] = parseSkillPath(repoPath?.path);
        const xrayStatus = await fetchXrayStatus(context, repoPath?.key, repoPath?.path);

        const auditRecord = {
            source: 'nemoclaw-skill-install',
            slug,
            version,
            repoKey: repoPath?.key,
            repoType: data.metadata?.repoType !== undefined ? RepoType[data.metadata.repoType] : 'UNKNOWN',
            registryIdentity: data.userContext?.id,
            isToken: data.userContext?.isToken,
            xrayStatus,
            downloadedAt: new Date().toISOString(),
        };

        const res = await context.clients.axios.post(auditSinkUrl, auditRecord, <AxiosRequestConfig>{
            headers: {
                Authorization: `Bearer ${context.secrets.get(SECRET_NAME)}`,
            },
        });

        if (res.status === 200) {
            console.log(`Audited NemoClaw skill install of '${repoPath?.id}' by '${auditRecord.registryIdentity}'`);
        } else {
            console.warn(`Failed to audit NemoClaw skill install. Status code: ${res.status}`);
            message = 'Failed to audit NemoClaw skill install';
        }
    } catch (error) {
        console.error(`Failed to audit NemoClaw skill install, caused by: ${(error as Error).message}`);
        message = 'Failed to audit NemoClaw skill install';
    }

    return {
        message,
    };
};

// Skill archives published via `jf skills publish` are stored as <slug>/<version>/<slug>-<version>.zip.
function parseSkillPath(path: string | undefined): [string | undefined, string | undefined] {
    const parts = path?.split('/');
    if (!parts || parts.length < 2) {
        return [undefined, undefined];
    }
    return [parts[0], parts[1]];
}

async function fetchXrayStatus(
    context: PlatformContext,
    repoKey: string | undefined,
    path: string | undefined,
): Promise<string> {
    if (!repoKey || !path) {
        return 'UNKNOWN';
    }
    try {
        const res = await context.clients.platformHttp.get(
            `/artifactory/api/skills/${repoKey}/xrayStatus?path=${encodeURIComponent(path)}`,
        );
        return res.data?.status ?? 'UNKNOWN';
    } catch (error) {
        console.warn(`Failed to fetch Xray status for '${repoKey}/${path}', caused by: ${(error as Error).message}`);
        return 'UNKNOWN';
    }
}
