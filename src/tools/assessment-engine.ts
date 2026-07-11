/**
 * AI Automation Assessment Engine
 *
 * Client-side scoring engine that analyzes business answers and generates
 * a tailored automation report with savings estimates, workflow rankings,
 * integration recommendations, and phased implementation roadmap.
 */

import { workflows, type Workflow } from "../content/workflows";

// ── Inline Integration Info (avoids heavy provider imports) ──────────────

const integrationInfo: Record<string, { name: string; category: string; description: string }> = {
  "quickbooks-online": { name: "QuickBooks Online", category: "Accounting", description: "Cloud-based accounting and bookkeeping" },
  "quickbooks-desktop": { name: "QuickBooks Desktop", category: "Accounting", description: "Desktop accounting software" },
  "xero": { name: "Xero", category: "Accounting", description: "Cloud-based accounting platform" },
  "netsuite": { name: "NetSuite", category: "ERP", description: "Cloud ERP system" },
  "sap-s4hana": { name: "SAP S/4HANA", category: "ERP", description: "Enterprise ERP system" },
  "sap-business-one": { name: "SAP Business One", category: "ERP", description: "SMB ERP solution" },
  "salesforce": { name: "Salesforce", category: "CRM", description: "CRM and sales platform" },
  "salesforce-service-cloud": { name: "Salesforce Service Cloud", category: "Support", description: "Customer service platform" },
  "hubspot": { name: "HubSpot", category: "CRM", description: "Marketing and sales platform" },
  "dynamics-365": { name: "Dynamics 365", category: "CRM/ERP", description: "Microsoft business applications" },
  "dynamics-365-bc": { name: "Dynamics 365 Business Central", category: "ERP", description: "Microsoft ERP solution" },
  "slack": { name: "Slack", category: "Communication", description: "Team messaging and collaboration" },
  "teams": { name: "Microsoft Teams", category: "Communication", description: "Team collaboration hub" },
  "gmail": { name: "Gmail", category: "Email", description: "Google email service" },
  "google-workspace": { name: "Google Workspace", category: "Email", description: "Google productivity suite" },
  "outlook": { name: "Outlook", category: "Email", description: "Microsoft email client" },
  "shopify": { name: "Shopify", category: "E-commerce", description: "E-commerce platform" },
  "zendesk": { name: "Zendesk", category: "Support", description: "Customer support platform" },
  "jira": { name: "Jira", category: "Project Management", description: "Issue and project tracking" },
  "notion": { name: "Notion", category: "Project Management", description: "All-in-one workspace" },
  "asana": { name: "Asana", category: "Project Management", description: "Work management platform" },
  "exchange": { name: "Exchange", category: "Email", description: "Microsoft email server" },
};

// ── Types ────────────────────────────────────────────────────────────────

export interface AssessmentAnswers {
  industry: string;
  companySize: string;
  department: string;
  topPainPoints: string[];
  currentSoftware: string[];
  manualProcesses: string;
  monthlyInvoiceVolume: string;
  hasComplianceNeeds: string;
  growthPlans: string;
  timeline: string;
  budget: string;
  email?: string;
  company?: string;
}

export interface WorkflowRecommendation {
  workflow: Workflow;
  impactScore: number;
  estimatedAnnualSavings: number;
  implementationTime: string;
  priority: "quick-win" | "medium-term" | "long-term";
}

export interface IntegrationRecommendation {
  name: string;
  category: string;
  relevanceScore: number;
  description: string;
}

export interface AssessmentReport {
  answers: AssessmentAnswers;
  annualSavings: number;
  topWorkflows: WorkflowRecommendation[];
  recommendedIntegrations: IntegrationRecommendation[];
  roadmap: {
    quickWins: WorkflowRecommendation[];
    mediumTerm: WorkflowRecommendation[];
    longTerm: WorkflowRecommendation[];
  };
  industry: string;
  companySize: string;
  departmentFocus: string;
  reportDate: string;
}

// ── Question Definitions ─────────────────────────────────────────────────

export interface Question {
  id: string;
  type: "single" | "multi" | "text" | "email";
  question: string;
  description?: string;
  options?: { value: string; label: string; icon?: string }[];
  placeholder?: string;
}

