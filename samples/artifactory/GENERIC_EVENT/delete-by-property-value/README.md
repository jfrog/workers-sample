# Delete Artifacts By Property Value

This worker is designed to delete artifacts from specified repositories based on a property and its value. It allows you to define thresholds for properties and delete artifacts with property values below these thresholds. The worker also supports a dry-run mode to simulate the operation without making any changes.

---

## **Features**
- Delete artifacts based on property value thresholds.
- Supports multiple repositories and properties in a single execution.
- Dry-run mode to log the operation without deleting files.
- Detailed logging for both successful operations and errors.

---

## **Payload Parameters**

| Parameter    | Type              | Description                                                                                       | Required | Default |
|--------------|-------------------|---------------------------------------------------------------------------------------------------|----------|---------|
| `properties` | JSON Object       | A key-value pair where the key is the property name and the value is the numeric threshold value. | ✅        | N/A     |
| `repos`      | Array of Strings  | A list of repository names to search for artifacts.                                              | ✅        | N/A     |
| `dryRun`     | Boolean           | If `true`, simulates the operation and logs the results without deleting artifacts.              | ❌        | `false` |

---

## **Execution Examples**

### **Inline Payload Execution**
Run the worker with an inline payload using the following command:

```bash
jf worker exec my-worker - <<EOF
{
    "repos": ["example-repo-local"],
    "properties": {
        "property1": 15,
        "property2": 17
    },
    "dryRun": true
}
EOF
```

- `repos`: Replace `example-repo-local` with the repository name(s) you want to target.
- `properties`: Replace `property1` and `property2` with the property keys you want to filter by and - their threshold values.
- `dryRun`: Set to `true` to simulate the operation without deleting artifacts. Set to `false` for actual deletion


### Execute with the payload located into a file named payload.json:

```bash
jf worker exec my-worker @payload.json
```

# **Behavior**

## **Deletion Process**
- The worker searches through the specified repositories and identifies artifacts with properties matching the criteria.
- If a property's value is less than the specified threshold, the artifact is deleted (unless `dryRun` is set to `true`).

## **Recursive Search**
- The worker performs a recursive search within the repositories to identify all matching artifacts.

---

## **Logging**

### **Dry-Run Mode**
- Logs the artifacts that would be deleted without performing any deletions.

### **Actual Run**
- Logs the artifacts being deleted and provides a summary of the operation.

---

## **Error Handling**
- If an error occurs during execution, such as:
  - Invalid repository names
  - Network issues
- The worker logs the error and returns a detailed error message.

# **Notes**

- **Valid Repositories**: Ensure the `repos` parameter contains valid repository names that are accessible by the worker.
- **Properties Parameter**: The `properties` parameter must include valid property names and numeric threshold values.
- **Ignored Artifacts**: 
  - Artifacts without the specified property are ignored.
  - Artifacts with non-numeric property values are also ignored.
- **Directory Handling**: Non-empty directories are skipped during the deletion process.
- **Permissions**: Adequate permissions are required to delete artifacts in the specified repositories.
