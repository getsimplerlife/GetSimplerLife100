/**
 * Integration Tool Registry
 *
 * Imports all integration provider action definitions and registers them
 * as tools for the Agent Runtime and LLM. Provides tool definitions in
 * OpenAI-compatible JSON schema format.
 *
 * Each tool wraps an integration action with connection lookup,
 * token refresh, and error handling via the action-executor.
 */

import { actionRegistry, executeAction } from "./action-executor";

// ── Tool Definition Types ────────────────────────────────────────────────

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolCallResult {
  toolCallId: string;
  actionName: string;
  success: boolean;
  data?: any;
  error?: string;
}

// ── Provider Action Imports & Registration ───────────────────────────────

// This function registers all actions from a provider module
function registerProviderActions(providerId: string, actionModules: any[], exportKeys: string[]) {
  for (const mod of actionModules) {
    for (const key of exportKeys) {
      const actions = mod[key];
      if (Array.isArray(actions)) {
        actionRegistry.registerProvider(providerId, actions);
      }
    }
  }
}

// CRM
import * as salesforce from "../integrations/providers/salesforce";
import * as hubspot from "../integrations/providers/hubspot";
import * as dynamics365 from "../integrations/providers/dynamics-365";
import * as zoho from "../integrations/providers/zoho-crm";
import * as pipedrive from "../integrations/providers/pipedrive";
import * as copper from "../integrations/providers/copper";
import * as freshsales from "../integrations/providers/freshsales";
import * as mondayCrm from "../integrations/providers/monday-crm";
import * as sugarcrm from "../integrations/providers/sugarcrm";
import * as creatio from "../integrations/providers/creatio";
// ERP
import * as netsuite from "../integrations/providers/netsuite";
import * as saps4hana from "../integrations/providers/sap-s4hana";
import * as sapb1 from "../integrations/providers/sap-business-one";
import * as dynbc from "../integrations/providers/dynamics-365-bc";
import * as dynfo from "../integrations/providers/dynamics-365-fo";
import * as oracleErp from "../integrations/providers/oracle-erp-cloud";
import * as acumatica from "../integrations/providers/acumatica";
import * as epicor from "../integrations/providers/epicor";
import * as kinetic from "../integrations/providers/epicor-kinetic";
import * as infor from "../integrations/providers/infor-cloudsuite";
import * as sageIntacct from "../integrations/providers/sage-intacct";
import * as sageX3 from "../integrations/providers/sage-x3";
import * as odoo from "../integrations/providers/odoo";
import * as qbe from "../integrations/providers/quickbooks-enterprise";
// Accounting
import * as qbo from "../integrations/providers/quickbooks-online";
import * as qbd from "../integrations/providers/quickbooks-desktop";
import * as xero from "../integrations/providers/xero";
import * as freshbooks from "../integrations/providers/freshbooks";
import * as wave from "../integrations/providers/wave";
import * as sage50 from "../integrations/providers/sage-50";
import * as bill from "../integrations/providers/bill";
import * as expensify from "../integrations/providers/expensify";
import * as ramp from "../integrations/providers/ramp";
import * as brex from "../integrations/providers/brex";
// Email
import * as outlook from "../integrations/providers/outlook";
import * as exchange from "../integrations/providers/exchange";
import * as gmail from "../integrations/providers/gmail";
import * as gws from "../integrations/providers/google-workspace";
import * as imap from "../integrations/providers/imap";
import * as smtp from "../integrations/providers/smtp";
// Communication
import * as teams from "../integrations/providers/teams";
import * as slack from "../integrations/providers/slack";
import * as zoom from "../integrations/providers/zoom";
import * as ringcentral from "../integrations/providers/ringcentral";
import * as webex from "../integrations/providers/webex";
import * as discord from "../integrations/providers/discord";
import * as twilio from "../integrations/providers/twilio";
import * as dialpad from "../integrations/providers/dialpad";
import * as aircall from "../integrations/providers/aircall";
// Storage
import * as sharepoint from "../integrations/providers/sharepoint";
import * as onedrive from "../integrations/providers/onedrive";
import * as gdrive from "../integrations/providers/google-drive";
import * as dropbox from "../integrations/providers/dropbox";
import * as box from "../integrations/providers/box";
import * as egnyte from "../integrations/providers/egnyte";
// Document Processing
import * as adobeSign from "../integrations/providers/adobe-sign";
import * as docusign from "../integrations/providers/docusign";
import * as pandadoc from "../integrations/providers/pandadoc";
import * as dropboxSign from "../integrations/providers/dropbox-sign";
import * as pdfCo from "../integrations/providers/pdf-co";
import * as ocrSpace from "../integrations/providers/ocr-space";
import * as abbyy from "../integrations/providers/abbyy";
import * as textract from "../integrations/providers/aws-textract";
import * as azureDocIntel from "../integrations/providers/azure-doc-intel";
import * as googleDocAI from "../integrations/providers/google-doc-ai";
// Project Management
import * as mondayCom from "../integrations/providers/monday-com";
import * as asana from "../integrations/providers/asana";
import * as clickup from "../integrations/providers/clickup";
import * as jira from "../integrations/providers/jira";
import * as trello from "../integrations/providers/trello";
import * as basecamp from "../integrations/providers/basecamp";
import * as notion from "../integrations/providers/notion";
import * as wrike from "../integrations/providers/wrike";
import * as smartsheet from "../integrations/providers/smartsheet";
// HR
import * as bamboohr from "../integrations/providers/bamboohr";
import * as workday from "../integrations/providers/workday";
import * as ukg from "../integrations/providers/ukg";
import * as adp from "../integrations/providers/adp";
import * as gusto from "../integrations/providers/gusto";
import * as rippling from "../integrations/providers/rippling";
import * as paychex from "../integrations/providers/paychex";
import * as greenhouse from "../integrations/providers/greenhouse";
import * as lever from "../integrations/providers/lever";
// Customer Support
import * as zendesk from "../integrations/providers/zendesk";
import * as freshdesk from "../integrations/providers/freshdesk";
import * as intercom from "../integrations/providers/intercom";
import * as helpScout from "../integrations/providers/help-scout";
import * as servicenow from "../integrations/providers/servicenow";
import * as serviceCloud from "../integrations/providers/salesforce-service-cloud";
// BI
import * as powerBI from "../integrations/providers/power-bi";
import * as tableau from "../integrations/providers/tableau";
import * as looker from "../integrations/providers/looker";
import * as metabase from "../integrations/providers/metabase";
import * as qlikSense from "../integrations/providers/qlik-sense";
import * as sigma from "../integrations/providers/sigma";
// ECommerce
import * as shopify from "../integrations/providers/shopify";
import * as woocommerce from "../integrations/providers/woocommerce";
import * as bigcommerce from "../integrations/providers/bigcommerce";
import * as magento from "../integrations/providers/magento";
import * as amazonSeller from "../integrations/providers/amazon-seller";
// Logistics
import * as mcleodSoftware from "../integrations/providers/mcleod-software";
import * as mercurygate from "../integrations/providers/mercurygate";
import * as trimbleTms from "../integrations/providers/trimble-tms";
import * as samsara from "../integrations/providers/samsara";
import * as motive from "../integrations/providers/motive";
import * as project44 from "../integrations/providers/project44";
import * as fourkites from "../integrations/providers/fourkites";
import * as dat from "../integrations/providers/dat";
import * as truckstop from "../integrations/providers/truckstop";
import * as descartes from "../integrations/providers/descartes";
import * as pcsTms from "../integrations/providers/pcs-tms";
import * as ascendTms from "../integrations/providers/ascend-tms";
// Manufacturing
import * as plex from "../integrations/providers/plex";
import * as katana from "../integrations/providers/katana";
import * as fishbowl from "../integrations/providers/fishbowl";
import * as mrpeasy from "../integrations/providers/mrpeasy";
import * as iqms from "../integrations/providers/iqms";
import * as epicorKineticMfg from "../integrations/providers/epicor-kinetic-mfg";
import * as siemensOpcenter from "../integrations/providers/siemens-opcenter";
// Healthcare
import * as athenahealth from "../integrations/providers/athenahealth";
import * as nextgen from "../integrations/providers/nextgen";
import * as eclinicalworks from "../integrations/providers/eclinicalworks";
// Scheduling
import * as calendly from "../integrations/providers/calendly";
import * as microsoftBookings from "../integrations/providers/microsoft-bookings";
import * as googleCalendar from "../integrations/providers/google-calendar";
import * as outlookCalendar from "../integrations/providers/outlook-calendar";
import * as acuity from "../integrations/providers/acuity";
// Forms
import * as typeform from "../integrations/providers/typeform";
import * as jotform from "../integrations/providers/jotform";
import * as microsoftForms from "../integrations/providers/microsoft-forms";
import * as googleForms from "../integrations/providers/google-forms";
import * as formstack from "../integrations/providers/formstack";
import * as gravityForms from "../integrations/providers/gravity-forms";
// Payment
import * as square from "../integrations/providers/square";
import * as paypal from "../integrations/providers/paypal";
import * as authorizeNet from "../integrations/providers/authorize-net";
import * as braintree from "../integrations/providers/braintree";
// AI Models
import * as openai from "../integrations/providers/openai";
import * as anthropicClaude from "../integrations/providers/anthropic-claude";
import * as googleGemini from "../integrations/providers/google-gemini";
import * as azureOpenai from "../integrations/providers/azure-openai";
import * as awsBedrock from "../integrations/providers/aws-bedrock";
import * as mistral from "../integrations/providers/mistral";
import * as cohere from "../integrations/providers/cohere";
// Automation
import * as n8n from "../integrations/providers/n8n";
import * as make from "../integrations/providers/make";
import * as zapier from "../integrations/providers/zapier";
import * as powerAutomate from "../integrations/providers/power-automate";
import * as uipath from "../integrations/providers/uipath";
import * as workato from "../integrations/providers/workato";
import * as trayIo from "../integrations/providers/tray-io";
import * as boomi from "../integrations/providers/boomi";
// Identity
import * as entraId from "../integrations/providers/entra-id";
import * as okta from "../integrations/providers/okta";
import * as auth0 from "../integrations/providers/auth0";
import * as googleWorkspaceIdentity from "../integrations/providers/google-workspace-identity";
// Storage (Cloud)
import * as s3 from "../integrations/providers/s3";
import * as azureBlob from "../integrations/providers/azure-blob";
import * as gcs from "../integrations/providers/gcs";
// Developer Tools
import * as restApi from "../integrations/providers/rest-api";
import * as graphql from "../integrations/providers/graphql";
import * as webhooksBroad from "../integrations/providers/webhooks-broad";
import * as sftp from "../integrations/providers/sftp";
import * as soap from "../integrations/providers/soap";
import * as json from "../integrations/providers/json";
import * as xml from "../integrations/providers/xml";
// Databases
import * as sqlServer from "../integrations/providers/sql-server";
import * as postgresql from "../integrations/providers/postgresql";
import * as mysql from "../integrations/providers/mysql";
import * as oracleDb from "../integrations/providers/oracle-db";
import * as mongodb from "../integrations/providers/mongodb";
import * as snowflake from "../integrations/providers/snowflake";
import * as bigquery from "../integrations/providers/bigquery";
import * as azureSql from "../integrations/providers/azure-sql";
import * as airtable from "../integrations/providers/airtable";

