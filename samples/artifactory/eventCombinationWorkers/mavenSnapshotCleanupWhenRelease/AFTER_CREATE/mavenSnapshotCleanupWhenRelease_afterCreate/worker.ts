import { PlatformContext } from 'jfrog-workers';
import { AfterCreateRequest, AfterCreateResponse } from './types';

export default async (context: PlatformContext, data: AfterCreateRequest): Promise<AfterCreateResponse> => {
    let message = 'proceed';
    try {
        const repoKey = data.metadata.repoPath.key;
        const itemPath = data.metadata.repoPath.path;

        if (itemPath.endsWith('.pom')) {
            await cleanupSnapshots(context, repoKey, itemPath);
        }
    } catch (error) {
        console.error(`Error in afterCreate: ${error.message}`);
        message = 'error';
    }
    return { message };
};

async function cleanupSnapshots(context: PlatformContext, releaseRepo: string, pomPath: string) {
    console.log(`Checking for snapshot cleanup: ${releaseRepo}, ${pomPath}`);

    const snapshotRepo = await findSnapshotRepo(context, releaseRepo);
    if (!snapshotRepo) return;

    const snapshotPath = pomPath.replace(/\/[^/]+\.pom$/, '-SNAPSHOT/');
    const snapshotFullPath = `${snapshotRepo}/${snapshotPath}`;

    console.log(`Deleting snapshot: ${snapshotFullPath}`);
    await context.clients.platformHttp.delete(`/artifactory/${snapshotFullPath}`);
}

async function findSnapshotRepo(context: PlatformContext, releaseRepo: string): Promise<string | null> {
    try {
        const repoConfig = await context.clients.platformHttp.get(`/artifactory/api/repositories/${releaseRepo}`);
        if (repoConfig.data?.packageType === 'maven' && repoConfig.data.handleReleases) {
            return repoConfig.data.key.replace(/-releases$/, '-snapshots');
        }
    } catch (error) {
        console.error(`Failed to fetch repository configuration for ${releaseRepo}: ${error.message}`);
    }
    return null;
}
