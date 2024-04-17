import { Header, DownloadMetadata, RepoPath, Status, UserContext } from './commons';

export interface BeforeDownloadRequest {
    /** Various immutable download metadata */
    metadata:
            | DownloadMetadata
            | undefined;
    /** The immutable request headers */
    headers: { [key: string]: Header };
    /** The user context which sends the request */
    userContext:
            | UserContext
            | undefined;
    /** The response repoPath */
    repoPath: RepoPath | undefined;
}

export interface BeforeDownloadResponse {
    /** The instruction of how to proceed */
    status: DownloadStatus;
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** Indicates whether worker execution succeeded or failed */
    executionStatus?: Status;
}

export enum DownloadStatus {
    DOWNLOAD_UNSPECIFIED = 0,
    DOWNLOAD_PROCEED = 1,
    DOWNLOAD_STOP = 2,
    DOWNLOAD_WARN = 3,
    UNRECOGNIZED = -1,
}