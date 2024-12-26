# Artifactory Event-Driven Workers

Artifactory workers allow you to automate tasks, enforce policies, and integrate with external systems based on specific events such as uploading, downloading, or managing artifacts and properties.

### Available Workers

This repository includes sample workers for the following Artifactory events:

- **Before Download**
    - **Triggers**: Before an artifact is downloaded.
    - **Use Cases**: Enforce download policies, log access.
  
- **After Download**
    - **Triggers**: After an artifact is downloaded.
    - **Use Cases**: Audit and log download activities.
  
- **Before Upload**
    - **Triggers**: Before an artifact is uploaded.
    - **Use Cases**: Validate artifacts, enforce naming conventions.
- **After Create**
    - **Triggers**: After an artifact or folder is created.
    - **Use Cases**: Automate post-creation tasks like indexing.
  
- **Before Property Create**
    - **Triggers**: Before a property is added to an artifact.
    - **Use Cases**: Enforce property-related policies.


### Generic Events

In addition to Artifactory-specific events, workers can respond to **Generic Events**. These are custom-defined events that don't directly map to Artifactory actions, offering flexibility to trigger and manage custom workflows or integrations within your JFrog Platform.

#### Use Cases for Generic Events:
- **Custom Automation**: Integrate with third-party systems or automate unique workflows.
- **Observability**: Log or monitor specific behaviors in your application.
- **Multi-Step Processes**: Orchestrate tasks across Artifactory or other parts of the JFrog Platform.

Each worker includes TypeScript code and detailed instructions for deployment and configuration.

---

## Getting Started

To use or customize the sample workers, follow these steps:

### 1. Clone the Repository
```
git clone https://github.com/jfrog/workers-sample.git
```

### 2. Navigate to the Artifactory Samples Directory
```
cd workers-sample/samples/artifactory
```

### 3. Install Dependencies
Go to the specific worker directory and install required dependencies:
```
cd specific-worker-directory
npm install
```

### 4. Modify the Worker Logic
> **Note**
>
> **Use Localized Types**: If creating new types, define them in the same file to avoid dependency issues.

Update the worker code as needed.


### 5. Test the Worker
Trigger the relevant event (for example, upload an artifact for a **Before Upload** worker) to ensure it works correctly.

### 6. Deploy the Worker
> **Note**
>
> **Remove All Imports**: Before deployment, remove all imports from the script to prevent compilation errors.

Deploy the worker using the JFrog CLI or the Workers UI.


### 7. Validate the Deployment
- Ensure the worker is associated with the correct event.
- Test in a staging environment before deploying to production.

---