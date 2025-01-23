import { PlatformContext } from 'jfrog-workers';


export default async function(context: PlatformContext, params: DeleteByPropertyValueParams) {
    if (!params?.repos || params.repos.length === 0) {
        return { error: "There should be at least one repo" };
    }

    if (!params?.properties || Object.keys(params.properties).length === 0) {
        return { error: "There should be at least one property" };
    }

    try {
        let total = 0;
        for (const [propertyName, propertyValue] of Object.entries(params.properties)) {
            total += await fileCleanup(context, propertyName, propertyValue, params.repos, Boolean(params.dryRun));
        }
        return { total };
    } catch (x) {
        return { error: x.message };
    }
}

async function fileCleanup(context: PlatformContext, propertyName: string, propertyValue: number, repos: Array<string>, dryRun: boolean ) {
    console.log(`Looking for files with property of ${propertyName} with a value lower than ${propertyValue}... in ${JSON.stringify(repos)}`);

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
        if (keyValue !== undefined && keyValue < propertyValue) {
            console.log(`Deleting ${itemPath} (dryRun: $dryRun)`);
            if (!dryRun) {
                await repositories.delete(itemPath);
            }
            console.log(`Deleted ${itemPath} (dryRun: $dryRun)`);
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

    async getProperty(itemPath: string, propertyKey: string): Promise<number | undefined> {
        console.debug(`GetProperty: ${itemPath}, ${propertyKey}`)
        const res = await this.ctx.clients.platformHttp.get(`/artifactory/api/storage/${itemPath}?properties=${encodeURIComponent(propertyKey)}`);
        const { properties } = res.data;
        if (properties && typeof properties === 'object') {
            const propertyValue = properties[propertyKey];
            if (typeof propertyValue === 'number') {
                return propertyValue;
            }
            try {
                return Number.parseFloat(propertyValue);
            } catch (x) {
                console.warn(`Cannot parse ${propertyKey}=${propertyValue} of ${itemPath}: ${x.message}`);
            }
        }
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

interface DeleteByPropertyValueParams {
    repos: Array<string>,
    properties: Record<string, number>,
    dryRun: boolean
}