export const assessmentQuestions: Question[] = [
  {
    id: "industry",
    type: "single",
    question: "What industry does your business operate in?",
    description: "This helps us tailor automation recommendations to your sector.",
    options: [
      { value: "manufacturing", label: "Manufacturing", icon: "🏭" },
      { value: "logistics", label: "Logistics & Supply Chain", icon: "🚛" },
      { value: "construction", label: "Construction", icon: "🏗️" },
      { value: "retail", label: "Retail & E-commerce", icon: "🛍️" },
      { value: "energy", label: "Energy & Utilities", icon: "⚡" },
      { value: "healthcare", label: "Healthcare", icon: "🏥" },
      { value: "financial-services", label: "Financial Services", icon: "💰" },
      { value: "insurance", label: "Insurance", icon: "🛡️" },
      { value: "legal", label: "Legal", icon: "⚖️" },
      { value: "accounting", label: "Accounting", icon: "📊" },
      { value: "technology", label: "Technology / SaaS", icon: "💻" },
      { value: "education", label: "Education", icon: "🎓" },
      { value: "hospitality", label: "Hospitality", icon: "🍽️" },
      { value: "real-estate", label: "Real Estate", icon: "🏠" },
      { value: "nonprofit", label: "Nonprofit", icon: "🤝" },
      { value: "government", label: "Government", icon: "🏛️" },
      { value: "other", label: "Other", icon: "🔧" },
    ],
  },
  {
    id: "companySize",
    type: "single",
    question: "How many employees does your company have?",
    options: [
      { value: "1-10", label: "1-10 (Startup)", icon: "🚀" },
      { value: "11-50", label: "11-50 (Small)", icon: "👥" },
      { value: "51-200", label: "51-200 (Mid-size)", icon: "🏢" },
      { value: "201-500", label: "201-500 (Large)", icon: "🏬" },
      { value: "501+", label: "501+ (Enterprise)", icon: "🏙️" },
    ],
  },
  {
    id: "department",
    type: "single",
    question: "Which department would benefit most from automation?",
    options: [
      { value: "finance", label: "Finance & Accounting", icon: "💵" },
      { value: "operations", label: "Operations", icon: "⚙️" },
      { value: "hr", label: "HR & People", icon: "👋" },
      { value: "sales", label: "Sales & Marketing", icon: "📈" },
      { value: "support", label: "Customer Support", icon: "🎧" },
      { value: "it", label: "IT & Engineering", icon: "🖥️" },
      { value: "logistics", label: "Logistics & Supply Chain", icon: "🚚" },
      { value: "procurement", label: "Procurement", icon: "📋" },
      { value: "multiple", label: "Multiple Departments", icon: "🔄" },
    ],
  },
  {
    id: "topPainPoints",
    type: "multi",
    question: "What are your biggest operational pain points?",
    description: "Select all that apply.",
    options: [
      { value: "data-entry", label: "Manual data entry / copy-paste", icon: "⌨️" },
      { value: "invoicing", label: "Invoice processing bottlenecks", icon: "🧾" },
      { value: "reconciliation", label: "Slow reconciliation", icon: "🔄" },
      { value: "inventory", label: "Inventory inaccuracies", icon: "📦" },
      { value: "reporting", label: "Manual report generation", icon: "📊" },
      { value: "onboarding", label: "Slow employee onboarding", icon: "👤" },
      { value: "support", label: "Customer support overload", icon: "🎧" },
      { value: "compliance", label: "Compliance tracking", icon: "⚖️" },
      { value: "communication", label: "Disconnected systems", icon: "🔗" },
      { value: "payroll", label: "Payroll errors", icon: "💰" },
      { value: "procurement", label: "Purchase order delays", icon: "📋" },
      { value: "scheduling", label: "Scheduling conflicts", icon: "📅" },
    ],
  },
  {
    id: "currentSoftware",
    type: "multi",
    question: "What software does your team currently use?",
    description: "Select all that apply. This helps us identify integration opportunities.",
    options: [
      { value: "quickbooks", label: "QuickBooks", icon: "📘" },
      { value: "xero", label: "Xero", icon: "📗" },
      { value: "netsuite", label: "NetSuite", icon: "🏢" },
      { value: "sap", label: "SAP", icon: "🔵" },
      { value: "salesforce", label: "Salesforce", icon: "☁️" },
      { value: "hubspot", label: "HubSpot", icon: "🟠" },
      { value: "dynamics", label: "Dynamics 365", icon: "🔷" },
      { value: "slack", label: "Slack", icon: "💬" },
      { value: "teams", label: "Microsoft Teams", icon: "💻" },
      { value: "gmail", label: "Gmail / Google Workspace", icon: "📧" },
      { value: "outlook", label: "Outlook / Office 365", icon: "📧" },
      { value: "shopify", label: "Shopify", icon: "🛒" },
      { value: "zendesk", label: "Zendesk", icon: "🎫" },
      { value: "jira", label: "Jira", icon: "📋" },
      { value: "notion", label: "Notion", icon: "📝" },
      { value: "asana", label: "Asana", icon: "✅" },
      { value: "other-erp", label: "Other ERP System", icon: "🏗️" },
      { value: "other-crm", label: "Other CRM", icon: "📇" },
      { value: "other", label: "Other / None", icon: "🔧" },
    ],
  },
  {
    id: "manualProcesses",
    type: "text",
    question: "Describe the most time-consuming manual process your team does daily.",
    description: "Be as specific as you can. For example: 'Someone downloads invoices from email, types them into QuickBooks, then emails customers.'",
    placeholder: "Every morning, someone has to...",
  },
  {
    id: "monthlyInvoiceVolume",
    type: "single",
    question: "Approximately how many invoices, orders, or documents does your team process monthly?",
    options: [
      { value: "0-100", label: "0-100", icon: "📄" },
      { value: "101-500", label: "101-500", icon: "📄📄" },
      { value: "501-2000", label: "501-2,000", icon: "📄📄📄" },
      { value: "2001-10000", label: "2,001-10,000", icon: "📄📄📄📄" },
      { value: "10000+", label: "10,000+", icon: "📊" },
    ],
  },
  {
    id: "hasComplianceNeeds",
    type: "single",
    question: "Does your business have specific compliance or regulatory requirements?",
    options: [
      { value: "none", label: "No specific requirements", icon: "✅" },
      { value: "audit", label: "Audit trail required", icon: "📋" },
      { value: "hipaa", label: "HIPAA (Healthcare)", icon: "🏥" },
      { value: "sox", label: "SOX (Finance)", icon: "💰" },
      { value: "gdpr", label: "GDPR (Data privacy)", icon: "🛡️" },
      { value: "multiple", label: "Multiple regulations", icon: "⚖️" },
    ],
  },
  {
    id: "growthPlans",
    type: "single",
    question: "What are your growth plans for the next 12 months?",
    options: [
      { value: "maintain", label: "Maintain current operations", icon: "📊" },
      { value: "grow-slightly", label: "Grow 10-25%", icon: "📈" },
      { value: "grow-fast", label: "Grow 25-50%", icon: "🚀" },
      { value: "scale", label: "Scale rapidly (50%+)", icon: "🔥" },
      { value: "new-markets", label: "Expand to new markets", icon: "🌍" },
    ],
  },
  {
    id: "timeline",
    type: "single",
    question: "When would you like to start automating?",
    options: [
      { value: "immediately", label: "Right now!", icon: "🔥" },
      { value: "this-quarter", label: "This quarter", icon: "📅" },
      { value: "next-quarter", label: "Next quarter", icon: "🗓️" },
      { value: "exploring", label: "Just exploring options", icon: "🔍" },
    ],
  },
  {
    id: "budget",
    type: "single",
    question: "What's your estimated monthly budget for automation tools?",
    options: [
      { value: "under-500", label: "Under $500/mo", icon: "💵" },
      { value: "500-2000", label: "$500 - $2,000/mo", icon: "💵💵" },
      { value: "2000-5000", label: "$2,000 - $5,000/mo", icon: "💵💵💵" },
      { value: "5000-10000", label: "$5,000 - $10,000/mo", icon: "💰" },
      { value: "10000+", label: "$10,000+/mo", icon: "💰💰" },
      { value: "unknown", label: "Not sure yet", icon: "🤔" },
    ],
  },
];

