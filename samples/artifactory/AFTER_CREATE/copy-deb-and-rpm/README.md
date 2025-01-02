# Copy the .deb and .rpm file to specific repository

This worker script is designed to handle package copy operations between repositories in a JFrog Artifactory environment. It monitors specified repositories for newly created `.deb` and `.rpm` files, parses the file paths using a predefined layout, and copies the files to designated target repositories.

## Features

- **Automatic Copying**: Detects newly created `.deb` and `.rpm` files in specified repositories and copies them to their respective destination repositories.
- **Debian Metadata Update**: Updates Debian package properties before copying to ensure compliance with repository configurations.
- **Retry Mechanism**: Implements a retry mechanism for handling transient errors during HTTP requests.
- **Logging**: Provides informative logs for monitoring operations, including successes and failures.

## Workflow

1. **Supported Repositories**:
   - Source repositories for `.deb` files: `["debian"]`
   - Source repositories for `.rpm` files: `["rpm"]`
   - Destination for `.deb` files: `["debian-dest"]`
   - Destination for `.rpm` files: `["rpm-dest"]`

2. **Debian Metadata Update**:
   For `.deb` files, the script updates properties such as:
   - Distribution: `trusty, jessie, xenial, stretch, bionic, buster, focal, jammy`
   - Component: `main`
   - Architecture: `all`

3. **Retry Logic**:
   - Retries failed operations (e.g., HTTP POST/PUT) up to 5 times for status codes 404, 409, or other transient errors.
   - Includes exponential backoff between retries.

4. **Renaming**:
   Replaces timestamps in file names (e.g., `20240824.123456-0400`) with `SNAPSHOT`.

## How to Use

1. **Configuration**:
   - Update the repository lists in the script:
     ```javascript
     const debRepositoryList = ["debian"];
     const yumRepositoryList = ["rpm"];
     const yumRepoCopyList   = ["rpm-dest"];
     const debRepoCopyList   = ["debian-dest"];
     ```

2. **Deploy the Worker**:
   - Ensure the script is deployed in the correct environment and linked to the JFrog platform.

3. **Testing**:
   - Test with a sample `.deb` or `.rpm` file.
   - Validate that the file is copied to the correct destination with updated properties or renamed as needed.

4. **Monitor Logs**:
   - Check the worker logs for success/failure messages:
     - **Success**: `Copy success`
     - **Failure**: `Unable to copy artifact to <destination>: <error_message>`

5. **Exclude Patterns**:
   Add the following exclude patterns to the worker to ensure unnecessary files are ignored: repodata/** tmp/** dists/**

## Example Log Output

```
INFO: Copying package: rpm/rpm-4.20.0-6-omv2490.aarch64.rpm to rpm-dest/rpm/rpm-4.20.0-6-SNAPSHOT.aarch64.rpm
INFO: Copy success
WARN: Unable to rename Timestamp to Snapshot for debian/dummy-package.deb
ERROR: Unable to copy artifact to debian-dest: File not found
```

## Notes
- Ensure that source repositories are added to the worker's filters.
- Only files matching the expected layout regex will be processed.
- Don't forget to add appropriate permissions for accessing and modifying repositories.
