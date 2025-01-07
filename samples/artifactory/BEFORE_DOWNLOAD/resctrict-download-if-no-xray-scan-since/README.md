# Worker for Restricting Downloads Based on Xray Scan Recency

## Overview

This worker is triggered by the `BEFORE_DOWNLOAD` event of Artifactory. Its primary purpose is to restrict downloads of artifacts that have not undergone an Xray scan within a specified threshold duration. This ensures artifacts comply with security policies by enforcing timely scans.

## Functionality

### Key Features
- **Xray Scan Check:** Verifies the most recent Xray scan date of an artifact.
- **Threshold Enforcement:** Restricts download if the last scan exceeds the specified threshold days or date.
- **Error Handling:** Issues a warning and allows download if Xray is unavailable or errors occur during the check.

### Worker Logic
1. **Xray Availability Check:** Verifies if Xray is operational by pinging the Xray system.
2. **Artifact Scan Details Fetching:** Retrieves artifact scan details, including the last scan date, using the artifact name and repository key.
3. **Decision Making:**
   - Stops the download if the last scan is older than the allowed threshold.
   - Allows download with a warning if scan details cannot be retrieved or Xray is unavailable.
   - Proceeds with the download if the scan is recent.

## Configuration

### Threshold Configuration
- **Threshold Days:** Defines the maximum allowed age (in days) of the last Xray scan. Default: 2 days.
- **Threshold Date:** Defines the latest allowable date for the last scan. Default: 7 days prior to the current date.

## Response Types

### Download Proceed
```json
{
  "status": "DOWNLOAD_PROCEED",
  "message": "Proceeding with download"
}
```
- **Explanation:** Indicates the artifact complies with the scan recency requirements.

### Download Stopped
```json
{
  "status": "DOWNLOAD_STOP",
  "message": "Stopping Download, because last scan date is older than allowed threshold duration of <threshold_days> days."
}
```
- **Explanation:** Indicates the artifact's last scan is outdated, and the download is blocked.

### Warning Response
```json
{
  "status": "DOWNLOAD_WARN",
  "message": "Could not check for Xray scans because Xray is not available. Proceeding download with warning."
}
```
- **Explanation:** Indicates that the worker encountered an error (e.g., Xray unavailability), but the download is allowed with a warning.

## Error Handling

- **Xray Unavailability:** Issues a warning and allows download if Xray is not operational.
- **Scan Check Failure:** Logs the error and proceeds with a warning.

## Recommendations

1. **Threshold Adjustment:**
   - Update the threshold days or date as per organizational requirements.

2. **Monitoring and Logging:**
   - Regularly review logs for `DOWNLOAD_WARN` responses to address recurring issues.

3. **Testing:**
   - Validate the worker functionality in a staging environment before deploying to production.