# Artifactory Storage Quota Worker

## Overview

The **Artifactory Storage Quota Worker** is a script designed to enforce storage limits for repository paths. It allows administrators to configure quotas for artifact storage under specific paths within a repository. If the combined size of existing artifacts and a new upload exceeds the defined quota, the upload is rejected.

---

## Features

- **Configurable Quotas:** Administrators can set a property named `repository.path.quota` on any existing repository path to define the maximum storage limit (in bytes) for artifacts under that path.
- **Granular Control:** The worker operates at the repository path level, enabling detailed control over storage allocation.
- **Real-Time Validation:** The script calculates the total size of existing artifacts and evaluates the new upload to determine compliance with the defined quota.
- **Comprehensive Logging:** Provides detailed logs for debugging, including quota checks, current artifact sizes, and skipped paths.

---

## Execution

This worker operates as a **`beforeUpload`** execution.

- **Root and Folder Uploads:** The worker skips processing for root and folder uploads, allowing these operations to proceed without interruption.
- **Quota Exceeded:** Uploads that cause the total size to exceed the defined quota are stopped with a descriptive error message.
- **Quota Not Defined:** If no quota is set for the target path, uploads proceed normally.

---

## Configuration

### Setting a Quota
To define a quota for a repository path, set the `repository.path.quota` property:

```bash
curl -u <admin_user>:<admin_password> -X PUT \
  -d "repository.path.quota=10485760" \
  "<artifactory_url>/api/storage/<repo>/<path>"
```

In the above example, the quota is set to 10 MB (10,485,760 bytes).

---

## Responses

- **Proceed (Quota Check Passed):**

```json
{
  "status": 1,
  "message": "Upload is allowed for test-repo/<path>. under <repo-name>."
}
```

- **Stop (Quota Exceeded):**

```json
{
  "status": 2,
  "message": "Quota exceeded for test-repo/<path>"
}
```

- **Proceed (Root/Folder Skipped):**

```json
{
  "status": 1,
  "message": "Skipping test-repo/<path>: root or folder detected."
}
```

---

## Script Details

### Key Functions

1. **`checkQuota`**
   - Validates the quota for the repository path.
   - Skips root and folder uploads.
   - Stops uploads if the quota is exceeded.

2. **`getRepoQuota`**
   - Fetches the `repository.path.quota` property for the target path.

3. **`getArtifactsSize`**
   - Calculates the total size of existing artifacts under the target path.

4. **Utility Functions**
   - `joinPath`: Joins repository key and path.
   - `getParentPath`: Retrieves the parent path from the full path.

---

## Logs

The worker logs relevant information for debugging and auditing:

- **Quota Check:** Logs the defined quota and current artifact size for the target path.
- **Skipped Paths:** Logs when root or folder uploads are skipped.
- **Quota Exceeded:** Logs warnings for quota breaches.

---

## Limitations

- **Folder Handling:** This worker does not enforce quotas for folder-level operations.
- **Nested Path Quotas:** Ensure parent and nested paths do not conflict in their quota settings.
- **Deep Repository Structures:** For deeply nested repository structures, consider quota implications carefully.

---
