# Artifactory Restrict Overwrite: Before Copy

## Overview
The "Restrict Overwrite: Before Copy" worker script enforces immutability by preventing overwrites of artifacts during the "copy" operation in JFrog Artifactory. It ensures that artifacts cannot be accidentally replaced, maintaining consistency and integrity across deployments.

## Features
- **Overwrite Protection**: Blocks attempts to copy artifacts if an artifact with the same name already exists in the target path.
- **Folder Handling**: If the target is a folder, the script allows the operation only when the folder is empty.
- **Error Logging**: Logs all operations, including failed attempts, for debugging and auditing purposes.

## Behavior
- If the target artifact already exists:
  - The script stops the operation and returns a message indicating the conflict.
- If the target artifact does not exist:
  - The operation proceeds without interruption.

## Example Responses
### File Does Not Exist
```json
{
  "status": 1
}
```
### File Already Exists
```json
{
  "status": 2,
  "message": "example-repo:file.txt already exists"
}
```
## Usage

### Execution Flow
1. **Trigger Point**: This worker script is triggered before the "copy" operation in Artifactory.
    
2. **AQL Query**: The script runs an AQL query to check if the target artifact exists in the specified repository path.
    
3. **Decision**: Based on the existence of the target artifact:
    - **Proceed**: If the artifact does not exist.
    - **Stop**: If the artifact already exists, with an appropriate error message.

### Implementation Notes
- **Logging**: All operations and exceptions are logged for traceability.
    
- **AQL Query**: The AQL query fetches information about the target artifact, including its type (file or folder).

## Limitations
- **Specific to Copy**: This script applies only to the "before copy" trigger. Separate implementations are required for "before create," "before upload," and "before move" operations.
    
- **Flat Repositories**: The script supports flat repository structures. For deeply nested repositories, ensure the paths are correctly configured.

## Notes
- **Immutability Enforcement**: Ensures existing artifacts remain unchanged unless explicitly deleted beforehand.
    
- **Folder Handling**: Prevents overwrites only if the folder already exists and is not empty.
    
- **Error Logging**: Provides detailed logs for troubleshooting and auditing.