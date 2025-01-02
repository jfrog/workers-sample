Restrict Download on Xray Critical Issues
=====================================

This worker is triggered by the `BEFORE_DOWNLOAD` event of Artifactory. Its primary purpose is to block artifact downloads if the number of critical security issues in JFrog Xray exceeds a defined threshold. The worker ensures compliance with security policies by preventing downloads of artifacts with excessive vulnerabilities.

Functionality
-------------
- **Threshold Check:** Blocks download if the number of critical security issues is greater than `MAX_CRITICAL_SEC_ISSUES_ACCEPTED` (default: 2).
- **Xray Availability:** Issues a warning and allows download if JFrog Xray is unavailable.
- **Error Handling:** Provides appropriate messages for unexpected errors or timeouts.
- **Headers:** Optionally modifies response headers if required.

Worker Logic
------------
1. **Xray Availability Check**: Before proceeding, the worker pings the Xray service to ensure it is available. If unavailable, the download proceeds with a warning.
2. **Artifact Scan**: Queries Xray for the artifact's security issues using the repository key and artifact name.
3. **Decision Making**:
    - Allows the download if the number of critical issues is below the threshold.
    - Blocks the download if critical issues exceed the threshold.
    - Issues a warning and allows download for errors or unexpected results.

Payload
-------
The worker operates on the `BEFORE_DOWNLOAD` event payload provided by Artifactory. It leverages metadata such as the artifact's repository path and key to query Xray.

Configuration
-------------
- **MAX_CRITICAL_SEC_ISSUES_ACCEPTED**: Maximum allowed critical security issues for an artifact. Default is 2. This can be modified in the worker script as per organizational requirements.

Possible Responses
------------------

### Download Proceed
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_PROCEED",
    "message": "Artifact has less than 2 security issues: proceed with the download."
  }
  ```
- **Explanation:**
  - Indicates the artifact meets security requirements, and the download is allowed.

### Download Stopped
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_STOP",
    "message": "DOWNLOAD STOPPED : artifact scan shows <number> critical security issues."
  }
  ```
- **Explanation:**
  - Indicates the artifact has too many critical security issues, and the download is blocked.

### Warning Response
- **Structure:**
  ```json
  {
    "status": "DOWNLOAD_WARN",
    "message": "Error during scan check. Download will proceed with warning."
  }
  ```
- **Explanation:**
  - Indicates that the worker encountered an error (e.g., Xray unavailability or unexpected results), but the download is allowed with a warning.

### Headers
- The worker response can optionally include modified headers. The `headers` field in the response is currently empty but can be populated if required.

Error Handling
--------------
- **Xray Unavailable:** Allows download with a warning message.
- **Query Failure:** Issues a warning and allows download for unexpected results from Xray.
- **Unexpected Errors:** Logs errors and proceeds with a warning.

Recommendations
---------------
1. **Threshold Adjustment**:
   - Update `MAX_CRITICAL_SEC_ISSUES_ACCEPTED` as per security requirements.

2. **Monitoring and Logging**:
   - Review logs for `DOWNLOAD_WARN` responses to identify and address recurring issues.

3. **Testing**:
   - Validate the worker functionality in a staging environment before deploying to production.