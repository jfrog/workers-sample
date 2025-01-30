# oldBuildCleanup Worker

## Overview

The `oldBuildCleanup` worker is designed to delete outdated builds from JFrog Artifactory based on a specified build name and build number threshold. This worker helps maintain a clean and efficient build repository by removing older builds and optionally their artifacts.

## Features

- Deletes builds up to a specified build number.
- Supports optional deletion of build artifacts.
- Logs the cleanup process for visibility and tracking.

## How It Works

The worker performs the following steps:

1. Fetches all builds for a given build name.
2. Identifies builds that are older than or equal to the specified build number.
3. Deletes matching builds and optionally their artifacts.

## Parameters

The worker accepts the following parameters:

| Parameter      | Type   | Description                                              |
|----------------|--------|----------------------------------------------------------|
| `buildName`    | string | The name of the build to clean up.                       |
| `buildNumber`  | number | The build number threshold; all builds up to this number will be deleted. |
| `cleanArtifacts` | boolean | When `true`, deletes the associated build artifacts as well. |

## Example Usage

### Input Parameters

```json
{
  "buildName": "example-build",
  "buildNumber": 10,
  "cleanArtifacts": true
}

### Execution Link:

```bash
curl -u your-username:your-api-key \
  -X POST \
  "${baseUrl}/worker/api/v1/execute/oldBuildCleanup" \
  -H "Content-Type: application/json" \
  -d '{
        "buildName": "example-build",
        "buildNumber": 10,
        "cleanArtifacts": true
      }'
```
