import { PlatformContext, BeforePropertyCreateRequest, BeforePropertyCreateResponse, BeforePropertyCreateStatus } from 'jfrog-workers';

/**
 * This worker is used to intercept the creation of a property.
 * It checks if the user is an admin and allows the creation of the property.
 * Only admins are allowed to create properties.
 */
export default async (context: PlatformContext, data: BeforePropertyCreateRequest): Promise<BeforePropertyCreateResponse> => {
    if (isAdmin(data)) {
        return {
            message: "Permission granted to admin",
            status: BeforePropertyCreateStatus.BEFORE_PROPERTY_CREATE_PROCEED
        };
    }

    return {
        message: "Only admins are allowed to create properties",
        status: BeforePropertyCreateStatus.BEFORE_PROPERTY_CREATE_STOP
    }
};

/**
 * Checks if the user is an admin.
 * 
 * @param data The request data
 * @returns <code>true</code> if the user is an admin, <code>false</code> otherwise
 */
function isAdmin(data: BeforePropertyCreateRequest): boolean {
    return data.userContext.id.endsWith("/users/admin");
}