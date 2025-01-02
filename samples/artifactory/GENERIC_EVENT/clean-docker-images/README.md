# Artifactory Clean Docker Images Worker

This worker script is designed to clean Docker repositories hosted in Artifactory based on configurable cleanup policies. It is useful for managing storage and maintaining repository hygiene.

---

## Key Features

- Cleans Docker repositories based on:
    -   Maximum age of images
    -   Maximum number of image versions
-   Supports cleanup based on:
    -   Image creation date
    -   Last download date
- Provides optional dry-run mode for safe execution.
- Handles complex repositories with multiple Docker files.
- Logs processed repositories and cleanup details for transparency.
    

## Configuration
---
The worker accepts the following configuration parameters:

### Required Parameters

*   **`dockerRepos`**: A list of Docker repositories to clean. Only repositories listed here will be processed.
    

### Optional Parameters

*   **`byDownloadDate`** (boolean, default: `false`):
    
    *   **`false`**: Images are cleaned based on their creation date.
        
    *   **`true`**: Images are cleaned based on their last download date or, if unavailable, their last update date.
        
*   **`dryRun`** (boolean, default: `false`):
    
    *   **`true`**: Simulates the cleanup process without deleting any files.
        
    *   **`false`**: Executes the cleanup, deleting the identified files.
        

### Example Configuration

```json
{
    "dockerRepos": ["example-docker-local", "example-docker-local-2"],
    "byDownloadDate": false,
    "dryRun": true
}
```

### Usage
-----

### Cleanup Policies

Cleanup policies are defined using labels in the Docker image. The worker supports the following policies:

*   **`maxDays`**: Specifies the maximum number of days an image can exist in the repository. Older images will be deleted.
    
    *   When `byDownloadDate=true`: Images downloaded or updated within the last `maxDays` will be preserved.
        
*   **`maxCount`**: Specifies the maximum number of image versions to retain. Excess versions will be deleted, starting with the oldest.
    
    *   When `byDownloadDate=true`: Image age is determined first by the _Last Downloaded Date_ and then by the _Modification Date_ if the image has never been downloaded.
        

### Adding Cleanup Labels to Docker Images

Labels can be added to the Dockerfile before building the image. For example:

```dockerfile
LABEL com.jfrog.artifactory.retention.maxCount="10"
LABEL com.jfrog.artifactory.retention.maxDays="7"
```

When deployed, these labels are automatically converted into properties in Artifactory. The worker reads these properties to determine the cleanup policy for each image.

Execution
---------

### JFrog CLI

Cleanup can be triggered using the JFrog CLI. For example:

```shell
jf worker exec my-worker - <<EOF
{
    "dockerRepos": ["example-docker-local"],
    "byDownloadDate": false,
    "dryRun": true
}
EOF
```

Alternatively, execute with a payload file:

```shell
jf worker exec my-worker @payload.json
```


Worker Timeout
--------------

### Timeout Behavior

*   The worker has a maximum execution timeout of **5 seconds**. If the cleanup process for a complex repository exceeds this limit:
    
    *   Files that can be deleted within the timeout are processed.
        
    *   A timeout error is returned: 
        ```json
            { "message": "Worker execution timeout" }
        ```
        
    *   Remaining files are **not** processed.
        

### Implications

*   Repositories with large numbers of images or complex cleanup requirements may require multiple executions to fully clean.
    
*   It is recommended to periodically monitor and trigger the worker for such repositories.
    

Logging
-------

### Payload and Repository Logs

* The worker logs the received payload and the processed repositories for debugging purposes. Example:
```
Payload - { 
            "dockerRepos": ["example-docker-local"],
            "byDownloadDate": false,
            "dryRun": false
          }
Repos - ["example-docker-local"]
```
    
*   Errors and unprocessed files due to timeout are logged for transparency.
    

Example Cleanup Workflow
------------------------

1.  Configure cleanup policies using labels in the Dockerfile.
    
2.  Deploy the images to Artifactory.
    
3.  Define the worker payload:
```json
{
    "dockerRepos": ["example-docker-local"],
    "byDownloadDate": true,
    "dryRun": false
}
```
    
4.  Trigger the worker using the JFrog CLI.
    
5.  Review the logs for details about the cleanup process.
    

Notes
-----

*   **Timeout Management**: For large or complex repositories, consider breaking cleanup into smaller tasks.
    
*   **Dry Run**: Always perform a dry run for initial testing to validate the cleanup logic.
    
*   **Monitoring**: Regularly monitor the storage usage and worker logs to ensure efficient repository management.
