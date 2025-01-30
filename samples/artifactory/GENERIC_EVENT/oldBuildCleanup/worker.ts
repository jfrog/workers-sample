import { PlatformContext } from 'jfrog-workers';

class CancelException extends Error {
    constructor(message: string) {
        super(message);
    }
}

export default async function oldBuildCleanup(context: PlatformContext, data: BuildCleanupPayload) {
    try {
        checkInput(data);
        data.cleanArtifacts = data.cleanArtifacts ?? false;
        const { buildName, buildNumber, cleanArtifacts } = data;
        console.info(`Starting build cleanup for ${buildName} up to build number ${buildNumber}, cleanArtifacts: ${cleanArtifacts}`);

        const builds = await getBuilds(context, buildName);
        let buildList: BuildInfo[] = [];
        let deleteCount = 0;

        for (const build of builds) {
            if (parseInt(build.number, 10) <= buildNumber) {
                console.warn(`Deleting build: ${buildName}#${build.number}, including artifacts: ${cleanArtifacts}`);
                try {
                    await deleteBuild(context, buildName, build.number, cleanArtifacts);
                    deleteCount++;
                } catch (error) {
                    console.error(`Failed to delete build: ${buildName}#${build.number}`, error);
                }
            }
        }
        return { status: 'STATUS_SUCCESS', message: `${deleteCount} build(s) deleted` };
        
    } catch (x) {
        console.log(x.message);
        return { status: 'STATUS_FAILURE', message: x.message };
    }
}

function checkInput(data: BuildCleanupPayload) {
    if (!data.buildName) {
        throw new CancelException('buildName is a mandatory parameter.');
    }
    if (isNaN(data.buildNumber)) {
        throw new CancelException('buildNumber must be an integer.');
    }
}

async function getBuilds(context: PlatformContext, buildName: string): Promise<BuildInfo[]> {
    console.info(`Fetching builds for ${buildName}`);
    try {
        const response = await context.clients.platformHttp.get(`/artifactory/api/build/${buildName}`);
        return response.data.builds || [];
    } catch (error) {
        console.error(`Failed to fetch builds: ${error.message}`);
        return [];
    }
}

async function deleteBuild(context: PlatformContext, buildName: string, buildNumber: string, cleanArtifacts: boolean) {
    console.info(`Deleting build ${buildName}#${buildNumber}, cleanArtifacts: ${cleanArtifacts}`);
    try {
        const url = `/artifactory/api/build/${buildName}/${buildNumber}?artifacts=${cleanArtifacts}`;
        await context.clients.platformHttp.delete(url);
        console.info(`Successfully deleted build ${buildName}#${buildNumber}`);
    } catch (error) {
        console.error(`Failed to delete build ${buildName}#${buildNumber}: ${error.message}`);
    }
}

interface BuildCleanupPayload {
    buildName: string;
    buildNumber: number;
    cleanArtifacts: boolean;
}

interface BuildInfo {
    uri: string;
    number: string;
}