// ── Register All Provider Actions ────────────────────────────────────────

// Register each provider's actions with the action registry

// CRM
registerProviderActions("salesforce", [salesforce], ["salesforceActions"]);
registerProviderActions("hubspot", [hubspot], ["hubSpotActions"]);
registerProviderActions("dynamics-365", [dynamics365], ["dynamicsActions"]);
registerProviderActions("zoho-crm", [zoho], ["zohoActions"]);
registerProviderActions("pipedrive", [pipedrive], ["pipedriveActions"]);
registerProviderActions("copper", [copper], ["copperActions"]);
registerProviderActions("freshsales", [freshsales], ["freshsalesActions"]);
registerProviderActions("monday-crm", [mondayCrm], ["mondayActions"]);
registerProviderActions("sugarcrm", [sugarcrm], ["sugarActions"]);
registerProviderActions("creatio", [creatio], ["creatioActions"]);
// ERP
registerProviderActions("netsuite", [netsuite], ["netSuiteActions"]);
registerProviderActions("sap-s4hana", [saps4hana], ["sapS4Actions"]);
registerProviderActions("sap-business-one", [sapb1], ["b1Actions"]);
registerProviderActions("dynamics-365-bc", [dynbc], ["bcActions"]);
registerProviderActions("dynamics-365-fo", [dynfo], ["foActions"]);
registerProviderActions("oracle-erp-cloud", [oracleErp], ["oracleERPActions"]);
registerProviderActions("acumatica", [acumatica], ["acumaticaActions"]);
registerProviderActions("epicor", [epicor], ["epicorActions"]);
registerProviderActions("epicor-kinetic", [kinetic], ["kineticActions"]);
registerProviderActions("infor-cloudsuite", [infor], ["inforActions"]);
registerProviderActions("sage-intacct", [sageIntacct], ["intacctActions"]);
registerProviderActions("sage-x3", [sageX3], ["sageX3Actions"]);
registerProviderActions("odoo", [odoo], ["odooActions"]);
registerProviderActions("quickbooks-enterprise", [qbe], ["qbeActions"]);
// Accounting
registerProviderActions("quickbooks-online", [qbo], ["qboActions"]);
registerProviderActions("quickbooks-desktop", [qbd], ["qbdActions"]);
registerProviderActions("xero", [xero], ["xeroActions"]);
registerProviderActions("freshbooks", [freshbooks], ["freshBooksActions"]);
registerProviderActions("wave", [wave], ["waveActions"]);
registerProviderActions("sage-50", [sage50], ["sage50Actions"]);
registerProviderActions("bill", [bill], ["billActions"]);
registerProviderActions("expensify", [expensify], ["expensifyActions"]);
registerProviderActions("ramp", [ramp], ["rampActions"]);
registerProviderActions("brex", [brex], ["brexActions"]);
// Email
registerProviderActions("outlook", [outlook], ["outlookActions"]);
registerProviderActions("exchange", [exchange], ["exchangeActions"]);
registerProviderActions("gmail", [gmail], ["gmailActions"]);
registerProviderActions("google-workspace", [gws], ["gwsActions"]);
registerProviderActions("imap", [imap], ["imapActions"]);
registerProviderActions("smtp", [smtp], ["smtpActions"]);
// Communication
registerProviderActions("teams", [teams], ["teamsActions"]);
registerProviderActions("slack", [slack], ["slackActions"]);
registerProviderActions("zoom", [zoom], ["zoomActions"]);
registerProviderActions("ringcentral", [ringcentral], ["ringCentralActions"]);
registerProviderActions("webex", [webex], ["webexActions"]);
registerProviderActions("discord", [discord], ["discordActions"]);
registerProviderActions("twilio", [twilio], ["twilioActions"]);
registerProviderActions("dialpad", [dialpad], ["dialpadActions"]);
registerProviderActions("aircall", [aircall], ["aircallActions"]);
// Storage
registerProviderActions("sharepoint", [sharepoint], ["sharepointActions"]);
registerProviderActions("onedrive", [onedrive], ["onedriveActions"]);
registerProviderActions("google-drive", [gdrive], ["gdriveActions"]);
registerProviderActions("dropbox", [dropbox], ["dropboxActions"]);
registerProviderActions("box", [box], ["boxActions"]);
registerProviderActions("egnyte", [egnyte], ["egnyteActions"]);
// Document Processing
registerProviderActions("adobe-sign", [adobeSign], ["adobeSignActions"]);
registerProviderActions("docusign", [docusign], ["docusignActions"]);
registerProviderActions("pandadoc", [pandadoc], ["pandadocActions"]);
registerProviderActions("dropbox-sign", [dropboxSign], ["dropboxSignActions"]);
registerProviderActions("pdf-co", [pdfCo], ["pdfCoActions"]);
registerProviderActions("ocr-space", [ocrSpace], ["ocrSpaceActions"]);
registerProviderActions("abbyy", [abbyy], ["abbyyActions"]);
registerProviderActions("aws-textract", [textract], ["textractActions"]);
registerProviderActions("azure-doc-intel", [azureDocIntel], ["azureDocIntelActions"]);
registerProviderActions("google-doc-ai", [googleDocAI], ["googleDocAIActions"]);
// Project Management
registerProviderActions("monday-com", [mondayCom], ["mondayComActions"]);
registerProviderActions("asana", [asana], ["asanaActions"]);
registerProviderActions("clickup", [clickup], ["clickUpActions"]);
registerProviderActions("jira", [jira], ["jiraActions"]);
registerProviderActions("trello", [trello], ["trelloActions"]);
registerProviderActions("basecamp", [basecamp], ["basecampActions"]);
registerProviderActions("notion", [notion], ["notionActions"]);
registerProviderActions("wrike", [wrike], ["wrikeActions"]);
registerProviderActions("smartsheet", [smartsheet], ["smartsheetActions"]);
// HR
registerProviderActions("bamboohr", [bamboohr], ["bamboohrActions"]);
registerProviderActions("workday", [workday], ["workdayActions"]);
registerProviderActions("ukg", [ukg], ["ukgActions"]);
registerProviderActions("adp", [adp], ["adpActions"]);
registerProviderActions("gusto", [gusto], ["gustoActions"]);
registerProviderActions("rippling", [rippling], ["ripplingActions"]);
registerProviderActions("paychex", [paychex], ["paychexActions"]);
registerProviderActions("greenhouse", [greenhouse], ["greenhouseActions"]);
registerProviderActions("lever", [lever], ["leverActions"]);
// Customer Support
registerProviderActions("zendesk", [zendesk], ["zendeskActions"]);
registerProviderActions("freshdesk", [freshdesk], ["freshdeskActions"]);
registerProviderActions("intercom", [intercom], ["intercomActions"]);
registerProviderActions("help-scout", [helpScout], ["helpScoutActions"]);
registerProviderActions("servicenow", [servicenow], ["servicenowActions"]);
registerProviderActions("salesforce-service-cloud", [serviceCloud], ["serviceCloudActions"]);
// BI
registerProviderActions("power-bi", [powerBI], ["powerBIActions"]);
registerProviderActions("tableau", [tableau], ["tableauActions"]);
registerProviderActions("looker", [looker], ["lookerActions"]);
registerProviderActions("metabase", [metabase], ["metabaseActions"]);
registerProviderActions("qlik-sense", [qlikSense], ["qlikSenseActions"]);
registerProviderActions("sigma", [sigma], ["sigmaActions"]);
// ECommerce
registerProviderActions("shopify", [shopify], ["shopifyActions"]);
registerProviderActions("woocommerce", [woocommerce], ["wooCommerceActions"]);
registerProviderActions("bigcommerce", [bigcommerce], ["bigCommerceActions"]);
registerProviderActions("magento", [magento], ["magentoActions"]);
registerProviderActions("amazon-seller", [amazonSeller], ["amazonSellerActions"]);
// Logistics
registerProviderActions("mcleod-software", [mcleodSoftware], ["mcleodSoftwareActions"]);
registerProviderActions("mercurygate", [mercurygate], ["mercurygateActions"]);
registerProviderActions("trimble-tms", [trimbleTms], ["trimbleTmsActions"]);
registerProviderActions("samsara", [samsara], ["samsaraActions"]);
registerProviderActions("motive", [motive], ["motiveActions"]);
registerProviderActions("project44", [project44], ["project44Actions"]);
registerProviderActions("fourkites", [fourkites], ["fourkitesActions"]);
registerProviderActions("dat", [dat], ["datActions"]);
registerProviderActions("truckstop", [truckstop], ["truckstopActions"]);
registerProviderActions("descartes", [descartes], ["descartesActions"]);
registerProviderActions("pcs-tms", [pcsTms], ["pcsTmsActions"]);
registerProviderActions("ascend-tms", [ascendTms], ["ascendTmsActions"]);
// Manufacturing
registerProviderActions("plex", [plex], ["plexActions"]);
registerProviderActions("katana", [katana], ["katanaActions"]);
registerProviderActions("fishbowl", [fishbowl], ["fishbowlActions"]);
registerProviderActions("mrpeasy", [mrpeasy], ["mrpeasyActions"]);
registerProviderActions("iqms", [iqms], ["iqmsActions"]);
registerProviderActions("epicor-kinetic-mfg", [epicorKineticMfg], ["epicorKineticMfgActions"]);
registerProviderActions("siemens-opcenter", [siemensOpcenter], ["siemensOpcenterActions"]);
// Healthcare
registerProviderActions("athenahealth", [athenahealth], ["athenahealthActions"]);
registerProviderActions("nextgen", [nextgen], ["nextgenActions"]);
registerProviderActions("eclinicalworks", [eclinicalworks], ["eclinicalworksActions"]);
// Scheduling
registerProviderActions("calendly", [calendly], ["calendlyActions"]);
registerProviderActions("microsoft-bookings", [microsoftBookings], ["microsoftBookingsActions"]);
registerProviderActions("google-calendar", [googleCalendar], ["googleCalendarActions"]);
registerProviderActions("outlook-calendar", [outlookCalendar], ["outlookCalendarActions"]);
registerProviderActions("acuity", [acuity], ["acuityActions"]);
// Forms
registerProviderActions("typeform", [typeform], ["typeformActions"]);
registerProviderActions("jotform", [jotform], ["jotformActions"]);
registerProviderActions("microsoft-forms", [microsoftForms], ["microsoftFormsActions"]);
registerProviderActions("google-forms", [googleForms], ["googleFormsActions"]);
registerProviderActions("formstack", [formstack], ["formstackActions"]);
registerProviderActions("gravity-forms", [gravityForms], ["gravityFormsActions"]);
// Payment
registerProviderActions("square", [square], ["squareActions"]);
registerProviderActions("paypal", [paypal], ["paypalActions"]);
registerProviderActions("authorize-net", [authorizeNet], ["authorizeNetActions"]);
registerProviderActions("braintree", [braintree], ["braintreeActions"]);
// AI Models
registerProviderActions("openai", [openai], ["openaiActions"]);
registerProviderActions("anthropic-claude", [anthropicClaude], ["anthropicClaudeActions"]);
registerProviderActions("google-gemini", [googleGemini], ["googleGeminiActions"]);
registerProviderActions("azure-openai", [azureOpenai], ["azureOpenaiActions"]);
registerProviderActions("aws-bedrock", [awsBedrock], ["awsBedrockActions"]);
registerProviderActions("mistral", [mistral], ["mistralActions"]);
registerProviderActions("cohere", [cohere], ["cohereActions"]);
// Automation
registerProviderActions("n8n", [n8n], ["n8nActions"]);
registerProviderActions("make", [make], ["makeActions"]);
registerProviderActions("zapier", [zapier], ["zapierActions"]);
registerProviderActions("power-automate", [powerAutomate], ["powerAutomateActions"]);
registerProviderActions("uipath", [uipath], ["uipathActions"]);
registerProviderActions("workato", [workato], ["workatoActions"]);
registerProviderActions("tray-io", [trayIo], ["trayIoActions"]);
registerProviderActions("boomi", [boomi], ["boomiActions"]);
// Identity
registerProviderActions("entra-id", [entraId], ["entraIdActions"]);
registerProviderActions("okta", [okta], ["oktaActions"]);
registerProviderActions("auth0", [auth0], ["auth0Actions"]);
registerProviderActions("google-workspace-identity", [googleWorkspaceIdentity], ["googleWorkspaceIdentityActions"]);
// Storage (Cloud)
registerProviderActions("s3", [s3], ["s3Actions"]);
registerProviderActions("azure-blob", [azureBlob], ["azureBlobActions"]);
registerProviderActions("gcs", [gcs], ["gcsActions"]);
// Developer Tools
registerProviderActions("rest-api", [restApi], ["restApiActions"]);
registerProviderActions("graphql", [graphql], ["graphqlActions"]);
registerProviderActions("webhooks-broad", [webhooksBroad], ["webhooksBroadActions"]);
registerProviderActions("sftp", [sftp], ["sftpActions"]);
registerProviderActions("soap", [soap], ["soapActions"]);
registerProviderActions("json", [json], ["jsonActions"]);
registerProviderActions("xml", [xml], ["xmlActions"]);
// Databases
registerProviderActions("sql-server", [sqlServer], ["sqlServerActions"]);
registerProviderActions("postgresql", [postgresql], ["postgresqlActions"]);
registerProviderActions("mysql", [mysql], ["mysqlActions"]);
registerProviderActions("oracle-db", [oracleDb], ["oracleDbActions"]);
registerProviderActions("mongodb", [mongodb], ["mongodbActions"]);
registerProviderActions("snowflake", [snowflake], ["snowflakeActions"]);
registerProviderActions("bigquery", [bigquery], ["bigqueryActions"]);
registerProviderActions("azure-sql", [azureSql], ["azureSqlActions"]);
registerProviderActions("airtable", [airtable], ["airtableActions"]);

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Get all tool definitions in OpenAI-compatible format.
 * These can be passed to the LLM as `tools` parameter.
 */
