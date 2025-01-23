# delete-deprecated Worker

## Overview
The `delete-deprecated` worker is designed to delete artifacts from JFrog Artifactory repositories based on the property `analysis.deprecated=true`. This worker ensures that deprecated artifacts can be efficiently removed, helping to maintain clean and relevant repositories.

## Features
- Deletes artifacts with the property `analysis.deprecated=true`.
- Supports specifying multiple repositories for the deletion operation.
- Includes a dry-run mode to simulate deletions without removing any artifacts.

## How It Works
The worker performs the following steps:
1. Searches for artifacts in the specified repositories with the property `analysis.deprecated=true`.
2. Deletes matching artifacts if the `dryRun` parameter is set to `false`.
3. Logs the results, including the number of artifacts deleted or found in dry-run mode.

## Parameters
The worker accepts the following parameters:

| Parameter  | Type          | Description                                                                                     |
|------------|---------------|-------------------------------------------------------------------------------------------------|
| `repos`    | `Array<string>` | A list of repository names where the worker will search for deprecated artifacts.               |
| `dryRun`   | `boolean`     | When `true`, no artifacts are deleted. The worker only logs the artifacts that would be deleted. |

## Example Usage

### Input Parameters
```json
{
  "repos": ["example-repo-local", "another-repo"],
  "dryRun": true
}
```

### Output
- **Dry Run Mode**:
  ```
  Found: example-repo-local/path/to/artifact.jar
  Dry run: Would delete example-repo-local/path/to/artifact.jar
  No files were actually deleted.
  ```
- **Deletion Mode**:
  ```
  Found: example-repo-local/path/to/artifact.jar
  Deleting: example-repo-local/path/to/artifact.jar
  Deleted: example-repo-local/path/to/artifact.jar
  Total deleted: 1
  ```
- **Execution link**:
  ```
  curl -u your-username:your-api-key \
    -X POST \
    "${baseUrl}/worker/api/v1/execute/delete-deprecated-worker" \
    -H "Content-Type: application/json" \
    -d '{
          "repos": ["example-repo-local", "another-repo"],
          "dryRun": true #optional and by default true
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

## Limitations
- The worker only processes artifacts with the exact property `analysis.deprecated=true`.
- Ensure the property is correctly set on the target artifacts before running the worker.