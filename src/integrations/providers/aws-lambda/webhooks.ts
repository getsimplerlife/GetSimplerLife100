/**
 * AWS Lambda / API Gateway Integration — Webhooks
 *
 * Webhook handlers for AWS Lambda and API Gateway events.
 * Supports processing Lambda function URL invocations and
 * API Gateway webhook callbacks.
 */
export interface AwsLambdaWebhookEvent {
  eventType: "lambda_invocation" | "api_gateway_callback";
  payload: Record<string, any>;
  source?: string;
  timestamp?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: AwsLambdaWebhookEvent) => Promise<void>;
}

export const lambdaInvocationHandler: WebhookHandler = {
  name: "aws_lambda_invocation_handler",
  description: "Process AWS Lambda invocation events",
  eventType: "lambda_invocation",
  handler: async (event) => {
    console.log(`[AWS Lambda] Invocation event: ${JSON.stringify(event.payload)}`);
  },
};

export const apiGatewayCallbackHandler: WebhookHandler = {
  name: "aws_api_gateway_callback",
  description: "Process API Gateway callback events",
  eventType: "api_gateway_callback",
  handler: async (event) => {
    console.log(`[AWS API Gateway] Callback: ${JSON.stringify(event.payload)}`);
  },
};

export const awsLambdaWebhookHandlers: WebhookHandler[] = [
  lambdaInvocationHandler,
  apiGatewayCallbackHandler,
];