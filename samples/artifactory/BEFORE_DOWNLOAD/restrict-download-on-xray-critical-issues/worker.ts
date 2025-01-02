import { PlatformContext, BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    const MAX_CRITICAL_SEC_ISSUES_ACCEPTED = 2;
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
            const critialIssues: number = Array.isArray(responseData?.data) && responseData.data[0].sec_issues?.critical || 0;
            if (critialIssues < MAX_CRITICAL_SEC_ISSUES_ACCEPTED) {
                message = `Artifact has less than ${MAX_CRITICAL_SEC_ISSUES_ACCEPTED} security issues: proceed with the download.`;
                status = DownloadStatus.DOWNLOAD_PROCEED;
            } else {
                message = `DOWNLOAD STOPPED : artifact scan shows ${critialIssues} critical security issues.`;
                status = DownloadStatus.DOWNLOAD_STOP;
            }
        } else {
            status = DownloadStatus.DOWNLOAD_WARN;
            message = 'Request returned unexpected result. Download will proceed with warning.'
        }
    } catch (error) {
        message = "Error during scan check. Download will proceed with warning.";
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
}