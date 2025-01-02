import { PlatformContext, BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    const thresholdDate = new Date(new Date().getUTCDate() - 7);
    const thresholdDays = 2;
    const isXrayAvailable = await checkIfXrayAvailable();
    if (!isXrayAvailable) {
        return {
            status: DownloadStatus.DOWNLOAD_WARN,
            message: "Could not check for xray scans because xray is not available. Proceeding download with warning.",
            headers: {} // This can be populated if response headers are required to be added/overriden. 
        }
    }

    let status: DownloadStatus = DownloadStatus.DOWNLOAD_UNSPECIFIED;
    let message = '';

    let responseData: {
        "data": [
            {
                "name": string,
                "repo_path": string,
                "package_id": string,
                "version": string,
                "sec_issues": {
                    "critical": number,
                    "high": number,
                    "low": number,
                    "medium": number,
                    "total": number
                },
                "scans_status": {
                    "overall": {
                        "status": string,
                        "time": string
                    }
                }
                "size": string,
                "violations": number,
                "created": string,
                "deployed_by": string,
                "repo_full_path": string
            }
        ],
        "offset": number
    } = null;

    try {
        const artifactName = data.metadata.repoPath.path.substr(data.metadata.repoPath.path.lastIndexOf('/') + 1);
        const repoKey = data.metadata.repoPath.key;

        const res = await context.clients.platformHttp.get(`/xray/api/v1/artifacts?repo=${repoKey}&search=${artifactName}&num_of_rows=1`);
        responseData = res.data;

        if (res.status === 200) {
            // console.log(responseData);
            console.log(responseData.data);
            const lastScanDetails = responseData.data[0].scans_status.overall;
            if (lastScanDetails.status !== "DONE") {
                return {
                    status: DownloadStatus.DOWNLOAD_WARN,
                    message: "Scan is on-going, proceeding with download with a warning.",
                    headers: {} // This can be populated if response headers are required to be added/overriden. 
                }
            } else {
                const lastScanDate = new Date(lastScanDetails.time);
                const currentDate = new Date();
                console.log(differenceInDays(lastScanDate, currentDate));
                if (thresholdDays < differenceInDays(lastScanDate, currentDate)) {
                    return {
                        status: DownloadStatus.DOWNLOAD_STOP,
                        message: `Stopping Download, because last scan date is older than allowed threshold duration of ${thresholdDays} days.`,
                        headers: {}
                    }
                } else if(lastScanDate<thresholdDate) {
                    return {
                        status: DownloadStatus.DOWNLOAD_STOP,
                        message: `Stopping Download, because last scan date is older than allowed threshold last date of ${thresholdDate.toUTCString()}.`,
                        headers: {}
                    }
                } 
                return {
                    status: DownloadStatus.DOWNLOAD_PROCEED,
                    message: `Proceeding with download`,
                    headers: {}
                }
            }
        } else {
            status = DownloadStatus.DOWNLOAD_WARN;
            message = 'Request returned unexpected result. Download will proceed with warning.'
        }
    } catch (error) {
        message = `Encountered error: ${error.message} during scan check. Download will proceed with warning.`;
        status = DownloadStatus.DOWNLOAD_WARN;
        console.error(`Request failed: ${error.message}`);
    }

    return {
        status,
        message,
        headers: {} // This can be populated if response headers are required to be added/overriden.
    }


    async function checkIfXrayAvailable(): Promise<boolean> {
        let response;
        try {
            response = await context.clients.platformHttp.get('/xray/api/v1/system/ping');
            if (response.data.status !== "pong") {
                throw new Error("Xray not available");
            }
            return true;
        } catch (error) {
            console.log(`Encountered error ${error.message} while checking for xray readiness. Allowing download with a warning`);
            return false;
        }

    }

    function differenceInDays(lastScanDate: Date, currentDate: Date): number {
        const differenceInTime = currentDate.getTime() - lastScanDate.getTime();
        return Math.round(differenceInTime / (1000 * 3600 * 24));
    }
}