import { PlatformContext } from 'jfrog-workers';


const DEFAULT_TIME_UNIT = "month";
const DEFAULT_TIME_INTERVAL = 1;
const DEFAULT_LIMIT = 100;
const DEFAULT_REMOVE_CONCURRENCY = 10;

interface ArtifactCleanupPayload {
    repos: Array<string>
    timeUnit: string
    timeInterval: number
    dryRun: boolean
    paceTimeMS: number
    disablePropertiesSupport: boolean
    limit: number
    concurrency: number
}

interface ArtifactInfo {
    repo: string;
    name: string;
    path: string;
    type: string;
    size: number;
}

class CancelException extends Error {
    constructor(message: string) {
        super(message);
    }
}

export default async function artifactCleanup(context: PlatformContext, data: ArtifactCleanupPayload) {

    try {
        checkInput(data);

        const repos = data.repos;
        const timeUnit = data.timeUnit || DEFAULT_TIME_UNIT;
        const timeInterval = data.timeInterval || DEFAULT_TIME_INTERVAL;
        const limit = data.limit || DEFAULT_LIMIT;
        const concurrency = data.concurrency || DEFAULT_REMOVE_CONCURRENCY;
        const dryRun = Boolean(data.dryRun);
        const disablePropertiesSupport = Boolean(data.disablePropertiesSupport);

        const skip: Record<string, Array<string>> = disablePropertiesSupport ? {} : await getSkippedPaths(context, repos);
        console.info(`Starting artifact cleanup for repositories ${repos}, until ${timeInterval} ${timeUnit}s ago, dryrun: ${dryRun}, disablePropertiesSupport: ${disablePropertiesSupport}`)
        const notDownloadSinceTimePeriod = computeLastDownloadDate(timeInterval, timeUnit);

        console.info(`Removing all artifacts not downloaded since ${notDownloadSinceTimePeriod}`);
        const itemsToRemove = await findItemsNotDownloadedSince(context, notDownloadSinceTimePeriod, repos, limit);

        for (let start = 0; start < itemsToRemove.length; start += concurrency) {
            await Promise.allSettled(itemsToRemove.slice(start, Math.min(start + concurrency, itemsToRemove.length)).map((item) => cleanupItem(context, item, skip, dryRun)));
        }

        return { status: 'STATUS_SUCCESS', message: `${itemsToRemove.length} item(s) processed` };
    } catch (x) {
        console.log(x.message);
        return { status: 'STATUS_FAILURE', message: x.message };
    }
}

function checkInput(data: ArtifactCleanupPayload) {
    if (!data) {
        throw new CancelException('no payload provided.');
    }

    if (!data.repos || !data.repos.length) {
        throw new CancelException('repos parameter must be specified before initiating cleanup.');
    }
}

function computeLastDownloadDate(timeInterval: number, timeUnit: string) {
    let minDownloadDate = new Date();
    switch (timeUnit) {
        case "minute":
            minDownloadDate.setUTCMinutes(minDownloadDate.getUTCMinutes() - timeInterval)
            break
        case "hour":
            minDownloadDate.setUTCHours(minDownloadDate.getUTCHours() - timeInterval)
            break
        case "day":
            minDownloadDate.setUTCDate(minDownloadDate.getUTCDate() - timeInterval)
            break
        case "month":
            minDownloadDate.setUTCMonth(minDownloadDate.getUTCMonth() - timeInterval)
            break
        case "year":
            minDownloadDate.setUTCFullYear(minDownloadDate.getUTCFullYear() - timeInterval)
            break
        default:
            throw new CancelException(`${timeUnit} is not valid time unit. Please check your request or scheduled policy`);
    }
    return minDownloadDate.toISOString()
}

async function findItemsNotDownloadedSince(context: PlatformContext, notDownloadSinceTimePeriod: string, repos: Array<string>, limit: number): Promise<Array<ArtifactInfo>> {
    // Items should be created at least before the expected last downloaded date
    const createdFilter = `"created":{"$lt":"${notDownloadSinceTimePeriod}"}`;
    // Items should have never been downloaded or been downloaded before the given date
    const downloadedFilter = `"$or":[{"stat.downloaded":{"$lt":"${notDownloadSinceTimePeriod}"}},{"stat.downloads":{"$eq":null}}]`;
    // Items repos
    const reposFilter = `"$or":[${repos.map((repo) => `{"repo":"` + repo + `"}`)}]`;

    let query = `items.find({${createdFilter},${downloadedFilter},${reposFilter}})`
    query = `${query}.include("repo","name","path","type","size")`;
    query = `${query}.sort({"$asc":["repo","name"]})`;
    query = `${query}.limit(${limit})`;

    return runAql(context, query);
}

async function getSkippedPaths(context: PlatformContext, repos: Array<string>) {
    const skip: Record<string, Array<string>> = {};

    for (let repo of repos) {
        const query = `items.find({"repo": "${repo}","type": "any","@cleanup.skip": "true"}).include("repo","name","path","type","size")`;
        const pathsTmp = await runAql(context, query)
            .then((items) => items.map((item) => {
                const path = getItemPath(item);
                console.trace(`skip found for ${repo}:${path}`);
                return path;
            }));

        // Simplify the list to only have one parent
        const paths: Array<string> = [];
        pathsTmp.sort();
        for (let path of pathsTmp.sort()) {
            if (!paths.length || !path.startsWith(paths[paths.length - 1])) {
                console.trace(`skip added for ${repo}:${path}`);
                paths.push(path);
            }
        }

        if (paths.length) {
            skip[repo] = paths;
        }
    }

    return skip;
}

async function cleanupItem(context: PlatformContext, item: ArtifactInfo, skipPaths: Record<string, Array<string>>, dryRun: boolean) {
    const itemPath = getItemPath(item);

    if (shouldSkipItem(item.repo, itemPath, skipPaths)) {
        console.log(`Skip ${item.repo}:${itemPath}`);
        return;
    }

    if (dryRun) {
        console.log(`Found ${item.repo}:${itemPath}`);
        return;
    }

    console.log(`Deleting ${item.repo}:${itemPath}`);
    await context.clients.platformHttp.delete(`/artifactory/${item.repo}/${getItemPath(item)}`);
    console.log(`Deleted ${item.repo}:${itemPath}`);
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

function getItemPath(item: ArtifactInfo) {
    let path = `${item.path}/${item.name}`;
    if ('.' === item.path) {
        path = item.name;
    }
    if ('folder' === item.type) {
        path = `${path}/`
    }
    return path;
}

function shouldSkipItem(repoKey: string, itemPath: string, skipPaths: Record<string, Array<string>>) {
    const repoSkippedPaths = skipPaths[repoKey];
    return repoSkippedPaths && repoSkippedPaths.length && repoSkippedPaths.find((skippedPath) => itemPath.startsWith(skippedPath));
}