// ── Scoring Engine ───────────────────────────────────────────────────────

const industryWorkflowMapping: Record<string, string[]> = {
  "manufacturing": ["invoice-automation", "purchase-order-management", "inventory-reconciliation", "production-reporting", "quality-assurance", "erp-updates"],
  "logistics": ["dispatch-scheduling", "route-optimization", "carrier-coordination", "pod-collection", "freight-audit", "invoice-automation"],
  "construction": ["invoice-automation", "purchase-order-management", "vendor-management", "document-processing", "compliance-reporting"],
  "retail": ["inventory-reconciliation", "invoice-automation", "customer-support-triage", "email-marketing", "social-media-management"],
  "energy": ["compliance-reporting", "production-reporting", "invoice-automation", "purchase-order-management", "data-entry-automation"],
  "healthcare": ["patient-intake", "appointment-scheduling", "insurance-verification", "medical-coding", "claims-processing", "compliance-reporting"],
  "financial-services": ["ap-ar-automation", "payment-reconciliation", "compliance-reporting", "data-entry-automation", "document-processing"],
  "insurance": ["claims-processing", "document-processing", "data-entry-automation", "compliance-reporting", "customer-support-triage"],
  "legal": ["contract-review", "document-processing", "data-entry-automation", "compliance-reporting", "client-intake"],
  "accounting": ["ap-ar-automation", "invoice-automation", "payment-reconciliation", "data-entry-automation", "document-processing"],
  "technology": ["data-entry-automation", "customer-support-triage", "lead-response", "notification-automation", "reporting-automation"],
  "education": ["onboarding", "data-entry-automation", "document-processing", "compliance-reporting", "notification-automation"],
  "hospitality": ["appointment-scheduling", "email-marketing", "customer-support-triage", "payroll-processing", "social-media-management"],
  "real-estate": ["client-intake", "document-processing", "lead-response", "email-automation", "appointment-scheduling"],
  "nonprofit": ["email-marketing", "donor-management", "compliance-reporting", "notification-automation", "data-entry-automation"],
  "government": ["compliance-reporting", "document-processing", "data-entry-automation", "approval-workflow", "notification-automation"],
  "other": ["data-entry-automation", "document-processing", "invoice-automation", "email-automation", "reporting-automation"],
};

