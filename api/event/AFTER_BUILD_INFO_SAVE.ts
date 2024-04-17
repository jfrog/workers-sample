import { Status } from './commons';

export interface AfterBuildInfoSaveRequest {
    /** Various immutable build run details */
    build: DetailedBuildRun | undefined;
}

export interface DetailedBuildRun {
    name: string;
    number: string;
    started: string;
    buildAgent: string;
    agent: string;
    durationMillis: number;
    principal: string;
    artifactoryPrincipal: string;
    url: string;
    parentName: string;
    parentNumber: string;
    buildRepo: string;
    modules: Module[];
    releaseStatus: string;
    promotionStatuses: PromotionStatus[];
}

export interface Module {
    id: string;
    artifacts: Artifact[];
    dependencies: Dependency[];
}

export interface Artifact {
    name: string;
    type: string;
    sha1: string;
    sha256: string;
    md5: string;
    remotePath: string;
    properties: string;
}

export interface Dependency {
    id: string;
    scopes: string;
    requestedBy: string;
}

export interface PromotionStatus {
    status: string;
    comment: string;
    repository: string;
    timestamp: string;
    user: string;
    ciUser: string;
}

export interface AfterBuildInfoSaveResponse {
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
    /** Indicates whether worker execution succeeded or failed */
    executionStatus: Status;
}
