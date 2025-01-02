import { PlatformContext, BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    let forbiddenProperties: ForbiddenProperty[] = [];
    forbiddenProperties.push({
        key: "FORBIDDEN",
        values: ["true"]
    });

    let status: DownloadStatus = DownloadStatus.DOWNLOAD_PROCEED;
    let message = 'Allowing Download';

    try {
        const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${data.repoPath.key}/${data.repoPath.path}?properties`);
        const artifactData: {
            "properties": {
                [key: string]: string[]
            },
            "uri": string
        } = res.data;
        const properties = artifactData.properties;
        for(const forbiddenProperty of forbiddenProperties) {
            if(isPropertyPresent(forbiddenProperty, properties)) {
                status = DownloadStatus.DOWNLOAD_STOP;
                message = `Stopping Download because forbiddenProperty ${forbiddenProperty.key} is present with forbidden values`;
                break;
            }
        }
    } catch (error) {
        console.log(`Got error: ${JSON.stringify(error)}`);
        message = `Download proceed with a warning. Could not check if artifact is forbidden or not.`;
        status = DownloadStatus.DOWNLOAD_WARN;
    }

    return {
        status,
        message,
        headers: {}
    }

    type ForbiddenProperty = {
        key: string,
        values: string[]
    };
    type ArtifactProperties = {
        [key: string]: string[]
    }

    function isPropertyPresent(forbiddenProperty: ForbiddenProperty, artifactProperties: ArtifactProperties): boolean {
        const artifactPropertyKeys = new Set(Object.keys(artifactProperties));
        if(artifactPropertyKeys.has(forbiddenProperty.key)) {
            const artifactPropertyValues = new Set(artifactProperties[forbiddenProperty.key]);
            for(const forbiddenValue of forbiddenProperty.values) {
                if(artifactPropertyValues.has(forbiddenValue)){
                    return true;
                }
            }
        }
        return false;
    }
}