import { Header, DownloadMetadata, Status, UserContext } from './commons';

export interface AfterDownloadRequest {
    /** Various immutable download metadata */
    metadata:
            | DownloadMetadata
            | undefined;
    /** The immutable request headers */
    headers: { [key: string]: Header };
    /** The user context which sends the request */
    userContext: UserContext | undefined;
}

export interface AfterDownloadResponse {
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** Indicates whether worker execution succeeded or failed */
    executionStatus?: Status;
}
