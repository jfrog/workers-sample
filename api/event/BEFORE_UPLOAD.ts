import { Header, RepoType, RepoPath, Status, UserContext, ArtifactProperties, UploadMetadata } from './commons';

export interface BeforeUploadRequest {
    /** Various immutable upload metadata */
    metadata:
            | UploadMetadata
            | undefined;
    /** The immutable request headers */
    headers: { [key: string]: Header };
    /** The user context which sends the request */
    userContext:
            | UserContext
            | undefined;
    /** The properties of the request */
    artifactProperties: { [key: string]: ArtifactProperties };
}

export interface BeforeUploadResponse {
    /** The instruction of how to proceed */
    status: UploadStatus;
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** The modified repo path from the worker */
    modifiedRepoPath:
            | RepoPath
            | undefined;
    /** Indicates whether worker execution succeeded or failed */
    executionStatus?: Status;
}

export enum UploadStatus {
    UPLOAD_UNSPECIFIED = 0,
    UPLOAD_PROCEED = 1,
    UPLOAD_STOP = 2,
    UPLOAD_WARN = 3,
}