const painPointWorkflowMapping: Record<string, string[]> = {
  "data-entry": ["data-entry-automation", "document-processing", "invoice-automation"],
  "invoicing": ["invoice-automation", "ap-ar-automation", "payment-reconciliation"],
  "reconciliation": ["payment-reconciliation", "ap-ar-automation"],
  "inventory": ["inventory-reconciliation", "purchase-order-management", "vendor-management"],
  "reporting": ["reporting-automation", "compliance-reporting", "production-reporting"],
  "onboarding": ["onboarding", "client-intake", "benefits-administration"],
  "support": ["customer-support-triage", "lead-response", "notification-automation"],
  "compliance": ["compliance-reporting", "approval-workflow", "quality-assurance"],
  "communication": ["email-automation", "notification-automation", "supplier-communication"],
  "payroll": ["payroll-processing", "benefits-administration"],
  "procurement": ["purchase-order-management", "supplier-communication", "vendor-management"],
  "scheduling": ["appointment-scheduling", "dispatch-scheduling"],
};

const softwareWorkflowMapping: Record<string, string[]> = {
  "quickbooks": ["invoice-automation", "ap-ar-automation", "payment-reconciliation"],
  "xero": ["invoice-automation", "ap-ar-automation", "payment-reconciliation"],
  "netsuite": ["erp-updates", "invoice-automation", "purchase-order-management"],
  "sap": ["erp-updates", "production-reporting", "purchase-order-management"],
  "salesforce": ["lead-response", "data-entry-automation", "reporting-automation"],
  "hubspot": ["lead-response", "email-marketing", "data-entry-automation"],
  "dynamics": ["erp-updates", "invoice-automation", "reporting-automation"],
  "slack": ["notification-automation", "approval-workflow", "customer-support-triage"],
  "teams": ["notification-automation", "approval-workflow", "customer-support-triage"],
  "gmail": ["email-automation", "email-marketing", "lead-response"],
  "outlook": ["email-automation", "email-marketing", "lead-response"],
  "shopify": ["inventory-reconciliation", "order-processing", "customer-support-triage"],
  "zendesk": ["customer-support-triage", "notification-automation", "lead-response"],
  "jira": ["notification-automation", "approval-workflow", "reporting-automation"],
  "notion": ["document-processing", "data-entry-automation", "reporting-automation"],
  "asana": ["notification-automation", "approval-workflow", "reporting-automation"],
};

