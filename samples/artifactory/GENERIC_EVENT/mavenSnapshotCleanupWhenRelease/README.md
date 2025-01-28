# MavenSnapshotCleanupWhenRelease Worker

## Overview
This worker is designed to clean up Maven snapshot files when their corresponding release files are created in JFrog Artifactory. It identifies snapshot files based on repository configurations and deletes them to free up storage and maintain repository hygiene.

## Features
- Cleans up Maven snapshot files based on repository configurations.
- Supports dry-run mode to simulate deletions before actual cleanup.
- Uses AQL queries to identify snapshot files efficiently.
- Validates repository configurations for Maven package type and release/snapshot handling.

## How It Works
1. The worker validates the input parameters.
2. For each repository pair:
   - Checks if the repositories are configured for Maven and handle releases/snapshots.
   - Constructs an AQL query to find snapshot files.
   - Deletes identified snapshot files if `dryRun` is set to `false`.
3. Logs the results of the cleanup process.

## Configuration

### Parameters
The worker accepts the following parameters:

| Parameter      | Type                        | Description                                                               |
| -------------- | --------------------------- | ------------------------------------------------------------------------- |
| `repositories` | `Array<RepositorySettings>` | List of repository pairs containing release and snapshot configurations.  |
| `dryRun`       | `boolean`                   | If `true`, simulates the cleanup without deleting files. Default: `true`. |

### RepositorySettings
Each repository setting includes:

| Field      | Type     | Description                      |
| ---------- | -------- | -------------------------------- |
| `release`  | `string` | Name of the release repository.  |
| `snapshot` | `string` | Name of the snapshot repository. |

### Output
- **Execution link**:
  ```
  curl -u your-username:your-api-key \
    -X POST \
    "${baseUrl}/worker/api/v1/execute/mavenSnapshotCleanupWhenRelease" \
    -H "Content-Type: application/json" \
    -d '{
          "repositories": [
            { "release": "maven-releases", "snapshot": "maven-snapshots" },
            { "release": "plugin-releases", "snapshot": "plugin-snapshots" }
          ],
          "dryRun": false
        }'
  ```

## How to Deploy
1. Build and deploy the worker using your preferred CI/CD pipeline or manual process.
2. Ensure the worker has the appropriate permissions to access and delete artifacts in the specified repositories.
3. Configure the worker to run with the required parameters via your orchestration platform.

## Best Practices
- **Dry Run First**: Always run the worker with `dryRun=true` initially to verify the artifacts that will be deleted.
- **Monitor Logs**: Review logs to ensure the worker is correctly identifying and deleting artifacts.
- **Use with Care**: This worker will permanently delete artifacts. Ensure backups are in place if necessary.