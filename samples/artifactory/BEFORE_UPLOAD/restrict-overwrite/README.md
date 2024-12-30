# Artifactory Restrict Overwrite (Before Upload)

## Overview

This worker script ensures that overwrites are restricted during the upload of artifacts to configured repositories in JFrog Artifactory. The worker validates if an artifact already exists at the target location and stops the upload process if the file or folder is present. 

This is particularly useful to prevent accidental overwrites or modifications to artifacts that should remain immutable.

## Features

- **Pre-upload Validation**: Ensures that no existing artifacts are overwritten during the upload process.
- **Detailed Status Messaging**:
  - If the artifact already exists, the upload is stopped with a message indicating the existing file's name.
  - If no conflict exists, the upload proceeds as usual.
- **Support for Folders**: Special handling ensures folders are not mistakenly overwritten.
- **Extensible Design**: Built to integrate seamlessly with Artifactory's worker framework.

## Configuration

No additional configuration is required. The script operates by intercepting the upload request and verifying the target location for any existing artifacts.

## Response Codes

The worker returns the following status codes in its response:

- **`status: 1`**: ndicates that no artifact exists at the target location. The upload is allowed to proceed::
  ```json
  {
    "status": 1,
  }
  ```

- **`status: 2`**: Indicates that an artifact with the same name already exists. The upload is stopped, and a message is provided:
  ```json
  {
    "status": 2,
    "message": "example-repo:path/to/file already exists"
  }
  ```

## Notes

- **Immutability**: This script enforces immutability for existing artifacts, ensuring consistency across deployments.
- **Folder Handling**: When the target is a folder, the script prevents overwrites only if the folder already exists and is not empty.
- **Error Logging**: All operations, including failed attempts, are logged for debugging and auditing purposes.

## Limitations

- This worker script is specific to the `before upload` trigger. Similar restrictions for other operations like `create`, `copy`, and `move` require separate implementations.
- The script currently supports artifacts in flat repositories. For nested or deeply structured repositories, ensure paths are correctly configured.

  