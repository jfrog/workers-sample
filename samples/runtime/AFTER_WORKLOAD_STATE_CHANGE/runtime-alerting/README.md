# Runtime Alert

## Overview

The `runtime-alert` project is designed to monitor and alert on vulnerabilities and risks associated with image tags in a Kubernetes cluster. It integrates with Elasticsearch for storing vulnerability data (optional) and Slack for sending alerts.

## Features

- Retrieves secrets for Slack webhook URL and optionally Elasticsearch API key and URL.
- Processes image tags and their associated vulnerabilities with enhanced metadata.
- Optionally stores vulnerability data in Elasticsearch (can be disabled).
- Sends alerts to Slack based on specified conditions.
- Supports comprehensive vulnerability data including CVSS scores, package information, and build details.

## Setup

## Configuration Options

The worker can be configured with the following options in the code:

```typescript
const elasticReporting: boolean = false; // Set to true to enable Elasticsearch reporting
```

## Required Secrets

Before running the worker, make sure the following secrets are set in your environment:

| Secret Name       | Description                                   | Required |
| ----------------- | --------------------------------------------- | -------- |
| `Slack_URL`       | Webhook URL for sending alerts to Slack       | Yes      |
| `Elastic_API_Key` | API key for authenticating with Elasticsearch | Only if `elasticReporting` is true |
| `Elastic_URL`     | Elasticsearch instance URL                    | Only if `elasticReporting` is true |

## Configuring JFrog CLI

### Add JFrog Platform Server Configuration

To configure JFrog CLI, run the following command:

```sh
jf config add <server ID>
```

Follow the prompts to enter the necessary details for your JFrog server.

### Add Secrets via JFrog CLI

Instead of setting secrets manually in the UI, you can also add them using JFrog CLI:

```sh
jf worker add-secret <secret-name>
```

Example for required secrets:

```sh
jf worker add-secret Slack_URL
```

Example for optional Elasticsearch secrets (only needed if `elasticReporting` is enabled):

```sh
jf worker add-secret Elastic_API_Key
jf worker add-secret Elastic_URL
```

If you need to update an existing secret, use:

```sh
jf worker add-secret --edit <secret-name>
```


## Deployment Steps

1. Configure the `elasticReporting` option in the worker code (set to `false` by default).
2. Ensure the required secrets are properly configured:
   - `Slack_URL` is always required
   - `Elastic_API_Key` and `Elastic_URL` are only required if `elasticReporting` is set to `true`
3. Deploy the worker manually using the following command:
   ```sh
   jf worker deploy runtime-alerting
   ```
4. The worker will automatically trigger when a workload change event occurs.
5. It will optionally log vulnerabilities to Elasticsearch (if enabled) and send alerts to Slack if conditions are met.


## Supported Data

The worker now processes comprehensive vulnerability and workload data including:

### Workload Information
- Name, namespace, and cluster details
- Node information
- Risk assessment
- Total vulnerability count

### Image Information
- Registry and repository details
- Architecture and SHA256 hash
- Deployment information (deployed by, build info)
- Associated risks and vulnerabilities

### Vulnerability Details
- CVE ID and Xray ID
- Severity levels and CVSS scores (v2 and v3)
- Package type and component information
- Applicability status
- Last fetched timestamp

## Alert Conditions

You can customize the alert conditions based on the severity, CVE ID, and namespace. These conditions can be set using the following optional parameters:

```typescript
// Optional alert conditions
const alertSeverity: string | undefined = undefined; // Set severity level (e.g., 'Critical', 'High')
const alertCveID: string | undefined = undefined;    // Set a specific CVE ID to filter by
const alertNamespace: string | undefined = 'testing'; // Set the namespace for filtering alerts
```

### Example 1: Filter by Severity
If you want to generate an alert only for vulnerabilities with a critical severity, you can configure the alert conditions like this:

```typescript
// Alert condition for critical severity vulnerabilities
const alertSeverity: string | undefined = 'Critical'; // Only critical severity vulnerabilities
const alertCveID: string | undefined = undefined; // No specific CVE ID filter
const alertNamespace: string | undefined = undefined; // No specific namespace filter
```

### Example 2: Filter by CVE ID
If you want to filter vulnerabilities by a specific CVE ID (e.g., CVE-2024-1234), you can adjust the conditions like this:

```typescript
// Alert condition for a specific CVE ID
const alertSeverity: string | undefined = undefined; // No specific severity filter
const alertCveID: string | undefined = 'CVE-2024-1234'; // Only alerts for this CVE
const alertNamespace: string | undefined = undefined; // No specific namespace filter
```

### Example 3: Filter by Namespace
If you want to restrict the alerts to a specific namespace (e.g., production), you can configure the condition like this:

```typescript
// Alert condition for a specific namespace
const alertSeverity: string | undefined = undefined; // No specific severity filter
const alertCveID: string | undefined = undefined; // No specific CVE ID filter
const alertNamespace: string | undefined = 'production'; // Only vulnerabilities in the production namespace
```

### Example 4: Combination of Filters
You can combine multiple conditions for more specificity. For example, if you want alerts only for critical severity vulnerabilities of CVE-2024-1234 in the testing namespace, you can configure it like this:

```typescript
// Combined alert conditions
const alertSeverity: string | undefined = 'Critical'; // Only critical severity vulnerabilities
const alertCveID: string | undefined = 'CVE-2024-1234'; // Only alerts for CVE-2024-1234
const alertNamespace: string | undefined = 'testing'; // Only vulnerabilities in the testing namespace
```

### Example 5: No Filters
If you want all vulnerabilities to trigger alerts, without filtering by severity, CVE ID, or namespace:

```typescript
// No filter on severity, CVE ID, or namespace
const alertSeverity: string | undefined = undefined; // No severity filter
const alertCveID: string | undefined = undefined;    // No CVE ID filter
const alertNamespace: string | undefined = undefined; // No namespace filter
```

These conditions will be used when generating alerts for vulnerabilities that meet the specified criteria.

