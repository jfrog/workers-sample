import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

/**
 * This worker is used to intercept the upload of a Docker image's.
 * It checks if the image is targeting a project repository and if the project key is present in the manifest.
 * A project repository is a repository that has a name that starts with the project key.
 */

// The label that should be present in the manifest
const PROJECT_KEY_LABEL = 'org.jfrog.artifactory.projectKey';

// The worker entry point
export default async (context: PlatformContext, data: BeforeUploadRequest): Promise<BeforeUploadResponse> => {
    let status: UploadStatus = UploadStatus.UPLOAD_PROCEED;
    let message: string = 'Proceed';

    try {

        // We should only intercept the docker image's manifest, as for the same image there are multiple layers.
        // And only the manifest contains annotations and labels
        if (isDockerManifest(data)) {
            const projectKey = getProjectKeyFromManifest(data);

            if (!projectKey) {
                status = UploadStatus.UPLOAD_STOP;
                message = `The project key is missing. Please add the label ${PROJECT_KEY_LABEL} to the manifest.`;
            } else if (!isProjectRepository(data, projectKey)) {
                // We stop the upload which to be targeting a project repository
                status = UploadStatus.UPLOAD_STOP;
                message = `Not targetting a project '${projectKey}' repository`;

                // We do a cleanup of the previously uploaded layers
                await removePreviouslyUploadedLayers(context, data);
            }
        }
    } catch (x) {
        status = UploadStatus.UPLOAD_WARN;
        message = `Error: ${x.message}`;
    }

    return { status, message, modifiedRepoPath: data.metadata.repoPath };
}

// Checks if the uploaded file is a Docker manifest (ends with manifest.json)
function isDockerManifest(data: BeforeUploadRequest): boolean {
    return data.metadata.repoPath.path.match(/^.*manifest.json$/g) !== null;
}

// Retrieves the project key from the manifest by looking for the label 'org.jfrog.artifactory.projectKey'
function getProjectKeyFromManifest(data: BeforeUploadRequest): string {
    return getArtifactProperty(data, `docker.label.${PROJECT_KEY_LABEL}`);
}

/**
 * Checks if the repository is a project repository by looking at the repository name.
 *
 * @param data The upload request data
 * @param projectKey The project key to check against
 * @returns <code>true</code> if the repository is a project repository, <code>false</code> otherwise
 */
function isProjectRepository(data: BeforeUploadRequest, projectKey: string): boolean {
    return new RegExp(`${projectKey}-.+`).test(data.metadata.repoPath.key);
}

/**
 * Some parts of the Docker image may have already been uploaded to Artifactory.
 * We should cleanup the previously uploaded layers if the manifest is not targeting a project repository.
 * We do this by checking if the layers are used by other manifests.
 * 
 * @param context  Worker context
 * @param data Upload request data
 */
async function removePreviouslyUploadedLayers(context: PlatformContext, data: BeforeUploadRequest): Promise<void> {
    const repoName = getArtifactProperty(data, 'docker.repoName');
    const repoKey = data.metadata.repoPath.key;

    // As layers can be shared by several manifests, we should only cleanup if there are no other manifests using the same layers
    const deployedVersions = await findDeployedVersions(context, repoKey, repoName);

    if (!deployedVersions.length) {
        await deleteArtifact(context, repoKey, repoName);
    }
}

/**
 * Looks for artifacts matching a given repository key and name.
 * 
 * @param context The worker context
 * @param repoKey The repository key
 * @param repoName The repository name
 * @param limit 
 * @returns 
 */
async function findDeployedVersions(context: PlatformContext, repoKey: string, repoName: string, limit = 2): Promise<Array<any>> {
    // Name filter
    const nameFilter = `"name":{"$match":"*manifest.json"}`;
    // Path filter
    const pathFilter = `"path":{"$match":"${repoName}/*"}`;
    // Items repos
    const reposFilter = `"repo":{"$eq":"${repoKey}"}`;

    let query = `items.find({${nameFilter},${reposFilter},${pathFilter}})`
    query = `${query}.include("path")`;
    query = `${query}.limit(${limit})`;

    const versions = await runAql(context, query);

    console.log(`Found ${versions.length} versions for ${repoKey}/${repoName}`);

    return versions;
}

/**
 * An utility function to get the value of a property from the artifact properties.
 * 
 * @param data The upload request data
 * @param property The property to get the value for
 * @returns The value of the property
 */
function getArtifactProperty(data: BeforeUploadRequest, property: string): any {
    const [value] = data.artifactProperties[property]?.value || [];
    return value;
}

/**
 * An utility function to run an AQL query.
 * 
 * @param context The worker context
 * @param query The AQL query to run
 * @returns The query results
 */
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

/**
 * Deletes an artifact from Artifactory.
 * 
 * @param context The worker context 
 * @param repoKey The repository key of the artifact
 * @param repoName The repository name of the artifact
 */
async function deleteArtifact(context: PlatformContext, repoKey: string, repoName: string): Promise<void> {
    console.log(`Deleting ${repoKey}/${repoName}`);
    await context.clients.platformHttp.delete(`/artifactory/${repoKey}/${repoName}`);
}