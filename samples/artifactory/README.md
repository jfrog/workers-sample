
# Artifactory Event-Driven Workers

Artifactory supports a variety of events to which workers can subscribe. Each event corresponds to a specific action within Artifactory, such as uploading a file, creating a property, or deleting an artifact. By creating workers that respond to these events, you can enforce policies, trigger external processes, or integrate with other systems.

### Available Workers in This Repository

This repository includes sample workers for the following Artifactory events:

- **Before Download**: Triggered before an artifact is downloaded. Use this worker to enforce download policies or log access attempts.
- **After Download**: Triggered after an artifact has been downloaded. Useful for auditing and logging download activities.
- **Before Upload**: Triggered before an artifact is uploaded. Allows you to validate artifacts or enforce naming conventions before they are stored.
- **After Create**: Triggered after an artifact or folder is created. Can be used to automate post-creation processes such as indexing or notifications.
- **Before Property Create**: Triggered before a property is added to an artifact. Allows validation or enforcement of property-related policies.

### Generic Events and Workers

In addition to Artifactory-specific events, workers can also respond to **Generic Events**, which are custom-defined events that do not directly correlate to built-in Artifactory actions. Generic events provide flexibility for developers to trigger and handle bespoke workflows or integrations within their JFrog Platform instance.

#### Use Cases for Generic Events:
- **Custom Automation**: Create workflows to process external triggers, such as integrating with third-party systems.
- **Enhanced Observability**: Log or monitor specific application behaviors by defining custom event triggers.
- **Orchestrating Multi-Step Processes**: Define a sequence of custom tasks that interact with Artifactory or other parts of the JFrog Platform.

Each sample worker in this repository includes the TypeScript code and instructions on how to deploy and configure it within your JFrog Platform instance.

---

## Getting Started


If you want to use these samples or edit them for personal use, follow these steps:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/jfrog/workers-sample.git
   ```
2. **Navigate to the Artifactory Samples Directory:**
   ```bash
   cd workers-sample/samples/artifactory
   ```
3. **Install Dependencies**:Navigate to the specific worker directory and install all required dependencies:
   ```bash
   cd specific-worker-directory
    npm install
   ```
4. **Make Your Changes:**
    - Update the logic as needed.
    - Create localized types if needed. Avoid spreading types across multiple files.
5. **Test Your Changes:**
    - Perform event actions (e.g., upload an artifact for a Before Upload worker) to ensure proper functionality.
6. **Deploy the script:**
    - Remove all imports from the script before deploying. Keeping imports will result in a compilation failure.
    - Use JFrog CLI or the Workers UI to deploy the updated script.
7. **Validate Deployment:**
    - Ensure the worker is correctly associated with the event.
    - Test the deployment in a staging environment before moving to production.

## Key Notes
 - <b> Remove All Imports </b>: Before deploying the script, ensure that all imports are removed. Keeping imports will lead to compilation failure.
 - <b> Use Localized Types </b>: If creating types, define them within the same file. Avoid spreading types across multiple files to maintain clarity and reduce dependency issues.