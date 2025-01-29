
export interface BeforeCreateTokenRequest {
    /** The spec of the token to create */
    tokenSpec:
            | TokenSpec
            | undefined;
    /** The user context which sends the request */
    userContext:
            | UserContext
            | undefined;
}

export interface TokenSpec {
    /** The subject the token belongs to */
    subject: string;
    /** The owner of the token */
    owner: string;
    /** A list of application specific scopes to grant the user in the generated token */
    scope: string[];
    /** The audience (i.e. services) this token is aimed for. These services are expected to accept this token. */
    audience: string[];
    /** Specific expiry in seconds - i.e. for how long the token should be accepted */
    expiresIn: number;
    /** Set whether the generated token also has a refresh token. */
    refreshable: boolean;
    /** Optional payload to put in the token */
    extension: string;
    /** Optional free text to put in the token */
    description: string;
    /** Set whether the generated token also has a reference token. */
    includeReferenceToken: boolean;
}

export interface UserContext {
    /** The username or subject */
    id: string;
    /** Is the context an accessToken */
    isToken: boolean;
    /** The realm of the user */
    realm: string;
}

export interface BeforeCreateTokenResponse {
    /** The instruction of how to proceed */
    status: CreateTokenStatus;
    /** Message to print to the log, in case of an error it will be printed as a warning */
    message: string;
}

export enum CreateTokenStatus {
    CREATE_TOKEN_UNSPECIFIED = 0,
    CREATE_TOKEN_PROCEED = 1,
    CREATE_TOKEN_STOP = 2,
    CREATE_TOKEN_WARN = 3,
    UNRECOGNIZED = -1,
}
