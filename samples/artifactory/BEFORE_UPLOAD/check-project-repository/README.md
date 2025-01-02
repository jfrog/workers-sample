# Worker: check-project-repository

This worker is designed to intercept the upload of Docker image manifests and ensure that they target the correct project repository. It validates that the Docker image manifest contains a specific label (`org.jfrog.artifactory.projectKey`) and that the target repository is prefixed with the same project key.

## Use Case

### **LABEL Validation**
The worker inspects the Docker manifest for a **LABEL** named `org.jfrog.artifactory.projectKey`. This label should contain the target _projectKey_.

### **Repository Validation**
The worker then verifies if the target repository belongs to the corresponding project by ensuring the repository name is prefixed with the _projectKey_.

### **Cleanup**
If the repository validation fails, the worker cleans up previously uploaded layers, ensuring no partial uploads are left in the repository.

## Responses
The worker can return the following responses:

### **1. Proceed**
Indicates that the upload is valid and should continue.

```json
{
  "status": 1,
  "message": "Proceed",
  "modifiedRepoPath": {
    "key": "test-docker-repo",
    "path": "your-image-name/_uploads/af365c10-bca5-4091-bec1-f51670750f62.patch",
    "id": "test-docker-repo:your-image-name/_uploads/af365c10-bca5-4091-bec1-f51670750f62.patch"
  }
}
```

### **2. Not Targeting Project Repository**
Indicates that the upload does not target a project repository matching the project key.

```json
{
  "status": 2,
  "message": "Not targetting a project 'your-project-key' repository",
  "modifiedRepoPath": {
    "key": "test-docker-repo",
    "path": "your-image-name/1.0/manifest.json",
    "id": "test-docker-repo:your-image-name/1.0/manifest.json"
  }
}
```

### **3. Project Key Missing**
Indicates that the `org.jfrog.artifactory.projectKey` label is missing from the Docker manifest.

```json
{
  "status": 2,
  "message": "The project key is missing. Please add the label org.jfrog.artifactory.projectKey to the manifest.",
  "modifiedRepoPath": {
    "key": "test-docker-repo",
    "path": "your-image-name/1.0/manifest.json",
    "id": "test-docker-repo:your-image-name/1.0/manifest.json"
  }
}
```

### **4. Error**
Indicates an error occurred during the worker execution.

```json
{
  "status": 3,
  "message": "Error: Cannot read properties of undefined (reading 'docker.label.org.jfrog.artifactory.projectKey')",
  "modifiedRepoPath": {
    "key": "test-repo",
    "path": "manifest.json",
    "id": "test-repo:manifest.json"
  }
}
```

### **5. Layers Cleanup**
If the repository validation fails, previously uploaded layers are cleaned up. The worker logs the cleanup process and ensures no unused layers are left.

## Worker Flow
1. **Intercepts Uploads**: The worker intercepts uploads for Docker manifests (files ending in `manifest.json`).
2. **Validates LABEL**: Checks for the presence of `org.jfrog.artifactory.projectKey` in the manifest.
3. **Validates Repository**: Confirms that the target repository is prefixed by the project key.
4. **Handles Failures**:
   - Stops the upload if the repository is invalid.
   - Cleans up previously uploaded layers if necessary.
5. **Logs and Returns**: Provides detailed responses for both success and failure cases.

## Implementation Notes
- The worker uses AQL queries to search for artifacts in Artifactory.
- Only intercepts Docker manifests; other layers are ignored.
- Cleanup ensures no orphaned layers remain after a failed validation.

## How to Use
1. Ensure the `org.jfrog.artifactory.projectKey` label is added to your Docker manifest during image build.
2. Push the image to a repository prefixed with the same project key.
3. The worker will validate the upload and proceed or stop based on the defined rules.

For more details, refer to the worker script or contact the platform administrator.
