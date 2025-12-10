import { PlatformContext } from 'jfrog-workers';


export default async function deleteEmptyDirs(context: PlatformContext, data:  DeleteEmptyDirsParams) {
    if (!data?.paths?.length) {
        return { message: "nothing to delete" };
    }

    let totalDeletedDirs = 0;

    const repositories = new Repositories(context);

    try {
        for (const path of data.paths) {
            console.log(`Deleting empty directories for ${path}`);
            const deletedDirs = await deleteEmptyDirsRecursively(repositories, buildRepoPath(path), data.dryRun);
            console.log(`Deleted ${deletedDirs} empty directory for given path ${path}`);
            totalDeletedDirs += deletedDirs;
        }
        console.log(`Finished deleting total(${totalDeletedDirs}) directories`);
        return { totalDeletedDirs, message: `${totalDeletedDirs} directories removed` };
    } catch (x) {
        console.warn(`deleteEmptyDirs ended with error=${x.message}`);
        return { error: x.message }
    }
}

async function deleteEmptyDirsRecursively(repositories: Repositories, repoPath: RepoPath, dryRun: boolean) {
    let deletedDirs = 0
    // if not folder - we're done, nothing to do here
    if (repoPath.path === repoPath.repo || (await repositories.getItemInfo(repoPath)).folder) {
        const children = await repositories.getChildren(repoPath);
        for (const child of children) {
            deletedDirs += await deleteEmptyDirsRecursively(repositories, child.repoPath, dryRun);
        }
        // now let's check again
        if ((await repositories.getChildren(repoPath)).length === 0) {
            // it is folder, and no children - delete!
            console.log(`Deleting empty directory (${repoPath.path})`);
            if (!dryRun) {
                await repositories.delete(repoPath)
            }
            deletedDirs += 1
        }
    }
    return deletedDirs
}

function joinPath(l: string, r: string): string {
    return l.replace(/^(.*)\/$/g, "$1") + '/' + r.replace(/^\/(.*)$/g, "$1");
}

export function buildRepoPath(path: string, repo?: string): RepoPath {
    const pathParts = path.split("/");
    if (pathParts.length === 0) {
        throw new Error(`Invalid path ${path}`)
    }
    const finalRepo = repo || pathParts[0];
    return  {
        path: path.startsWith(finalRepo) ? path : joinPath(finalRepo, path),
        repo: finalRepo,
        name: pathParts.length === 1 && !repo ? "" : pathParts[pathParts.length - 1],
    };
}

interface DeleteEmptyDirsParams {
    paths: Array<string>
    dryRun: boolean
}

export interface RepoPath {
    path: string
    name: string
    repo: string
}

interface RepoItemInfo {
    repoPath: RepoPath
    folder: boolean
}

class Repositories {
    constructor(private ctx: PlatformContext) {
    }

    async delete(item: RepoPath) {
        console.log(`Deleting /${item.path}`)
        await this.ctx.clients.platformHttp.delete(`/artifactory/${item.path}`);
        console.log(`Deleted /${item.path}`)
    }

    async getChildren(repoPath: RepoPath): Promise<Array<RepoItemInfo>> {
        console.debug(`GetChildren: ${repoPath.path}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${repoPath.path}?list&deep=0&listFolders=1&mdTimestamps=0&includeRoot=0`);
        const { files } = res.data;
        const children: RepoItemInfo[] = [];
        for (const { uri }  of (files || [])) {
            if (uri) {
                console.log(`repoPath='${repoPath.path}', childUri=${uri}`);
                children.push(await this.getItemInfo(buildRepoPath(joinPath(repoPath.path, uri), repoPath.repo)));
            }
        }
        return children;
    }

    async getItemInfo(itemPath: RepoPath): Promise<RepoItemInfo> {
        console.debug(`GetItemInfo: ${itemPath.path}`)
        const res = await this.ctx.clients.platformHttp.get(joinPath("/artifactory/api/storage", itemPath.path));
        const { repo, path, downloadUri } = res.data
        return {
            repoPath: buildRepoPath(path, repo),
            folder: !downloadUri, // Only files have downloadUri
        };
    }
}
