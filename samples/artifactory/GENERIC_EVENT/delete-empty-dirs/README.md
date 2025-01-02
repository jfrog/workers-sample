Artifactory Delete Empty Dirs
=========================================
## Overview
This worker deletes all empty directories found inside any of the given set of paths in your Artifactory repositories. The worker traverses specified directories recursively, checking for empty directories, and deletes them if they are found.

## Parameters

This worker takes one parameter:

- **`paths`**: A comma-separated list of paths to search for empty directories. Each path is in the form `repository-name/path/to/dir`. The worker will look through these directories for any empty folders and remove them.

  Example:
  - `example-docker-local/dir1`
  - `example-docker-local/dir2`

## Execution

### Using Inline Payload

To execute the worker with an inline payload, use the following command:

```bash
jf worker exec my-worker - <<EOF
{
    "paths": ["example-docker-local/dir1", "example-docker-local/dir2"],
    "dryRun": false
}
```

- **`paths`** : List of directories to search for empty directories.
- **`dryRun`**: Set this to `true` to simulate the deletion (without actually deleting the directories), or set it to `false` to perform the actual deletion.

### Execute with the payload located into a file named payload.json:

```bash
jf worker exec my-worker @payload.json
```

## Behavior

- **Recursive Deletion**: The worker will search the specified paths and their sub-directories recursively for empty directories. Once an empty directory is found, it will be deleted unless the `dryRun` flag is set to true.
- **Logging**: The worker logs the progress of the operation, including the directories being processed, the number of directories deleted, and any errors encountered.
- **Dry Run**: When `dryRun` is set to `true`, the worker will simulate the deletion process without actually removing any directories.
- **Asynchronous Deletion**: For directories with a large number of files, the worker might take some time to complete the deletion process. All empty directories will eventually be removed, but the changes may not reflect immediately.

## Error Handling

If there is an error, the worker will log the issue and return an error message. Common issues could include:

- Invalid paths
- Insufficient permissions
- Network connectivity issues

Ensure the paths provided are correct and accessible, and verify that the necessary permissions are granted to the worker.

## Notes

- **Permissions**: Ensure that the worker has the necessary permissions to delete directories from the specified repositories.
- **Recursive Deletion**: The worker checks subdirectories within the given paths, so if a directory becomes empty after its children are deleted, it will also be removed.
- **Delayed Reflection**: When triggered for directories with a significant number of files, the deletion of empty directories may not be immediately visible. The process ensures eventual deletion but may take some time to reflect all changes.
- **Limitations**: This worker only removes empty directories and does not delete files. Non-empty directories will be skipped.
