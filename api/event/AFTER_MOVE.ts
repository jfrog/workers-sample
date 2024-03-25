import { ArtifactProperties, UploadMetadata, RepoPath, Status, UserContext } from './commons';

export interface AfterMoveRequest {
    /** Various immutable upload metadata */
    metadata: UploadMetadata | undefined;
    /** The immutable target repository path */
    targetRepoPath: RepoPath | undefined;
    /** The user context which sends the request */
    userContext: UserContext | undefined;
    /** The moved artifacts properties */
    artifactProperties: { [key: string]: ArtifactProperties };
}

export interface AfterMoveResponse {
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** Indicates whether worker execution succeeded or failed */
    executionStatus?: Status;
}
