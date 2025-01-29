
export interface BeforeCreateRequest {
    /** Various immutable upload metadata */
    metadata:
            | UploadMetadata
            | undefined;
    itemInfo: ItemInfo | undefined;
    /** The user context which sends the request */
    userContext: UserContext | undefined;
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

export interface BeforeCreateResponse {
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** The instruction of how to proceed */
    status: ActionStatus;
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

export interface ItemInfo {
    /** The repoPath object of the request */
    repoPath: RepoPath;
    /** Name of the Artifact **/
    name: string;
    /** Time of creation of the artifact **/
    created: number;
    /** Last modification time that occurred */
    lastModified: number;
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

export enum ActionStatus {
    UNSPECIFIED = 0,
    PROCEED = 1,
    STOP = 2,
    WARN = 3,
    UNRECOGNIZED = -1,
}