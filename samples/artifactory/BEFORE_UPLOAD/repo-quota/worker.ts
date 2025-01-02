import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

const REPO_QUOTA_PROPERTY = "repository.path.quota";

export default async function (context: PlatformContext, data: BeforeUploadRequest): Promise<Partial<BeforeUploadResponse>> {
    try {
        return checkQuota(context, data);
    } catch (x) {
        return { status: UploadStatus.UPLOAD_STOP, message: x.message };
    }
}

async function checkQuota(context: PlatformContext, data: BeforeUploadRequest): Promise<Partial<BeforeUploadResponse>> {
    if (data.metadata.repoPath.isRoot || data.metadata.repoPath.isFolder) {
        console.log(`Skipping root and folder`);
        return {
            status: UploadStatus.UPLOAD_PROCEED,
            message: `Skipping ${data.metadata.repoPath.path} is root or folder`,
        };
    }

    const parentPath = getParentPath(data.metadata.repoPath.path);
    const repoQuota = await getRepoQuota(context, data.metadata.repoPath.key, parentPath);
    const artifactsSize = await getArtifactsSize(context, data.metadata.repoPath.key, parentPath);

    console.log(`RepoQuota for ${data.metadata.repoPath.key}/${parentPath}=${repoQuota}`);
    console.log(`Current artifact size for ${data.metadata.repoPath.key}/${parentPath}=${artifactsSize}`);

    if (repoQuota < 0) {
        console.log(`No repoQuota found for path ${data.metadata.repoPath.key}/${parentPath}... proceeding with upload`);
    } else if (artifactsSize + data.metadata.contentLength >= repoQuota) {
        console.warn(`Repository path quota of ${data.metadata.repoPath.key}/${parentPath} will exceed after uploading ${data.metadata.repoPath.path}`);
        return {
            status: UploadStatus.UPLOAD_STOP,
            message: `Quota exceeded for ${data.metadata.repoPath.key}/${parentPath}`,
        };
    }

    return { status: UploadStatus.UPLOAD_PROCEED };
}

async function getRepoQuota(context: PlatformContext, repoKey: string, path: string): Promise<number> {
    const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${joinPath(repoKey, path)}?properties=${encodeURIComponent(REPO_QUOTA_PROPERTY)}`);
    const { properties } = res.data;
    if (properties && typeof properties === 'object') {
        try {
            return Number.parseInt(properties[REPO_QUOTA_PROPERTY]);
        } catch (x) {
            console.error(`Invalid ${REPO_QUOTA_PROPERTY}=${properties[REPO_QUOTA_PROPERTY]}: ${x.message}`);
        }
    }
    return -1;
}

async function getArtifactsSize(context: PlatformContext, repoKey: string, path: string): Promise<number> {
    let totalSize = 0;
    const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${joinPath(repoKey, path)}?list&deep=1&listFolders=0&mdTimestamps=0&includeRoot=0`);
    const { files } = res.data;
    (files || []).forEach(({ size }) => {
        if (typeof size === 'number') {
            totalSize += size;
        }
    })
    return totalSize;
}

function joinPath(l: string, r: string): string {
    return l.replaceAll(/^(.*)\/$/g, "$1") + '/' + r.replaceAll(/^\/(.*)$/g, "$1");
}

function getParentPath(path: string) {
    const paths = path.split('/');
    return paths.slice(0, paths.length - 1).join('/');
}
