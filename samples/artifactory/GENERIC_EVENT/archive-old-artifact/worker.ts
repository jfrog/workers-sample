import {PlatformContext} from 'jfrog-workers';
import {ArtifactResponse, ArtifactStatistics, PropertyMap} from './types';

const ArchiveConstants = {
    DAYS_TO_MILLIS: 24 * 60 * 60 * 1000, // 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
};


export default async function archiveOldArtifacts(context: PlatformContext, params: {
    filePattern?: string;
    srcRepo: string;
    archiveRepo: string;
    lastModifiedDays?: number;
    lastUpdatedDays?: number;
    createdDays?: number;
    lastDownloadedDays?: number;
    ageDays?: number;
    excludePropertySet?: string;
    includePropertySet?: string;
    archiveProperty?: string;
    numKeepArtifacts?: number;
}): Promise<void> {
    const {
        filePattern = '*',
        srcRepo,
        archiveRepo,
        lastModifiedDays = 0,
        lastUpdatedDays = 0,
        createdDays = 0,
        lastDownloadedDays = 0,
        ageDays = 0,
        excludePropertySet = '',
        includePropertySet = '',
        archiveProperty = 'archived.timestamp',
        numKeepArtifacts = 0,
    } = params;
    if (lastModifiedDays === 0 &&
        lastUpdatedDays === 0 &&
        createdDays === 0 &&
        lastDownloadedDays === 0 &&
        ageDays === 0 &&
        excludePropertySet === '' &&
        includePropertySet === '') {
        console.error('No selection criteria specified, exiting now!');
        throw new Error('No selection criteria specified!');
    }

    if (!archiveRepo || !srcRepo) {
        const errmsg = `Both srcRepo and archiveRepo must be defined, srcRepo: ${srcRepo}, archiveRepo: ${archiveRepo}`;
        console.error(errmsg);
        throw new Error(errmsg);
    }

    try {
        const searchResults = await searchArtifacts(context, filePattern, srcRepo);
        for (const artifact of searchResults) {
            console.info(`Search found artifact: ${filePattern}`);

            const storageIndex = artifact.uri.indexOf('/storage/') + '/storage/'.length;
            const filePath = artifact.uri.substring(storageIndex);
            const todayTime = Date.now();

            let archiveTiming: boolean = true;
            let archiveExcludeProperties: boolean = true;
            let archiveIncludeProperties: boolean = true;
            let artifactsArchived: number = 0;

            const itemInfo = await getItemInfo(context, srcRepo, filePath);
            console.log(`Artifact: ${filePath} , item info: ${JSON.stringify(itemInfo)}`);

            if (lastModifiedDays !== 0 ||
                lastUpdatedDays !== 0 ||
                createdDays !== 0 ||
                lastDownloadedDays !== 0 ||
                ageDays !== 0) {
                console.info('We are going to perform a timing policies check...');

                const archiveTiming = checkArchiveTimingPolicies(
                    context,
                    itemInfo,
                    lastModifiedDays,
                    lastUpdatedDays,
                    createdDays,
                    lastDownloadedDays,
                    ageDays,
                    todayTime,
                    srcRepo,
                    filePath
                );
            }
            if (excludePropertySet !== '') {
                console.info('We are going to exclude artifacts based on attributes...');
                const excludeMap = translatePropertiesString(excludePropertySet);
                console.info('About to call verify properties for false');
                archiveExcludeProperties = await verifyProperties(context, srcRepo, filePath, excludeMap, false);
            }
            if (includePropertySet !== '') {
                console.info('We are going to include artifacts based on attributes...');
                const includeMap = translatePropertiesString(includePropertySet);
                console.info('About to call verify properties for true');
                archiveIncludeProperties = await verifyProperties(context, srcRepo, filePath, includeMap, true);
            }

            if (archiveTiming && archiveExcludeProperties && archiveIncludeProperties) {
                const properties = await getArtifactProperties(context, srcRepo, filePath);
                const deployFileResponse = await deployArtifact(context, srcRepo, filePath, filePattern);
                const propertiesJsonString = JSON.stringify(properties.data.properties);
                const propertiesInfo = JSON.parse(propertiesJsonString);
                const deployFileJsonString = JSON.stringify(deployFileResponse);
                const deployFileJsonInfo = JSON.parse(deployFileJsonString);
                for (const key in propertiesInfo) {
                    if (propertiesInfo.hasOwnProperty(key)) {
                        await setArtifactProperties(context, srcRepo, deployFileJsonInfo.data.repo + deployFileJsonInfo.data.path, {[key]: propertiesInfo[key]});


                    }
                }
                await moveArtifact(context, deployFileJsonInfo.data.repo + deployFileJsonInfo.data.path, archiveRepo);
                await setArtifactProperties(context, archiveRepo, archiveRepo + "/" + filePattern, {["archiveProperty"]: [archiveProperty]});
                artifactsArchived++;
            } else {
                console.log('Not archiving artifact: ' + filePath)
                console.log('Timing archive policy status: ' + archiveTiming)
                console.log('Exclude properties policy status: ' + archiveExcludeProperties)
                console.log('Include properties policy status: ' + archiveIncludeProperties)
            }
            console.log('Process archived ' + artifactsArchived + ' total artifact(s)');
        }

    } catch (Error) {
        console.log("Artifactory archieved failed");
    }
}

