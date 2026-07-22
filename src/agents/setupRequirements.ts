/**
 * Agent Setup Requirements
 *
 * Defines what each agent type needs for initial setup — connections, data uploads,
 * configuration fields, and setup steps. Used by the setup wizard UI and the
 * /api/agents/types endpoint to return setup requirements alongside agent metadata.
 * Also used by the marketplace to show badges like "Needs CRM", "Works out of box", etc.
 */

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "boolean" | "number" | "connection";
  options?: string[];
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export interface SetupStep {
  step: number;
  label: string;
  action: "connect" | "configure" | "upload" | "run" | "verify";
  description: string;
  connectionType?: string;
}

export interface AgentSetupRequirements {
  type: string;
  needsConnections: string[];
  needsDataUpload: boolean;
  needsConfiguration: boolean;
  configFields: ConfigField[];
  setupSteps: SetupStep[];
  badges: string[];
  estimatedSetupMinutes: number;
}

// ── Agent Setup Requirements ─────────────────────────────────────────────────

export const AGENT_SETUP_REQUIREMENTS_MAP: Record<string, AgentSetupRequirements> = {
  // ── 1. Document Intake AI ──────────────────────────────────────────────────
  document_intake: {
    type: "document_intake",
    needsConnections: [],
    needsDataUpload: true,
    needsConfiguration: false,
    configFields: [
      { key: "auto_process", label: "Auto-process new uploads", type: "boolean", description: "Automatically process documents when uploaded", required: false },
      { key: "extraction_depth", label: "Extraction depth", type: "select", options: ["basic", "standard", "deep"], placeholder: "standard", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Upload documents", action: "upload", description: "Upload your first document to see the AI in action" },
      { step: 2, label: "Verify extraction", action: "verify", description: "Review the extracted text and key information" },
      { step: 3, label: "Configure auto-processing", action: "configure", description: "Set auto-processing preferences for future uploads" },
    ],
    badges: ["Works out of box"],
    estimatedSetupMinutes: 5,
  },

  // ── 2. Healthcare Intake AI ────────────────────────────────────────────────
  healthcare_intake: {
    type: "healthcare_intake",
    needsConnections: ["ehr", "document_storage"],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "ehr_system", label: "EHR System", type: "select", options: ["epic", "cerner", "athenahealth", "meditech", "allscripts", "other"], required: true },
      { key: "practice_name", label: "Practice / Clinic Name", type: "text", placeholder: "e.g., Northside Medical Associates", required: true },
      { key: "insurance_verification", label: "Auto-verify insurance", type: "boolean", description: "Enable automatic insurance eligibility verification", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect EHR system", action: "connect", description: "Connect your EHR system (Epic, Cerner, or other) to enable patient data sync", connectionType: "ehr" },
      { step: 2, label: "Upload intake forms", action: "upload", description: "Upload sample patient intake forms for processing calibration" },
      { step: 3, label: "Configure verification rules", action: "configure", description: "Set insurance verification and patient matching rules" },
      { step: 4, label: "Verify and launch", action: "run", description: "Test with sample data and go live" },
    ],
    badges: ["Needs EHR", "Needs documents"],
    estimatedSetupMinutes: 15,
  },

  // ── 3. Invoice & Ledger AI ─────────────────────────────────────────────────
  invoice_ledger: {
    type: "invoice_ledger",
    needsConnections: ["accounting", "erp"],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "accounting_platform", label: "Accounting Platform", type: "select", options: ["quickbooks", "xero", "freshbooks", "sage", "other"], required: true },
      { key: "currency", label: "Primary Currency", type: "text", placeholder: "USD", required: true },
      { key: "auto_reconcile", label: "Auto-reconcile when confidence > 90%", type: "boolean", description: "Automatically match and reconcile invoices", required: false },
      { key: "approval_threshold", label: "Approval threshold amount", type: "number", placeholder: "1000", description: "Invoices above this amount require human approval", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect accounting platform", action: "connect", description: "Connect QuickBooks, Xero, or your accounting system", connectionType: "accounting" },
      { step: 2, label: "Upload sample invoices", action: "upload", description: "Upload sample invoices and receipts for processing calibration" },
      { step: 3, label: "Configure ledger mapping", action: "configure", description: "Map expense categories and ledger accounts" },
      { step: 4, label: "Set approval rules", action: "configure", description: "Configure auto-approval thresholds and routing rules" },
    ],
    badges: ["Needs accounting", "Needs documents"],
    estimatedSetupMinutes: 15,
  },

  // ── 4. Sales Outreach Coordinator AI ───────────────────────────────────────
  sales_outreach: {
    type: "sales_outreach",
    needsConnections: ["crm", "email"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "target_industry", label: "Target Industry", type: "text", placeholder: "e.g., Technology, Healthcare", required: true },
      { key: "target_region", label: "Target Region", type: "text", placeholder: "e.g., North America, Europe", required: true },
      { key: "crm_platform", label: "CRM Platform", type: "select", options: ["salesforce", "hubspot", "pipedrive", "zoho", "other"], required: true },
      { key: "max_daily_outreach", label: "Max emails per day", type: "number", placeholder: "50", required: false },
      { key: "follow_up_sequence", label: "Follow-up sequence length", type: "number", placeholder: "3", description: "Number of follow-up emails in sequence", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect your CRM", action: "connect", description: "Connect Salesforce, HubSpot, or your CRM to enable lead management", connectionType: "crm" },
      { step: 2, label: "Connect email", action: "connect", description: "Connect your email provider to send outreach campaigns", connectionType: "email" },
      { step: 3, label: "Set campaign parameters", action: "configure", description: "Set target industry, region, and outreach goals" },
      { step: 4, label: "Launch first campaign", action: "run", description: "Your agent starts sending outreach" },
    ],
    badges: ["Needs CRM", "Needs email"],
    estimatedSetupMinutes: 20,
  },

  // ── 5. HR Intake & Compliance AI ───────────────────────────────────────────
  hr_compliance: {
    type: "hr_compliance",
    needsConnections: ["hr_system", "document_storage"],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "hr_platform", label: "HR Platform", type: "select", options: ["bamboo", "gusto", "workday", "adp", "rippling", "other"], required: true },
      { key: "compliance_jurisdiction", label: "Compliance Jurisdiction", type: "text", placeholder: "e.g., US-Federal, California", required: true },
      { key: "auto_verify_i9", label: "Auto-verify I-9 documents", type: "boolean", description: "Automatically verify I-9 eligibility documents", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect HR system", action: "connect", description: "Connect your HR platform for employee data sync", connectionType: "hr_system" },
      { step: 2, label: "Upload compliance templates", action: "upload", description: "Upload W9, I-9, and other compliance form templates" },
      { step: 3, label: "Configure compliance rules", action: "configure", description: "Set jurisdiction-specific compliance requirements and auto-verification rules" },
      { step: 4, label: "Verify and launch", action: "run", description: "Run a compliance test and go live" },
    ],
    badges: ["Needs HR system", "Needs documents"],
    estimatedSetupMinutes: 20,
  },

  // ── 6. Dispatch Logistics Optimization AI ──────────────────────────────────
  dispatch_logistics: {
    type: "dispatch_logistics",
    needsConnections: ["crm", "communication"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "primary_port", label: "Primary Port / Hub", type: "text", placeholder: "e.g., Port of Los Angeles", required: true },
      { key: "communication_channel", label: "Alert Channel", type: "select", options: ["slack", "email", "teams", "sms"], required: true },
      { key: "optimization_frequency", label: "Optimization frequency", type: "select", options: ["hourly", "daily", "weekly"], placeholder: "daily", required: false },
      { key: "delay_threshold_hours", label: "Delay alert threshold (hours)", type: "number", placeholder: "4", description: "Alert when delays exceed this threshold", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect communication channel", action: "connect", description: "Connect Slack, Teams, or email for dispatch alerts", connectionType: "communication" },
      { step: 2, label: "Configure ports and routes", action: "configure", description: "Set primary ports, shipping routes, and alert thresholds" },
      { step: 3, label: "Set optimization parameters", action: "configure", description: "Configure optimization frequency and delay alert thresholds" },
      { step: 4, label: "Start monitoring", action: "run", description: "Agent begins monitoring and optimizing logistics" },
    ],
    badges: ["Needs communication"],
    estimatedSetupMinutes: 15,
  },

  // ── 7. Operations Audit Logger AI ──────────────────────────────────────────
  audit_logger: {
    type: "audit_logger",
    needsConnections: [],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "report_frequency", label: "Report Frequency", type: "select", options: ["daily", "weekly", "monthly"], placeholder: "weekly", required: false },
      { key: "include_anomaly_detection", label: "Include anomaly detection", type: "boolean", description: "Flag operational anomalies in reports", required: false },
      { key: "notification_recipients", label: "Report notification emails", type: "text", placeholder: "ops@company.com, managers@company.com", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Configure report preferences", action: "configure", description: "Set report frequency, recipients, and anomaly detection preferences" },
      { step: 2, label: "Verify data sources", action: "verify", description: "Check that operational data is being collected correctly" },
      { step: 3, label: "Start monitoring", action: "run", description: "Agent begins generating audit reports and analytics" },
    ],
    badges: ["Works out of box"],
    estimatedSetupMinutes: 5,
  },

  // ── 8. Voice AI Receptionist ───────────────────────────────────────────────
  voice_receptionist: {
    type: "voice_receptionist",
    needsConnections: ["twilio"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "twilio_phone_number", label: "Twilio Phone Number", type: "text", placeholder: "+1 (555) 123-4567", description: "Your Twilio-provisioned phone number", required: true },
      { key: "twilio_account_sid", label: "Twilio Account SID", type: "text", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: true },
      { key: "twilio_auth_token", label: "Twilio Auth Token", type: "text", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: true },
      { key: "business_hours_only", label: "Answer only during business hours", type: "boolean", description: "Route after-hours calls to voicemail", required: false },
      { key: "greeting_style", label: "Greeting Style", type: "select", options: ["professional", "friendly", "formal"], placeholder: "professional", required: false },
      { key: "forwarding_number", label: "Emergency forwarding number", type: "text", placeholder: "+1 (555) 987-6543", description: "Number to forward urgent calls to", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect Twilio", action: "connect", description: "Connect your Twilio account and provision a phone number", connectionType: "twilio" },
      { step: 2, label: "Configure greeting and routing", action: "configure", description: "Set greeting style, business hours, and call routing rules" },
      { step: 3, label: "Test call routing", action: "verify", description: "Make a test call to verify routing and response quality" },
      { step: 4, label: "Go live", action: "run", description: "Activate the receptionist to handle live calls" },
    ],
    badges: ["Needs Twilio"],
    estimatedSetupMinutes: 25,
  },

  // ── 9. AI Customer Support Agent ───────────────────────────────────────────
  support_agent: {
    type: "support_agent",
    needsConnections: ["ticketing", "email"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "ticketing_platform", label: "Ticketing Platform", type: "select", options: ["zendesk", "freshdesk", "intercom", "helpscout", "other"], required: true },
      { key: "sla_first_response", label: "SLA first response target (hours)", type: "number", placeholder: "4", required: false },
      { key: "auto_reply_enabled", label: "Auto-reply to common issues", type: "boolean", description: "Automatically respond to common support questions", required: false },
      { key: "escalation_email", label: "Escalation email", type: "text", placeholder: "escalations@company.com", description: "Email for urgent ticket escalations", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect ticketing system", action: "connect", description: "Connect Zendesk, Freshdesk, or your support platform", connectionType: "ticketing" },
      { step: 2, label: "Connect email", action: "connect", description: "Connect your support email inbox", connectionType: "email" },
      { step: 3, label: "Configure SLA rules", action: "configure", description: "Set response time SLAs, auto-reply rules, and escalation paths" },
      { step: 4, label: "Test and launch", action: "run", description: "Submit a test ticket and verify the agent responds correctly" },
    ],
    badges: ["Needs ticketing", "Needs email"],
    estimatedSetupMinutes: 20,
  },

  // ── 10. Internal Knowledge Assistant ───────────────────────────────────────
  knowledge_assistant: {
    type: "knowledge_assistant",
    needsConnections: [],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "knowledge_base_name", label: "Knowledge Base Name", type: "text", placeholder: "e.g., Company Wiki", required: true },
      { key: "auto_index", label: "Auto-index uploaded documents", type: "boolean", description: "Automatically index new documents into the knowledge base", required: false },
      { key: "include_web_search", label: "Include web search fallback", type: "boolean", description: "Search the web when knowledge base results are insufficient", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Upload knowledge documents", action: "upload", description: "Upload company docs, wikis, SOPs, and training materials" },
      { step: 2, label: "Configure indexing", action: "configure", description: "Set up auto-indexing and web search fallback preferences" },
      { step: 3, label: "Test knowledge queries", action: "verify", description: "Ask test questions to verify search quality and citation accuracy" },
      { step: 4, label: "Go live", action: "run", description: "Activate the knowledge assistant for your team" },
    ],
    badges: ["Needs documents"],
    estimatedSetupMinutes: 15,
  },

  // ── 11. Inventory Management AI ────────────────────────────────────────────
  inventory_management: {
    type: "inventory_management",
    needsConnections: ["erp", "inventory_system"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "erp_platform", label: "ERP Platform", type: "select", options: ["netsuite", "sap", "odoo", "dynamics365", "other"], required: true },
      { key: "low_stock_threshold", label: "Low stock threshold (%)", type: "number", placeholder: "20", description: "Alert when stock falls below this % of reorder point", required: false },
      { key: "locations", label: "Warehouse locations", type: "text", placeholder: "e.g., Warehouse-A, Warehouse-B", description: "Comma-separated list of locations", required: false },
      { key: "auto_reorder", label: "Auto-generate reorder POs", type: "boolean", description: "Automatically create purchase orders for low stock", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect ERP/inventory system", action: "connect", description: "Connect NetSuite, SAP, or your inventory platform", connectionType: "erp" },
      { step: 2, label: "Configure locations and thresholds", action: "configure", description: "Set warehouse locations, low-stock thresholds, and reorder rules" },
      { step: 3, label: "Verify stock data", action: "verify", description: "Review initial stock data sync for accuracy" },
      { step: 4, label: "Start monitoring", action: "run", description: "Agent begins inventory monitoring and alerting" },
    ],
    badges: ["Needs ERP", "Needs inventory system"],
    estimatedSetupMinutes: 20,
  },

  // ── 12. Contract Management AI ─────────────────────────────────────────────
  contract_management: {
    type: "contract_management",
    needsConnections: ["document_storage"],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "renewal_lead_days", label: "Renewal alert lead time (days)", type: "number", placeholder: "30", description: "How many days before expiry to send renewal alerts", required: false },
      { key: "legal_review_email", label: "Legal review email", type: "text", placeholder: "legal@company.com", description: "Email for contracts needing legal review", required: false },
      { key: "auto_classify", label: "Auto-classify uploaded contracts", type: "boolean", description: "Automatically classify and extract terms from uploaded contracts", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Upload contracts", action: "upload", description: "Upload existing contracts for term extraction and indexing" },
      { step: 2, label: "Configure renewal and obligation rules", action: "configure", description: "Set renewal alert timing, obligation tracking, and review workflows" },
      { step: 3, label: "Verify term extraction", action: "verify", description: "Review extracted contract terms for accuracy" },
      { step: 4, label: "Start monitoring", action: "run", description: "Agent begins tracking renewals, obligations, and compliance" },
    ],
    badges: ["Needs documents"],
    estimatedSetupMinutes: 15,
  },

  // ── 13. Customer Success / Retention AI ────────────────────────────────────
  customer_success: {
    type: "customer_success",
    needsConnections: ["crm", "email"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "crm_platform", label: "CRM Platform", type: "select", options: ["salesforce", "hubspot", "pipedrive", "zoho", "other"], required: true },
      { key: "health_score_threshold", label: "At-risk health score threshold", type: "number", placeholder: "40", description: "Customers below this score are flagged as at-risk", required: false },
      { key: "check_in_frequency", label: "Auto check-in frequency (days)", type: "number", placeholder: "30", required: false },
      { key: "churn_alert_email", label: "Churn alert email", type: "text", placeholder: "success@company.com", description: "Email for high-risk churn alerts", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect CRM", action: "connect", description: "Connect your CRM to access customer data and usage metrics", connectionType: "crm" },
      { step: 2, label: "Connect email", action: "connect", description: "Connect email for automated check-in campaigns", connectionType: "email" },
      { step: 3, label: "Configure health scoring", action: "configure", description: "Set health score thresholds, check-in frequency, and churn signals" },
      { step: 4, label: "Launch monitoring", action: "run", description: "Agent begins monitoring customer health and sending interventions" },
    ],
    badges: ["Needs CRM", "Needs email"],
    estimatedSetupMinutes: 20,
  },

  // ── 14. Project Management AI ──────────────────────────────────────────────
  project_management: {
    type: "project_management",
    needsConnections: ["project_management_tool"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "pm_tool", label: "Project Management Tool", type: "select", options: ["jira", "asana", "monday", "clickup", "trello", "other"], required: true },
      { key: "default_report_recipients", label: "Status report recipients", type: "text", placeholder: "stakeholders@company.com", description: "Email recipients for automated status reports", required: false },
      { key: "alert_on_overdue", label: "Alert on overdue tasks", type: "boolean", description: "Send alerts when tasks pass their deadline", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect project management tool", action: "connect", description: "Connect Jira, Asana, Monday.com, or your PM platform", connectionType: "project_management_tool" },
      { step: 2, label: "Configure project tracking", action: "configure", description: "Set up project milestones, deadline tracking, and status report preferences" },
      { step: 3, label: "Verify data sync", action: "verify", description: "Review synced project data for accuracy" },
      { step: 4, label: "Start monitoring", action: "run", description: "Agent begins tracking projects and generating reports" },
    ],
    badges: ["Needs PM tool"],
    estimatedSetupMinutes: 15,
  },

  // ── 15. Procurement & Vendor Management AI ─────────────────────────────────
  procurement_vendor: {
    type: "procurement_vendor",
    needsConnections: ["erp", "document_storage"],
    needsDataUpload: true,
    needsConfiguration: true,
    configFields: [
      { key: "erp_platform", label: "ERP Platform", type: "select", options: ["netsuite", "sap", "odoo", "dynamics365", "other"], required: true },
      { key: "po_approval_threshold", label: "PO approval threshold", type: "number", placeholder: "5000", description: "POs above this amount require approval", required: false },
      { key: "vendor_onboarding_email", label: "Vendor onboarding email", type: "text", placeholder: "procurement@company.com", description: "Email for new vendor onboarding notifications", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect ERP system", action: "connect", description: "Connect your ERP for PO and vendor data", connectionType: "erp" },
      { step: 2, label: "Upload vendor contracts", action: "upload", description: "Upload existing vendor agreements and contracts" },
      { step: 3, label: "Configure procurement rules", action: "configure", description: "Set PO approval thresholds, vendor qualification criteria, and spend analysis rules" },
      { step: 4, label: "Launch procurement automation", action: "run", description: "Agent begins managing procurement workflows" },
    ],
    badges: ["Needs ERP", "Needs documents"],
    estimatedSetupMinutes: 20,
  },

  // ── 16. IT Operations & DevOps AI ──────────────────────────────────────────
  it_operations: {
    type: "it_operations",
    needsConnections: ["monitoring_tool", "communication"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "monitoring_tool", label: "Monitoring Tool", type: "select", options: ["datadog", "newrelic", "grafana", "prometheus", "cloudwatch", "other"], required: true },
      { key: "alert_channel", label: "Alert Channel", type: "select", options: ["slack", "teams", "pagerduty", "email"], required: true },
      { key: "sla_response_time", label: "SLA response time target (minutes)", type: "number", placeholder: "15", description: "Target response time for critical incidents", required: false },
      { key: "auto_remediation", label: "Auto-remediate common issues", type: "boolean", description: "Automatically restart services or clear caches for known issues", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect monitoring tools", action: "connect", description: "Connect Datadog, New Relic, or your monitoring platform", connectionType: "monitoring_tool" },
      { step: 2, label: "Connect alert channel", action: "connect", description: "Connect Slack, Teams, or PagerDuty for incident alerts", connectionType: "communication" },
      { step: 3, label: "Configure SLA and remediation rules", action: "configure", description: "Set SLA targets, auto-remediation rules, and escalation paths" },
      { step: 4, label: "Start monitoring", action: "run", description: "Agent begins infrastructure monitoring and incident triage" },
    ],
    badges: ["Needs monitoring", "Needs communication"],
    estimatedSetupMinutes: 20,
  },

  // ── 17. Financial Planning & FP&A AI ───────────────────────────────────────
  fp_and_a: {
    type: "fp_and_a",
    needsConnections: ["accounting", "erp"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "accounting_platform", label: "Accounting Platform", type: "select", options: ["quickbooks", "xero", "sage", "netsuite", "other"], required: true },
      { key: "fiscal_year_start", label: "Fiscal Year Start", type: "text", placeholder: "January", required: false },
      { key: "budget_owners_email", label: "Budget owner notification email", type: "text", placeholder: "finance@company.com", required: false },
      { key: "forecast_horizon_months", label: "Forecast horizon (months)", type: "number", placeholder: "12", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect accounting platform", action: "connect", description: "Connect QuickBooks, Xero, or your financial system", connectionType: "accounting" },
      { step: 2, label: "Configure budget and forecast parameters", action: "configure", description: "Set fiscal year, budget categories, and forecast horizon" },
      { step: 3, label: "Verify financial data", action: "verify", description: "Review synced financial data for accuracy" },
      { step: 4, label: "Start financial monitoring", action: "run", description: "Agent begins budget tracking, forecasting, and variance analysis" },
    ],
    badges: ["Needs accounting", "Needs ERP"],
    estimatedSetupMinutes: 20,
  },

  // ── 18. Marketing & Social Media AI ────────────────────────────────────────
  marketing_social: {
    type: "marketing_social",
    needsConnections: ["social_media", "email", "crm"],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "social_platforms", label: "Social Media Platforms", type: "text", placeholder: "LinkedIn, Twitter, Instagram, Facebook", description: "Comma-separated list of platforms", required: true },
      { key: "crm_platform", label: "CRM Platform", type: "select", options: ["salesforce", "hubspot", "pipedrive", "zoho", "other"], required: true },
      { key: "content_frequency", label: "Posts per week", type: "number", placeholder: "5", required: false },
      { key: "competitor_monitoring", label: "Enable competitor monitoring", type: "boolean", description: "Track competitor marketing activity and social media", required: false },
    ],
    setupSteps: [
      { step: 1, label: "Connect social media accounts", action: "connect", description: "Connect LinkedIn, Twitter, Instagram, and other platforms", connectionType: "social_media" },
      { step: 2, label: "Connect CRM", action: "connect", description: "Connect your CRM to track campaign attribution", connectionType: "crm" },
      { step: 3, label: "Connect email", action: "connect", description: "Connect email for campaign notifications", connectionType: "email" },
      { step: 4, label: "Configure content strategy", action: "configure", description: "Set posting frequency, competitor monitoring, and campaign goals" },
      { step: 5, label: "Launch campaigns", action: "run", description: "Agent begins managing marketing and social media operations" },
    ],
    badges: ["Needs social media", "Needs CRM", "Needs email"],
    estimatedSetupMinutes: 25,
  },
};

