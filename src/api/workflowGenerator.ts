/**
 * Natural Language Workflow Generator — parses natural language descriptions
 * of business processes and generates structured workflow definitions.
 *
 * Stores generated workflows in the portal_data table (section: 'workflows').
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  type: "trigger" | "action" | "condition" | "output";
  name: string;
  description: string;
  config: Record<string, any>;
  depends_on?: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: WorkflowStep[];
  estimated_savings?: string;
  tags: string[];
  status: "draft" | "active" | "paused" | "failed";
  successRate: string;
  runtime: string;
  errors: number;
  lastTriggered: string;
  dependencies: string;
  _storageId?: string;
}

export interface GenerateRequest {
  description: string;
  userId: string;
}

export interface GenerateResponse {
  success: boolean;
  workflow?: WorkflowDefinition;
  error?: string;
  storageId?: string;
}

// ── Template Library ─────────────────────────────────────────────────────

interface WorkflowTemplate {
  name: string;
  category: string;
  description: string;
  keywords: string[];
  steps: WorkflowStep[];
  tags: string[];
  estimated_savings: string;
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: "Invoice Processing Pipeline",
    category: "Finance",
    description: "Automated invoice intake, OCR extraction, line-item matching, and payment routing with approval gates for high-value transactions.",
    keywords: ["invoice", "bill", "payment", "quickbooks", "finance", "vendor", "receipt", "po", "purchase order"],
    tags: ["finance", "invoice", "automation"],
    estimated_savings: "$12,400/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Invoice Received", description: "Triggers when an invoice arrives via email, upload, or webhook", config: { source: "email,upload,webhook", format: "PDF,CSV,Image" } },
      { id: "step_2", type: "action", name: "OCR Extraction", description: "Extract text, line items, totals, and vendor info from the invoice", config: { engine: "advanced_ocr", fields: "vendor,date,total,line_items,tax_id" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Line-Item Matching", description: "Match extracted items against purchase orders and contracts", config: { matching: "fuzzy", threshold: "0.85" }, depends_on: ["step_2"] },
      { id: "step_4", type: "condition", name: "Amount Check", description: "Route based on invoice total — high-value requires approval", config: { field: "total", operator: ">", value: "5000" }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Update QuickBooks", description: "Post invoice to QuickBooks accounting system", config: { system: "QuickBooks", action: "create_invoice", sync: "auto" }, depends_on: ["step_4"] },
      { id: "step_6", type: "output", name: "Notify Team", description: "Send notification to Slack/email about new invoice", config: { channel: "#finance", template: "new_invoice" }, depends_on: ["step_4"] },
    ],
  },
  {
    name: "Customer Onboarding Flow",
    category: "CRM",
    description: "End-to-end customer onboarding with data verification, account creation, welcome sequence, and CRM sync.",
    keywords: ["onboard", "customer", "signup", "registration", "welcome", "crm", "hubspot", "salesforce", "welcome email", "account creation"],
    tags: ["crm", "onboarding", "customer"],
    estimated_savings: "$8,200/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "New Registration", description: "Fires when a new customer signs up or is added to the system", config: { source: "web_form,api,import" } },
      { id: "step_2", type: "action", name: "Identity Verification", description: "Verify customer identity and run compliance checks", config: { verify: "email,phone,document", checks: "aml,kyc" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Create Accounts", description: "Provision accounts in CRM, billing, and support systems", config: { systems: "hubspot,stripe,zendesk" }, depends_on: ["step_2"] },
      { id: "step_4", type: "output", name: "Send Welcome Kit", description: "Send personalized welcome email with onboarding instructions", config: { template: "welcome_series", delay: "immediate" }, depends_on: ["step_3"] },
    ],
  },
  {
    name: "Document Compliance Review",
    category: "Compliance",
    description: "Automated document classification, metadata extraction, compliance rule checking, and archival with audit trail.",
    keywords: ["compliance", "document review", "audit", "regulation", "legal", "contract", "compliance check", "archive", "metadata"],
    tags: ["compliance", "documents", "audit"],
    estimated_savings: "$15,600/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Document Uploaded", description: "Fires when a document is uploaded to the system", config: { allowed_types: "PDF,DOCX,XLSX,CSV", max_size: "50MB" } },
      { id: "step_2", type: "action", name: "Document Classification", description: "Classify document type (contract, report, invoice, etc.)", config: { classifier: "ml_multiclass", confidence_threshold: "0.8" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Metadata Extraction", description: "Extract key metadata fields based on document type", config: { extract: "title,date,author,parties,effective_date,expiry" }, depends_on: ["step_2"] },
      { id: "step_4", type: "condition", name: "Compliance Rule Check", description: "Run compliance rules against extracted metadata", config: { rules: "gdpr,sox,hipaa", action_on_fail: "flag_for_review" }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Archive & Audit Log", description: "Store document with full audit trail and generate compliance report", config: { storage: "encrypted_s3", retention: "7_years" }, depends_on: ["step_4"] },
    ],
  },
  {
    name: "Inventory Management Sync",
    category: "Operations",
    description: "Real-time inventory tracking, low-stock alerts, purchase order generation, and supplier communication.",
    keywords: ["inventory", "stock", "warehouse", "supply", "reorder", "supplier", "logistics", "sku", "low stock"],
    tags: ["operations", "inventory", "logistics"],
    estimated_savings: "$6,800/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Inventory Check", description: "Periodic inventory level check or real-time webhook from POS", config: { schedule: "every_15_min", source: "erp_api" } },
      { id: "step_2", type: "condition", name: "Low Stock Detection", description: "Check if stock levels fall below reorder threshold", config: { threshold_field: "reorder_point", compare: "less_than" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Generate Purchase Order", description: "Auto-generate PO with optimal order quantities", config: { strategy: "economic_order_qty", approve_if_under: "10000" }, depends_on: ["step_2"] },
      { id: "step_4", type: "output", name: "Notify Supplier", description: "Send PO to supplier via EDI, email, or API", config: { method: "auto", fallback: "email" }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Update Dashboard", description: "Update inventory dashboard and notify ops team", config: { dashboard: "realtime", alert_channel: "#ops" }, depends_on: ["step_2"] },
    ],
  },
  {
    name: "Employee Payroll Processing",
    category: "HR",
    description: "Automated timesheet collection, hours verification, payroll calculation, and direct deposit processing.",
    keywords: ["payroll", "employee", "timesheet", "salary", "wage", "hr", "pay", "compensation", "direct deposit"],
    tags: ["hr", "payroll", "finance"],
    estimated_savings: "$5,400/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Payroll Period End", description: "Triggered at the end of each payroll period", config: { schedule: "biweekly", day: "friday" } },
      { id: "step_2", type: "action", name: "Collect Timesheets", description: "Collect and validate timesheets from all employees", config: { source: "hr_system,api_import", validation: "auto" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Calculate Payroll", description: "Calculate gross pay, deductions, taxes, and net pay", config: { tax_rules: "federal,state,local", deductions: "benefits,401k" }, depends_on: ["step_2"] },
      { id: "step_4", type: "condition", name: "Approval Check", description: "Route for manager approval if overtime or exceptions exist", config: { check: "overtime_hours", threshold: "40", approve_auto: true }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Process Direct Deposit", description: "Execute direct deposit payments and generate pay stubs", config: { method: "ach", provider: "stripe" }, depends_on: ["step_4"] },
    ],
  },
  {
    name: "Email & Communication Auto-Response",
    category: "Communication",
    description: "Intelligent email triage, intent classification, auto-reply generation, and escalation routing.",
    keywords: ["email", "communication", "slack", "support", "ticket", "inquiry", "auto-reply", "response", "customer service"],
    tags: ["communication", "email", "support"],
    estimated_savings: "$7,100/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Message Received", description: "Fires when an email, support ticket, or Slack message arrives", config: { sources: "email,support_portal,slack" } },
      { id: "step_2", type: "action", name: "Intent Classification", description: "Classify message intent (question, complaint, request, spam)", config: { classifier: "nlp_intent", confidence_threshold: "0.75" }, depends_on: ["step_1"] },
      { id: "step_3", type: "condition", name: "Routing Decision", description: "Route to auto-reply, knowledge base, or human agent", config: { auto_reply_for: "faq,status", escalate: "complaint,refund" }, depends_on: ["step_2"] },
      { id: "step_4", type: "action", name: "Generate Response", description: "Generate contextual response using AI or template", config: { style: "professional", include_signature: true }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Send Reply", description: "Send reply via original channel and log interaction", config: { track_in_crm: true, log_to_audit: true }, depends_on: ["step_4"] },
    ],
  },
  {
    name: "Data Reconciliation & Reporting",
    category: "Analytics",
    description: "Automated data extraction from multiple sources, cross-referencing, discrepancy detection, and report generation.",
    keywords: ["reconciliation", "report", "data", "analytics", "dashboard", "cross-reference", "discrepancy", "spreadsheet", "excel", "csv"],
    tags: ["analytics", "data", "reporting"],
    estimated_savings: "$9,300/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Scheduled Reconciliation", description: "Triggered on schedule or on-demand for ad-hoc reconciliation", config: { schedule: "daily_midnight", on_demand: true } },
      { id: "step_2", type: "action", name: "Extract Data Sources", description: "Pull data from connected systems (ERP, CRM, bank, etc.)", config: { sources: "quickbooks,stripe,bank_api,crm" }, depends_on: ["step_1"] },
      { id: "step_3", type: "action", name: "Cross-Reference Records", description: "Match and reconcile records across all sources", config: { matching_keys: "transaction_id,date,amount", tolerance: "0.01" }, depends_on: ["step_2"] },
      { id: "step_4", type: "condition", name: "Discrepancy Detection", description: "Flag unmatched or discrepant records for review", config: { flag_unmatched: true, alert_on: ">1%_variance" }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Generate Report", description: "Generate reconciliation report with summary and details", config: { format: "pdf,excel", distribute_to: "finance_team" }, depends_on: ["step_4"] },
    ],
  },
  {
    name: "Social Media Monitoring",
    category: "Marketing",
    description: "Social media listening, sentiment analysis, brand mention tracking, and automated engagement.",
    keywords: ["social media", "monitor", "mention", "twitter", "linkedin", "facebook", "sentiment", "brand", "engagement"],
    tags: ["marketing", "social", "monitoring"],
    estimated_savings: "$4,100/mo",
    steps: [
      { id: "step_1", type: "trigger", name: "Brand Mention Detected", description: "Fires when brand keywords are mentioned on social platforms", config: { platforms: "twitter,linkedin,reddit", keywords: "brand_name,product_name" } },
      { id: "step_2", type: "action", name: "Sentiment Analysis", description: "Analyze post sentiment (positive, negative, neutral)", config: { model: "sentiment_nlp", languages: "en,es,fr" }, depends_on: ["step_1"] },
      { id: "step_3", type: "condition", name: "Escalation Check", description: "Escalate negative/high-reach mentions to social media team", config: { escalate_when: "negative_AND_high_reach", auto_reply: "positive" }, depends_on: ["step_2"] },
      { id: "step_4", type: "action", name: "Generate Response", description: "Auto-generate response for positive mentions; draft for negative", config: { tone: "brand_voice", use_template: true }, depends_on: ["step_3"] },
      { id: "step_5", type: "output", name: "Publish & Log", description: "Post reply and log engagement metrics", config: { track_metrics: true, update_dashboard: true }, depends_on: ["step_4"] },
    ],
  },
];

// ── Pattern Detection ────────────────────────────────────────────────────

interface DetectedPattern {
  template: WorkflowTemplate;
  score: number;
}

function detectPatterns(description: string): DetectedPattern[] {
  const lower = description.toLowerCase();

  return WORKFLOW_TEMPLATES
    .map((template) => {
      const matches = template.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
      const score = matches.length / template.keywords.length;
      // Also boost score if the description mentions the template's category
      const categoryBoost = lower.includes(template.category.toLowerCase()) ? 0.2 : 0;
      return { template, score: score + categoryBoost };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ── Custom Workflow Generator ────────────────────────────────────────────

function generateCustomWorkflow(description: string, template: WorkflowTemplate): WorkflowDefinition {
  // Start with the matched template as base, then customize
  const customSteps = template.steps.map((step, idx) => ({
    ...step,
    id: `step_${idx + 1}`,
    // Customize description based on input
    description: customizeStepDescription(step, description),
  }));

  // Generate a name from the description
  const name = generateWorkflowName(description, template.name);

  return {
    id: `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    name,
    description: description.length > 200 ? description.slice(0, 200) + "..." : description,
    category: template.category,
    steps: customSteps,
    estimated_savings: template.estimated_savings,
    tags: [...template.tags],
    status: "draft",
    successRate: "98",
    runtime: "< 30s",
    errors: 0,
    lastTriggered: "Not yet run",
    dependencies: template.steps.filter((s) => s.depends_on).length > 0 ? template.steps.map((s) => s.name).join(" → ") : "None",
  };
}

function customizeStepDescription(step: WorkflowStep, description: string): string {
  // Add contextual customization based on the user's description
  const lower = description.toLowerCase();

  if (step.name === "Notify Team" || step.name === "Send Reply" || step.name === "Publish & Log") {
    if (lower.includes("slack")) return step.description + " (via Slack)";
    if (lower.includes("email")) return step.description + " (via Email)";
    if (lower.includes("teams")) return step.description + " (via Microsoft Teams)";
  }

  if (step.name === "Update QuickBooks" || step.name === "Create Accounts") {
    if (lower.includes("quickbooks")) return step.description;
    if (lower.includes("xero")) return step.description.replace("QuickBooks", "Xero");
    if (lower.includes("sage")) return step.description.replace("QuickBooks", "Sage");
    if (lower.includes("oracle") || lower.includes("netsuite")) return step.description.replace("QuickBooks", "NetSuite");
    if (lower.includes("hubspot")) return step.description.replace("QuickBooks", "HubSpot");
    if (lower.includes("salesforce")) return step.description.replace("QuickBooks", "Salesforce");
  }

  return step.description;
}

function generateWorkflowName(description: string, fallback: string): string {
  // Extract potential name from the description
  const namePatterns = [
    /(?:automate|create|build|set up)\s+(?:a|an|the)?\s*([^.]+)/i,
    /(?:workflow\s+(?:for|to)\s+)([^.]+)/i,
    /(?:pipeline\s+(?:for|to)\s+)([^.]+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Capitalize first letter of each word
      return name
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
        .slice(0, 60);
    }
  }

  return fallback;
}

// ── Main Generator Handler ───────────────────────────────────────────────

export async function generateWorkflow(request: GenerateRequest): Promise<GenerateResponse> {
  const { description, userId } = request;

  if (!description || description.trim().length < 5) {
    return { success: false, error: "Please provide a more detailed workflow description (at least 5 characters)." };
  }

  // Detect the best matching pattern
  const patterns = detectPatterns(description);

  let workflow: WorkflowDefinition;

  if (patterns.length > 0) {
    // Use the best matching template as base
    const bestMatch = patterns[0];
    workflow = generateCustomWorkflow(description, bestMatch.template);

    // Log which template was matched
    console.log(`[workflowGenerator] Matched template "${bestMatch.template.name}" (score: ${bestMatch.score.toFixed(2)}) for: "${description.slice(0, 80)}..."`);
  } else {
    // No template matched — generate a generic workflow
    workflow = {
      id: `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: generateWorkflowName(description, "Custom Automation Pipeline"),
      description: description.length > 200 ? description.slice(0, 200) + "..." : description,
      category: "General",
      steps: [
        { id: "step_1", type: "trigger", name: "Event Trigger", description: "Fires when the triggering event occurs", config: { source: "manual_or_api" } },
        { id: "step_2", type: "action", name: "Process Data", description: "Process the incoming data based on workflow rules", config: { processing: "ai_enhanced" }, depends_on: ["step_1"] },
        { id: "step_3", type: "condition", name: "Validation Check", description: "Validate the processed data against business rules", config: { rules: "business_logic", on_fail: "human_review" }, depends_on: ["step_2"] },
        { id: "step_4", type: "output", name: "Complete Action", description: "Execute the final action and log results", config: { output: "system_update", log: true }, depends_on: ["step_3"] },
      ],
      estimated_savings: "Custom — varies based on implementation",
      tags: ["custom", "automation"],
      status: "draft",
      successRate: "95",
      runtime: "< 1 min",
      errors: 0,
      lastTriggered: "Not yet run",
      dependencies: "Trigger → Process → Validate → Complete",
    };
  }

  // Store the workflow in portal_data
  const now = Date.now();
  const storageId = crypto.randomUUID();
  const { id: wfId, ...workflowData } = workflow;

  await db.run(
    sql.raw(
      `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${storageId}', '${userId}', 'workflows', '${JSON.stringify({ ...workflowData, id: wfId }).replace(/'/g, "''")}', ${now}, ${now})`
    )
  );

  return {
    success: true,
    workflow: { ...workflow, _storageId: storageId },
    storageId,
  };
}

// ── Workflow List ────────────────────────────────────────────────────────

export async function listTemplates(): Promise<WorkflowTemplate[]> {
  return WORKFLOW_TEMPLATES.map((t) => ({
    ...t,
    // Don't expose internal steps in list view
    steps: t.steps.slice(0, 2),
  }));
}