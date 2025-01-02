# Generic Event Workers

## Overview

Generic Event Workers are specialized JFrog workers that are not tied to specific Artifactory events. Instead, they are executed on demand via API calls or manual invocation. These workers are highly customizable, allowing you to perform tasks that are not bound to predefined triggers.

## Key Features

- **Manual Execution:** Can be triggered manually or through a specific API call.
- **Custom Logic:** Supports flexible implementation for a variety of use cases.
- **Independent Operation:** Operates independently of Artifactory's standard event-driven workflow.

## Use Cases

1. **Custom Maintenance Tasks:** Perform one-off operations such as cleaning up repositories or updating artifact metadata.
2. **Scheduled Jobs:** Execute pre-scheduled tasks using external job schedulers.
3. **Custom API Integration:** Enable workflows that require external API calls or integrations.

## Example Worker Logic

Here’s a simple example of a Generic Event Worker:

```typescript
import { PlatformContext, GenericEventRequest, GenericEventResponse } from 'jfrog-workers';

export default async (context: PlatformContext, data: GenericEventRequest): Promise<GenericEventResponse> => {
    try {
        console.log("Worker triggered manually with data:", data);
        return {
            message: "Worker executed successfully",
            status: "SUCCESS"
        };
    } catch (error) {
        console.error("Worker execution failed:", error.message);
        return {
            message: "Worker execution failed",
            status: "FAILURE"
        };
    }
};
```

## Recommendations

- **Authentication:** Ensure only authorized users or systems can trigger the worker.
- **Input Validation:** Validate the input payload to prevent errors or misuse.
- **Logging and Monitoring:** Log all executions for auditing and debugging purposes.

## License

This worker script and documentation are provided under the MIT License.
