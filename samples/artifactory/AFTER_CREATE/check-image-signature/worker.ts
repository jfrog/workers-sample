import { PlatformContext, AfterCreateRequest, AfterCreateResponse } from 'jfrog-workers';

/**
 * This worker is used to intercept the creation of a Docker image.
 * It checks if the image is signed and if not, it removes the image.
 * An image is considered signed if a signature file exists for the manifest.
 */

// Worker entry point
export default async (context: PlatformContext, data: AfterCreateRequest): Promise<AfterCreateResponse> => {

    let message = 'proceed';

    if (isDockerManifest(data)) {
        try {
            const repoInfos = extractRepoInfos(data);
            // We remove the image if it is not signed
            if (!(await isSigned(context, repoInfos))) {
                message = `Removing unsigned image ${data.metadata.repoPath.id}`;
                await deleteImage(context, repoInfos);
            }
        } catch (error) {
            console.error(`Unexpected error: ${error.message}`)
        }
    }

    return { message };
}

// Checks if the uploaded file is a Docker manifest (ends with manifest.json)
function isDockerManifest(data: AfterCreateRequest): boolean {
    return data.metadata.repoPath.path.match(/^.*manifest.json$/g) !== null;
}

// Checks if the image is signed, by looking for a signature file.
async function isSigned(context: PlatformContext, data: ReturnType<typeof extractRepoInfos>): Promise<boolean> {
    const manifestSha = await getImageSha256(context, data);

    if (!manifestSha) {
        console.log(`No SHA found for ${data.repoKey}/${data.repoName}/${data.version}`);
        return false;
    }

    try {
        const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${data.repoKey}/${data.repoName}/_uploads/sha256-${manifestSha}.sig`);
        return res.status >= 200 && res.status < 300;
    } catch (error) {
        console.error(`Error while checking signature: ${error.message}`);
    }

    return false;
}

// Removes the image if it is not signed
async function deleteImage(context: PlatformContext, data: ReturnType<typeof extractRepoInfos>): Promise<void> {
    const { repoKey, repoName, version } = data;

    // As layers can be shared by several manifests, we should only cleanup if there are no other manifests using the same layers
    const deployedVersions = await findDeployedVersions(context, repoKey, repoName);

    if (deployedVersions.length === 1) {
        // Only one version present, we can delete the whole image
        await deleteArtifact(context, repoKey, repoName);
    } else {
        // We delete only the version
        await deleteArtifact(context, repoKey, `${repoName}/${version}`);
    }
}

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

function extractRepoInfos(data: AfterCreateRequest): { repoKey: string, repoName: string, version: string } {
    const repoKey = data.metadata.repoPath.key;

    const pathParts = data.metadata.repoPath.path.split('/');

    // The last part is the manifest.json file
    pathParts.pop();
    // The part before the last is the version
    const version = pathParts.pop();
    // The rest is the repo name
    const repoName = pathParts.join('/');

    return { repoKey, repoName, version };
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

async function deleteArtifact(context: PlatformContext, repoKey: string, repoName: string): Promise<void> {
    console.log(`Deleting ${repoKey}/${repoName}`);
    await context.clients.platformHttp.delete(`/artifactory/${repoKey}/${repoName}`);
}

async function getImageSha256(context: PlatformContext, data: ReturnType<typeof extractRepoInfos>): Promise<string> {
    const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${data.repoKey}/${data.repoName}/${data.version}/manifest.json`);
    return res.data?.checksums?.sha256;
}