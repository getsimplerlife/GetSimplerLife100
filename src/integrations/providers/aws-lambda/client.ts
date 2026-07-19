/**
 * AWS Lambda / API Gateway Integration — Client
 *
 * Typed API client for AWS Lambda and API Gateway management.
 * Uses the AWS REST API for Lambda function invocation,
 * listing, and API Gateway deployment/monitoring.
 */
import { HttpClient } from "../../framework/client";
import type { ConnectionConfig } from "../../framework/connection";
import { AwsLambdaAuthConfig, getLambdaApiUrl, getApiGatewayManagementUrl, getAwsAuthHeaders } from "./auth";

// ── Type Definitions ────────────────────────────────────────────────────────

export interface LambdaFunction {
  FunctionName: string;
  FunctionArn: string;
  Runtime: string;
  Role: string;
  Handler: string;
  CodeSize: number;
  Description: string;
  Timeout: number;
  MemorySize: number;
  LastModified: string;
  CodeSha256: string;
  Version: string;
  Environment?: { Variables: Record<string, string> };
  Tags?: Record<string, string>;
  State?: string;
  LastUpdateStatus?: string;
}

export interface LambdaInvocationResult {
  StatusCode: number;
  ExecutedVersion: string;
  LogResult?: string;
  Payload: string;
  FunctionError?: string;
}

export interface ApiGatewayRestApi {
  id: string;
  name: string;
  description: string;
  createdDate: string;
  apiEndpoint: string;
  protocolType: string;
}

export interface ApiGatewayStage {
  stageName: string;
  deploymentId: string;
  createdDate: string;
  lastUpdatedDate: string;
  description?: string;
  variables?: Record<string, string>;
}

export interface ApiGatewayDeployment {
  id: string;
  description: string;
  createdDate: string;
}

export interface ApiGatewayResource {
  id: string;
  parentId: string;
  pathPart: string;
  path: string;
  resourceMethods: string[];
}

export interface CloudWatchMetric {
  MetricName: string;
  Namespace: string;
  Timestamp: string;
  Value: number;
  Unit: string;
}

export class AwsLambdaClient {
  private lambdaClient: HttpClient;
  private apiGatewayClient: HttpClient;
  private authConfig: AwsLambdaAuthConfig;
  private authHeaders: Record<string, string>;