export function getToolDefinitions(): ToolDefinition[] {
  const allActions = actionRegistry.listAllActions();
  return allActions.map((action) => ({
    type: "function" as const,
    function: {
      name: action.name,
      description: action.description,
      parameters: action.inputSchema,
    },
  }));
}

/**
 * Get tool definitions filtered by provider category (e.g., "crm", "accounting")
 */
export function getToolDefinitionsByCategory(category: string): ToolDefinition[] {
  const allActions = actionRegistry.listAllActions();
  // Filter by category is best-effort: we match provider IDs against known categories
  const categoryProviders = getProvidersInCategory(category);
  return allActions
    .filter((a) => categoryProviders.includes(a.providerId))
    .map((action) => ({
      type: "function" as const,
      function: {
        name: action.name,
        description: action.description,
        parameters: action.inputSchema,
      },
    }));
}

/**
 * Process a tool call from the LLM.
 * Parses the arguments, executes the action, and returns the result.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  userId: string,
): Promise<ToolCallResult> {
  try {
    const args = JSON.parse(toolCall.function.arguments);
    const result = await executeAction(toolCall.function.name, args, userId);
    return {
      toolCallId: toolCall.id,
      actionName: toolCall.function.name,
      success: result.success,
      data: result.data,
      error: result.error,
    };
  } catch (err: any) {
    return {
      toolCallId: toolCall.id,
      actionName: toolCall.function.name,
      success: false,
      error: err.message || "Failed to execute tool call",
    };
  }
}

/**
 * Get the count of registered tools
 */
