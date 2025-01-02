# Allow Upload by Pattern

## Overview

This worker script ensures that artifact uploads are allowed only if the target path matches a predefined pattern. This pattern is specified using a regular expression (`authorizedPathRegEx`). The script validates the repository path (`repoPath`) and blocks uploads that do not comply with the pattern.

## Functionality

- **Path Matching**: The worker validates repository paths against the regular expression:
  ```
  /^org\/company\/(?:\w+.\/)+[\w\-\.]+\.(?:jar|war)$/
  ```
  This regex allows paths that:
  - Start with `org/company/`
  - Contain subdirectories separated by `/`
  - End with `.jar` or `.war`

- **Allowed Paths**: Examples of acceptable paths include:
  - `org/company/src/app.jar`
  - `org/company/package1/subPackage/webapp.war`

- **Blocked Paths**: Paths that do not match the pattern, such as `text.txt`, are disallowed.

## Response Examples

### When Path Matches the Pattern
```json
{
  "status": 1,
  "message": "RepoPath 'org/company/src/app.jar' is acceptable for the repository 'FIXTURE'",
  "modifiedRepoPath": {
    "key": "FIXTURE",
    "path": "org/company/src/helloworld.jar",
    "id": "FIXTURE:org/company/src/helloworld.jar"
  }
}
```

### When Path Does Not Match the Pattern
```json
{
  "status": 2,
  "message": "RepoPath 'file.txt' does not match the regex /^org\\/company\\/(?:\\w+.\\/)+[\\w\\-\\.]+\\.(?:jar|war)$/ for the repository 'FIXTURE'",
  "modifiedRepoPath": {
    "key": "FIXTURE",
    "path": "text.txt",
    "id": "FIXTURE:text.txt"
  }
}
```

## Error Handling

If an error occurs during the path validation process, the script logs the error and allows the upload with a warning:

```json
{
  "status": 3,
  "message": "An error occurred during the check. Proceed with warning.",
  "modifiedRepoPath": {
    "key": "FIXTURE",
    "path": "example/path.txt",
    "id": "FIXTURE:example/path.txt"
  }
}
```

## Notes

1. **Custom Patterns**: Modify the `authorizedPathRegEx` variable to enforce different patterns based on project requirements.
2. **Security**: This script helps maintain a controlled upload environment by enforcing consistent repository paths.
3. **Error Logging**: All failed attempts are logged for auditing and debugging purposes.
4. **Extensions**: Although the current pattern focuses on `.jar` and `.war` files, it can be extended to support additional file types.