  constructor(config: ConnectionConfig) {
    this.authConfig = {
      accessKeyId: config.accessKeyId || "",
      secretAccessKey: config.secretAccessKey || "",
      region: config.region || "us-east-1",
      sessionToken: config.sessionToken,
      accountId: config.accountId,
    };
    this.authHeaders = getAwsAuthHeaders(this.authConfig);

    this.lambdaClient = new HttpClient({
      baseUrl: getLambdaApiUrl(this.authConfig.region),
      rateLimit: { maxRequestsPerSecond: 20 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 15000 },
      timeout: 60000, // Lambda invocations can be long
    });

    this.apiGatewayClient = new HttpClient({
      baseUrl: getApiGatewayManagementUrl(this.authConfig.region),
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 15000 },
      timeout: 30000,
    });
  }

  // ── Lambda Function Management ──────────────────────────────────────────

  /**
   * List all Lambda functions
   */
  async listFunctions(marker?: string, maxItems: number = 50): Promise<{
    functions: LambdaFunction[];
    nextMarker?: string;
  }> {
    let path = `/2015-03-31/functions?MaxItems=${maxItems}`;
    if (marker) path += `&Marker=${encodeURIComponent(marker)}`;

    const res = await this.lambdaClient.get<any>(path, this.authHeaders);
    return {
      functions: (res.data.Functions || []).map((f: any) => ({
        FunctionName: f.FunctionName,
        FunctionArn: f.FunctionArn,
        Runtime: f.Runtime,
        Role: f.Role,
        Handler: f.Handler,
        CodeSize: f.CodeSize,
        Description: f.Description,
        Timeout: f.Timeout,
        MemorySize: f.MemorySize,
        LastModified: f.LastModified,
        CodeSha256: f.CodeSha256,
        Version: f.Version,
        Environment: f.Environment,
        Tags: f.Tags,
        State: f.State,
        LastUpdateStatus: f.LastUpdateStatus,
      })),
      nextMarker: res.data.NextMarker,
    };
  }

  /**
   * Get details of a specific Lambda function
   */
  async getFunction(functionName: string): Promise<LambdaFunction> {
    const res = await this.lambdaClient.get<any>(
      `/2015-03-31/functions/${encodeURIComponent(functionName)}`,
      this.authHeaders,
    );
    const f = res.data.Configuration || res.data;
    return {
      FunctionName: f.FunctionName,
      FunctionArn: f.FunctionArn,
      Runtime: f.Runtime,
      Role: f.Role,
      Handler: f.Handler,
      CodeSize: f.CodeSize,
      Description: f.Description,
      Timeout: f.Timeout,
      MemorySize: f.MemorySize,
      LastModified: f.LastModified,
      CodeSha256: f.CodeSha256,
      Version: f.Version,
      Environment: f.Environment,
      Tags: res.data.Tags,
      State: f.State,
      LastUpdateStatus: f.LastUpdateStatus,
    };
  }

  /**
   * Invoke a Lambda function synchronously
   */
  async invokeFunction(
    functionName: string,
    payload: any,
    invocationType: "RequestResponse" | "Event" | "DryRun" = "RequestResponse",
  ): Promise<LambdaInvocationResult> {
    const headers = {
      ...this.authHeaders,
      "X-Amz-Invocation-Type": invocationType,
      "X-Amz-Log-Type": invocationType === "RequestResponse" ? "Tail" : "None",
    };

    const res = await this.lambdaClient.post<any>(
      `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
      JSON.stringify(payload),
      headers,
    );

    let logResult: string | undefined;
    if (res.headers?.get("X-Amz-Log-Result")) {
      logResult = Buffer.from(res.headers.get("X-Amz-Log-Result")!, "base64").toString("utf-8");
    }

    return {
      StatusCode: res.status,
      ExecutedVersion: res.headers?.get("X-Amz-Executed-Version") || "$LATEST",
      LogResult: logResult,
      Payload: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
      FunctionError: res.headers?.get("X-Amz-Function-Error") || undefined,
    };
  }

  /**
   * Invoke a Lambda function asynchronously (fire-and-forget)
   */
  async invokeAsync(functionName: string, payload: any): Promise<{ statusCode: number }> {
    return this.invokeFunction(functionName, payload, "Event");
  }

  // ── API Gateway Management ──────────────────────────────────────────────

  /**
   * List REST APIs in API Gateway
   */
  async listRestApis(): Promise<ApiGatewayRestApi[]> {
    const res = await this.apiGatewayClient.get<any>(
      "/restapis",
      this.authHeaders,
    );
    return (res.data.items || []).map((api: any) => ({
      id: api.id,
      name: api.name,
      description: api.description,
      createdDate: api.createdDate,
      apiEndpoint: api.apiEndpoint,
      protocolType: api.protocolType || "REST",
    }));
  }

  /**
   * Get details of a specific REST API
   */
  async getRestApi(apiId: string): Promise<ApiGatewayRestApi> {
    const res = await this.apiGatewayClient.get<any>(
      `/restapis/${apiId}`,
      this.authHeaders,
    );
    return {
      id: res.data.id,
      name: res.data.name,
      description: res.data.description,
      createdDate: res.data.createdDate,
      apiEndpoint: res.data.apiEndpoint,
      protocolType: res.data.protocolType || "REST",
    };
  }

  /**
   * List stages for an API Gateway REST API
   */
  async listStages(apiId: string): Promise<ApiGatewayStage[]> {
    const res = await this.apiGatewayClient.get<any>(
      `/restapis/${apiId}/stages`,
      this.authHeaders,
    );
    const item = res.data.item || [];
    return item.map((stage: any) => ({
      stageName: stage.stageName,
      deploymentId: stage.deploymentId,
      createdDate: stage.createdDate,
      lastUpdatedDate: stage.lastUpdatedDate,
      description: stage.description,
      variables: stage.variables,
    }));
  }

  /**
   * Create a deployment for an API Gateway REST API
   */
  async createDeployment(
    apiId: string,
    stageName: string,
    description?: string,
  ): Promise<ApiGatewayDeployment> {
    const body: any = { stageName };
    if (description) body.description = description;

    const res = await this.apiGatewayClient.post<any>(
      `/restapis/${apiId}/deployments`,
      JSON.stringify(body),
      this.authHeaders,
    );
    return {
      id: res.data.id,
      description: res.data.description,
      createdDate: res.data.createdDate,
    };
  }

  /**
   * List resources for an API Gateway REST API
   */
  async listResources(apiId: string): Promise<ApiGatewayResource[]> {
    const res = await this.apiGatewayClient.get<any>(
      `/restapis/${apiId}/resources`,
      this.authHeaders,
    );
    return (res.data.item || []).map((r: any) => ({
      id: r.id,
      parentId: r.parentId,
      pathPart: r.pathPart,
      path: r.path,
      resourceMethods: Object.keys(r.resourceMethods || {}),
    }));
  }

  // ── Monitoring ──────────────────────────────────────────────────────────

  /**
   * Get Lambda invocation metrics (simulated via CloudWatch-style response)
   * In production, this would use CloudWatch API or AWS SDK
   */
  async getLambdaMetrics(functionName: string): Promise<{ invocations: number; errors: number; duration: number }> {
    // Simulated metrics - in production, query CloudWatch
    const res = await this.lambdaClient.get<any>(
      `/2015-03-31/functions/${encodeURIComponent(functionName)}/configuration`,
      this.authHeaders,
    );
    return {
      invocations: 0,
      errors: 0,
      duration: 0,
    };
  }

  /**
   * Get API Gateway metrics for a specific API and stage
   * (simulated - would use CloudWatch in production)
   */
  async getApiGatewayMetrics(apiId: string, stageName: string): Promise<{
    count: number;
    errorCount: number;
    latency: number;
  }> {
    return {
      count: 0,
      errorCount: 0,
      latency: 0,
    };
  }

  // ── Health Check ────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.listFunctions(undefined, 1);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an AWS Lambda/API Gateway client from stored connection config
 */
export function createAwsLambdaClient(config: ConnectionConfig): AwsLambdaClient {
  return new AwsLambdaClient(config);
}