const departmentWorkflowMapping: Record<string, string[]> = {
  "finance": ["invoice-automation", "ap-ar-automation", "payment-reconciliation", "data-entry-automation"],
  "operations": ["purchase-order-management", "inventory-reconciliation", "production-reporting", "dispatch-scheduling"],
  "hr": ["payroll-processing", "onboarding", "benefits-administration", "compliance-reporting"],
  "sales": ["lead-response", "email-marketing", "reporting-automation", "customer-support-triage"],
  "support": ["customer-support-triage", "lead-response", "notification-automation", "email-automation"],
  "it": ["data-entry-automation", "reporting-automation", "compliance-reporting", "notification-automation"],
  "logistics": ["dispatch-scheduling", "route-optimization", "carrier-coordination", "pod-collection"],
  "procurement": ["purchase-order-management", "supplier-communication", "vendor-management", "invoice-automation"],
  "multiple": ["invoice-automation", "data-entry-automation", "email-automation", "reporting-automation"],
};

// ── Savings Calculation ──────────────────────────────────────────────────

function calculateAnnualSavings(
  workflowId: string,
  companySize: string,
  volume: string,
): number {
  const baseSavings: Record<string, number> = {
    "invoice-automation": 25000,
    "purchase-order-management": 18000,
    "inventory-reconciliation": 22000,
    "dispatch-scheduling": 20000,
    "route-optimization": 28000,
    "carrier-coordination": 15000,
    "pod-collection": 12000,
    "freight-audit": 16000,
    "patient-intake": 20000,
    "appointment-scheduling": 15000,
    "insurance-verification": 18000,
    "medical-coding": 25000,
    "claims-processing": 35000,
    "compliance-reporting": 20000,
    "ap-ar-automation": 22000,
    "data-entry-automation": 18000,
    "document-processing": 15000,
    "contract-review": 20000,
    "onboarding": 15000,
    "client-intake": 12000,
    "payroll-processing": 15000,
    "benefits-administration": 12000,
    "vendor-management": 15000,
    "customer-support-triage": 20000,
    "lead-response": 12000,
    "payment-reconciliation": 20000,
    "reporting-automation": 15000,
    "approval-workflow": 10000,
    "notification-automation": 8000,
    "social-media-management": 10000,
    "email-automation": 12000,
    "email-marketing": 15000,
    "erp-updates": 18000,
    "production-reporting": 20000,
    "quality-assurance": 15000,
    "supplier-communication": 12000,
  };

  const sizeMultipliers: Record<string, number> = {
    "1-10": 0.5, "11-50": 1.0, "51-200": 1.5, "201-500": 2.0, "501+": 3.0,
  };

  const volumeMultipliers: Record<string, number> = {
    "0-100": 0.5, "101-500": 1.0, "501-2000": 1.5, "2001-10000": 2.0, "10000+": 3.0,
  };

  const base = baseSavings[workflowId] || 15000;
  const sizeMultiplier = sizeMultipliers[companySize] || 1.0;
  const volumeMultiplier = volumeMultipliers[volume] || 1.0;

  return Math.round(base * sizeMultiplier * volumeMultiplier);
}

function estimateImplementationTime(workflowId: string): string {
  const quick = ["data-entry-automation", "email-automation", "notification-automation", "lead-response", "social-media-management",
    "email-marketing", "approval-workflow", "client-intake", "pod-collection"];
  const medium = ["invoice-automation", "ap-ar-automation", "payment-reconciliation", "onboarding", "customer-support-triage",
    "reporting-automation", "vendor-management", "supplier-communication", "quality-assurance"];
  
  if (quick.includes(workflowId)) return "2-4 weeks";
  if (medium.includes(workflowId)) return "4-8 weeks";
  return "8-16 weeks";
}

