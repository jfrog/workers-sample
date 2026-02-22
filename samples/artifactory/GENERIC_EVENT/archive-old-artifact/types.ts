export interface PropertyMap {
    [key: string]: string;
}

export interface Checksums {
    sha1: string;
    md5: string;
    sha256: string;
}

export interface Artifact {
    repo: string;
    path: string;
    created: string;
    createdBy: string;
    lastModified: string;
    modifiedBy: string;
    lastUpdated: string;
    downloadUri: string;
    mimeType: string;
    size: string;
    checksums: Checksums;
    originalChecksums: Checksums;
    uri: string;
}

export interface ArtifactResponse {
    artifact: Artifact;
}

export interface ArtifactStatistics {
    uri: string;
    downloadCount: number;
    lastDownloaded: number;
    remoteDownloadCount: number;
    remoteLastDownloaded: number;
}
