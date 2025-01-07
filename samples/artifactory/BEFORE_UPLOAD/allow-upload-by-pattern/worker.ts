import { PlatformContext, BeforeUploadRequest, BeforeUploadResponse, UploadStatus } from 'jfrog-workers';

export default async (context: PlatformContext, data: BeforeUploadRequest): Promise<BeforeUploadResponse> => {
    // This RegExp will match all repopaths that start with 'org/company/' and end with the extension .jar OR .war
    // For instance those paths will match the regex :
    //  - org/company/src/app.jar
    //  - org/company/package1/subPackage/webapp.war
    const authorizedPathRegEx = /^org\/company\/(?:\w+.\/)+[\w\-\.]+\.(?:jar|war)$/;
    let status: UploadStatus = UploadStatus.UPLOAD_UNSPECIFIED;
    let message = "";

    try {
        if (authorizedPathRegEx.exec(data.metadata.repoPath.path)) {
            status = UploadStatus.UPLOAD_PROCEED;
            message = `RepoPath '${data.metadata.repoPath.path}' is acceptable for the repository '${data.metadata.repoPath.key}'`;
        } else {
            status = UploadStatus.UPLOAD_STOP;
            message = `RepoPath '${data.metadata.repoPath.path}' does not match the regex ${authorizedPathRegEx} for the repository '${data.metadata.repoPath.key}'`;
        }
    } catch(error) {
        status = UploadStatus.UPLOAD_WARN;
        console.error(`could not check the path: ${error}`);
        message = `An error occurred during the check. Proceed with warning.`;
    }

    return {
        status,
        message,
        modifiedRepoPath: data.metadata.repoPath
    }
}
