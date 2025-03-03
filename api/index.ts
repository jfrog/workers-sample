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
  platformHttp: PlatformHttpClient;
  axios: Pick<AxiosInstance, 'get'|'put'|'post'|'delete'|'head'|'patch'|'request'>;
}

export interface PlatformSecrets {
  /**
   * Retrieves a secret by its key
   * @param {string} secretKey - The secret key
   */
  get(secretKey: string): string;
}

export interface PlatformContext {
  platformToken: string
  clients: PlatformClients
  secrets: PlatformSecrets
}