function determinePriority(workflowId: string, implementationTime: string): "quick-win" | "medium-term" | "long-term" {
  if (implementationTime === "2-4 weeks") return "quick-win";
  if (implementationTime === "4-8 weeks") return "medium-term";
  return "long-term";
}

// ── Integration Matching ─────────────────────────────────────────────────

function getSoftwareCategory(softwareValue: string): string {
  const categories: Record<string, string> = {
    "quickbooks": "Accounting", "xero": "Accounting", "netsuite": "ERP",
    "sap": "ERP", "salesforce": "CRM", "hubspot": "CRM",
    "dynamics": "CRM/ERP", "slack": "Communication", "teams": "Communication",
    "gmail": "Email", "outlook": "Email", "shopify": "E-commerce",
    "zendesk": "Support", "jira": "Project Management", "notion": "Project Management",
    "asana": "Project Management",
  };
  return categories[softwareValue] || "Other";
}

function findMatchingIntegrations(softwareValues: string[]): IntegrationRecommendation[] {
  const result: IntegrationRecommendation[] = [];
  const providerIds = new Set<string>();

  for (const sw of softwareValues) {
    const providerMap: Record<string, string[]> = {
      "quickbooks": ["quickbooks-online", "quickbooks-desktop"],
      "xero": ["xero"],
      "netsuite": ["netsuite"],
      "sap": ["sap-s4hana", "sap-business-one"],
      "salesforce": ["salesforce", "salesforce-service-cloud"],
      "hubspot": ["hubspot"],
      "dynamics": ["dynamics-365", "dynamics-365-bc", "dynamics-365-fo"],
      "slack": ["slack"],
      "teams": ["teams"],
      "gmail": ["gmail", "google-workspace"],
      "outlook": ["outlook", "exchange"],
      "shopify": ["shopify"],
      "zendesk": ["zendesk"],
      "jira": ["jira"],
      "notion": ["notion"],
      "asana": ["asana"],
    };

    const providerIdsForSoftware = providerMap[sw] || [];
    for (const pid of providerIdsForSoftware) {
      providerIds.add(pid);
    }
  }

  for (const pid of providerIds) {
    const info = integrationInfo[pid];
    if (info) {
      result.push({
        name: info.name,
        category: info.category,
        relevanceScore: 10,
        description: info.description,
      });
    }
  }

  return result;
}

// ── Main Assessment Function ─────────────────────────────────────────────

