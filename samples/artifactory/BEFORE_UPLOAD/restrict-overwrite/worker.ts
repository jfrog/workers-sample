import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

export default async function (context: PlatformContext, data: BeforeUploadRequest): Promise<Partial<BeforeUploadResponse>> {
    try {
        return restrictOverwrite(context, data);
    } catch (x) {
        return { status: UploadStatus.UPLOAD_STOP, message: x.message };
    }
}

async function restrictOverwrite(context: PlatformContext, data: BeforeUploadRequest): Promise<Partial<BeforeUploadResponse>> {
    const existingItem = await getExistingItemInfo(context, data.metadata.repoPath);

    if (existingItem && !(data.metadata.repoPath.isFolder && existingItem.isFolder)) {
        return {
            status: UploadStatus.UPLOAD_STOP,
            message: `${data.metadata.repoPath.id} already exists`,
        };
    }

    return { status: UploadStatus.UPLOAD_PROCEED };
}

async function getExistingItemInfo(context: PlatformContext, repoPath: RepoPath): Promise<RepoItemInfo | undefined> {
    const pathParts = repoPath.path.split('/')
    const query = {
        repo: repoPath.key,
        path:  pathParts.length === 1 ? '.' : pathParts.slice(0, pathParts.length - 1).join('/'),
        name: pathParts[pathParts.length - 1]
    };
    const aqlResult = await runAql(context, `items.find(${JSON.stringify(query)}).include("type").limit(1)`)
    if (aqlResult.length) {
        return { isFolder: aqlResult[0].type === 'folder' };
    }
}

async function runAql(context: PlatformContext, query: string) {
    console.log(`Running AQL: ${query}`)
    try {
        const queryResponse = await context.clients.platformHttp.post(
                '/artifactory/api/search/aql',
                query,
                {
                    'Content-Type': 'text/plain'
                });
        return (queryResponse.data.results || []) as Array<any>;
    } catch (x) {
        console.log(`AQL query failed: ${x.message}`);
    }
    return [];
}

interface RepoItemInfo {
    isFolder: boolean
}
