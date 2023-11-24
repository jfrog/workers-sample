// /!\/!\ Remove the imports when using it as worker code
import { PlatformContext } from '../../../../service/src/execution/model/platform';

const maxDaysProp = "docker.label.com.jfrog.artifactory.retention.maxDays";
const maxCountProp = "docker.label.com.jfrog.artifactory.retention.maxCount";
const oneDayMs = 24 * 60 * 1000;

export default async function cleanDockerImages(context: PlatformContext, payload: CleanDockerImagesPayload) {

    const deleted: Array<string> = [];
    const repos = payload.dockerRepos || [];
    const dryRun = Boolean(payload.dryRun)
    const byDownloadDate = Boolean(payload.byDownloadDate)

    console.log(`cleanDockerImages: Options dryRun=${dryRun}, byDownloadDate=${byDownloadDate}`)

    const repositories = new Repositories(context);

    try {
        for (const repo of repos) {
            console.log(`Cleaning Docker images in repo: ${repo}`)
            await cleanDockerRepo(repositories, repo, dryRun, byDownloadDate, deleted)
        }
    } catch (x) {
        return { status: "failed", error: x.message };
    }

    return { status: "OK", dryRun, deleted }
}

async function cleanDockerRepo(repositories: Repositories, repo: string, dryRun: boolean, byDownloadDate: boolean, deleted: Array<string>) {
    const oldSet: Array<RepoPath> = [];
    const imagesPathMap = new Map<string, Array<Pick<RepoItemInfo, 'repoPath' | 'lastUpdated'>>>();
    const imagesCount = new Map<string, number>();
    const parentInfo = await repositories.getItemInfo(repo)
    await simpleTraverse(repositories, parentInfo, oldSet, imagesPathMap, imagesCount, byDownloadDate)
    for (const img of oldSet) {
        deleted.push(img.id)
        if (!dryRun) {
            await repositories.delete(img)
        }
    }
    for (const key of imagesPathMap.keys()) {
        let repoList = imagesPathMap.get(key)
        const maxImagesCount = imagesCount.get(key)
        // If number of current docker images is more than maxcount, delete them
        if (maxImagesCount <= 0 || repoList.length <= maxImagesCount) {
            console.debug(`MaxCount=${maxImagesCount} not reached ... skipping ${key}`)
            continue
        }
        // We sort by lastUpdated
        repoList = repoList.sort((l, r) => l.lastUpdated - r.lastUpdated);
        const deleteCount = repoList.length - maxImagesCount
        for (const toDelete of repoList.slice(0, deleteCount)) {
            deleted.push(toDelete.repoPath.id)
            if (!dryRun) {
                await repositories.delete(toDelete.repoPath)
            }
        }
    }
    return deleted
}

// Traverse through the docker repo (directories and sub-directories) and:
// - delete the images immediately if the maxDays policy applies
// - Aggregate the images that qualify for maxCount policy (to get deleted in
//   the execution closure)
async function simpleTraverse(
  repositories: Repositories,
  parentInfo: RepoItemInfo,
  oldSet: Array<RepoPath>,
  imagesPathMap: Map<string, Array<Pick<RepoItemInfo, 'repoPath' | 'lastUpdated'>>>,
  imagesCount: Map<string, number>,
  byDownloadDate: boolean
) {
    let maxCount = null
    const parentRepoPath = parentInfo.repoPath
    for (const childItem of await repositories.getChildren(parentRepoPath)) {
        let currentPath = childItem.repoPath
        if (childItem.folder) {
            await simpleTraverse(repositories, childItem, oldSet, imagesPathMap, imagesCount, byDownloadDate)
            continue
        }
        console.log(`Scanning File: ${currentPath.path}`)
        if (currentPath.name != "manifest.json") {
            continue
        }
        // get the properties here and delete based on policies:
        // - implement daysPassed policy first and delete the images that
        //   qualify
        // - aggregate the image info to group by image and sort by create
        //   (byDownloadDate=false) or downloaded/updated (byDownloadDate=true)
        //   date for maxCount policy
        if (await checkDaysPassedForDelete(repositories, childItem, byDownloadDate)) {
            console.debug(`Adding to OLD MAP: ${parentRepoPath.path}`);
            oldSet.push(parentRepoPath)
        } else if ((maxCount = await getMaxCountForDelete(repositories, childItem)) > 0) {
            console.debug(`Adding to IMAGES MAP: ${parentRepoPath.path}`)
            const parentId = parentRepoPath.parent.id
            let oldMax = maxCount
            if (parentId in imagesCount) {
                oldMax = imagesCount.get(parentId)
            }
            imagesCount.set(parentId, maxCount > oldMax ? maxCount : oldMax);
            if (!imagesPathMap.has(parentId)) {
                imagesPathMap.set(parentId, []);
            }
            let itemLastUsedDate = await getItemLastUsedDate(repositories, childItem, byDownloadDate)
            imagesPathMap.get(parentId).push({ repoPath: parentRepoPath, lastUpdated: itemLastUsedDate })
        }
        break
    }
}

// Check Last Downloaded Date for a specified path and return the value as long (epoch).
/// Returns 0 when item was never downloaded.
async function getLastDownloadedDate(repositories: Repositories, itemPath: RepoPath) {
    let lastDownloadedDate = 0
    const itemStats = await repositories.getStats(itemPath)
    if (itemStats) {
        lastDownloadedDate = itemStats.lastDownloaded
        console.debug(`lastDownloadedDate: STAT lastDownloadedDate =${lastDownloadedDate} (${new Date(lastDownloadedDate)})`)
    } else {
        console.log("NO STATS for ${itemPath.id} found")
    }
    return lastDownloadedDate
}

