/**
 * Connect AI — Agent↔Integration Mapping Engine
 *
 * Manages the connections between deployed AI agents and integration providers.
 * Data stored in portal_data table with section = 'agent_integration_links'.
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentIntegrationLink {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  integrationId: string;
  integrationName: string;
  integrationCategory: string;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWithLinks {
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  description: string;
  links: AgentIntegrationLink[];
  availableIntegrations: IntegrationSummary[];
}

export interface IntegrationSummary {
  id: string;
  name: string;
  category: string;
  description: string;
}

// ── Available Integrations (from provider registry) ──────────────────────

export const AVAILABLE_INTEGRATIONS: IntegrationSummary[] = [
  // CRM
  { id: "salesforce", name: "Salesforce", category: "CRM", description: "Customer relationship management" },
  { id: "hubspot", name: "HubSpot", category: "CRM", description: "Marketing, sales & service CRM" },
  { id: "dynamics", name: "Microsoft Dynamics 365", category: "CRM", description: "Enterprise CRM & ERP" },
  { id: "zoho", name: "Zoho CRM", category: "CRM", description: "Cloud CRM suite" },
  { id: "pipedrive", name: "Pipedrive", category: "CRM", description: "Sales pipeline management" },
  // Accounting
  { id: "quickbooks", name: "QuickBooks", category: "Accounting", description: "Small business accounting" },
  { id: "xero", name: "Xero", category: "Accounting", description: "Cloud accounting software" },
  { id: "netsuite", name: "NetSuite", category: "Accounting", description: "ERP & financial management" },
  { id: "sage", name: "Sage", category: "Accounting", description: "Business accounting" },
  // Communication
  { id: "slack", name: "Slack", category: "Communication", description: "Team messaging platform" },
  { id: "teams", name: "Microsoft Teams", category: "Communication", description: "Team collaboration" },
  { id: "gmail", name: "Gmail", category: "Communication", description: "Email & productivity" },
  { id: "outlook", name: "Outlook", category: "Communication", description: "Email & calendar" },
  { id: "twilio", name: "Twilio", category: "Communication", description: "SMS, voice & messaging" },
  // Storage
  { id: "googledrive", name: "Google Drive", category: "Storage", description: "Cloud file storage" },
  { id: "dropbox", name: "Dropbox", category: "Storage", description: "File hosting & sync" },
  { id: "onedrive", name: "OneDrive", category: "Storage", description: "Microsoft cloud storage" },
  { id: "sharepoint", name: "SharePoint", category: "Storage", description: "Document management" },
  { id: "s3", name: "Amazon S3", category: "Storage", description: "Object storage service" },
  // Project Management
  { id: "jira", name: "Jira", category: "Project Mgmt", description: "Issue tracking & agile" },
  { id: "asana", name: "Asana", category: "Project Mgmt", description: "Work management platform" },
  { id: "notion", name: "Notion", category: "Project Mgmt", description: "Docs, wikis & projects" },
  { id: "trello", name: "Trello", category: "Project Mgmt", description: "Kanban board tool" },
  { id: "monday", name: "Monday.com", category: "Project Mgmt", description: "Work operating system" },
  // E-commerce
  { id: "shopify", name: "Shopify", category: "E-commerce", description: "Online store platform" },
  { id: "woocommerce", name: "WooCommerce", category: "E-commerce", description: "WordPress e-commerce" },
  { id: "square", name: "Square", category: "E-commerce", description: "Payments & POS" },
  // HR
  { id: "bamboohr", name: "BambooHR", category: "HR", description: "HR management software" },
  { id: "workday", name: "Workday", category: "HR", description: "HR, planning & finance" },
  { id: "greenhouse", name: "Greenhouse", category: "HR", description: "Recruiting platform" },
  { id: "adp", name: "ADP", category: "HR", description: "Payroll & HR services" },
  // Support
  { id: "zendesk", name: "Zendesk", category: "Support", description: "Customer service platform" },
  { id: "intercom", name: "Intercom", category: "Support", description: "Customer messaging" },
  { id: "freshdesk", name: "Freshdesk", category: "Support", description: "Helpdesk software" },
  // Healthcare
  { id: "epic", name: "Epic", category: "Healthcare", description: "EHR system" },
  { id: "cerner", name: "Cerner", category: "Healthcare", description: "Health IT solutions" },
  { id: "iguana", name: "Iguana", category: "Healthcare", description: "Healthcare integration engine" },
  { id: "mirth", name: "Mirth Connect", category: "Healthcare", description: "HL7 interface engine" },
  // Dev & Data
  { id: "github", name: "GitHub", category: "Dev & Data", description: "Code hosting platform" },
  { id: "snowflake", name: "Snowflake", category: "Dev & Data", description: "Cloud data warehouse" },
  { id: "clickhouse", name: "ClickHouse", category: "Dev & Data", description: "Analytical database" },
  { id: "airflow", name: "Apache Airflow", category: "Dev & Data", description: "Workflow orchestration" },
  { id: "aws-lambda", name: "AWS Lambda", category: "Dev & Data", description: "Serverless compute" },
];

// ── Database Operations ──────────────────────────────────────────────────

export async function getLinks(userId: string): Promise<AgentIntegrationLink[]> {
  try {
    const rows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'agent_integration_links' ORDER BY created_at DESC`)
    );
    return rows.map((r: any) => {
      const parsed = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      return parsed as AgentIntegrationLink;
    });
  } catch (err) {
    console.error("[connectAI] Error fetching links:", err);
    return [];
  }
}

export async function createLink(
  userId: string,
  link: Omit<AgentIntegrationLink, "id" | "createdAt" | "updatedAt">
): Promise<AgentIntegrationLink> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const fullLink: AgentIntegrationLink = {
    ...link,
    id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.run(
      sql.raw(
        `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', 'agent_integration_links', '${JSON.stringify(fullLink).replace(/'/g, "''")}', ${Date.now()}, ${Date.now()})`
      )
    );
  } catch (err) {
    console.error("[connectAI] Error creating link:", err);
  }

  return fullLink;
}

export async function updateLinkConfig(
  userId: string,
  linkId: string,
  config: Record<string, any>
): Promise<boolean> {
  try {
    const rows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE id = '${linkId}' AND user_id = '${userId}' AND section = 'agent_integration_links'`)
    );
    if (rows.length === 0) return false;

    const row = rows[0] as { data: string };
    const link = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    link.config = config;
    link.updatedAt = new Date().toISOString();

    await db.run(
      sql.raw(
        `UPDATE portal_data SET data = '${JSON.stringify(link).replace(/'/g, "''")}', updated_at = ${Date.now()} WHERE id = '${linkId}' AND user_id = '${userId}' AND section = 'agent_integration_links'`
      )
    );
    return true;
  } catch (err) {
    console.error("[connectAI] Error updating link:", err);
    return false;
  }
}

export async function deleteLink(userId: string, linkId: string): Promise<boolean> {
  try {
    await db.run(
      sql.raw(`DELETE FROM portal_data WHERE id = '${linkId}' AND user_id = '${userId}' AND section = 'agent_integration_links'`)
    );
    return true;
  } catch (err) {
    console.error("[connectAI] Error deleting link:", err);
    return false;
  }
}

// ── Agent + Link Aggregation ─────────────────────────────────────────────

export interface AgentSummary {
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  description: string;
}

export async function getDeployedAgents(userId: string): Promise<AgentSummary[]> {
  try {
    const rows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'employees' ORDER BY created_at DESC`)
    );
    return rows.map((r: any) => {
      const e = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      return {
        agentId: e.id || e._id || "unknown",
        agentName: e.name || "Unnamed Agent",
        agentType: e.agentType || e.role || "unknown",
        agentStatus: e.status || "idle",
        description: e.description || e.role || "",
      };
    });
  } catch (err) {
    console.error("[connectAI] Error fetching agents:", err);
    return [];
  }
}

export async function getAgentMapping(userId: string): Promise<{
  agents: AgentWithLinks[];
  unlinkedIntegrations: IntegrationSummary[];
}> {
  const [links, agents] = await Promise.all([
    getLinks(userId),
    getDeployedAgents(userId),
  ]);

  const agentsWithLinks = agents.map((agent) => {
    const agentLinks = links.filter((l) => l.agentId === agent.agentId);
    const linkedIntIds = new Set(agentLinks.map((l) => l.integrationId));
    const available = AVAILABLE_INTEGRATIONS.filter((i) => !linkedIntIds.has(i.id));
    return { ...agent, links: agentLinks, availableIntegrations: available };
  });

  // Integrations not linked to any agent
  const allLinkedIntIds = new Set(links.map((l) => l.integrationId));
  const unlinkedIntegrations = AVAILABLE_INTEGRATIONS.filter((i) => !allLinkedIntIds.has(i.id));

  return { agents: agentsWithLinks, unlinkedIntegrations };
}

export function getAgentTypeName(type: string): string {
  const names: Record<string, string> = {
    document_intake: "Document Intake AI",
    healthcare_intake: "Healthcare Intake AI",
    invoice_ledger: "Invoice & Ledger AI",
    sales_outreach: "Sales Outreach AI",
    hr_compliance: "HR Compliance AI",
    dispatch_logistics: "Dispatch Logistics AI",
    audit_logger: "Audit Logger AI",
    voice_receptionist: "Voice AI Receptionist",
    support_agent: "Support Agent AI",
    knowledge_assistant: "Knowledge Assistant AI",
    inventory_management: "Inventory Management AI",
    contract_management: "Contract Management AI",
    customer_success: "Customer Success AI",
    project_management: "Project Management AI",
    procurement_vendor: "Procurement & Vendor AI",
    it_operations: "IT Operations AI",
    fp_and_a: "Financial Planning AI",
    marketing_social: "Marketing & Social AI",
  };
  return names[type] || type;
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    CRM: "#3b82f6", Accounting: "#10b981", Communication: "#8b5cf6",
    Storage: "#f59e0b", "Project Mgmt": "#ef4444", "E-commerce": "#ec4899",
    HR: "#06b6d4", Support: "#14b8a6", Healthcare: "#f97316",
    "Dev & Data": "#6366f1",
  };
  return colors[category] || "#6b7280";
}
