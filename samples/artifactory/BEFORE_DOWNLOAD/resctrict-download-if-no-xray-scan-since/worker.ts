import { PlatformContext, BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {

    let status: DownloadStatus = DownloadStatus.DOWNLOAD_UNSPECIFIED;

    try {
        // The in-browser HTTP client facilitates making calls to the JFrog REST APIs
        //To call an external endpoint, use 'await context.clients.axios.get("https://foo.com")'
        const res = await context.clients.platformHttp.get('/artifactory/api/v1/system/readiness');

        // You should reach this part if the HTTP request status is successful (HTTP Status 399 or lower)
        if (res.status === 200) {
            status = DownloadStatus.DOWNLOAD_PROCEED;
            console.log("Artifactory ping success");
        } else {
            status = DownloadStatus.DOWNLOAD_WARN;
            console.warn(`Request is successful but returned status other than 200. Status code : ${ res.status }`);
        }
    } catch(error) {
        // The platformHttp client throws PlatformHttpClientError if the HTTP request status is 400 or higher
        status = DownloadStatus.DOWNLOAD_STOP;
        console.error(`Request failed with status code ${ error.status || '<none>' } caused by : ${ error.message }`)
    }

    return {
        status,
        message: 'Overwritten by worker-service if an error occurs.',
    }
}
