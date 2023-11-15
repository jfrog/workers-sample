// /!\/!\ Remove the imports when using it as worker code
import { PlatformContext } from '../../../../service/src/execution/model/platform';

export default async function(context: PlatformContext, data: RemoteBackupPayload) {
    try {
        const [complete, total ] = await runBackup(context, data.backups, data.dryRun);
        return { complete, total };
    } catch (x) {
        return { error: x.message };
    }
}

async function runBackup(context: PlatformContext, repos: Record<string, string>, dryRun: boolean) {
    let complete = 0, total = 0;
    const repositories = new Repositories(context);
    for (const [src,dest] of Object.entries(repos)) {
        const query = JSON.stringify({type: 'file', repo: src})
        const aql = `items.find(${query}).include("repo","path","name")`
        for (const item of await runAql(context, aql)) {
            let path = item.path + '/' + item.name;
            if (item.path === '.') {
                path = item.name;
            }
            const srcPath = buildRepoPath(path, src);
            const destPath = buildRepoPath(path, dest);
            const srcInfo = await repositories.getFileInfo(srcPath);
            const destInfo = await repositories.getFileInfo(destPath);
            if (srcInfo &&
                    (!destInfo ||
                            (srcInfo.checksums.sha1 !== destInfo.checksums.sha1))) {
                total += 1
                try {
                    await repositories.copy(srcPath, destPath, dryRun)
                    complete += 1
                } catch (x) {
                    console.warn(`Unable to backup ${srcPath.path} to ${destPath.path}: ${x.message}`)
                }
            }
        }
    }
    return [complete, total]
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

function joinPath(l: string, r: string): string {
    return l.replaceAll(/^(.*)\/$/g, "$1") + '/' + r.replaceAll(/^\/(.*)$/g, "$1");
}

function buildRepoPath(path: string, repo?: string): RepoPath {
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


interface RemoteBackupPayload {
    backups: Record<string, string>
    dryRun: boolean
}

interface RepoPath {
    path: string
    name: string
    repo: string
}

interface ChecksumsInfo {
    sha1: string
}

interface FileInfo {
    checksums: ChecksumsInfo
}

class Repositories {
    constructor(private ctx: PlatformContext) {
    }

    async copy(src: RepoPath, dest: RepoPath, dryRun = false) {
        console.log(`Copying ${src.path} to ${dest.path}`)
        await this.ctx.clients.platformHttp.post(`/artifactory/api/copy/${src.path}?to=${encodeURIComponent(dest.path)}&dry=${dryRun ? 1: 0}`);
        console.log(`Copied ${src.path} to ${dest.path}`)
    }

    async getFileInfo(repoPath: RepoPath): Promise<FileInfo | undefined> {
        console.debug(`GetFileInfo: ${repoPath.path}`)
        try {
            const res = await this.ctx.clients.platformHttp.get(`${joinPath("/artifactory/api/storage", repoPath.path)}`);
            const { checksums } = res.data
            return { checksums: checksums || { sha1: "" } };
        } catch (x) {
            console.warn(`Cannot get ${repoPath.path} fileInfo: ${x.message}`);
        }
    }
}