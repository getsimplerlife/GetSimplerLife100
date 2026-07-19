/**
 * AWS Lambda / API Gateway Integration — Module Export
 *
 * Provides AWS Lambda function invocation and management, plus
 * API Gateway deployment and monitoring tools.
 * Target: IT Operations AI (it_operations) and generic agent tool.
 */
export * from "./auth";
export * from "./client";
export * from "./actions";
export * from "./webhooks";
export const PROVIDER_ID = "aws-lambda";
export const PROVIDER_NAME = "AWS Lambda / API Gateway";
export const PROVIDER_CATEGORY = "developer-tools";