/**
 * Integration Auth Type Map
 *
 * Maps every provider ID to its authentication type for the catalog UI.
 * Determines whether the Connect button triggers an OAuth 2.0 flow
 * or an API key configuration form.
 */

export type AuthMethod = "oauth2" | "api_key";

export interface ProviderAuthInfo {
  providerId: string;
  authMethod: AuthMethod;
  /** Human-readable label for the connect button */
  connectLabel: string;
  /** Whether we have a real auth module for this provider */
  hasAuthModule: boolean;
}

/**
 * Providers with real OAuth auth modules in src/integrations/providers/<id>/auth.ts
 */
const OAUTH_PROVIDERS = new Set([
  "salesforce",
  "salesforce-service-cloud",
  "hubspot",
  "pipedrive",
  "zoho-crm",
  "monday-crm",
  "freshsales",
  "sugarcrm",
  "copper",
  "creatio",
  "netsuite",
  "oracle-netsuite",
  "sap",
  "sap-s4hana",
  "sap-business-one",
  "ms-dynamics-365",
  "dynamics-business-central",
  "oracle-erp-cloud",
  "acumatica",
  "epicor",
  "infor-cloudsuite",
  "sage-intacct",
  "sage-x3",
  "odoo",
  "quickbooks-enterprise",
  "quickbooks-online",
  "quickbooks-desktop",
  "xero",
  "freshbooks",
  "wave",
  "sage-50",
  "bill-com",
  "expensify",
  "ramp",
  "brex",
  "google-workspace",
  "google-calendar",
  "google-docs",
  "google-sheets",
  "google-forms",
  "outlook",
  "outlook-calendar",
  "microsoft-365",
  "microsoft-bookings",
  "microsoft-forms",
  "teams",
  "slack",
  "zoom",
  "ringcentral",
  "webex",
  "discord",
  "twilio",
  "dialpad",
  "aircall",
  "servicenow",
  "zendesk",
  "freshdesk",
  "intercom",
  "help-scout",
  "jira",
  "confluence",
  "asana",
  "monday-com",
  "wrike",
  "trello",
  "smartsheet",
  "notion",
  "clickup",
  "basecamp",
  "workday",
  "bamboo-hr",
  "gusto",
  "rippling",
  "paychex",
  "ukg",
  "greenhouse",
  "lever",
  "workable",
  "breezy-hr",
  "shopify",
  "woocommerce",
  "magento",
  "bigcommerce",
  "stripe",
  "square",
  "paypal",
  "authorize-net",
  "braintree",
  "tableau",
  "power-bi",
  "looker",
  "metabase",
  "sigma",
  "qlik-sense",
  "snowflake",
  "databricks",
  "bigquery",
  "redshift",
  "salesforce-marketing",
  "mailchimp",
  "hubspot-marketing",
  "marketo",
  "activecampaign",
  "docusign",
  "pandadoc",
  "hellosign",
  "dropbox-sign",
  "onedrive",
  "sharepoint",
  "box",
  "dropbox",
  "s3",
  "gcs",
  "azure-blob",
  "okta",
  "onelogin",
  "azure-ad",
  "auth0",
  "ping-identity",
  "samsara",
  "motive",
  "project44",
  "fourkites",
  "trimble-tms",
  "mcleod-software",
  "mercurygate",
  "pcs-tms",
  "truckstop",
  "plex",
  "siemens-opcenter",
  "katana",
  "mrpeasy",
  "fishbowl",
  "iqms",
  "nextgen",
  "salesforce-health",
  "oracle-health",
  "cerner",
  "epic",
  "meditech",
  "athenahealth",
  "openai",
  "google-gemini",
  "mistral",
  "anthropic",
  "cohere",
  "stability-ai",
  "uipath",
  "automation-anywhere",
  "blue-prism",
  "power-automate",
  "zapier",
  "make",
  "tray-io",
  "workato",
  "n8n",
  "clickhouse",
  "airflow",
  "aws-lambda",
  "iguana",
  "mirth-connect",
]);

/**
 * Providers that use API keys or connection strings instead of OAuth.
 * These are databases, FTP, raw protocols, and simple API services.
 */
const API_KEY_PROVIDERS = new Set([
  "mysql",
  "postgresql",
  "sql-server",
  "oracle-db",
  "mongodb",
  "redis",
  "elasticsearch",
  "cassandra",
  "mariadb",
  "dynamodb",
  "couchdb",
  "neo4j",
  "influxdb",
  "timescaledb",
  "cockroachdb",
  "ftp-sftp",
  "sftp",
  "smtp",
  "imap",
  "rest-api",
  "graphql",
  "soap",
  "webhooks",
  "json",
  "xml",
  "csv",
  "excel",
  "word",
  "pdf-co",
  "ocr-space",
  "jotform",
  "typeform",
  "gravity-forms",
  "formstack",
  "pdf-co",
]);

/**
 * Resolve auth method for a provider ID.
 * Priority: explicit OAUTH set > explicit API_KEY set > fallback to api_key
 */
export function getAuthMethod(providerId: string): AuthMethod {
  if (OAUTH_PROVIDERS.has(providerId)) return "oauth2";
  if (API_KEY_PROVIDERS.has(providerId)) return "api_key";
  // Default to API key for safety — most remaining are API-key based
  return "api_key";
}

export function getConnectLabel(providerId: string): string {
  return getAuthMethod(providerId) === "oauth2"
    ? "Connect via OAuth"
    : "Connect via API Key";
}

export function hasAuthModule(providerId: string): boolean {
  // Providers we know have real auth.ts files
  return OAUTH_PROVIDERS.has(providerId) || API_KEY_PROVIDERS.has(providerId);
}

/**
 * Agent types available for data routing
 */
export const AGENT_TYPES = [
  { id: "document_intake", name: "Document AI System" },
  { id: "healthcare_intake", name: "Healthcare Intake AI" },
  { id: "invoice_ledger", name: "Invoice & Ledger AI" },
  { id: "sales_outreach", name: "Sales Outreach Coordinator AI" },
  { id: "hr_compliance", name: "HR Intake & Compliance AI" },
  { id: "dispatch_logistics", name: "Dispatch Logistics Optimization AI" },
  { id: "audit_logger", name: "Operations Audit Logger AI" },
  { id: "voice_receptionist", name: "Voice AI Receptionist" },
  { id: "support_agent", name: "AI Customer Support Agent" },
  { id: "knowledge_assistant", name: "Internal Knowledge Assistant" },
  { id: "inventory_management", name: "Inventory Management AI" },
  { id: "contract_management", name: "Contract Management AI" },
  { id: "customer_success", name: "Customer Success / Retention AI" },
  { id: "project_management", name: "Project Management AI" },
  { id: "procurement_vendor", name: "Procurement & Vendor Management AI" },
  { id: "it_operations", name: "IT Operations & DevOps AI" },
  { id: "fp_and_a", name: "Financial Planning & FP&A AI" },
  { id: "marketing_social", name: "Marketing & Social Media AI" },
];
