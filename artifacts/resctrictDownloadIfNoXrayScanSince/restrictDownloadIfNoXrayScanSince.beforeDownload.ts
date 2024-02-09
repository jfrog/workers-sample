export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    const SECONDS = 1000;
    const EXPIRY = 30;
    let status: DownloadStatus = DownloadStatus.DOWNLOAD_UNSPECIFIED;
    let message = '';

    try {
        const res = await context.clients.platformHttp.post('/xray/api/v1/artifactDetails', {
            "repo": data.metadata.repoPath.key,
            "repo_type": 'maven', // This might be confusing, the REST endpoint expects the type of the package (not repo type like local, remote, etc.) which is not held in data
            "path": data.metadata.repoPath.path,
        });

        if (res.status === 200) {
            if (res.data.status_last_updated && Date.now() - res.data.status_last_updated < EXPIRY * SECONDS) {
                message = "Artifact scanned, proceed to download";
                status = DownloadStatus.DOWNLOAD_PROCEED;
            } else {
                message = `DOWNLOAD STOPPED : artifact scan is older than ${EXPIRY} seconds. Last scan date : ${new Date(Number.parseInt(res.data.status_last_updated))}`;
                status = DownloadStatus.DOWNLOAD_STOP;
            }
        } else {
            status = DownloadStatus.DOWNLOAD_WARN;
            message = 'Request returned unexpected result. Download will proceed with warning.'
        }
    } catch(error) {
        message = "Error during scan check. Download will proceed with warning.";
        status = DownloadStatus.DOWNLOAD_WARN;
        console.error(`Request failed with status code ${ error.status || '<none>' } caused by : ${ error.message }`);
    }

    return {
        status,
        message,
    }
}