export async function searchArtifacts(context: PlatformContext, filePattern: string, srcRepo: string): Promise<any[]> {
    const apiUrl = `artifactory/api/search/artifact?name=${filePattern}&repos=${srcRepo}`;
    const response = await context.clients.platformHttp.get(apiUrl);

    if (response.status !== 200) {
        throw new Error(`Error fetching artifacts: ${response.data}`);
    }
    return response.data.results;
}

export async function getItemInfo(context: PlatformContext, repoKey: string, filePath: string): Promise<ArtifactResponse> {
    const apiUrl = `artifactory/api/storage/${filePath}`;
    const response = await context.clients.platformHttp.get(apiUrl);
    if (response.status !== 200) {
        throw new Error(`Error fetching file information: ${response.data}`);
    }
    return response.data;
}

function getCompareDays(todayTime: number, policyTime: number): number {
    return (todayTime - policyTime) / ArchiveConstants.DAYS_TO_MILLIS;
}

function checkTimingPolicy(compareDays: number, days: number, artifact: string, policyName: string): boolean {
    if (compareDays >= days) {
        console.log(artifact + ' passed the ' + policyName + ' policy check (' + days + ' days)');
        return true;
    }
    console.log(artifact + ' did not pass the ' + policyName + ' policy check (' + days + ' days)');
    return false;
}

export function checkArchiveTimingPolicies(
    context: PlatformContext,
    itemInfo: object,
    lastModifiedDays: number,
    lastUpdatedDays: number,
    createdDays: number,
    lastDownloadedDays: number,
    ageDays: number,
    todayTime: number,
    srcRepo: string,
    filePath: string
): boolean {
    let compareDays: number;
    const itemInfoJsonString = JSON.stringify(itemInfo, null, 2); // Pretty print with 2-space indentation
    const parsedItemInfo = JSON.parse(itemInfoJsonString);
    if (lastModifiedDays !== 0) {
        const lastModifiedTime = new Date(parsedItemInfo.lastModified);
        console.log(`${filePath} was last modified: ${lastModifiedTime}`);
        compareDays = getCompareDays(todayTime, lastModifiedTime.getTime());
        console.log(`${filePath} days since last modified: ${compareDays}`);
        if (!checkTimingPolicy(compareDays, lastModifiedDays, filePath, 'last modified')) {
            return false;
        }
    }
    if (lastUpdatedDays !== 0) {
        const lastUpdatedTime = new Date(parsedItemInfo.lastUpdated);
        console.log(filePath + ' was last updated: ' + lastUpdatedTime);
        compareDays = getCompareDays(todayTime, lastUpdatedTime.getTime());
        if (!checkTimingPolicy(compareDays, createdDays, filePath, 'last updated')) {
            return false;
        }
    }
    if (createdDays !== 0) {
        const createdTime = new Date(parsedItemInfo.created).getTime(); // Convert to milliseconds
        console.log(filePath + ' was created: ' + createdTime);
        const todayTime = new Date().getTime(); // Get current time in milliseconds
        const compareDays = getCompareDays(todayTime, createdTime);
        console.log(filePath + ' days since created: ' + compareDays);
        if (!checkTimingPolicy(compareDays, createdDays, filePath, 'created')) {
            return false;
        }
    }

    if (lastDownloadedDays !== 0) {
        const statsInfo = getFileStatistics(context, srcRepo, filePath);
        if (statsInfo == null) {
            const statsInfoJsonString = JSON.stringify(statsInfo, null, 2); // Pretty print with 2-space indentation
            const parsedStatsInfo = JSON.parse(statsInfoJsonString);
            console.log('Artifact ' + filePath + ' stats info: ' + statsInfo);
            const lastDownloadedTime = new Date(parsedStatsInfo.lastDownloaded);
            compareDays = getCompareDays(todayTime, lastDownloadedTime.getTime());
            if (!checkTimingPolicy(compareDays, lastDownloadedDays, filePath, 'last downloaded')) {
                return false;
            }

        }
    }
    if (ageDays !== 0) {
        const compareTime = new Date();
        const fileCreationDate = new Date(parsedItemInfo.created);
        const fileAge = compareTime.getTime() - fileCreationDate.getTime();
        compareDays = fileAge / ArchiveConstants.DAYS_TO_MILLIS;
        if (!checkTimingPolicy(compareDays, ageDays, filePath, 'age')) {
            return false;
        }
    }
    return true;
}

