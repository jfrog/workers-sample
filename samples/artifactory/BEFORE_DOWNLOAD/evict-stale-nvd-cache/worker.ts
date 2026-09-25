import { PlatformContext } from 'jfrog-workers';
import { BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus, RepoType } from './types';

const NVD_MODIFIED_META_URL =
    'https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-modified.meta';

const REMOTE_CACHE_SUFFIX = '-cache';

interface StorageInfo {
    lastUpdated?: string;
}

function parseNvdLastModified(metaBody: string): number {
    const match = metaBody.match(/^lastModifiedDate:(.+)$/m);
    if (!match?.[1]) {
        throw new Error('lastModifiedDate not found in NVD meta file');
    }
    const parsed = Date.parse(match[1].trim());
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid lastModifiedDate: ${match[1]}`);
    }
    return parsed;
}

function resolveCacheRepoKey(repoKey: string): string {
    return repoKey.endsWith(REMOTE_CACHE_SUFFIX)
        ? repoKey
        : `${repoKey}${REMOTE_CACHE_SUFFIX}`;
}

async function fetchNvdModifiedTimestamp(context: PlatformContext): Promise<number> {
    const res = await context.clients.axios.get(NVD_MODIFIED_META_URL, {
        validateStatus: (status) => status >= 200 && status < 300,
    });
    return parseNvdLastModified(String(res.data));
}

async function getCachedArtifactLastUpdated(
    context: PlatformContext,
    cacheRepoKey: string,
    artifactPath: string,
): Promise<number | undefined> {
    try {
        const res = await context.clients.platformHttp.get(
            `/artifactory/api/storage/${cacheRepoKey}/${artifactPath}`,
        );
        const info = res.data as StorageInfo;
        if (!info.lastUpdated) {
            return undefined;
        }
        const parsed = Date.parse(info.lastUpdated);
        return Number.isNaN(parsed) ? undefined : parsed;
    } catch (error: any) {
        // 404 = nothing cached yet; nothing to evict
        if (error.status === 404) {
            return undefined;
        }
        throw error;
    }
}

export default async (
    context: PlatformContext,
    data: BeforeDownloadRequest,
): Promise<BeforeDownloadResponse> => {
    const repoPath = data.metadata?.repoPath ?? data.repoPath;

    if (!repoPath?.key || !repoPath.path || repoPath.isFolder) {
        return {
            status: DownloadStatus.DOWNLOAD_PROCEED,
            message: 'Not a file download; skipping NVD cache check',
            headers: {},
        };
    }

    if (data.metadata?.repoType !== RepoType.REPO_TYPE_REMOTE) {
        return {
            status: DownloadStatus.DOWNLOAD_PROCEED,
            message: 'Not a remote repo download; skipping NVD cache check',
            headers: {},
        };
    }

    const cacheRepoKey = resolveCacheRepoKey(repoPath.key);
    const artifactPath = repoPath.path;

    try {
        const [nvdLastModified, artifactLastUpdated] = await Promise.all([
            fetchNvdModifiedTimestamp(context),
            getCachedArtifactLastUpdated(context, cacheRepoKey, artifactPath),
        ]);
        console.log(`nvdLastModified = ${nvdLastModified}, artifactLastUpdated = ${artifactLastUpdated}`);

        if (artifactLastUpdated === undefined) {
            console.log('nothing to evict');
            return {
                status: DownloadStatus.DOWNLOAD_PROCEED,
                message: `No cached artifact at ${cacheRepoKey}/${artifactPath}; nothing to evict`,
                headers: {},
            };
        }

        if (nvdLastModified > artifactLastUpdated) {
            console.log(
                `NVD feed newer (${new Date(nvdLastModified).toISOString()}) than cached artifact ` +
                `(${new Date(artifactLastUpdated).toISOString()}); evicting ${cacheRepoKey}/${artifactPath}`,
            );

            await context.clients.platformHttp.delete(
                `/artifactory/${cacheRepoKey}/${artifactPath}`,
            );

            return {
                status: DownloadStatus.DOWNLOAD_PROCEED,
                message: `Evicted stale cache entry ${cacheRepoKey}/${artifactPath} because NVD modified feed is newer`,
                headers: {},
            };
        }

        console.log('keeping cache');
        return {
            status: DownloadStatus.DOWNLOAD_PROCEED,
            message: 'Cached artifact is still fresh relative to NVD modified feed',
            headers: {},
        };
    } catch (error: any) {
        console.error(`NVD cache check failed: ${error.message ?? error}`);
        return {
            status: DownloadStatus.DOWNLOAD_WARN,
            message: 'Could not verify NVD freshness; download proceeds with warning',
            headers: {},
        };
    }
};
