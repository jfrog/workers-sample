interface DetailedBuildRun {
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

interface Module {
    id: string;
    artifacts: Artifact[];
    dependencies: Dependency[];
}

interface Artifact {
    name: string;
    type: string;
    sha1: string;
    sha256: string;
    md5: string;
    remotePath: string;
    properties: string;
}

interface Dependency {
    id: string;
    scopes: string;
    requestedBy: string;
}

interface PromotionStatus {
    status: string;
    comment: string;
    repository: string;
    timestamp: string;
    user: string;
    ciUser: string;
}

export interface AfterBuildInfoSaveRequest {
    /** Various immutable build run details */
    build: DetailedBuildRun;
}

export interface ArtifactPathInfo {
    repo: string;
    path: string;
}
