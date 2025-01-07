# Admin-Only Property Creation

## Overview  
This worker is triggered by the `BEFORE_PROPERTY_CREATE` event in JFrog Artifactory. Its primary purpose is to enforce a policy where only users with admin privileges can create artifact properties.
  

## Functionality  

- **Admin Check:** Ensures that only users with admin privileges can create artifact properties.
- **Access Restriction:** Non-admin users attempting to create properties will have their request denied.
- **Event Interception:** Intercepts the `BEFORE_PROPERTY_CREATE` event to implement this logic.

## Key Features

1. **Permission Validation:**
   - Checks the user context to determine if the user is an admin.
   - Grants or denies property creation based on user privileges.

2. **Custom Responses:**
   - Returns appropriate messages for both allowed and denied actions.
   - Prevents unauthorized users from modifying artifact properties.

## Worker Logic

### Admin Validation
The worker determines if the user is an admin by checking their user ID. It assumes that admin user IDs end with `/users/admin`. 

### Decision Making
- **Admin Users:**
  - Permission is granted for property creation.
  - Responds with `BEFORE_PROPERTY_CREATE_PROCEED`.

- **Non-Admin Users:**
  - Permission is denied for property creation.
  - Responds with `BEFORE_PROPERTY_CREATE_STOP`.

### Responses
The worker sends back one of the following responses:

#### Property Creation Allowed
```json
{
  "message": "Permission granted to admin",
  "status": "BEFORE_PROPERTY_CREATE_PROCEED"
}
```

#### Property Creation Not Allowed
``` json 
{
    "message": "Only admins are allowed to create properties",
    "status":  "BEFORE_PROPERTY_CREATE_STOP"
}
```

## Recommendations  

1. **User Context Validation:** Ensure that admin user IDs are configured to end with /users/admin. 
2. **Auditing:** Periodically review logs for denied requests to ensure policy compliance.  
3. **Testing:** Test the worker in a staging environment before deploying it in production.  

## Error Scenarios  

- **Invalid User IDs:** If the user ID format does not conform to the expected convention, the worker will deny property creation.  
- **Unexpected Failures:** The worker logs any errors encountered during execution for further debugging.  