/**
 * Get setup requirements for a specific agent type.
 * Falls back to a generic setup if the type is not found.
 */
export function getAgentSetupRequirements(type: string): AgentSetupRequirements {
  return AGENT_SETUP_REQUIREMENTS_MAP[type] || {
    type,
    needsConnections: [],
    needsDataUpload: false,
    needsConfiguration: true,
    configFields: [
      { key: "name", label: "Agent Name", type: "text", placeholder: "My Agent", required: true },
    ],
    setupSteps: [
      { step: 1, label: "Configure agent", action: "configure", description: "Set up your agent's basic configuration" },
      { step: 2, label: "Launch agent", action: "run", description: "Start the agent and begin operations" },
    ],
    badges: ["Basic setup"],
    estimatedSetupMinutes: 5,
  };
}

/**
 * Merge setup requirements into agent type configs for API responses.
 */
export function getAgentTypesWithSetup(
  agentTypes: Array<{ type: string; name: string; description: string; [key: string]: any }>
): Array<{ type: string; name: string; description: string; [key: string]: any }> {
  return agentTypes.map((agentType) => ({
    ...agentType,
    setupRequirements: getAgentSetupRequirements(agentType.type),
  }));
}

/**
 * Array of all setup requirements (for UI use with .find() etc.)
 */
