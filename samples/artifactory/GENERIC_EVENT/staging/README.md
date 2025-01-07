# JFrog Worker: Staging Strategy Calculator

This JFrog Worker calculates the staging strategy for Artifactory builds based on configurable strategies. The worker supports multiple strategies such as **Gradle**, **Simple Maven**, and **Detailed Maven**. It fetches build information from Artifactory and determines the appropriate release version, target repository, tagging details, and more.

## Features

- Supports multiple staging strategies:
  - Gradle
  - Simple Maven
  - Detailed Maven
- Dynamically determines release versions and next development versions.
- Fetches build information from Artifactory using the provided `PlatformContext`.
- Customizable behavior based on input parameters.

## Prerequisites

- A JFrog Artifactory instance with API access.
- A valid `PlatformContext` object provided by JFrog Workers.

## Installation

Clone the repository and install the required dependencies:

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

## Usage

The main function of this worker is `getStagingStrategy`, which takes the following inputs:

### Input Parameters

| Parameter        | Type                | Description                                                                                     |
|------------------|---------------------|-------------------------------------------------------------------------------------------------|
| `strategyName`   | `string`           | The name of the strategy to execute. Options: `gradle`, `simpleMaven`, `detailedMaven`.         |
| `params`         | `object`           | Key-value pairs of parameters used by the selected strategy. Example: `{ patch: "true" }`.      |
| `buildName`      | `string`           | The name of the Artifactory build for which the strategy is being calculated.                   |
| `context`        | `PlatformContext`  | The JFrog Worker platform context, which provides API clients to interact with Artifactory.     |

### Example Payload

```typescript
const requestPayload = {
  strategyName: "gradle", // Choose from "gradle", "simpleMaven", "detailedMaven"
  buildName: "example-build",
  params: {
    patch: "true", // Indicates whether to increment the patch version
  },
};
```

## Strategies

### 1. Gradle
- **Purpose**: Calculates release and next development versions for Gradle builds.
- **Key Parameters**: 
  - `patch`: Determines whether to increment the patch version.
- **Tag Format**: `gradle-multi-example-{releaseVersion}`.
- **Target Repository**: `gradle-staging-local`.

### 2. Simple Maven
- **Purpose**: Calculates release and next development versions for simple Maven builds.
- **Tag Format**: `rel-{releaseVersion}`.
- **Target Repository**: `staging-local`.

### 3. Detailed Maven
- **Purpose**: Calculates module-specific versions for Maven builds with multiple modules.
- **Key Behavior**:
  - Generates a map of module versions.
  - Tags in `multi-modules/tags/artifactory`.
- **Target Repository**: `libs-snapshot-local`.

## API Reference

### `getBuilds(buildName: string, context: PlatformContext): Promise<BuildRun[]>`

Fetches build information from Artifactory. Example response:

```json
[
  {
    "releaseStatus": "Released",
    "startedDate": "2024-01-01T12:00:00Z",
    "modules": [{ "id": "example-module:1.0.0" }]
  }
]
```

### Response Example

On successful execution, the worker returns the following response:

```json
{
  "status": 200,
  "message": "Successfully calculated staging strategy",
  "data": {
    "useReleaseBranch": false,
    "createTag": true,
    "tagUrlOrName": "gradle-multi-example-1.0.1",
    "tagComment": "[gradle-multi-example] Release version 1.0.1",
    "nextDevelopmentVersionComment": "[gradle-multi-example] Next development version",
    "targetRepository": "gradle-staging-local",
    "promotionConfigComment": "Staging Artifactory 1.0.1"
  }
}
```

## Error Handling

If an error occurs during execution, the worker returns:

```json
{
  "status": 400,
  "message": "Got error: <error_message>",
  "data": null
}
```

## Development

### Adding a New Strategy

1. Create a new class implementing the `ExecutorStrategy` interface.
2. Define the `execute` method to handle the specific strategy logic.
3. Register the strategy in `StrategyExecutionFactory`.

### Running Tests

Add tests to validate worker functionality using mock `PlatformContext` and build data.

## License

This project is licensed under the MIT License.
