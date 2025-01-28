import { PlatformContext } from 'jfrog-workers';

export default async function(context: PlatformContext, params: MavenSnapshotCleanupParams) {
    if (!params?.repositories || params.repositories.length === 0) {
        return { error: "There should be at least one repository pair." };
    }

    const dryRun = params.dryRun ?? true;

    try {
        let total = 0;
        total += await cleanupSnapshots(context, params.repositories, dryRun);

        return { total };
    } catch (error) {
        return { error: error.message };
    }
}

async function cleanupSnapshots(context: PlatformContext, repositories: Array<RepositorySettings>, dryRun: boolean) {
    console.log(`Cleaning up Maven snapshots for repositories: ${JSON.stringify(repositories)}`);

    const repoManager = new Repositories(context);
    let totalDeleted = 0;

    for (const { release, snapshot } of repositories) {
        console.log(`Processing release: ${release}, snapshot: ${snapshot}`);

        const releaseConfig = await repoManager.getRepositoryConfiguration(release);
        const snapshotConfig = await repoManager.getRepositoryConfiguration(snapshot);

        if (
            releaseConfig?.packageType === 'maven' &&
            releaseConfig.handleReleases &&
            snapshotConfig?.packageType === 'maven' &&
            snapshotConfig.handleSnapshots
        ) {
            const query = JSON.stringify({
                repo: snapshot,
                path: { $match: `*-SNAPSHOT/` },
                name: { $match: `*.pom` },
            });

            const aql = `items.find(${query}).include("repo", "path", "name")`;

            for (const item of await searchAql(context, aql)) {
                const itemPath = `${item.repo}/${item.path === '.' ? '' : item.path}/${item.name}`;

                console.log(`Found: ${itemPath}`);

                if (!dryRun) {
                    await repoManager.delete(itemPath);
                    console.log(`Deleted: ${itemPath}`);
                }

                totalDeleted++;
            }
        } else {
            console.error(
                `Skipping repository pair: ${release}/${snapshot} (invalid configuration)`
            );
        }
    }

    if (totalDeleted > 0) {
        console.log(`Deleted ${totalDeleted} snapshot files (dryRun: ${dryRun})`);
    } else {
        console.log(`No snapshots found to delete (dryRun: ${dryRun})`);
    }

    return totalDeleted;
}

class Repositories {
    constructor(private context: PlatformContext) {}

    async getRepositoryConfiguration(repoKey: string): Promise<RepositoryConfig | undefined> {
        try {
            const res = await this.context.clients.platformHttp.get(`/artifactory/api/repositories/${repoKey}`);
            return res.data as RepositoryConfig;
        } catch (error) {
            console.error(`Failed to fetch repository configuration for ${repoKey}: ${error.message}`);
        }
    }

    async delete(itemPath: string) {
        await this.context.clients.platformHttp.delete(`/artifactory/${itemPath}`);
    }
}

async function searchAql(context: PlatformContext, query: string) {
    console.log(`Running AQL: ${query}`);
    try {
        const response = await context.clients.platformHttp.post(
            '/artifactory/api/search/aql',
            query,
            { 'Content-Type': 'text/plain' }
        );
        return (response.data.results || []) as Array<any>;
    } catch (error) {
        console.warn(`AQL query failed: ${error.message}`);
    }
    return [];
}

interface MavenSnapshotCleanupParams {
    repositories: Array<RepositorySettings>;
    dryRun: boolean;
}

interface RepositorySettings {
    release: string;
    snapshot: string;
}

interface RepositoryConfig {
    packageType: string;
    handleReleases: boolean;
    handleSnapshots: boolean;
}