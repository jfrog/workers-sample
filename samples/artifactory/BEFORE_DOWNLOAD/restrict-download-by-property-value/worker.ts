import { PlatformContext, BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from 'jfrog-workers';


export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    const EXPECTED_PROPERTY_KEY = 'FORBIDDEN';
    const EXPECTED_PROPERTY_VALUE = 'true';

    let status: DownloadStatus = DownloadStatus.DOWNLOAD_UNSPECIFIED;
    let message = '';

    try {
        const res = await context.clients.platformHttp.get(`/artifactory/api/storage/${data.repoPath.key}/${data.repoPath.path}?properties`);
        const artifactData: { // Data structure from Artifactory endpoint: https://jfrog.com/help/r/jfrog-rest-apis/item-properties
            "properties": {
                [key: string]: string[]
            },
            "uri": string
        } = res.data;

        if (artifactData.properties[EXPECTED_PROPERTY_KEY] && artifactData.properties[EXPECTED_PROPERTY_KEY][0] === EXPECTED_PROPERTY_VALUE) {
            message = `Download is forbidden. The artifact ${data.repoPath.key}/${data.repoPath.path} has the property ${EXPECTED_PROPERTY_KEY} = ${EXPECTED_PROPERTY_VALUE}`;
            status = DownloadStatus.DOWNLOAD_STOP;
        } else {
            message = "Download can proceed";
            status = DownloadStatus.DOWNLOAD_PROCEED;
        }
    } catch(error) {
        message = `Download proceed with a warning. Could not check if artifact is forbidden or not.`;
        status = DownloadStatus.DOWNLOAD_WARN;
    }

    return {
        status,
        message,
    }
}