// Retrieve and return item last use date as 'long' (epoch)
// For 'byDownloadDate=false' this is the item creation date (original plugin behaviour).
// When 'byDownloadDate=true', this will be last download date or last modification date (for items never downloaded).
async function getItemLastUsedDate(repositories: Repositories, item: RepoItemInfo, byDownloadDate: boolean) {
    let lastDownloadedDate = null
    let itemLastUse = item.created

    if (byDownloadDate) {
        lastDownloadedDate = await getLastDownloadedDate(repositories, item.repoPath)
        itemLastUse = (lastDownloadedDate) ? lastDownloadedDate : item.lastUpdated
    }

    console.debug(`${item.repoPath.id}: itemLastUse = ${itemLastUse} item.created = ${item.created} item.lastUpdated = ${item.lastUpdated}`)
    return itemLastUse
}

// This method checks if the docker image's manifest has the property
// "com.jfrog.artifactory.retention.maxDays" for purge
async function checkDaysPassedForDelete(repositories: Repositories, item: RepoItemInfo, byDownloadDate: boolean) {
    const propStr = await repositories.getProperty(item.repoPath, maxDaysProp);
    if (!propStr) {
        return false;
    }

    console.log(`PROPERTY maxDays FOUND = ${propStr} IN MANIFEST FILE ${item.repoPath.id}`)
    let prop: number;
    try {
        prop = Number.parseInt(propStr);
    } catch (x) {
        console.log(`PROPERTY maxDays is not a number: ${x.message}`);
        return false;
    }

    const fileLastUseDate = await getItemLastUsedDate(repositories, item, byDownloadDate);

    return ((Date.now() - fileLastUseDate) / oneDayMs) >= prop;
}

// This method checks if the docker image's manifest has the property
// "com.jfrog.artifactory.retention.maxCount" for purge
async function getMaxCountForDelete(repositories: Repositories, item: RepoItemInfo) {
    const propStr = await repositories.getProperty(item.repoPath, maxCountProp)
    if (!propStr) {
        return 0
    }

    console.log(`PROPERTY maxCount FOUND = ${propStr} IN MANIFEST FILE ${item.repoPath.id}`)

    let prop: number;
    try {
        prop = Number.parseInt(propStr);
    } catch (x) {
        console.log(`PROPERTY maxCount is not a number: ${x.message}`);
        return false;
    }

    return Math.max(prop, 0)
}

function joinPath(l: string, r: string): string {
    return l.replaceAll(/^(.*)\/$/g, "$1") + '/' + r.replaceAll(/^\/(.*)$/g, "$1");
}

export function buildRepoPath(repo: string, path: string): RepoPath {
    const pathParts = path.split("/");
    let parent: RepoPath;
    if (pathParts.length > 1) {
        parent = buildRepoPath(repo, pathParts.slice(0, pathParts.length - 1).join('/'));
    } else {
        parent = { id: `${repo}:/`, path: '/', name: '', repo }
    }
    return {
        parent,
        repo,
        id: `${repo}:${path}`,
        path: `${joinPath(repo, path)}`,
        name: pathParts.length > 0 ? pathParts[pathParts.length - 1] : "",
    } as any;
}

interface CleanDockerImagesPayload {
    dockerRepos: Array<string>
    byDownloadDate: boolean
    dryRun: boolean
}

export interface RepoPath {
    id: string
    path: string
    name: string
    repo: string
    parent?: RepoPath
}

interface RepoItemInfo {
    repoPath: RepoPath
    created: number
    lastUpdated: number
    folder: boolean
}

interface ItemStats  {
    lastDownloaded: number
}

class Repositories {
    constructor(private ctx: PlatformContext) {
    }

    async delete(item: RepoPath) {
        console.log(`Deleting /${item.path}`)
        await this.ctx.clients.platformHttp.delete(`/artifactory/${item.path}`);
        console.log(`Deleted /${item.path}`)
    }

    async getProperty(repoPath: RepoPath, propertyName: string): Promise<string | undefined> {
        console.debug(`GetProperty: ${repoPath.path}, ${propertyName}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${repoPath.path}?properties=${encodeURIComponent(propertyName)}`);
        const { properties } = res.data;
        if (properties && typeof properties === 'object') {
            return properties[propertyName];
        }
        return
    }

    async getStats(repoPath: RepoPath): Promise<ItemStats> {
        console.debug(`GetStats: ${repoPath.path}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${repoPath.path}?stats`);
        const { lastDownloaded } = res.data;
        return { lastDownloaded }
    }

    async getChildren(repoPath: RepoPath): Promise<Array<RepoItemInfo>> {
        console.debug(`GetChildren: ${repoPath.path}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${repoPath.path}?list&deep=0&listFolders=1&mdTimestamps=0&includeRoot=0`);
        const { files } = res.data;
        const children = [];
        for (const { uri }  of (files || [])) {
            if (uri) {
                children.push(await this.getItemInfo(`${joinPath(repoPath.path, uri)}`));
            }
        }
        return children;
    }

    async getItemInfo(itemPath: string): Promise<RepoItemInfo> {
        console.debug(`GetItemInfo: ${itemPath}`)
        const res = await this.ctx.clients.platformHttp.get(`${joinPath("/artifactory/api/storage", itemPath)}`);
        const { repo, path, created, lastUpdated, downloadUri } = res.data
        return {
            repoPath: buildRepoPath(repo, path),
            created: Date.parse(created),
            lastUpdated: Date.parse(lastUpdated),
            folder: !downloadUri, // Only files have downloadUri
        };
    }
}