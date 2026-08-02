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
 * Authentication is derived from the provider auth modules. These are direct
 * static imports so the client never claims OAuth for a missing provider.
 */
import * as auth_0 from "../integrations/providers/adobe-sign/auth";
import * as auth_1 from "../integrations/providers/adp/auth";
import * as auth_2 from "../integrations/providers/asana/auth";
import * as auth_3 from "../integrations/providers/basecamp/auth";
import * as auth_4 from "../integrations/providers/bigcommerce/auth";
import * as auth_5 from "../integrations/providers/bill/auth";
import * as auth_6 from "../integrations/providers/box/auth";
import * as auth_7 from "../integrations/providers/clickup/auth";
import * as auth_8 from "../integrations/providers/creatio/auth";
import * as auth_9 from "../integrations/providers/dialpad/auth";
import * as auth_10 from "../integrations/providers/docusign/auth";
import * as auth_11 from "../integrations/providers/dropbox/auth";
import * as auth_12 from "../integrations/providers/dropbox-sign/auth";
import * as auth_13 from "../integrations/providers/dynamics-365/auth";
import * as auth_14 from "../integrations/providers/dynamics-365-bc/auth";
import * as auth_15 from "../integrations/providers/dynamics-365-fo/auth";
import * as auth_16 from "../integrations/providers/egnyte/auth";
import * as auth_17 from "../integrations/providers/epicor/auth";
import * as auth_18 from "../integrations/providers/exchange/auth";
import * as auth_19 from "../integrations/providers/expensify/auth";
import * as auth_20 from "../integrations/providers/freshbooks/auth";
import * as auth_21 from "../integrations/providers/gmail/auth";
import * as auth_22 from "../integrations/providers/google-doc-ai/auth";
import * as auth_23 from "../integrations/providers/google-drive/auth";
import * as auth_24 from "../integrations/providers/google-workspace/auth";
import * as auth_25 from "../integrations/providers/gusto/auth";
import * as auth_26 from "../integrations/providers/help-scout/auth";
import * as auth_27 from "../integrations/providers/hubspot/auth";
import * as auth_28 from "../integrations/providers/infor-cloudsuite/auth";
import * as auth_29 from "../integrations/providers/jira/auth";
import * as auth_30 from "../integrations/providers/netsuite/auth";
import * as auth_31 from "../integrations/providers/notion/auth";
import * as auth_32 from "../integrations/providers/onedrive/auth";
import * as auth_33 from "../integrations/providers/oracle-erp-cloud/auth";
import * as auth_34 from "../integrations/providers/outlook/auth";
import * as auth_35 from "../integrations/providers/paychex/auth";
import * as auth_36 from "../integrations/providers/pipedrive/auth";
import * as auth_37 from "../integrations/providers/power-bi/auth";
import * as auth_38 from "../integrations/providers/quickbooks-enterprise/auth";
import * as auth_39 from "../integrations/providers/ringcentral/auth";
import * as auth_40 from "../integrations/providers/sage-intacct/auth";
import * as auth_41 from "../integrations/providers/salesforce/auth";
import * as auth_42 from "../integrations/providers/salesforce-service-cloud/auth";
import * as auth_43 from "../integrations/providers/sap-business-one/auth";
import * as auth_44 from "../integrations/providers/sap-s4hana/auth";
import * as auth_45 from "../integrations/providers/sharepoint/auth";
import * as auth_46 from "../integrations/providers/shopify/auth";
import * as auth_47 from "../integrations/providers/slack/auth";
import * as auth_48 from "../integrations/providers/smartsheet/auth";
import * as auth_49 from "../integrations/providers/sugarcrm/auth";
import * as auth_50 from "../integrations/providers/teams/auth";
import * as auth_51 from "../integrations/providers/ukg/auth";
import * as auth_52 from "../integrations/providers/wave/auth";
import * as auth_53 from "../integrations/providers/webex/auth";
import * as auth_54 from "../integrations/providers/workday/auth";
import * as auth_55 from "../integrations/providers/wrike/auth";
import * as auth_56 from "../integrations/providers/xero/auth";
import * as auth_57 from "../integrations/providers/zoho-crm/auth";
import * as auth_58 from "../integrations/providers/zoom/auth";
const providerAuthModules: ReadonlyArray<{ id: string; module: Record<string, unknown> }> = [
  { id: "adobe-sign", module: auth_0 },
  { id: "adp", module: auth_1 },
  { id: "asana", module: auth_2 },
  { id: "basecamp", module: auth_3 },
  { id: "bigcommerce", module: auth_4 },
  { id: "bill", module: auth_5 },
  { id: "box", module: auth_6 },
  { id: "clickup", module: auth_7 },
  { id: "creatio", module: auth_8 },
  { id: "dialpad", module: auth_9 },
  { id: "docusign", module: auth_10 },
  { id: "dropbox", module: auth_11 },
  { id: "dropbox-sign", module: auth_12 },
  { id: "dynamics-365", module: auth_13 },
  { id: "dynamics-365-bc", module: auth_14 },
  { id: "dynamics-365-fo", module: auth_15 },
  { id: "egnyte", module: auth_16 },
  { id: "epicor", module: auth_17 },
  { id: "exchange", module: auth_18 },
  { id: "expensify", module: auth_19 },
  { id: "freshbooks", module: auth_20 },
  { id: "gmail", module: auth_21 },
  { id: "google-doc-ai", module: auth_22 },
  { id: "google-drive", module: auth_23 },
  { id: "google-workspace", module: auth_24 },
  { id: "gusto", module: auth_25 },
  { id: "help-scout", module: auth_26 },
  { id: "hubspot", module: auth_27 },
  { id: "infor-cloudsuite", module: auth_28 },
  { id: "jira", module: auth_29 },
  { id: "netsuite", module: auth_30 },
  { id: "notion", module: auth_31 },
  { id: "onedrive", module: auth_32 },
  { id: "oracle-erp-cloud", module: auth_33 },
  { id: "outlook", module: auth_34 },
  { id: "paychex", module: auth_35 },
  { id: "pipedrive", module: auth_36 },
  { id: "power-bi", module: auth_37 },
  { id: "quickbooks-enterprise", module: auth_38 },
  { id: "ringcentral", module: auth_39 },
  { id: "sage-intacct", module: auth_40 },
  { id: "salesforce", module: auth_41 },
  { id: "salesforce-service-cloud", module: auth_42 },
  { id: "sap-business-one", module: auth_43 },
  { id: "sap-s4hana", module: auth_44 },
  { id: "sharepoint", module: auth_45 },
  { id: "shopify", module: auth_46 },
  { id: "slack", module: auth_47 },
  { id: "smartsheet", module: auth_48 },
  { id: "sugarcrm", module: auth_49 },
  { id: "teams", module: auth_50 },
  { id: "ukg", module: auth_51 },
  { id: "wave", module: auth_52 },
  { id: "webex", module: auth_53 },
  { id: "workday", module: auth_54 },
  { id: "wrike", module: auth_55 },
  { id: "xero", module: auth_56 },
  { id: "zoho-crm", module: auth_57 },
  { id: "zoom", module: auth_58 },
];
function getAuthModule(providerId: string) {
  return providerAuthModules.find((entry) => entry.id === providerId)?.module;
}
export function getAuthMethod(providerId: string): AuthMethod {
  const module = getAuthModule(providerId);
  const exports = module ? Object.keys(module).join(" ").toLowerCase() : "";
  return /oauth/.test(exports) ? "oauth2" : "api_key";
}
export function getConnectLabel(providerId: string): string {
  return getAuthMethod(providerId) === "oauth2" ? "Connect via OAuth" : "Connect via API Key";
}
export function hasAuthModule(providerId: string): boolean {
  return getAuthModule(providerId) !== undefined;
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
