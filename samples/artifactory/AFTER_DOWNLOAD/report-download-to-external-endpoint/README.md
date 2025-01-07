# Log Download activity to an external endpoint

## Overview  
This worker listens to the `AFTER_DOWNLOAD` event in JFrog Artifactory and notifies an external endpoint when a file is downloaded. The worker logs the artifact's details, the repository, and the user responsible for the download.  

## Functionality  

1. **Trigger:** Activated after a download event occurs in Artifactory.  
2. **Notification:** Sends a log containing details about the downloaded artifact to a specified external endpoint.  
3. **Authentication:** Uses a bearer token stored in a secret to authenticate with the external endpoint.  
4. **Error Handling:** Logs and updates the response message if the notification fails.  

## Configuration  

To customize the worker, you need to update two constants in the source code:  

- `URL`: The endpoint where the download log will be sent.  
  Example:  
  ```typescript  
  const URL = 'https://<external_endpoint>';  
  ```  

- `SECRET_NAME`: The name of the secret that contains the bearer token for authentication.  
  Example:  
  ```typescript  
  const SECRET_NAME = 'myBearerToken';  
  ```  

## How It Works  

1. **Download Event:** The worker is triggered when an artifact is downloaded.  
2. **Log Creation:** The worker creates a log message with the following details:  
    - Artifact path  
    - Repository key  
    - User ID or token used for the download  
3. **Notification:** Sends the log message as a POST request to the external endpoint.  
4. **Response Handling:**  
    - Logs success if the notification is successfully sent.  
    - Logs a warning or error if the notification fails and updates the response message accordingly.  

## Example Log Message  

```plaintext  
The artifact '<artifact_path>' has been downloaded by the <userid/token>: <user_id> from the repository '<repo_key>'.  
```  

## Response Messages  

- **Successful Notification:**  
  - Message: `Download activity successfully logged`  

- **Failed Notification:**  
  - Message: `Failed to log download activity`  

## Dependencies  

This worker relies on the following JFrog Workers APIs:  
- `PlatformContext` for accessing platform resources (e.g., secrets, HTTP clients).  
- `AfterDownloadRequest` and `AfterDownloadResponse` for handling download event payloads and responses.  

## Recommendations  

1. **Endpoint Configuration:** Ensure the external endpoint is correctly set and accessible.  
2. **Bearer Token Secret:** Store the bearer token securely as a secret in the JFrog platform.  
3. **Monitoring:** Regularly monitor logs for failed notifications to identify issues.  
4. **Testing:** Test the worker in a staging environment before deploying it in production.  

## Error Scenarios  

- **Network Errors:** Occur if the external endpoint is unreachable.  
- **Authentication Failures:** Occur if the bearer token is invalid or missing.  
- **Invalid URL:** Occurs if the provided endpoint URL is incorrect.  
