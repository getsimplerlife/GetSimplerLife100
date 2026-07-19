/**
 * AWS Lambda / API Gateway Integration — Actions
 *
 * Action definitions for the Agent Runtime.
 * Wraps AWS Lambda and API Gateway operations as typed LLM-callable actions.
 */
import { createAwsLambdaClient } from "./client";
import type { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── Lambda Function Actions ─────────────────────────────────────────────────

export const invokeLambda: ActionDefinition = {
  name: "aws_lambda_invoke",
  description: "Invoke an AWS Lambda function with a payload",
  inputSchema: {
    type: "object",
    properties: {
      functionName: { type: "string", description: "Name or ARN of the Lambda function" },
      payload: { type: "object", description: "JSON payload to pass to the function" },
      invocationType: {
        type: "string",
        enum: ["RequestResponse", "Event", "DryRun"],
        description: "Invocation type: RequestResponse (sync), Event (async), DryRun (test)",
      },
    },
    required: ["functionName", "payload"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.invokeFunction(params.functionName, params.payload, params.invocationType);
  },
};

export const listLambdaFunctions: ActionDefinition = {
  name: "aws_lambda_list",
  description: "List all AWS Lambda functions in the account",
  inputSchema: {
    type: "object",
    properties: {
      maxItems: { type: "number", description: "Maximum number of functions to return (default: 50)" },
      marker: { type: "string", description: "Pagination marker from previous response" },
    },
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.listFunctions(params.marker, params.maxItems || 50);
  },
};

export const getLambdaFunction: ActionDefinition = {
  name: "aws_lambda_get",
  description: "Get details of a specific AWS Lambda function",
  inputSchema: {
    type: "object",
    properties: {
      functionName: { type: "string", description: "Name or ARN of the Lambda function" },
    },
    required: ["functionName"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.getFunction(params.functionName);
  },
};

export const invokeLambdaAsync: ActionDefinition = {
  name: "aws_lambda_invoke_async",
  description: "Invoke an AWS Lambda function asynchronously (fire-and-forget)",
  inputSchema: {
    type: "object",
    properties: {
      functionName: { type: "string", description: "Name or ARN of the Lambda function" },
      payload: { type: "object", description: "JSON payload to pass to the function" },
    },
    required: ["functionName", "payload"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.invokeAsync(params.functionName, params.payload);
  },
};

// ── API Gateway Actions ─────────────────────────────────────────────────────

export const listRestApis: ActionDefinition = {
  name: "aws_api_list",
  description: "List all API Gateway REST APIs in the account",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createAwsLambdaClient(config);
    return client.listRestApis();
  },
};

export const getRestApi: ActionDefinition = {
  name: "aws_api_get",
  description: "Get details of a specific API Gateway REST API",
  inputSchema: {
    type: "object",
    properties: {
      apiId: { type: "string", description: "API Gateway REST API ID" },
    },
    required: ["apiId"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.getRestApi(params.apiId);
  },
};

export const createDeployment: ActionDefinition = {
  name: "aws_api_deploy",
  description: "Deploy an API Gateway REST API to a stage",
  inputSchema: {
    type: "object",
    properties: {
      apiId: { type: "string", description: "API Gateway REST API ID" },
      stageName: { type: "string", description: "Deployment stage name (e.g., 'prod', 'staging')" },
      description: { type: "string", description: "Deployment description" },
    },
    required: ["apiId", "stageName"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.createDeployment(params.apiId, params.stageName, params.description);
  },
};

export const listApiStages: ActionDefinition = {
  name: "aws_api_stages",
  description: "List stages for an API Gateway REST API",
  inputSchema: {
    type: "object",
    properties: {
      apiId: { type: "string", description: "API Gateway REST API ID" },
    },
    required: ["apiId"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.listStages(params.apiId);
  },
};

export const listApiResources: ActionDefinition = {
  name: "aws_api_resources",
  description: "List resources (endpoints) for an API Gateway REST API",
  inputSchema: {
    type: "object",
    properties: {
      apiId: { type: "string", description: "API Gateway REST API ID" },
    },
    required: ["apiId"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.listResources(params.apiId);
  },
};

export const getApiGatewayMetrics: ActionDefinition = {
  name: "aws_api_monitor",
  description: "Get API Gateway metrics for a specific API and stage",
  inputSchema: {
    type: "object",
    properties: {
      apiId: { type: "string", description: "API Gateway REST API ID" },
      stageName: { type: "string", description: "Deployment stage name" },
    },
    required: ["apiId", "stageName"],
  },
  handler: async (config, params) => {
    const client = createAwsLambdaClient(config);
    return client.getApiGatewayMetrics(params.apiId, params.stageName);
  },
};

// ── Health Check ────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "aws_lambda_health",
  description: "Check if the AWS Lambda/API Gateway connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createAwsLambdaClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "aws-lambda" };
  },
};

// ── All Actions Export ──────────────────────────────────────────────────────

export const awsLambdaActions: ActionDefinition[] = [
  invokeLambda,
  listLambdaFunctions,
  getLambdaFunction,
  invokeLambdaAsync,
  listRestApis,
  getRestApi,
  createDeployment,
  listApiStages,
  listApiResources,
  getApiGatewayMetrics,
  healthCheck,
];