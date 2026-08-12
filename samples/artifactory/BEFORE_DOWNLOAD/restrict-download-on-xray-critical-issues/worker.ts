import { PlatformContext } from 'jfrog-workers';
import { BeforeDownloadRequest, BeforeDownloadResponse, DownloadStatus } from './types';

export default async (context: PlatformContext, data: BeforeDownloadRequest): Promise<BeforeDownloadResponse> => {
    const MAX_CRITICAL_SEC_ISSUES_ACCEPTED = 2;
    const isXrayAvailable = await checkIfXrayAvailable(context);
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
        "data": Array<{
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
        }>,
        "offset": number
    };

    try {
        if (!data.metadata?.repoPath) {
            throw new Error('Missing repoPath metadata on the download request');
        }
        const repoPath = data.metadata.repoPath.path;
        const repoKey = data.metadata.repoPath.key;
        // search= only free-text matches on artifact name, so it can return several
        // artifacts sharing that name (e.g. every Docker tag's manifest.json); we must
        // pick out the one that is actually being downloaded rather than trusting data[0].
        const artifactName = repoPath.slice(repoPath.lastIndexOf('/') + 1);
        const expectedRepoFullPath = `${repoKey}/${repoPath}`;

        const res = await context.clients.platformHttp.get(`/xray/api/v1/artifacts?repo=${repoKey}&search=${artifactName}&num_of_rows=100`);
        responseData = res.data;

        if (res.status === 200) {
            const matchedArtifact = responseData?.data?.find(artifact => artifact.repo_full_path === expectedRepoFullPath);
            if (!matchedArtifact) {
                message = 'Could not find an Xray scan result matching this artifact. Download will proceed with warning.';
                status = DownloadStatus.DOWNLOAD_WARN;
            } else {
                const critialIssues: number = matchedArtifact.sec_issues?.critical || 0;
                if (critialIssues < MAX_CRITICAL_SEC_ISSUES_ACCEPTED) {
                    message = `Artifact has less than ${MAX_CRITICAL_SEC_ISSUES_ACCEPTED} security issues: proceed with the download.`;
                    status = DownloadStatus.DOWNLOAD_PROCEED;
                } else {
                    message = `DOWNLOAD STOPPED : artifact scan shows ${critialIssues} critical security issues.`;
                    status = DownloadStatus.DOWNLOAD_STOP;
                }
            }
        } else {
            status = DownloadStatus.DOWNLOAD_WARN;
            message = 'Request returned unexpected result. Download will proceed with warning.'
        }
    } catch (error: any) {
        message = "Error during scan check. Download will proceed with warning.";
        status = DownloadStatus.DOWNLOAD_WARN;
        console.error(`Request failed: ${error.message}`);
    }

    return {
        status,
        message,
        headers: {} // This can be populated if response headers are required to be added/overriden.
    }
}

async function checkIfXrayAvailable(context: PlatformContext): Promise<boolean> {
    let response;
    try {
        response = await context.clients.platformHttp.get('/xray/api/v1/system/ping');
        if (response.data.status !== "pong") {
            throw new Error("Xray not available");
        }
        return true;
    } catch (error: any) {
        console.log(`Encountered error ${error.message} while checking for xray readiness. Allowing download with a warning`);
        return false;
    }
}
