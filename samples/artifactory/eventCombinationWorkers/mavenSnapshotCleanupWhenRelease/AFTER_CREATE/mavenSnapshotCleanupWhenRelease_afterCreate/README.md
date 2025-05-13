# MavenSnapshotCleanupWhenRelease Workers

## Overview

The `afterCreate` and `afterMove` workers work together to clean up Maven snapshot files when their corresponding release files are created or moved in JFrog Artifactory. These workers ensure that obsolete snapshot files are removed once a stable release is available, optimizing storage and maintaining repository hygiene.

## Features

- **Automated Cleanup**: Deletes old Maven snapshot versions when a corresponding release is created or moved.
- **Event-Driven Execution**: Listens for artifact creation (`afterCreate`) and artifact movement (`afterMove`).
- **Smart Repository Handling**: Determines snapshot repositories linked to release repositories dynamically.
- **Logging & Error Handling**: Provides detailed logs for debugging and ensures errors do not block the process.

## Workers

### 1. afterCreate Worker

**Trigger**: Runs when a new artifact is created in a repository.

**Functionality**:
- Checks if the newly created file is a Maven POM (`.pom` file).
- Identifies the associated snapshot repository.
- Cleans up corresponding snapshot versions if applicable.

### 2. afterMove Worker

**Trigger**: Runs when an artifact is moved between repositories.

**Functionality**:
- Detects when an artifact is moved from a staging or development repository to a release repository.
- Identifies the related snapshot repository.
- Cleans up old snapshot versions corresponding to the released artifact.

## How It Works

1. A release POM file is created (afterCreate triggers cleanup of snapshots).
2. Artifacts are moved from staging to a release repository (afterMove triggers additional cleanup).
3. The snapshot repository is determined dynamically based on the release repository name.
4. The corresponding snapshot artifacts are identified and deleted to free up space.
5. Logs are generated for traceability and debugging.

## Deployment & Configuration

### Parameters

The workers require minimal configuration as they automatically infer the snapshot repository from the release repository.

| **Parameter** | **Type**                    | **Description**                                                                 |
|---------------|-----------------------------|---------------------------------------------------------------------------------|
| `context`     | PlatformContext             | Provides API access for repository operations.                                 |
| `data`        | AfterCreateRequest / AfterMoveRequest | Contains event data, such as repository key and artifact path.               |

### Example Execution

#### After Create Trigger:

```
curl -u user:apiKey -X POST "${baseUrl}/worker/api/v1/execute/afterCreate" \
  -H "Content-Type: application/json" \
  -d '{ "metadata": { "repoPath": { "key": "maven-releases", "path": "com/example/app/1.0.0/app-1.0.0.pom" } } }'
```

#### After Move Trigger:

```
curl -u user:apiKey -X POST "${baseUrl}/worker/api/v1/execute/afterMove" \
  -H "Content-Type: application/json" \
  -d '{ "sourceRepo": "staging-repo", "targetRepo": "maven-releases", "itemPath": "com/example/app/1.0.0/app-1.0.0.jar" }'
```

## Best Practices

1. Monitor Logs: Ensure the correct snapshot versions are being removed.
2. Use with Care: These workers perform deletions; verify configurations to prevent unintended removals.