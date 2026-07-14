/**
 * Natural Language Workflow Generator — Real LLM Implementation
 *
 * Uses OpenAI to generate structured workflow definitions from
 * natural language descriptions. Falls back to template matching
 * when the LLM is unavailable.
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";
import { generateWorkflowLLM } from "../ai/llm";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Template-based Fallback ────────────────────────────────────────────────
// (kept from original for when LLM is unavailable)

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
    description: "Automated invoice intake, OCR extraction, line-item matching, and payment routing.",
    keywords: ["invoice", "bill", "payment", "quickbooks", "finance", "vendor", "receipt", "po", "purchase order"],
    tags: ["finance", "invoice", "automation"],
    estimated_savings: "$12,400/mo",
    steps: [],
  },
  {
    name: "Customer Onboarding Flow",
    category: "CRM",
    description: "End-to-end customer onboarding with data verification, account creation, and welcome sequence.",
    keywords: ["onboard", "customer", "signup", "registration", "welcome", "crm", "hubspot", "salesforce"],
    tags: ["crm", "onboarding", "customer"],
    estimated_savings: "$8,200/mo",
    steps: [],
  },
  {
    name: "Document Compliance Review",
    category: "Compliance",
    description: "Automated document classification, metadata extraction, and compliance rule checking.",
    keywords: ["compliance", "document review", "audit", "regulation", "legal", "contract"],
    tags: ["compliance", "documents", "audit"],
    estimated_savings: "$15,600/mo",
    steps: [],
  },
  {
    name: "Inventory Management Sync",
    category: "Operations",
    description: "Real-time inventory tracking, low-stock alerts, and purchase order generation.",
    keywords: ["inventory", "stock", "warehouse", "supply", "reorder", "supplier", "logistics", "sku"],
    tags: ["operations", "inventory", "logistics"],
    estimated_savings: "$6,800/mo",
    steps: [],
  },
  {
    name: "Email & Communication Auto-Response",
    category: "Communication",
    description: "Intelligent email triage, intent classification, and auto-reply generation.",
    keywords: ["email", "communication", "slack", "support", "ticket", "inquiry", "auto-reply"],
    tags: ["communication", "email", "support"],
    estimated_savings: "$7,100/mo",
    steps: [],
  },
  {
    name: "Data Reconciliation & Reporting",
    category: "Analytics",
    description: "Automated data extraction from multiple sources, cross-referencing, and report generation.",
    keywords: ["reconciliation", "report", "data", "analytics", "dashboard", "cross-reference", "discrepancy"],
    tags: ["analytics", "data", "reporting"],
    estimated_savings: "$9,300/mo",
    steps: [],
  },
];

// ── Main Generator ─────────────────────────────────────────────────────────

export async function generateWorkflow(request: GenerateRequest): Promise<GenerateResponse> {
  const { description, userId } = request;

  if (!description || description.trim().length < 5) {
    return { success: false, error: "Please provide a more detailed workflow description (at least 5 characters)." };
  }

  let workflow: WorkflowDefinition;

  try {
    // Try LLM generation first
    const llmResult = await generateWorkflowLLM(description);

    workflow = {
      id: `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: llmResult.name,
      description: llmResult.description,
      category: llmResult.category,
      steps: llmResult.steps.map((s, i) => ({
        ...s,
        id: `step_${i + 1}`,
      })),
      estimated_savings: llmResult.estimated_savings,
      tags: llmResult.tags,
      status: "draft",
      successRate: "98",
      runtime: "< 30s",
      errors: 0,
      lastTriggered: "Not yet run",
      dependencies: llmResult.steps.length > 0
        ? llmResult.steps.map(s => s.name).join(" → ")
        : "None",
    };

    console.log(`[workflowGenerator] LLM generated workflow: "${workflow.name}" for: "${description.slice(0, 80)}..."`);
  } catch (err: any) {
    console.warn("[workflowGenerator] LLM failed, falling back to template matching:", err.message);

    // Fallback: template matching
    const lower = description.toLowerCase();
    const matched = WORKFLOW_TEMPLATES
      .map(t => ({
        template: t,
        score: t.keywords.filter(k => lower.includes(k)).length / t.keywords.length,
      }))
      .filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score);

    if (matched.length > 0) {
      const best = matched[0].template;
      workflow = {
        id: `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: best.name,
        description: description.length > 200 ? description.slice(0, 200) + "..." : description,
        category: best.category,
        steps: [
          { id: "step_1", type: "trigger", name: `${best.name} Trigger`, description: `Triggers when the process starts`, config: {} },
          { id: "step_2", type: "action", name: "Process Data", description: `Process the incoming data`, config: {}, depends_on: ["step_1"] },
          { id: "step_3", type: "condition", name: "Validation Check", description: `Validate the processed data`, config: {}, depends_on: ["step_2"] },
          { id: "step_4", type: "output", name: "Complete Action", description: `Execute the final action`, config: {}, depends_on: ["step_3"] },
        ],
        estimated_savings: best.estimated_savings,
        tags: [...best.tags],
        status: "draft",
        successRate: "98",
        runtime: "< 30s",
        errors: 0,
        lastTriggered: "Not yet run",
        dependencies: "Trigger → Process → Validate → Complete",
      };
    } else {
      // Generic fallback
      workflow = {
        id: `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Custom Automation Pipeline",
        description: description.length > 200 ? description.slice(0, 200) + "..." : description,
        category: "General",
        steps: [
          { id: "step_1", type: "trigger", name: "Event Trigger", description: "Fires when the triggering event occurs", config: { source: "manual_or_api" } },
          { id: "step_2", type: "action", name: "Process Data", description: "Process the incoming data", config: { processing: "ai_enhanced" }, depends_on: ["step_1"] },
          { id: "step_3", type: "condition", name: "Validation Check", description: "Validate the processed data", config: { rules: "business_logic" }, depends_on: ["step_2"] },
          { id: "step_4", type: "output", name: "Complete Action", description: "Execute the final action", config: { output: "system_update" }, depends_on: ["step_3"] },
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

export async function listTemplates() {
  return WORKFLOW_TEMPLATES.map(t => ({ name: t.name, category: t.category, description: t.description, tags: t.tags, estimated_savings: t.estimated_savings }));
}