export async function getFileStatistics(context: PlatformContext, repoKey: string, artifactPath: string): Promise<ArtifactStatistics> {
    const subPath = artifactPath.split('/')[1]?.split('/').slice(0, 2).join('/') || '';
    const apiUrl = `artifactory/api/storage/${repoKey}/${subPath}?stats`;
    const response = await context.clients.platformHttp.get(apiUrl);
    if (response.status !== 200) {
        throw new Error(`Error fetching file statistics: ${response.data}`);
    }
    console.log(`Fetched statistics for file: ${subPath}`);
    return response.data;
}

async function verifyProperties(
    context: PlatformContext,
    srcRepo: string,
    filePath: string,
    propertyMap: PropertyMap,
    inclusive: boolean
): Promise<boolean> {
    const response = await getArtifactProperties(context, srcRepo, filePath);
    const propertiesInfoJsonString = JSON.stringify(response.data.properties);
    const propertiesInfo = JSON.parse(propertiesInfoJsonString);
    if (response.status !== 200) {
        throw new Error(`Error fetching properties for artifact: ${propertiesInfo}`);
    }
    console.log("Got properties for artifact: " + propertiesInfoJsonString);

    for (const key in propertyMap) {
        if (propertiesInfo != null && propertiesInfo[key]) {
            const value = propertyMap[key];
            if (value !== undefined) {
                const valueSet = propertiesInfo[key];

                if (valueSet.includes(value)) {
                    console.log('Both have key:' + key + ' value:' + value);
                } else {
                    console.log('Both have key:' + key + ' but values differ. Value checked:' + value);
                    return !inclusive;
                }
            } else {
                console.log('We were not given a value for the provided key: ' + key + ' this is a match since the key matches.');
            }
        } else {
            console.log("The artifact did not contain the key: " + key);
            return !inclusive;
        }
    }
    return true;
}

function translatePropertiesString(properties: string): PropertyMap {
    const regex = /(\w.+)(:\w.)*(;(\w.+)(:\w.)*)*/;

    if (regex.test(properties)) {
        console.log(`Properties are of the proper format! Properties: ${properties}`);
    } else {
        console.error(`Properties are not of the proper format: ${properties}. Exiting now!`);
        throw new Error('Incorrect format for properties!');
    }
    const map: PropertyMap = {};

    const propertySets = properties.split(';'); // Use split instead of tokenize
    propertySets.forEach(set => {
        const [key, value] = set.split(':');
        map[key] = value !== undefined ? value : '';
    });

    return map;
}

export async function getArtifactProperties(
    context: PlatformContext,
    srcRepo: string,
    filePath: string,
): Promise<any> {
    const apiUrl = `artifactory/api/storage/${filePath}?properties`;
    const response = await context.clients.platformHttp.get(apiUrl);

    if (response.status !== 200) {
        throw new Error(`Error fetching artifact properties: ${response.data}`);
    }
    return response;
}

export async function setArtifactProperties(
    context: PlatformContext,
    repoKey: string,
    itemPath: string,
    properties: Record<string, string | string[]>,
    recursive: boolean = true
): Promise<any> {
    const key = Object.keys(properties)[0];
    const value = properties[key][0];
    const propertiesString = key + "=" + value
    const apiUrl = 'artifactory/api/storage/' + itemPath + '?properties=' + propertiesString;
    try {
        const response = await context.clients.platformHttp.put(apiUrl);
        if (response.status !== 204) {
            throw new Error('Error setting properties');
        }
    } catch (error) {
        console.error('Error during setArtifactProperties:')
    }

}

export async function deployArtifact(
    context: PlatformContext,
    repoKey: string,
    itemPath: string,
    filePattern: string
): Promise<any> {
    const apiUrl = "artifactory/" + repoKey + "/archived/" + filePattern;
    try {
        const response = await context.clients.platformHttp.put(apiUrl);
        if (response.status !== 201) {
            throw new Error("Error deploying artifact:" + itemPath);
        }
        console.log("Artifact deployed successfully to:" + itemPath);
        return response;
    } catch (error) {
        console.error("Error during artifact deployment:");
        throw error;
    }

}

export async function moveArtifact(
    context: PlatformContext,
    src: string,
    destination: string,
): Promise<any> {
    const apiUrl = "artifactory/api/move/" + src + "?to=/" + destination;
    try {
        const response = await context.clients.platformHttp.post(apiUrl);
    } catch (error) {
        throw error;
    }
}