export const AGENT_SETUP_REQUIREMENTS_ARRAY: AgentSetupRequirements[] = Object.values(AGENT_SETUP_REQUIREMENTS_MAP);

// Alias for backward compatibility with portal.index.tsx
export const AGENT_SETUP_REQUIREMENTS: AgentSetupRequirements[] = AGENT_SETUP_REQUIREMENTS_ARRAY;

/**
 * Get a badge string for an agent setup requirement, indicating the most
 * important setup need. Used for dashboard display.
 */
export function getSetupBadge(req: AgentSetupRequirements | null | undefined): string {
  if (!req) return "Unknown";
  if (req.badges.length === 0) return "Ready to use";
  // Return the first badge that indicates a need
  const needBadge = req.badges.find((b) => !b.toLowerCase().includes("works out of box"));
  if (needBadge) return needBadge;
  return "Works out of box";
}

/**
 * Re-export AgentSetupRequirements as SetupRequirement for backward compatibility.
 */
export type SetupRequirement = AgentSetupRequirements;

/**
 * Get setup progress info for an agent given its completed steps.
 */
export function getSetupProgress(req: AgentSetupRequirements | null | undefined, completedSteps: string[]): { completed: number; total: number; percentage: number } | null {
  if (!req) return null;
  const total = req.setupSteps.length;
  const completed = req.setupSteps.filter((s) => completedSteps.includes(s.action)).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;
  return { completed, total, percentage };
}