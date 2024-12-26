Restrict Download by Property Value
=====================================

This worker is triggered by the `BEFORE_DOWNLOAD` event of Artifactory. Its primary purpose is to block artifact downloads if the artifact contains certain forbidden properties with restricted values. This ensures compliance with organizational policies by preventing downloads of restricted artifacts.

Functionality
-------------
- **Forbidden Properties Check:** Blocks download if an artifact contains a forbidden property with restricted values.
- **Error Handling:** Issues a warning and allows download if the properties cannot be verified due to an error.
- **Headers:** Optionally modifies response headers if required.

Worker Logic
------------
1. **Property Fetching**: Queries Artifactory for artifact properties using the repository key and artifact path.
2. **Decision Making**:
    - Blocks the download if a forbidden property with restricted values is present.
    - Allows the download if no forbidden properties are found.
    - Issues a warning and allows download for errors or unexpected results.

Payload
-------
The worker operates on the `BEFORE_DOWNLOAD` event payload provided by Artifactory. It uses metadata such as the artifact's repository path and key to fetch properties.

Configuration
-------------
- **Forbidden Properties**: Define the list of forbidden properties and their restricted values in the worker script. Example:
  ```typescript
  let forbiddenProperties: ForbiddenProperty[] = [];
  forbiddenProperties.push({
      key: "FORBIDDEN",
      values: ["true"]
  });
  ```

Possible Responses
------------------

### Download Proceed
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_PROCEED",
    "message": "Allowing Download"
  }
  ```
- **Explanation:**
  - Indicates the artifact does not contain any forbidden properties, and the download is allowed.

### Download Stopped
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_STOP",
    "message": "Stopping Download because forbiddenProperty <key> is present with forbidden values"
  }
  ```
- **Explanation:**
  - Indicates the artifact contains a forbidden property, and the download is blocked.

### Warning Response
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_WARN",
    "message": "Download proceed with a warning. Could not check if artifact is forbidden or not."
  }
  ```
- **Explanation:**
  - Indicates that the worker encountered an error (e.g., API failure), but the download is allowed with a warning.

### Headers
- The worker response can optionally include modified headers. The `headers` field in the response is currently empty but can be populated if required.

Error Handling
--------------
- **Property Fetch Failure:** Allows download with a warning message.
- **Unexpected Errors:** Logs errors and proceeds with a warning.

Recommendations
---------------
1. **Forbidden Properties Definition**:
   - Update the list of forbidden properties and their restricted values as per organizational policies.

2. **Monitoring and Logging**:
   - Review logs for `DOWNLOAD_WARN` responses to identify and address recurring issues.

3. **Testing**:
   - Validate the worker functionality in a staging environment before deploying to production.