export function runAssessment(answers: AssessmentAnswers): AssessmentReport {
  const scoredWorkflows = new Map<string, number>();
  const workflowSources = new Map<string, string[]>();

  // Score from industry
  const industryWorkflows = industryWorkflowMapping[answers.industry] || industryWorkflowMapping["other"];
  for (const wfId of industryWorkflows) {
    scoredWorkflows.set(wfId, (scoredWorkflows.get(wfId) || 0) + 30);
    const sources = workflowSources.get(wfId) || [];
    sources.push("industry");
    workflowSources.set(wfId, sources);
  }

  // Score from pain points
  for (const painPoint of answers.topPainPoints) {
    const wfs = painPointWorkflowMapping[painPoint] || [];
    for (const wfId of wfs) {
      scoredWorkflows.set(wfId, (scoredWorkflows.get(wfId) || 0) + 25);
      const sources = workflowSources.get(wfId) || [];
      sources.push("pain-point");
      workflowSources.set(wfId, sources);
    }
  }

  // Score from department
  const deptWorkflows = departmentWorkflowMapping[answers.department] || [];
  for (const wfId of deptWorkflows) {
    scoredWorkflows.set(wfId, (scoredWorkflows.get(wfId) || 0) + 20);
    const sources = workflowSources.get(wfId) || [];
    sources.push("department");
    workflowSources.set(wfId, sources);
  }

  // Score from software
  for (const sw of answers.currentSoftware) {
    const wfs = softwareWorkflowMapping[sw] || [];
    for (const wfId of wfs) {
      scoredWorkflows.set(wfId, (scoredWorkflows.get(wfId) || 0) + 15);
      const sources = workflowSources.get(wfId) || [];
      sources.push("software");
      workflowSources.set(wfId, sources);
    }
  }

  // Bonus for compliance needs
  if (answers.hasComplianceNeeds !== "none") {
    const complianceWfs = ["compliance-reporting", "approval-workflow", "quality-assurance", "document-processing"];
    for (const wfId of complianceWfs) {
      scoredWorkflows.set(wfId, (scoredWorkflows.get(wfId) || 0) + 10);
    }
  }

  // Convert scored workflows to recommendations
  const recommendations: WorkflowRecommendation[] = [];
  for (const [wfId, score] of scoredWorkflows) {
    const workflow = workflows.find(w => w.id === wfId);
    if (workflow) {
      const implTime = estimateImplementationTime(wfId);
      recommendations.push({
        workflow,
        impactScore: score,
        estimatedAnnualSavings: calculateAnnualSavings(wfId, answers.companySize, answers.monthlyInvoiceVolume),
        implementationTime: implTime,
        priority: determinePriority(wfId, implTime),
      });
    }
  }

  // Sort by score descending, take top 10
  recommendations.sort((a, b) => b.impactScore - a.impactScore);
  const top10 = recommendations.slice(0, 10);

  // Categorize by priority
  const quickWins = top10.filter(w => w.priority === "quick-win");
  const mediumTerm = top10.filter(w => w.priority === "medium-term");
  const longTerm = top10.filter(w => w.priority === "long-term");

  // Calculate total annual savings (top 5)
  const annualSavings = top10.slice(0, 5).reduce((sum, w) => sum + w.estimatedAnnualSavings, 0);

  // Find recommended integrations
  const recommendedIntegrations = findMatchingIntegrations(answers.currentSoftware);

  return {
    answers,
    annualSavings,
    topWorkflows: top10.slice(0, 5),
    recommendedIntegrations,
    roadmap: { quickWins, mediumTerm, longTerm },
    industry: answers.industry,
    companySize: answers.companySize,
    departmentFocus: answers.department,
    reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  };
}

/**
 * Generate a text summary of the report for PDF inclusion
 */
export function generateReportText(report: AssessmentReport): string {
  const lines = [
    "AI AUTOMATION ASSESSMENT REPORT",
    `Generated: ${report.reportDate}`,
    "",
    `Industry: ${report.industry}`,
    `Company Size: ${report.companySize} employees`,
    `Department Focus: ${report.departmentFocus}`,
    "",
    "=== EXECUTIVE SUMMARY ===",
    `Estimated Annual Savings: $${report.annualSavings.toLocaleString()}`,
    `Top Automation Opportunities Identified: ${report.topWorkflows.length}`,
    "",
    "=== TOP 5 WORKFLOWS TO AUTOMATE ===",
    ...report.topWorkflows.map((w, i) =>
      `${i + 1}. ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr (${w.implementationTime})`
    ),
    "",
    "=== IMPLEMENTATION ROADMAP ===",
    "Quick Wins (2-4 weeks):",
    ...report.roadmap.quickWins.map(w => `  • ${w.workflow.name}`),
    "Medium-Term (4-8 weeks):",
    ...report.roadmap.mediumTerm.map(w => `  • ${w.workflow.name}`),
    "Long-Term (8-16 weeks):",
    ...report.roadmap.longTerm.map(w => `  • ${w.workflow.name}`),
    "",
    "=== RECOMMENDED INTEGRATIONS ===",
    ...report.recommendedIntegrations.map(i => `  • ${i.name} (${i.category})`),
    "",
    "---",
    "Report generated by Simpler Life 100 AI Automation Assessment",
    "Schedule a discovery call to get started: https://simplerlife100.ctonew.app/contact",
  ];

  return lines.join("\n");
}

/**
 * Generate an HTML version of the report for the page
 */
export function generateReportSummary(report: AssessmentReport): string {
  const totalWins = report.roadmap.quickWins.length + report.roadmap.mediumTerm.length + report.roadmap.longTerm.length;
  return `Found ${report.topWorkflows.length} automation opportunities that could save your team **$${report.annualSavings.toLocaleString()}/year**. We identified **${totalWins} workflows** across ${report.roadmap.quickWins.length} quick wins, ${report.roadmap.mediumTerm.length} medium-term, and ${report.roadmap.longTerm.length} long-term initiatives.`;
}
