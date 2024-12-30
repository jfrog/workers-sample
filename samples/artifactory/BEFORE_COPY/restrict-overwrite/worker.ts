import { PlatformContext, BeforeCopyRequest, BeforeCopyResponse, ActionStatus} from 'jfrog-workers';


export default async function (context: PlatformContext, data: BeforeCopyRequest): Promise<Partial<BeforeCopyResponse>> {
    try {
        return restrictOverwrite(context, data);
    } catch (x) {
        return { status: ActionStatus.STOP, message: x.message };
    }
}

async function restrictOverwrite(context: PlatformContext, data: BeforeCopyRequest): Promise<Partial<BeforeCopyResponse>> {
    const existingItem = await getExistingItemInfo(context, data.targetRepoPath);

    if (existingItem && !(data.metadata.repoPath.isFolder && existingItem.isFolder)) {
        return {
            status: ActionStatus.STOP,
            message: `${data.metadata.repoPath.id} already exists`,
        };
    }

    return { status: ActionStatus.PROCEED };
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