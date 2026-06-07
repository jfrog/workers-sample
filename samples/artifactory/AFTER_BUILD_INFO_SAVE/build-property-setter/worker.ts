import {PlatformContext, Status} from "jfrog-workers";
import {AfterBuildInfoSaveRequest, ArtifactPathInfo} from "./types";

export default async function setBuildProperty(
    context: PlatformContext,
    data: AfterBuildInfoSaveRequest
): Promise<{ message: string; executionStatus: Status }> {
    try {
        const buildName = data.build.name;
        const currentBuildNumber = data.build.number;
        const previousBuildResponse = await context.clients.platformHttp.get(
            `/artifactory/api/build/${buildName}`
        );

        const previousBuildNumbers = new Set<string>();

        for (const build of previousBuildResponse.data.buildsNumbers) {
            const buildNumber = build.uri.replace(/^\/+/, "");
            if (buildNumber != currentBuildNumber) {
                previousBuildNumbers.add(buildNumber);
            }
        }

        if (previousBuildNumbers.size >= 1) {
            await processPropertyCleanupForPreviousBuilds(
                context,
                buildName,
                previousBuildNumbers
            );
        }

        await processCurrentBuildForSettingProperty(
            context,
            buildName,
            currentBuildNumber
        );
    } catch (error) {
        console.error(
            `Request failed with status code ${error.status || "<none>"} caused by: ${error.message
            }`
        );
        return {
            message: "Error occurred",
            executionStatus: Status.STATUS_FAIL,
        };
    }
    return {
        message: "Successfully set property for artifacts",
        executionStatus: Status.STATUS_SUCCESS,
    };
}

async function processPropertyCleanupForPreviousBuilds(
    context: PlatformContext,
    buildName: string,
    previousBuildNumbers: Set<string>
) {
    console.info(
        "Finding all artifacts with latest set from the build numbers: " +
        Array.from(previousBuildNumbers)
    );
    const artifactsForPropertyRemoval = new Map<string, ArtifactPathInfo>();

    for (const buildNumber of previousBuildNumbers) {
        await fetchAndExtractBuildDetailsForPropertyRemoval(
            context,
            buildName,
            buildNumber,
            artifactsForPropertyRemoval
        );
    }

    for (const artifactInfo of artifactsForPropertyRemoval.values()) {
        await deleteProperty(context, artifactInfo.repo, artifactInfo.path);
    }
}

async function processCurrentBuildForSettingProperty(
    context: PlatformContext,
    buildName: string,
    currentBuildNumber: string
) {
    console.info(
        `Setting property latest to value true for artifacts in build number ${currentBuildNumber}`
    );
    const artifactSet = new Set<ArtifactPathInfo>();

    await fetchAndExtractBuildDetailsForPropertyUpdate(
        context,
        buildName,
        currentBuildNumber,
        artifactSet
    );

    for (const artifactInfo of artifactSet) {
        await setProperty(context, artifactInfo.repo, artifactInfo.path);
    }
}

async function populateArtifactsForPropertyRemoval(
    modules: any,
    artifactsForPropertyRemoval: Map<string, ArtifactPathInfo>
) {
    for (const module of modules) {
        if (Array.isArray(module.artifacts)) {
            for (const artifact of module.artifacts) {
                const artifactFullPath =
                    artifact.originalDeploymentRepo + "/" + artifact.path;
                if (!artifactsForPropertyRemoval.has(artifactFullPath)) {
                    const artifactPathInfo: ArtifactPathInfo = {
                        repo: artifact.originalDeploymentRepo,
                        path: artifact.path,
                    };
                    artifactsForPropertyRemoval.set(artifactFullPath, artifactPathInfo);
                }
            }
        } else {
            console.warn("A module was skipped as no artifact array was found");
        }
    }
}

async function populateArtifactsForPropertyUpdate(
    modules: any,
    artifactsForPropertyUpdate: Set<ArtifactPathInfo>
) {
    for (const module of modules) {
        if (Array.isArray(module.artifacts)) {
            for (const artifact of module.artifacts) {
                const artifactPathInfo: ArtifactPathInfo = {
                    repo: artifact.originalDeploymentRepo,
                    path: artifact.path,
                };
                artifactsForPropertyUpdate.add(artifactPathInfo);
            }
        } else {
            console.warn(`A module was skipped as no artifact array was found`);
        }
    }
}

async function fetchAndExtractBuildDetailsForPropertyRemoval(
    context: PlatformContext,
    buildName: string,
    buildNumber: string,
    artifactsForPropertyRemoval: Map<string, ArtifactPathInfo>
) {
    const buildResponse = await context.clients.platformHttp.get(
        `/artifactory/api/build/${buildName}/${buildNumber}`
    );
    if (buildResponse.status === 200) {
        const buildData = buildResponse.data;
        const modules = buildData.buildInfo.modules;
        if (Array.isArray(modules)) {
            populateArtifactsForPropertyRemoval(modules, artifactsForPropertyRemoval);
        } else {
            console.warn(
                "No modules found in the build data or modules is not an array"
            );
        }
    } else {
        console.warn(
            `Failed to retrieve build data, status code: ${buildResponse.status}`
        );
        throw new Error(`build fetch failed for build number: ${buildNumber}`);
    }
}

async function fetchAndExtractBuildDetailsForPropertyUpdate(
    context: PlatformContext,
    buildName: string,
    buildNumber: string,
    artifactsForPropertyUpdate: Set<ArtifactPathInfo>
) {
    const buildResponse = await context.clients.platformHttp.get(
        `/artifactory/api/build/${buildName}/${buildNumber}`
    );
    if (buildResponse.status === 200) {
        const buildData = buildResponse.data;
        const modules = buildData.buildInfo.modules;
        if (Array.isArray(modules)) {
            populateArtifactsForPropertyUpdate(modules, artifactsForPropertyUpdate);
        } else {
            console.warn(
                "No modules found in the build data or modules is not an array"
            );
        }
    } else {
        console.warn(
            `Failed to retrieve build data, status code: ${buildResponse.status}`
        );
        throw new Error(`build fetch failed for build number: ${buildNumber}`);
    }
}

async function deleteProperty(
    context: PlatformContext,
    repository: string,
    path: string
) {
    const updateResponse = await context.clients.platformHttp.delete(
        `/artifactory/api/storage/${repository}/${path}?properties=latest`
    );

    if (updateResponse.status !== 204) {
        console.error(
            `Failed to delete properties for ${path}, status code: ${updateResponse.status}`
        );
        throw new Error("failed to remove property from an artifact");
    }
}

async function setProperty(
    context: PlatformContext,
    repository: string,
    path: string
) {
    const properties = `latest=true`;
    const updateResponse = await context.clients.platformHttp.put(
        `/artifactory/api/storage/${repository}/${path}?properties=${properties}`
    );

    if (updateResponse.status !== 204) {
        console.error(
            `Failed to set property for artifact: ${path} with status code: ${updateResponse.status}`
        );
        throw new Error("failed to set property");
    }
}
