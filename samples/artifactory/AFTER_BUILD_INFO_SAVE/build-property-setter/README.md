Build Property Setter
=====================================

This worker is triggered by the `AFTER_BUILD_INFO_SAVE` event of Artifactory. Its primary purpose is to remove the "latest=true" property from any artifacts in previous builds and set the same property on the artifacts corresponding to the current build that was saved.

Functionality
-------------
- **Removing property:** Removes "latest=true" from artifacts in past builds.
- **Adding property:** Sets "latest=true" for artifacts in the current build.

Worker Logic
------------
1. **Removing latest from previous build's artifacts**:
    - Find the previous build numbers for the same build name.
    - Find the unique artifacts from the past builds.
    - Use the delete property API to remove the property from these artifacts.
2. **Setting latest for artifacts in current build**:
    - Fetch artifacts from the current build.
    - Use the set property API to set `latest=true` for each of these artifacts.

Payload
-------
The worker operates on the `AFTER_BUILD_INFO_SAVE` event payload provided by Artifactory. It uses the build name and build number to fetch the artifact details.

Possible Responses
------------------

### Success
- **Structure:**
  ```json
  {
    "data": {
        "message": "Successfully set property for artifacts",
        "executionStatus": 4
    },
    "executionStatus": "STATUS_SUCCESS"
  }
  ```
- **Explanation:**
  - Indicates that only the artifacts present in the build (if any) will now have the property `latest=true` set.

### Failed
- **Structure:**
  ```json
  {
    "data": {
        "message": "Error occurred",
        "executionStatus": 2
    },
    "executionStatus": "STATUS_FAIL"
  }
  ```
- **Explanation:**
  - Indicates there was an error in fetching details or setting the property.

Recommendations
---------------

- **Testing**:
   - Validate the worker functionality in a staging environment before deploying to production.