export function getToolCount(): number {
  return actionRegistry.listAllActions().length;
}

/**
 * Check if a specific action exists
 */
export function hasAction(actionName: string): boolean {
  return actionRegistry.hasAction(actionName);
}

/**
 * Get tool suggestions based on a user message
 * Uses keyword matching to suggest relevant tools
 */
export function suggestTools(message: string, limit: number = 5): ToolDefinition[] {
  const lower = message.toLowerCase();
  const allActions = actionRegistry.listAllActions();

  // Score actions by relevance to the message
  const scored = allActions.map((action) => {
    let score = 0;
    const desc = action.description.toLowerCase();
    const name = action.name.toLowerCase();

    // Keyword matches
    if (desc.includes(lower) || name.includes(lower)) score += 10;
    if (lower.includes("contact") && (desc.includes("contact") || name.includes("contact"))) score += 5;
    if (lower.includes("email") && (desc.includes("email") || name.includes("email"))) score += 5;
    if (lower.includes("invoice") && (desc.includes("invoice") || name.includes("invoice"))) score += 5;
    if (lower.includes("create") && (name.startsWith("create") || name.startsWith("new"))) score += 3;
    if (lower.includes("search") && (name.includes("search") || name.includes("find") || name.includes("get"))) score += 3;
    if (lower.includes("send") && (name.includes("send") || name.includes("email"))) score += 3;

    return { action, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((s) => s.score > 0)
    .map((s) => ({
      type: "function" as const,
      function: {
        name: s.action.name,
        description: s.action.description,
        parameters: s.action.inputSchema,
      },
    }));
}

/**
 * Get all provider IDs in a category
 */
function getProvidersInCategory(category: string): string[] {
  const categoryMap: Record<string, string[]> = {
    "crm": ["salesforce", "hubspot", "dynamics-365", "zoho-crm", "pipedrive", "copper", "freshsales", "monday-crm", "sugarcrm", "creatio"],
    "erp": ["netsuite", "sap-s4hana", "sap-business-one", "dynamics-365-bc", "dynamics-365-fo", "oracle-erp-cloud", "acumatica", "epicor", "epicor-kinetic", "infor-cloudsuite", "sage-intacct", "sage-x3", "odoo", "quickbooks-enterprise"],
    "accounting": ["quickbooks-online", "quickbooks-desktop", "xero", "freshbooks", "wave", "sage-50", "bill", "expensify", "ramp", "brex"],
    "email": ["outlook", "exchange", "gmail", "google-workspace", "imap", "smtp"],
    "communication": ["teams", "slack", "zoom", "ringcentral", "webex", "discord", "twilio", "dialpad", "aircall"],
    "storage": ["sharepoint", "onedrive", "google-drive", "dropbox", "box", "egnyte", "s3", "azure-blob", "gcs"],
    "document-processing": ["adobe-sign", "docusign", "pandadoc", "dropbox-sign", "pdf-co", "ocr-space", "abbyy", "aws-textract", "azure-doc-intel", "google-doc-ai"],
    "project-management": ["monday-com", "asana", "clickup", "jira", "trello", "basecamp", "notion", "wrike", "smartsheet"],
    "hr": ["bamboohr", "workday", "ukg", "adp", "gusto", "rippling", "paychex", "greenhouse", "lever"],
    "support": ["zendesk", "freshdesk", "intercom", "help-scout", "servicenow", "salesforce-service-cloud"],
    "bi": ["power-bi", "tableau", "looker", "metabase", "qlik-sense", "sigma"],
    "ecommerce": ["shopify", "woocommerce", "bigcommerce", "magento", "amazon-seller"],
    "logistics": ["mcleod-software", "mercurygate", "trimble-tms", "samsara", "motive", "project44", "fourkites", "dat", "truckstop", "descartes", "pcs-tms", "ascend-tms"],
    "manufacturing": ["plex", "katana", "fishbowl", "mrpeasy", "iqms", "epicor-kinetic-mfg", "siemens-opcenter"],
    "healthcare": ["athenahealth", "nextgen", "eclinicalworks"],
    "scheduling": ["calendly", "microsoft-bookings", "google-calendar", "outlook-calendar", "acuity"],
    "forms": ["typeform", "jotform", "microsoft-forms", "google-forms", "formstack", "gravity-forms"],
    "payments": ["square", "paypal", "authorize-net", "braintree"],
    "ai": ["openai", "anthropic-claude", "google-gemini", "azure-openai", "aws-bedrock", "mistral", "cohere"],
    "automation": ["n8n", "make", "zapier", "power-automate", "uipath", "workato", "tray-io", "boomi"],
    "identity": ["entra-id", "okta", "auth0", "google-workspace-identity"],
    "developer-tools": ["rest-api", "graphql", "webhooks-broad", "sftp", "soap", "json", "xml"],
    "databases": ["sql-server", "postgresql", "mysql", "oracle-db", "mongodb", "snowflake", "bigquery", "azure-sql", "airtable"],
  };

  return categoryMap[category] || [];
}