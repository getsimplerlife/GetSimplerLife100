/**
 * Workflow Mappings for all 18 AI Agent Types
 *
 * Defines the current (manual) process, AI-automated process, remaining human steps,
 * bottleneck indicators, and cross-agent integration chains for each agent type.
 */

export interface WorkflowStep {
  description: string;
  order: number;
}

export interface WorkflowMapping {
  type: string;
  name: string;
  currentProcessSteps: WorkflowStep[];
  aiProcessSteps: WorkflowStep[];
  humanStepsRemaining: string[];
  bottleneckIndicators: string[];
  crossAgentIntegration: string[];
}

// ── All 18 Agent Workflow Mappings ──────────────────────────────────────────────

export const WORKFLOW_MAPPINGS: Record<string, WorkflowMapping> = {
  // ── 1. Document Intake AI ──────────────────────────────────────────────────
  document_intake: {
    type: "document_intake",
    name: "Document Intake AI",
    currentProcessSteps: [
      { description: "Receive document via email or upload", order: 1 },
      { description: "Open and manually review document", order: 2 },
      { description: "Classify document type (invoice, contract, etc.)", order: 3 },
      { description: "Manually extract key data points", order: 4 },
      { description: "Enter data into system", order: 5 },
      { description: "File document in folder structure", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI monitors document uploads and email inbox", order: 1 },
      { description: "OCR extracts full text content from document", order: 2 },
      { description: "AI classifies document type automatically", order: 3 },
      { description: "LLM extracts key information (dates, amounts, names)", order: 4 },
      { description: "Auto-posts structured data to system", order: 5 },
      { description: "Files document in searchable document store", order: 6 },
    ],
    humanStepsRemaining: [
      "Review and approve extracted data for high-value documents",
      "Handle documents with poor OCR quality",
      "Verify ambiguous classifications",
    ],
    bottleneckIndicators: [
      "If >10% of documents require manual review, check OCR quality settings",
      "If classification accuracy <90%, retrain document type patterns",
      "If extraction confidence <0.7 for key fields, check document quality",
    ],
    crossAgentIntegration: [
      "invoice_ledger",
      "contract_management",
      "hr_compliance",
      "audit_logger",
    ],
  },

  // ── 2. Healthcare Intake AI ────────────────────────────────────────────────
  healthcare_intake: {
    type: "healthcare_intake",
    name: "Healthcare Intake AI",
    currentProcessSteps: [
      { description: "Receive patient intake forms (paper/email/fax)", order: 1 },
      { description: "Manually enter patient demographics into EHR", order: 2 },
      { description: "Verify insurance eligibility via phone/portal", order: 3 },
      { description: "Scan and attach documents to patient record", order: 4 },
      { description: "Route to appropriate department", order: 5 },
    ],
    aiProcessSteps: [
      { description: "AI receives and OCRs intake forms automatically", order: 1 },
      { description: "Extracts patient demographics and auto-populates EHR", order: 2 },
      { description: "Verifies insurance eligibility via integrated APIs", order: 3 },
      { description: "Classifies and attaches documents to patient record", order: 4 },
      { description: "Routes to department based on intake reason", order: 5 },
    ],
    humanStepsRemaining: [
      "Review and approve insurance denial cases",
      "Handle non-standard patient situations",
      "Verify extracted data for complex cases",
    ],
    bottleneckIndicators: [
      "If insurance verification takes >2 minutes per patient, check API connectivity",
      "If >5% of intake forms fail OCR, check form template quality",
      "If routing errors increase, review department mapping rules",
    ],
    crossAgentIntegration: [
      "document_intake",
      "audit_logger",
      "customer_success",
    ],
  },

  // ── 3. Invoice & Ledger AI ─────────────────────────────────────────────────
  invoice_ledger: {
    type: "invoice_ledger",
    name: "Invoice & Ledger AI",
    currentProcessSteps: [
      { description: "Receive invoice via email or mail", order: 1 },
      { description: "Open PDF and manually review line items", order: 2 },
      { description: "Manually enter into accounting system", order: 3 },
      { description: "Match invoice to purchase order", order: 4 },
      { description: "Send approval request to manager", order: 5 },
      { description: "File invoice in storage", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI monitors invoice inbox and email", order: 1 },
      { description: "OCR extracts all line items, totals, tax amounts", order: 2 },
      { description: "Auto-posts to accounting system (QuickBooks, Xero, etc.)", order: 3 },
      { description: "AI matches invoice to PO automatically", order: 4 },
      { description: "Routes to appropriate approver if over threshold", order: 5 },
      { description: "Files in searchable document store with metadata", order: 6 },
    ],
    humanStepsRemaining: [
      "Approve invoices over configurable threshold amounts",
      "Resolve PO mismatches that AI cannot reconcile",
      "Handle vendor disputes and credit notes",
    ],
    bottleneckIndicators: [
      "If >10% of invoices require manual review, check approval threshold settings",
      "If OCR accuracy drops below 95%, check invoice scan quality",
      "If PO matching failure rate >5%, review PO data quality",
    ],
    crossAgentIntegration: [
      "document_intake",
      "audit_logger",
      "procurement_vendor",
      "fp_and_a",
    ],
  },

  // ── 4. Sales Outreach Coordinator AI ───────────────────────────────────────
  sales_outreach: {
    type: "sales_outreach",
    name: "Sales Outreach Coordinator AI",
    currentProcessSteps: [
      { description: "Research and identify target prospects", order: 1 },
      { description: "Manually write personalized outreach emails", order: 2 },
      { description: "Send emails one by one", order: 3 },
      { description: "Track responses in spreadsheet", order: 4 },
      { description: "Qualify leads manually", order: 5 },
      { description: "Update CRM with lead status", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI analyzes lead lists and scores prospects", order: 1 },
      { description: "Generates personalized email templates", order: 2 },
      { description: "Schedules and sends outbound campaigns", order: 3 },
      { description: "Tracks opens, clicks, and replies automatically", order: 4 },
      { description: "Scores leads based on engagement and fit", order: 5 },
      { description: "Auto-updates CRM with lead status and notes", order: 6 },
    ],
    humanStepsRemaining: [
      "Review and approve AI-generated email content",
      "Handle replies and objections from prospects",
      "Conduct final qualification calls with hot leads",
    ],
    bottleneckIndicators: [
      "If reply rate <2%, review email templates and targeting",
      "If open rate <20%, check subject line quality and timing",
      "If lead scoring accuracy drops, review qualification criteria",
    ],
    crossAgentIntegration: [
      "customer_success",
      "document_intake",
      "audit_logger",
    ],
  },

  // ── 5. HR Intake & Compliance AI ───────────────────────────────────────────
  hr_compliance: {
    type: "hr_compliance",
    name: "Automated HR Intake & Compliance AI",
    currentProcessSteps: [
      { description: "Receive onboarding documents from new hire", order: 1 },
      { description: "Manually verify W9 and I-9 forms", order: 2 },
      { description: "Enter employee data into HRIS", order: 3 },
      { description: "Run background check manually", order: 4 },
      { description: "File compliance documents", order: 5 },
      { description: "Notify relevant departments", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI receives and classifies onboarding documents", order: 1 },
      { description: "Extracts and cross-references W9/I-9 data automatically", order: 2 },
      { description: "Auto-populates HRIS with employee data", order: 3 },
      { description: "Triggers background check via integrated API", order: 4 },
      { description: "Files compliance documents with audit trail", order: 5 },
      { description: "Notifies IT, payroll, facilities automatically", order: 6 },
    ],
    humanStepsRemaining: [
      "Review background check results for adverse actions",
      "Handle I-9 Section 2 physical document inspection",
      "Approve exceptions and non-standard onboarding requests",
    ],
    bottleneckIndicators: [
      "If background check turnaround >48 hours, check provider API status",
      "If document validation failure rate >5%, review document templates",
      "If HRIS auto-population errors increase, check field mapping config",
    ],
    crossAgentIntegration: [
      "document_intake",
      "audit_logger",
      "it_operations",
    ],
  },

  // ── 6. Dispatch Logistics Optimization AI ──────────────────────────────────
  dispatch_logistics: {
    type: "dispatch_logistics",
    name: "Dispatch Logistics Optimization AI",
    currentProcessSteps: [
      { description: "Monitor port congestion manually via websites", order: 1 },
      { description: "Check delivery schedules in spreadsheets", order: 2 },
      { description: "Manually calculate optimal dispatch times", order: 3 },
      { description: "Contact carriers for ETA updates", order: 4 },
      { description: "Update CRM with shipment status", order: 5 },
      { description: "Notify customers of delays", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI monitors port congestion indexes via web search", order: 1 },
      { description: "Aggregates delivery schedules across all carriers", order: 2 },
      { description: "Calculates optimal dispatch times using ML algorithms", order: 3 },
      { description: "Tracks shipments in real-time via APIs", order: 4 },
      { description: "Auto-updates CRM with shipment status and ETAs", order: 5 },
      { description: "Sends proactive delay notifications to customers", order: 6 },
    ],
    humanStepsRemaining: [
      "Handle exception cases (weather events, port strikes)",
      "Approve alternative routing for high-value shipments",
      "Manage carrier relationship escalations",
    ],
    bottleneckIndicators: [
      "If port congestion data is >4 hours stale, check web search feeds",
      "If ETA accuracy <85%, review carrier API integration health",
      "If delay notifications are sent after customer discovers delay, check monitoring frequency",
    ],
    crossAgentIntegration: [
      "audit_logger",
      "customer_success",
      "procurement_vendor",
    ],
  },

  // ── 7. Operations Audit Logger AI ──────────────────────────────────────────
  audit_logger: {
    type: "audit_logger",
    name: "Operations Audit Logger AI",
    currentProcessSteps: [
      { description: "Collect logs from various systems manually", order: 1 },
      { description: "Export data to spreadsheet for analysis", order: 2 },
      { description: "Manually calculate efficiency metrics", order: 3 },
      { description: "Identify anomalies by reviewing logs", order: 4 },
      { description: "Generate report in PowerPoint/Word", order: 5 },
      { description: "Send report to management via email", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI aggregates logs from all systems automatically", order: 1 },
      { description: "Analyzes operational metrics in real-time", order: 2 },
      { description: "Calculates efficiency and labor savings automatically", order: 3 },
      { description: "Detects anomalies using pattern recognition", order: 4 },
      { description: "Generates executive analytics dashboard", order: 5 },
      { description: "Sends scheduled reports and real-time alerts", order: 6 },
    ],
    humanStepsRemaining: [
      "Review and investigate flagged anomalies",
      "Validate cost savings calculations before reporting",
      "Make strategic decisions based on audit findings",
    ],
    bottleneckIndicators: [
      "If anomaly false positive rate >20%, tune detection thresholds",
      "If report generation takes >30 seconds, check data aggregation pipeline",
      "If log sources are missing data, check integration health",
    ],
    crossAgentIntegration: [
      "document_intake",
      "invoice_ledger",
      "it_operations",
      "fp_and_a",
    ],
  },

  // ── 8. Voice AI Receptionist ────────────────────────────────────────────────
  voice_receptionist: {
    type: "voice_receptionist",
    name: "Voice AI Receptionist",
    currentProcessSteps: [
      { description: "Answer incoming call", order: 1 },
      { description: "Listen to caller's request", order: 2 },
      { description: "Determine appropriate department", order: 3 },
      { description: "Transfer call or take message", order: 4 },
      { description: "Log call details in system", order: 5 },
    ],
    aiProcessSteps: [
      { description: "AI answers call via Twilio voice integration", order: 1 },
      { description: "Natural language processing understands caller intent", order: 2 },
      { description: "AI classifies intent and looks up relevant info", order: 3 },
      { description: "Routes call, schedules appointment, or takes message", order: 4 },
      { description: "Logs call details, transcription, and outcome", order: 5 },
    ],
    humanStepsRemaining: [
      "Handle escalated calls that exceed AI capability",
      "Manage complex multi-step requests",
      "Handle irate callers requiring human empathy",
    ],
    bottleneckIndicators: [
      "If call escalation rate >15%, review AI intent classification accuracy",
      "If appointment scheduling errors increase, check calendar integration",
      "If caller satisfaction drops, review AI response tone and accuracy",
    ],
    crossAgentIntegration: [
      "customer_success",
      "support_agent",
      "audit_logger",
    ],
  },

  // ── 9. AI Customer Support Agent ────────────────────────────────────────────
  support_agent: {
    type: "support_agent",
    name: "AI Customer Support Agent",
    currentProcessSteps: [
      { description: "Customer submits ticket via email/portal", order: 1 },
      { description: "Ticket sits in queue until an agent picks it up", order: 2 },
      { description: "Agent reads ticket and researches issue", order: 3 },
      { description: "Agent writes and sends response", order: 4 },
      { description: "Customer replies, agent continues thread", order: 5 },
      { description: "Ticket resolved and closed manually", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI receives and classifies ticket by urgency", order: 1 },
      { description: "AI analyzes sentiment and prioritizes queue", order: 2 },
      { description: "AI searches knowledge base for relevant solutions", order: 3 },
      { description: "AI generates contextual reply and sends it", order: 4 },
      { description: "AI continues conversation until resolution", order: 5 },
      { description: "AI resolves ticket, updates SLA, and logs", order: 6 },
    ],
    humanStepsRemaining: [
      "Handle escalated tickets requiring human judgment",
      "Manage complex technical issues beyond AI scope",
      "Handle VIP customer relations and account management",
    ],
    bottleneckIndicators: [
      "If escalation rate >20%, review AI response quality and knowledge base coverage",
      "If first response time >5 minutes, check ticket processing pipeline",
      "If customer satisfaction <4/5, review AI tone and solution accuracy",
    ],
    crossAgentIntegration: [
      "knowledge_assistant",
      "customer_success",
      "audit_logger",
    ],
  },

  // ── 10. Internal Knowledge Assistant ────────────────────────────────────────
  knowledge_assistant: {
    type: "knowledge_assistant",
    name: "Internal Knowledge Assistant AI",
    currentProcessSteps: [
      { description: "Employee has a question about policy", order: 1 },
      { description: "Searches shared drive for relevant document", order: 2 },
      { description: "Reads through multiple documents to find answer", order: 3 },
      { description: "Asks colleagues for help if not found", order: 4 },
      { description: "May email HR/IT/legal for clarification", order: 5 },
    ],
    aiProcessSteps: [
      { description: "Employee asks question in natural language", order: 1 },
      { description: "AI performs semantic search across knowledge base", order: 2 },
      { description: "AI retrieves relevant chunks with source citations", order: 3 },
      { description: "AI synthesizes answer with document references", order: 4 },
      { description: "AI provides answer with confidence score and sources", order: 5 },
    ],
    humanStepsRemaining: [
      "Validate critical answers for legal/compliance accuracy",
      "Upload and maintain knowledge base documents",
      "Handle questions about information not in knowledge base",
    ],
    bottleneckIndicators: [
      "If answer confidence <0.7, check knowledge base coverage",
      "If citation accuracy <90%, review document chunking quality",
      "If query response time >5 seconds, check embedding service latency",
    ],
    crossAgentIntegration: [
      "support_agent",
      "hr_compliance",
      "document_intake",
    ],
  },

  // ── 11. Inventory Management AI ────────────────────────────────────────────
  inventory_management: {
    type: "inventory_management",
    name: "Inventory Management AI",
    currentProcessSteps: [
      { description: "Check stock levels manually in system", order: 1 },
      { description: "Calculate reorder points using spreadsheets", order: 2 },
      { description: "Place purchase orders manually", order: 3 },
      { description: "Track inventory across locations", order: 4 },
      { description: "Conduct physical inventory counts", order: 5 },
      { description: "Reconcile discrepancies manually", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI monitors stock levels across all locations in real-time", order: 1 },
      { description: "Calculates optimal reorder points using demand forecasting", order: 2 },
      { description: "Generates purchase orders automatically", order: 3 },
      { description: "Tracks multi-location inventory transfers", order: 4 },
      { description: "Flags discrepancies for reconciliation", order: 5 },
      { description: "Sends low-stock alerts proactively", order: 6 },
    ],
    humanStepsRemaining: [
      "Approve large or unusual purchase orders",
      "Handle supplier negotiations and relationship management",
      "Investigate and resolve inventory discrepancies",
    ],
    bottleneckIndicators: [
      "If stockout rate >2%, review reorder point calculations",
      "If inventory accuracy <95%, check cycle counting frequency",
      "If excess stock >10% of total, review demand forecasting model",
    ],
    crossAgentIntegration: [
      "procurement_vendor",
      "dispatch_logistics",
      "audit_logger",
      "fp_and_a",
    ],
  },

  // ── 12. Contract Management AI ─────────────────────────────────────────────
  contract_management: {
    type: "contract_management",
    name: "Contract Management AI",
    currentProcessSteps: [
      { description: "Receive contract via email", order: 1 },
      { description: "Manually review and extract key terms", order: 2 },
      { description: "Enter contract data into spreadsheet", order: 3 },
      { description: "Track renewal dates in calendar", order: 4 },
      { description: "File contract in folder/drive", order: 5 },
      { description: "Manually check for obligations", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI receives and classifies contract document", order: 1 },
      { description: "Extracts key terms: parties, dates, amounts, obligations", order: 2 },
      { description: "Stores structured contract data in system", order: 3 },
      { description: "Monitors renewal and expiry dates automatically", order: 4 },
      { description: "Files contract with version control", order: 5 },
      { description: "Tracks obligations and sends compliance alerts", order: 6 },
    ],
    humanStepsRemaining: [
      "Review and approve contract terms before signing",
      "Handle contract negotiations and amendments",
      "Resolve obligation disputes and compliance issues",
    ],
    bottleneckIndicators: [
      "If renewal miss rate >5%, review calendar integration and alert settings",
      "If term extraction accuracy <90%, check OCR quality and template coverage",
      "If obligation tracking errors increase, review extraction rules",
    ],
    crossAgentIntegration: [
      "document_intake",
      "audit_logger",
      "procurement_vendor",
      "fp_and_a",
    ],
  },

  // ── 13. Customer Success / Retention AI ────────────────────────────────────
  customer_success: {
    type: "customer_success",
    name: "Customer Success / Retention AI",
    currentProcessSteps: [
      { description: "Monitor customer usage manually in reports", order: 1 },
      { description: "Identify at-risk customers via spreadsheet", order: 2 },
      { description: "Schedule check-in calls manually", order: 3 },
      { description: "Track health scores in CRM", order: 4 },
      { description: "Send renewal reminders manually", order: 5 },
    ],
    aiProcessSteps: [
      { description: "AI calculates customer health scores automatically", order: 1 },
      { description: "Detects churn signals from usage and sentiment", order: 2 },
      { description: "Schedules and triggers automated check-in emails", order: 3 },
      { description: "Updates health scores in CRM in real-time", order: 4 },
      { description: "Sends targeted renewal reminders and upsell offers", order: 5 },
    ],
    humanStepsRemaining: [
      "Handle high-touch customer relationships",
      "Manage renewal negotiations for enterprise accounts",
      "Address complex customer complaints and escalations",
    ],
    bottleneckIndicators: [
      "If churn prediction accuracy <70%, review health score model",
      "If check-in email open rate <30%, review email content and timing",
      "If upsell conversion <5%, review upsell targeting criteria",
    ],
    crossAgentIntegration: [
      "support_agent",
      "sales_outreach",
      "audit_logger",
    ],
  },

  // ── 14. Project Management AI ──────────────────────────────────────────────
  project_management: {
    type: "project_management",
    name: "Project Management AI",
    currentProcessSteps: [
      { description: "Create project plan in spreadsheet/PM tool", order: 1 },
      { description: "Assign tasks to team members manually", order: 2 },
      { description: "Track progress via status meetings", order: 3 },
      { description: "Identify bottlenecks through manual review", order: 4 },
      { description: "Generate status report manually", order: 5 },
      { description: "Update stakeholders via email", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI generates project plan from natural language description", order: 1 },
      { description: "Auto-assigns tasks based on team capacity and skills", order: 2 },
      { description: "Monitors progress and flags at-risk items in real-time", order: 3 },
      { description: "Detects bottlenecks and resource contention automatically", order: 4 },
      { description: "Generates status reports with burndown charts", order: 5 },
      { description: "Sends stakeholder updates and milestone alerts", order: 6 },
    ],
    humanStepsRemaining: [
      "Make strategic decisions on resource reallocation",
      "Handle team conflicts and personnel issues",
      "Approve scope changes and timeline adjustments",
    ],
    bottleneckIndicators: [
      "If milestone miss rate >15%, review task estimation accuracy",
      "If resource utilization >90%, consider hiring or redistribution",
      "If status report accuracy <85%, check data source integration",
    ],
    crossAgentIntegration: [
      "audit_logger",
      "it_operations",
      "customer_success",
    ],
  },

  // ── 15. Procurement & Vendor Management AI ─────────────────────────────────
  procurement_vendor: {
    type: "procurement_vendor",
    name: "Procurement & Vendor Management AI",
    currentProcessSteps: [
      { description: "Identify vendor needs and requirements", order: 1 },
      { description: "Request quotes from vendors manually", order: 2 },
      { description: "Compare quotes in spreadsheet", order: 3 },
      { description: "Create purchase orders manually", order: 4 },
      { description: "Track vendor performance in spreadsheet", order: 5 },
      { description: "Manage vendor contracts and renewals", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI analyzes vendor needs based on inventory levels", order: 1 },
      { description: "Sends automated RFQs to preferred vendors", order: 2 },
      { description: "Compares quotes and recommends best option", order: 3 },
      { description: "Generates purchase orders automatically", order: 4 },
      { description: "Tracks vendor performance metrics in real-time", order: 5 },
      { description: "Monitors contract terms and renewal dates", order: 6 },
    ],
    humanStepsRemaining: [
      "Approve vendor selections for strategic purchases",
      "Negotiate pricing and terms with vendors",
      "Handle vendor disputes and quality issues",
    ],
    bottleneckIndicators: [
      "If PO approval time >24 hours, check approval workflow settings",
      "If vendor quote response rate <50%, review vendor list quality",
      "If vendor performance score drops, check SLA compliance tracking",
    ],
    crossAgentIntegration: [
      "inventory_management",
      "contract_management",
      "invoice_ledger",
      "audit_logger",
    ],
  },

  // ── 16. IT Operations & DevOps AI ──────────────────────────────────────────
  it_operations: {
    type: "it_operations",
    name: "IT Operations & DevOps AI",
    currentProcessSteps: [
      { description: "Monitor system health via dashboards", order: 1 },
      { description: "Respond to alerts manually", order: 2 },
      { description: "Troubleshoot issues by checking logs", order: 3 },
      { description: "Deploy updates and patches manually", order: 4 },
      { description: "Manage user access requests", order: 5 },
      { description: "Generate compliance reports", order: 6 },
    ],
    aiProcessSteps: [
      { description: "AI monitors system health across all services", order: 1 },
      { description: "Responds to alerts with automated remediation", order: 2 },
      { description: "Analyzes logs to identify root cause of issues", order: 3 },
      { description: "Orchestrates deployments and patch management", order: 4 },
      { description: "Auto-provisions user access based on policies", order: 5 },
      { description: "Generates compliance and audit reports", order: 6 },
    ],
    humanStepsRemaining: [
      "Approve critical infrastructure changes",
      "Handle security incidents and breaches",
      "Manage architectural decisions and tech strategy",
    ],
    bottleneckIndicators: [
      "If MTTR >30 minutes, review automated remediation playbooks",
      "If alert fatigue increases, tune alert threshold settings",
      "If deployment failure rate >5%, review CI/CD pipeline health",
    ],
    crossAgentIntegration: [
      "audit_logger",
      "support_agent",
      "knowledge_assistant",
    ],
  },

  // ── 17. Financial Planning & FP&A AI ───────────────────────────────────────
  fp_and_a: {
    type: "fp_and_a",
    name: "Financial Planning & FP&A AI",
    currentProcessSteps: [
      { description: "Collect financial data from multiple sources", order: 1 },
      { description: "Manually consolidate into spreadsheets", order: 2 },
      { description: "Calculate budgets and forecasts", order: 3 },
      { description: "Generate variance analysis reports", order: 4 },
      { description: "Present findings to leadership", order: 5 },
    ],
    aiProcessSteps: [
      { description: "AI aggregates financial data from all systems", order: 1 },
      { description: "Consolidates and normalizes data automatically", order: 2 },
      { description: "Generates budgets and forecasts using ML models", order: 3 },
      { description: "Produces variance analysis with recommendations", order: 4 },
      { description: "Creates executive dashboards and reports", order: 5 },
    ],
    humanStepsRemaining: [
      "Review and approve financial forecasts",
      "Make strategic financial decisions",
      "Handle regulatory filing and compliance",
    ],
    bottleneckIndicators: [
      "If forecast accuracy <80%, review ML model and data quality",
      "If data consolidation takes >1 hour, check source system integrations",
      "If variance explanations are inaccurate, review data mapping rules",
    ],
    crossAgentIntegration: [
      "invoice_ledger",
      "audit_logger",
      "procurement_vendor",
      "inventory_management",
    ],
  },

  // ── 18. Marketing & Social Media AI ────────────────────────────────────────
  marketing_social: {
    type: "marketing_social",
    name: "Marketing & Social Media AI",
    currentProcessSteps: [
      { description: "Brainstorm content ideas manually", order: 1 },
      { description: "Write and design content in tools", order: 2 },
      { description: "Schedule posts across platforms manually", order: 3 },
      { description: "Monitor engagement and replies", order: 4 },
      { description: "Generate performance reports", order: 5 },
    ],
    aiProcessSteps: [
      { description: "AI generates content ideas based on trends and audience", order: 1 },
      { description: "Creates and optimizes content for each platform", order: 2 },
      { description: "Schedules and publishes posts automatically", order: 3 },
      { description: "Monitors engagement and auto-replies to comments", order: 4 },
      { description: "Generates performance analytics with recommendations", order: 5 },
    ],
    humanStepsRemaining: [
      "Review and approve brand-critical content",
      "Handle crisis communication and PR issues",
      "Define brand voice and strategic direction",
    ],
    bottleneckIndicators: [
      "If engagement rate drops >20%, review content quality and targeting",
      "If post scheduling errors increase, check platform API integrations",
      "If content approval time >24 hours, review approval workflow",
    ],
    crossAgentIntegration: [
      "sales_outreach",
      "customer_success",
      "audit_logger",
    ],
  },
};

/**
 * Get workflow mapping for a specific agent type
 */
export function getWorkflowMapping(agentType: string): WorkflowMapping | null {
  return WORKFLOW_MAPPINGS[agentType] || null;
}

/**
 * Get all workflow mappings
 */
export function getAllWorkflowMappings(): WorkflowMapping[] {
  return Object.values(WORKFLOW_MAPPINGS);
}

/**
 * Get cross-agent integration suggestions for a given agent type
 */
export function getCrossAgentIntegrations(agentType: string): string[] {
  const mapping = WORKFLOW_MAPPINGS[agentType];
  return mapping?.crossAgentIntegration || [];
}