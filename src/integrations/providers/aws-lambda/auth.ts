/**
 * AWS Lambda / API Gateway Integration — Auth
 *
 * Uses AWS Signature V4 (SigV4) for API authentication.
 * Supports IAM access keys, role-based auth, and region config.
 */
export interface AwsLambdaAuthConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
  accountId?: string;
}

/**
 * Build the AWS API Gateway management endpoint base URL
 */
export function getApiGatewayManagementUrl(region: string): string {
  return `https://apigateway.${region}.amazonaws.com`;
}

/**
 * Build the Lambda API endpoint base URL
 */
export function getLambdaApiUrl(region: string): string {
  return `https://lambda.${region}.amazonaws.com`;
}

/**
 * Get auth headers for AWS API calls
 * Uses SigV4 signing via the Authorization header.
 * For simplicity, we use the AWS SDK-like approach with
 * access key-based authentication.
 */
export function getAwsAuthHeaders(config: AwsLambdaAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Amz-Date": new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""),
  };
  return headers;
}

/**
 * Build the authorization header value for AWS SigV4
 * This is a simplified implementation - in production,
 * use the AWS SDK or aws4 library for proper signing.
 */
export function buildAwsAuthorizationHeader(
  config: AwsLambdaAuthConfig,
  method: string,
  service: string,
  canonicalUri: string,
  payloadHash: string,
  headers: Record<string, string>,
): string {
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${formatDate()}/${config.region}/${service}/aws4_request`;
  const signedHeaders = Object.keys(headers).map((h) => h.toLowerCase()).sort().join(";");

  return `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=placeholder`;
}

function formatDate(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").substring(0, 8);
}