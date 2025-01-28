import { PlatformContext } from 'jfrog-workers';
import { AfterMoveRequest, AfterMoveResponse } from './types';

export default async (context: PlatformContext, data: AfterMoveRequest): Promise<AfterMoveResponse> => {
    let message = 'proceed';
    try {
        const targetRepoKey = data.target.repoPath.key;
        const targetPath = data.target.repoPath.path;

        if (targetPath.endsWith('.pom')) {
            await cleanupSnapshots(context, targetRepoKey, targetPath);
        }
    } catch (error) {
        console.error(`Error in afterMove: ${error.message}`);
        message = 'error';
    }
    return { message };
};

async function cleanupSnapshots(context: PlatformContext, releaseRepo: string, pomPath: string) {
    console.log(`Checking for snapshot cleanup after move: ${releaseRepo}, ${pomPath}`);

    const snapshotRepo = await findSnapshotRepo(context, releaseRepo);
    if (!snapshotRepo) return;

    const snapshotPath = pomPath.replace(/\/[^/]+\.pom$/, '-SNAPSHOT/');
    const snapshotFullPath = `${snapshotRepo}/${snapshotPath}`;

    console.log(`Deleting snapshot after move: ${snapshotFullPath}`);
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
