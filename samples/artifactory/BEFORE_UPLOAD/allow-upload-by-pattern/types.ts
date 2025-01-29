
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
}

export interface ArtifactProperties {
    value: string[];
}

export interface UploadMetadata {
    /** The repoPath object of the request */
    repoPath:
            | RepoPath
            | undefined;
    /** The deploy request content length */
    contentLength: number;
    /** Last modification time that occurred */
    lastModified: number;
    /** Is the request trusting the server checksums */
    trustServerChecksums: boolean;
    /** The url that points to artifactory */
    servletContextUrl: string;
    /** Is it a request that skips jar indexing */
    skipJarIndexing: boolean;
    /** Is redirect disabled on this request */
    disableRedirect: boolean;
    /** Repository type */
    repoType: RepoType;
}

export interface RepoPath {
    /** The repo key */
    key: string;
    /** The path itself */
    path: string;
    /** The key:path combination */
    id: string;
    /** Is the path the root */
    isRoot: boolean;
    /** Is the path a folder */
    isFolder: boolean;
}

export interface Header {
    value: string[];
}

export interface UserContext {
    /** The username or subject */
    id: string;
    /** Is the context an accessToken */
    isToken: boolean;
    /** The realm of the user */
    realm: string;
}

export enum RepoType {
    REPO_TYPE_UNSPECIFIED = 0,
    REPO_TYPE_LOCAL = 1,
    REPO_TYPE_REMOTE = 2,
    REPO_TYPE_FEDERATED = 3,
    UNRECOGNIZED = -1,
}

export enum UploadStatus {
    UPLOAD_UNSPECIFIED = 0,
    UPLOAD_PROCEED = 1,
    UPLOAD_STOP = 2,
    UPLOAD_WARN = 3,
}
