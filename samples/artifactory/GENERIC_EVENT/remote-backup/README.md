Artifactory Remote Backup
=====================================

This worker copies files from a remote cache to a local 'backup' repository. This ensures that cached artifacts are still available, even after they're removed from the cache. This worker can also be used to copy from a local repository to a different local repository.

Note that this worker will not copy properties on folders, including Docker image folders. Properties on artifacts are copied as expected.

Target repositories should exist, or the copies will fail.

Payload
-------

The worker expects a JSON object of repository pairs. For example, if you'd like to backup `repo-foo-remote` to `repo-foo-backup-local`, and also backup `repo-bar-remote` to `repo-bar-backup-local`, you can specify `maxDepth` (the maximum path depth to copy) and `maxFiles` (the max number of items to copy). Your configuration would be:

```json
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": false,
    "maxDepth": 10,
    "maxFiles": 1000
}
```

Usage
-----

The worker can be executed using a Generic event.

Execute with the payload from standard input:

```shell
jf worker exec my-worker - <<EOF
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": true,
    "maxDepth": 10,
    "maxFiles": 1000
}
EOF
```

Execute with the payload located in a file named `payload.json`:

```shell
jf worker exec my-worker @payload.json
```

Worker Timeout
--------------

### Timeout Behavior

*   The worker has a maximum execution timeout of **5 seconds**. If the backup process for a complex repository exceeds this limit:

    *   Copy operations applied to files within the timeout will be processed.
    *   A timeout error is returned:
        ```json
        { "message": "Worker execution timeout" }
        ```
    *   Remaining files are **not** processed.

### Implications

*   Repositories with large numbers of artifacts or complex backup requirements may require multiple executions to fully back up.
*   It is recommended to periodically monitor and trigger the worker for such repositories with multiple combinations of workers like `restrict-overwrite`, or to skip artifacts that are already processed to avoid repeated processing of the same files. For large repositories, the recommendation would be to trigger based on a cron schedule to handle timeouts.

Possible Responses
------------------

### Successful Backup Response
- **Structure:**
  ```json
  {
    "complete": 10,
    "total": 20
  }
  ```
- **Explanation:**
  - `complete`: The number of files successfully backed up.
  - `total`: The total number of files attempted for backup.
- This response indicates the worker successfully backed up a subset or all files in the repositories specified in the payload.

### Error Response
- **Structure:**
  ```json
  {
    "error": "Descriptive error message"
  }
  ```
- **Explanation:**
  - The `error` field provides a human-readable message explaining what went wrong.
- Example Errors:
  - **Repository Not Found:** `Cannot get repo-foo-remote-cache files: Repository does not exist.`
  - **Timeout:** `Worker execution timeout`
  - **Copy Failure:** `Unable to backup <srcPath> to <destPath>: Permission denied`
- **Common Causes:**
  - Missing repository.
  - Insufficient permissions.
  - Timeout due to exceeding execution time.

### Invalid Payload Response
- **Structure:**
  ```json
  {
    "error": "Invalid payload structure"
  }
  ```
- **Explanation:**
  - This error occurs when the payload JSON is missing required fields like `backups` or contains incorrect data types for fields (e.g., `backups` is not a dictionary).

### Dry Run Response
- **Structure:**
  ```json
  {
    "complete": 0,
    "total": 10
  }
  ```
- **Explanation:**
  - Indicates that no files were copied because the worker was executed with the `dryRun` flag set to `true`.
- Use this response to verify which files **would** be backed up without actually performing the backup.

### Repository Path Error
- **Structure:**
  ```json
  {
    "error": "Invalid repository path: repo-foo-remote-cache"
  }
  ```
- **Explanation:**
  - This error occurs if the repository path is incorrectly specified in the payload.

Recommendations for Handling Responses
--------------------------------------

1. **Success Response**
   - Monitor the `complete` and `total` fields to ensure all files were backed up.
   - If `complete < total`, investigate potential errors (e.g., timeouts or skipped files).

2. **Error Response**
   - Check the `error` message for specific guidance.
   - Review repository paths, payload structure, and permissions.

3. **Timeout**
   - For large repositories, schedule multiple executions of the worker using a cron job.
   - Use strategies like skipping already processed artifacts to optimize subsequent runs.

4. **Dry Run**
   - Use the `dryRun` mode to identify issues before performing actual backups.

