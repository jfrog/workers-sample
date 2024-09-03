import { PlatformContext, BeforeCreateTokenRequest, BeforeCreateTokenResponse, CreateTokenStatus } from 'jfrog-workers';

/**
 * This worker enforces 3 checks before allowing the creation of new tokens.
 *   - The number of tokens owned by the subject should not exceeds a specific count.
 *   - If it is a user token that is been created its expiry should not exceeds 1 month (the duration can be parameterized)
 *   - If it is a service token that is been created its expiry should not exceeds 1 year (the duration can be parameterized)
 */

// The maximum number of tokens a user can have
const MAX_TOKENS_PER_USERS = 10;
// The maximum expiry duration for a user token
const MAX_USER_TOKEN_EXPIRY = 31 * 24 * 60 * 60; // 1 month
// The maximum expiry duration for a service token
const MAX_SERVICE_TOKEN_EXPIRY = 365 * 24 * 60 * 60; // 1 year

// Worker entry point
export default async (context: PlatformContext, data: BeforeCreateTokenRequest): Promise<BeforeCreateTokenResponse> => {

    let status: CreateTokenStatus = CreateTokenStatus.CREATE_TOKEN_PROCEED;
    let message: string = 'Proceed';

    try {
        if (await subjectTokensCountExceedsMaximum(context, data.tokenSpec.subject)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `The maximum number of tokens per user (${MAX_TOKENS_PER_USERS}) has been reached.`;
        }

        else if (isUserToken(data) && tokenExpiryExceeds(data, MAX_USER_TOKEN_EXPIRY)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `Users tokens cannot exceed ${MAX_USER_TOKEN_EXPIRY} seconds.`;
        }

        else if (isServiceToken(data) && tokenExpiryExceeds(data, MAX_SERVICE_TOKEN_EXPIRY)) {
            status = CreateTokenStatus.CREATE_TOKEN_STOP;
            message = `Service tokens cannot exceed ${MAX_SERVICE_TOKEN_EXPIRY} seconds.`;
        }
    } catch (error) {
        // The platformHttp client throws PlatformHttpClientError if the HTTP request status is 400 or higher
        status = CreateTokenStatus.CREATE_TOKEN_WARN;
        message = 'Cannot verify the number of tokens.';
        console.error(`Request failed with status code ${error.status || '<none>'} caused by : ${error.message}`);
    }

    return { status, message };
};

/**
 * Counts the number of tokens owned by the subject.
 * 
 * @param context The platform context
 * @param subject The subject of the token
 * @returns The number of tokens owned by the subject
 */
async function countUserTokens(context: PlatformContext, subject: string): Promise<number> {
    // We retrieve the list of tokens managed by the user that's triggering the token creation
    const res = await context.clients.platformHttp.get('/access/api/v1/tokens');

    if (res.status !== 200) {
        console.warn(`Cannot fetch tokens. The request is successful but returned status other than 200. Status code : ${res.status}`);
        return 0;
    }

    const { tokens } = res.data;
    return tokens?.filter((token) => token.subject === subject).length || 0;
}

/**
 * Checks if the number of tokens owned by the subject exceeds the maximum count.
 * 
 * @param context The platform context
 * @param subject The subject of the token
 * @returns <code>true</code> if the number of tokens owned by the subject exceeds the maximum count, <code>false</code> otherwise
 */
async function subjectTokensCountExceedsMaximum(context: PlatformContext, subject: string): Promise<boolean> {
    return await countUserTokens(context, subject) + 1 >= MAX_TOKENS_PER_USERS;
}

/**
 * Checks if the token is a user token.
 * 
 * @param data The token request data
 * @returns <code>true</code> if the token is a user token, <code>false</code> otherwise
 */
function isUserToken(data: BeforeCreateTokenRequest) {
    const [scope] = data.tokenSpec.scope;
    return scope && scope === 'applied-permissions/user';
}

/**
 * Checks if the token is a service token.
 * 
 * @param data The token request data
 * @returns <code>true</code> if the token is a service token, <code>false</code> otherwise
 */
function isServiceToken(data: BeforeCreateTokenRequest) {
    if (isUserToken(data)) {
        return false;
    }
    const subject = data.tokenSpec.subject;
    return subject && (/^[^/]+\/nodes\/[^/]+$/.test(subject) || !subject.include('/'));
}

/**
 * Checks if the token expiry exceeds the maximum expiry duration.
 * 
 * @param data The token request data
 * @param maxExpiry The maximum expiry duration
 * @returns <code>true</code> if the token expiry exceeds the maximum expiry duration, <code>false</code> otherwise
 */
function tokenExpiryExceeds(data: BeforeCreateTokenRequest, maxExpiry: number) {
    return data.tokenSpec.expiry > maxExpiry;
}