import { PlatformContext } from 'jfrog-workers';


export default async function(context: PlatformContext, params: DeleteDeprecatedParams) {
    if (!params?.repos || params.repos.length === 0) {
        return { error: "There should be at least one repo" };
    }

    const dryRun = params.dryRun ?? true;

    try {
        let total = 0;
        total += await fileCleanup(context, "analysis.deprecated", "true", params.repos, dryRun);
    
        return { total };
    } catch (x) {
        return { error: x.message };
    }
}

async function fileCleanup(context: PlatformContext, propertyName: string, propertyValue: string, repos: Array<string>, dryRun: boolean ) {
    console.log(`Looking for files with property Analysis.deprecated set to true repo in ${JSON.stringify(repos)}`);

    const repositories = new Repositories(context)

    let totalDeleted = 0;

    const query = JSON.stringify({
        ["property.key"]: propertyName,
        ["$or"]: repos.map((repo) => ({ repo }))
    });

    const aql = `items.find(${query}).include("repo", "path", "name")`;

    for (const item of await searchAql(context, aql)) {
        const itemPath = item.repo + (item.path === '.' ? '' : item.path)+ "/" + item.name

        console.log(`Found: ${itemPath}`)

        const keyValue = await repositories.getProperty(itemPath, propertyName)
        console.debug(`For ${itemPath}, ${propertyName}=${propertyValue}`);
        if (keyValue !== undefined && keyValue.toString() === propertyValue) {
            console.log(`Deleting ${itemPath} (dryRun: ${dryRun})`);
            if (!dryRun) {
                await repositories.delete(itemPath);
            }
            console.log(`Deleted ${itemPath} (dryRun: ${dryRun})`);
            totalDeleted++
        }
    }

    if (totalDeleted > 0) {
        console.log(`Successfully deleted  ${totalDeleted} files matching (${propertyName} < ${propertyValue}) (dryRun: ${dryRun})`)
    } else {
        console.log(`No files with property: '${propertyName}' and property value less than '${propertyValue}' found. Did not delete anything`)
    }

    return totalDeleted;
}

class Repositories {
    constructor(private ctx: PlatformContext) {
    }

    async getProperty(itemPath: string, propertyKey: string): Promise<undefined | boolean | string> {
        console.debug(`GetProperty: ${itemPath}, ${propertyKey}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${itemPath}?properties=${encodeURIComponent(propertyKey)}`);
        const { properties } = res.data;
        if (properties && typeof properties === 'object') {
            const propertyValue = properties[propertyKey];
            if (typeof propertyValue === 'string' || typeof propertyValue === 'boolean') {
                return propertyValue;
            }
        }
        return undefined;
    }

    async delete(itemPath: string) {
        await this.ctx.clients.platformHttp.delete(`/artifactory/${itemPath}`);
    }
}


async function searchAql(context: PlatformContext, query: string) {
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
        console.warn(`AQL query failed: ${x.message}`);
    }
    return [];
}

interface DeleteDeprecatedParams {
    repos: Array<string>,
    dryRun: boolean
}