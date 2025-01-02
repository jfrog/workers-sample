import { PlatformContext } from 'jfrog-workers';

export default async function(context: PlatformContext, data: RemoteBackupPayload) {
    try {
        const [complete, total] = await runBackup(context, data.backups, data.dryRun, data.checksums, data.maxDepth ?? 10, data.maxFiles ?? 1000);
        return { complete, total };
    } catch (x) {
        return { error: x.message };
    }
}

async function runBackup(context: PlatformContext, repos: Record<string, string>, dryRun: boolean, checksums: boolean, maxDepth: number, maxFiles: number): Promise<[number, number]> {
    const res = { complete: 0, total: 0 };
    const repositories = new Repositories(context);
    // We do not use await Promise.allSettled because it will use too much CPU
    for (const [src, dest] of Object.entries(repos)) {
        await backupDir(src, dest, dryRun, checksums, repositories, maxDepth, maxFiles, res);
    }
    return [res.complete, res.total];
}

async function backupDir(
    src: string,
    dest: string,
    dryRun: boolean,
    checksums: boolean,
    repositories: Repositories,
    maxDepth: number,
    maxFiles: number,
    acc: { complete: number, total: number },
) {
    let destSums: Record<string, string> | undefined;
    if (checksums) {
        destSums = {};
        for (const item of await repositories.getRepoFiles(dest, maxDepth, false)) {
            destSums[item.uri] = item.sha1;
        }
    }

    for (const item of await repositories.getRepoFiles(src, maxDepth, false)) {
        if (acc.complete >= maxFiles) {
            break;
        }

        const srcPath = buildRepoPath(item.uri, src);
        const destPath = buildRepoPath(item.uri, dest);

        if (destSums) {
            if (destSums[item.uri] === item.sha1) {
                continue;
            }
        }

        acc.total += 1
        try {
            await repositories.copy(srcPath, destPath, dryRun)
            acc.complete += 1
        } catch (x) {
            console.warn(`Unable to backup ${srcPath.path} to ${destPath.path}: ${x.message}`)
        }
    }
}

export function joinPath(l: string, r: string): string {
    const result = l.endsWith('/') ? l : l + '/';
    const right = r.startsWith('/') ? r.substring(1) : r;
    return result + right;
}

export function buildRepoPath(path: string, repo?: string): RepoPath {
    const pathParts = path.split("/");
    const finalRepo = repo || pathParts[0];
    return  {
        path: path.startsWith(finalRepo) ? path : joinPath(finalRepo, path),
        repo: finalRepo,
        name: pathParts.length === 1 && !repo ? "" : pathParts[pathParts.length - 1],
    };
}


export interface RemoteBackupPayload {
    backups: Record<string, string>
    dryRun: boolean
    // Check if the files are already backed up
    checksums: boolean
    // Maximum depth to search for files (default 10
    maxDepth?: number
    // Maximum number of files to copy (default 1000)
    maxFiles?: number
}

interface RepoPath {
    path: string
    name: string
    repo: string
}

interface File {
    uri: string,
    folder: boolean,
    size: number,
    lastModified: number,
    sha1: string,
}

class Repositories {
    constructor(private ctx: PlatformContext) {
    }

    async copy(src: RepoPath, dest: RepoPath, dryRun = false) {
        console.log(`Copying ${src.path} to ${dest.path}`)
        await this.ctx.clients.platformHttp.post(`/artifactory/api/copy/${src.path}?to=${encodeURIComponent(dest.path)}&dry=${dryRun ? 1: 0}`);
    }

    async getRepoFiles(repo: string, depth=1, listFolders=false): Promise<Array<File>> {
        console.debug(`GetRepoFiles: ${repo}`)

        let depthParam = "&deep=0";
        if (depth > 1) {
            depthParam = `&deep=1&depth${depth}`;
        }

        const listFoldersParam = `&listFolders=${listFolders ? 1 : 0}`;

        try {
            const res = await this.ctx.clients.platformHttp.get(`${joinPath("/artifactory/api/storage", repo)}?list&includeRootPath=0${depthParam}${listFoldersParam}`);
            return res.data?.children ?? res.data?.files ?? [];
        } catch (x) {
            console.warn(`Cannot get ${repo} files: ${x.message}`);
        }
    }
}
