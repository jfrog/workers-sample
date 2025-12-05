import { AxiosInstance } from "axios";

/**
 * Response returned by JFrog platform API
 */
export interface IPlatformHttpResponse {
  /**
   * Http status
   */
  status: number;
  /**
   * Response headers
   */
  headers: Record<string, string>;
  /**
   * Parsed response body
   */
  data: any;
}

/**
 *  PlatformHttpClient allows performing REST requests to JFrog platform APIs.
 *  The client encapsulates platform scheme, hostname and port. Client can add Authorization header with
 *  admin token and other additional headers (E.g. X-Jfrog-Tenant-Id header with proper tenant id in multi-tenant
 *  environment). User provides only the path for the request, body, http method, additional headers.
 */
export interface PlatformHttpClient {
  /**
   * Perform http GET request to JFrog platform
   * @param {string} endpoint - API endpoint. E.g. /artifactory/api/repositories
   * @param {Record<string, string>} headers - additional headers used in the request
   */
  get(endpoint: string, headers?: Record<string, string>): Promise<IPlatformHttpResponse>;

  /**
   * Perform http POST request to JFrog platform
   * @param {string} endpoint - API endpoint. E.g. /artifactory/api/repositories
   * @param {any} requestData - data sent in request body
   * @param {Record<string, string>} headers - additional headers used in the request
   */
  post(endpoint: string, requestData?: any, headers?: Record<string, string>): Promise<IPlatformHttpResponse>;

  /**
   * Perform http PUT request to JFrog platform
   * @param {string} endpoint - API endpoint. E.g. /artifactory/api/repositories
   * @param {any} requestData - data sent in request body
   * @param {Record<string, string>} headers - additional headers used in the request
   */
  put(endpoint: string, requestData?: any, headers?: Record<string, string>): Promise<IPlatformHttpResponse>;

  /**
   * Perform http PATCH request to JFrog platform
   * @param {string} endpoint - API endpoint. E.g. /artifactory/api/repositories
   * @param {any} requestData - data sent in request body
   * @param {Record<string, string>} headers - additional headers used in the request
   */
  patch(endpoint: string, requestData?: any, headers?: Record<string, string>): Promise<IPlatformHttpResponse>;

  /**
   * Perform http DELETE request to JFrog platform
   * @param {string} endpoint - API endpoint. E.g. /artifactory/api/repositories
   * @param {Record<string, string>} headers - additional headers used in the request
   */
  delete(endpoint: string, headers?: Record<string, string>): Promise<IPlatformHttpResponse>;
}

export interface PlatformClients {
  /**
   * HTTP client to perform requests to your JFrog platform
   */
  platformHttp: PlatformHttpClient
  /**
   * HTTP client (axios) to perform requests to the outside
   */
  axios: Pick<AxiosInstance, 'get'|'put'|'post'|'delete'|'head'|'patch'|'request'>;
}

export interface PlatformSecrets {
  /**
   * Retrieves a secret by its key
   * @param {string} secretKey - The secret key
   */
  get(secretKey: string): string;
}

export interface PlatformProperties {
  /**
   * Retrieves a Worker's property by its key
   * @param {string} propertyKey - The property key
   */
  get(propertyKey: string): string;
}

export interface StateManager {
  /**
   * Retrieves a value from the state by its key
   * @param {string} key - The key of the value to retrieve
   */
  get(key: string): string;

  /**
   * Sets a value in the state by its key
   * @param {string} key - The key of the value to set
   * @param {any} value - The value to set. If the value is not a string, it will be converted to a JSON string.
   */
  set(key: string, value: any): void;

  /**
   * Checks if a value exists in the state by its key
   * @param {string} key - The key of the value to check
   * @returns {boolean} - True if the value exists, false otherwise
   */
  has(key: string): boolean;

  /**
   * Deletes a value from the state by its key.
   * If it does not exist, it does nothing.
   * @param {string} key - The key of the value to delete
   */
  delete(key: string): void;

  /**
   * Clears the entire state
   */
  clear(): void;

  /**
   * Returns a copy of the entire state
   */
  getAll(): Record<string, string>;
}

export interface PlatformHttpClientError {
  /**
   * The reason of the error
   */
  message: string;

  /**
   * Http status
   */
  status: number;
}

export interface PlatformContext {
    /**
     * HTTP clients to perform requests to your JFrog platform or to the outside
     */
    clients: PlatformClients;
    /**
     * Utility to get access to your Worker's secrets
     */
    secrets: PlatformSecrets;
    /**
     * Utility to get access to your Worker's properties
     */
    properties: PlatformProperties;
    /**
     * The base URL of the JFrog platform
     */
    baseUrl: string;
    /**
     * Token used when communicating with the JFrog platform
     */
    platformToken: string;
    /**
     * State manager to store and retrieve state for this Worker between executions.
     * NOTE: This state is not safe against concurrent executions of the same Worker.
     * NOTE: The state will not be saved in case of execution failure.
     * NOTE: The state is limited in size and number of items. Check the Worker documentation for more details.
     */
    state: StateManager;
    /**
     * Will wait for the number of millisecond.
     * The waiting time is limited by the execution time of the function.
     * @param {number} delayMs - The number of milliseconds to wait
     */
    wait(delayMs: number): Promise<void>;
    /**
     * Will return the remaining execution time in milliseconds
     */
    getRemainingExecutionTime(): number;
}
