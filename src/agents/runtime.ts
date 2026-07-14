/**
 * AI Agent Execution Runtime — Core Engine
 *
 * Real implementation using LLM for task planning and reasoning.
 * Falls back to rule-based execution when LLM is unavailable.
 */

import { registry } from "./tools";
import {
  type AgentInstance,
  type AgentConfig,
  type ExecutionResult,
  type ExecutionStep,
  type ToolContext,
  getAgentInstance,
  saveAgentInstance,
  saveAgentExecution,
  listAgentExecutions,
} from "./schema";
import { db } from "../db/index";
import { planTask } from "../ai/llm";

// ── Registered Agent Types ─────────────────────────────────────────────────

const agentConfigs = new Map<string, AgentConfig>();

export function registerAgentType(config: AgentConfig): void {
  agentConfigs.set(config.type, config);
}

export function getAgentConfig(type: string): AgentConfig | undefined {
  return agentConfigs.get(type);
}

export function listAgentTypes(): AgentConfig[] {
  return Array.from(agentConfigs.values());
}

// ── Main Execution Function ────────────────────────────────────────────────

export interface RunAgentInput {
  agentId: string;
  userId: string;
  prompt: string;
  context?: Record<string, any>;
}

export async function runAgent(input: RunAgentInput): Promise<ExecutionResult> {
  const { agentId, userId, prompt, context } = input;

  const instance = await getAgentInstance(agentId, userId);
  if (!instance) {
    throw new Error(`Agent '${agentId}' not found for user '${userId}'`);
  }

  instance.status = "running";
  instance.updatedAt = Date.now();
  await saveAgentInstance(instance);

  const executionId = crypto.randomUUID();
  const execution: ExecutionResult = {
    id: executionId,
    agentId,
    userId,
    input: prompt,
    steps: [],
    finalOutput: null,
    status: "running",
    startedAt: Date.now(),
  };

  try {
    const config = agentConfigs.get(instance.agentType);
    if (!config) {
      throw new Error(`Agent type '${instance.agentType}' not registered`);
    }

    const toolCtx: ToolContext = { userId, agentId, executionId, db };

    // Step 1: Plan the task using LLM
    const planStep = await executeReasoningStep(
      executionId, userId, agentId, toolCtx,
      "Planning task execution",
      prompt,
      { agentName: instance.name, systemPrompt: config.systemPrompt },
    );
    execution.steps.push(planStep);

    if (planStep.status === "failed") {
      throw new Error(`Task planning failed: ${planStep.error}`);
    }

    // Step 2: Execute based on the task
    const taskLower = prompt.toLowerCase();

    if (taskLower.includes("extract") || taskLower.includes("document") || taskLower.includes("file") || taskLower.includes("upload") || taskLower.includes("read")) {
      await executeDocumentPath(execution, prompt, instance, config, toolCtx, context);
    } else if (taskLower.includes("classify") || taskLower.includes("analyze") || taskLower.includes("sentiment") || taskLower.includes("check")) {
      await executeAnalysisPath(execution, prompt, toolCtx, context);
    } else {
      await executeGeneralPath(execution, prompt, toolCtx, context);
    }

    // Step 3: Generate summary
    execution.status = "completed";
    execution.summary = generateSummary(execution.steps, prompt);
    execution.completedAt = Date.now();
  } catch (err: any) {
    execution.status = "failed";
    execution.error = err.message;
    execution.completedAt = Date.now();
    execution.summary = `Failed: ${err.message}`;
    try {
      await registry.execute("log_to_audit", {
        action: "agent_execution_failed",
        resource: agentId,
        details: { error: err.message, executionId, prompt: prompt.slice(0, 200) },
        severity: "error",
      }, { userId, agentId, executionId, db });
    } catch {}
  }

  await saveAgentExecution(execution);

  instance.status = execution.status === "completed" ? "idle" : "error";
  instance.updatedAt = Date.now();
  await saveAgentInstance(instance);

  return execution;
}

// ── Execution Paths ─────────────────────────────────────────────────────────

async function executeDocumentPath(
  execution: ExecutionResult,
  _prompt: string,
  instance: AgentInstance,
  _config: AgentConfig,
  toolCtx: ToolContext,
  context?: Record<string, any>,
): Promise<void> {
  const { userId, agentId } = toolCtx;
  const contextData = context || {};
  const filePath = contextData.filePath as string;
  const mimeType = contextData.mimeType as string;

  if (filePath) {
    const extractStep = await executeToolStep(
      execution.id, userId, agentId, toolCtx,
      "Extracting document content",
      "document_extract",
      { filePath, mimeType },
    );
    execution.steps.push(extractStep);

    if (extractStep.status === "completed" && extractStep.output?.data?.text) {
      const text = extractStep.output.data.text;

      const classifyStep = await executeToolStep(
        execution.id, userId, agentId, toolCtx,
        "Classifying document type",
        "classify_document",
        { text: text.slice(0, 3000), filename: contextData.filename || "" },
      );
      execution.steps.push(classifyStep);

      const infoStep = await executeToolStep(
        execution.id, userId, agentId, toolCtx,
        "Extracting key information",
        "extract_key_info",
        { text: text.slice(0, 5000) },
      );
      execution.steps.push(infoStep);

      const docType = classifyStep.output?.data?.documentType || "document";
      const storedData = {
        type: docType,
        filename: contextData.filename || "unknown",
        classification: classifyStep.output?.data,
        keyInfo: infoStep.output?.data,
        extractedText: text.slice(0, 500),
        processedAt: new Date().toISOString(),
        agentId: instance.name,
      };

      await executeToolStep(
        execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
        "Storing extracted document data",
        "data_api_post",
        { section: "documents", data: storedData },
      );

      await executeToolStep(
        execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
        "Notifying user",
        "notify_user",
        {
          title: `📄 Document Processed: ${docType}`,
          body: `Document "${contextData.filename || "unknown"}" classified as "${docType}".`,
          type: "success",
        },
      );

      execution.finalOutput = {
        documentType: docType,
        classification: classifyStep.output?.data,
        keyInfo: infoStep.output?.data,
        summary: `Processed document "${contextData.filename || "unknown"}": classified as ${docType}.`,
      };
    }
  } else {
    const searchStep = await executeToolStep(
      execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
      "Searching for documents",
      "data_api_get",
      { section: "documents", limit: 10 },
    );
    execution.steps.push(searchStep);
    execution.finalOutput = {
      message: "Searched for documents. Use a file path to process a specific document.",
      documents: searchStep.output?.data?.records || [],
    };
  }
}

async function executeAnalysisPath(
  execution: ExecutionResult,
  prompt: string,
  toolCtx: ToolContext,
  context?: Record<string, any>,
): Promise<void> {
  const contextData = context || {};
  const textToAnalyze = contextData.text || prompt;

  const sentimentStep = await executeToolStep(
    execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
    "Running sentiment analysis",
    "analyze_sentiment",
    { text: textToAnalyze },
  );
  execution.steps.push(sentimentStep);

  const infoStep = await executeToolStep(
    execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
    "Extracting key information",
    "extract_key_info",
    { text: textToAnalyze },
  );
  execution.steps.push(infoStep);

  execution.finalOutput = {
    sentiment: sentimentStep.output?.data,
    keyInfo: infoStep.output?.data,
    summary: `Analysis complete. Sentiment: ${sentimentStep.output?.data?.sentiment || "unknown"}.`,
  };
}

async function executeGeneralPath(
  execution: ExecutionResult,
  prompt: string,
  toolCtx: ToolContext,
  _context?: Record<string, any>,
): Promise<void> {
  const sections = ["workflows", "employees", "documents", "activity", "analytics", "approvals"];
  const relevantSections = sections.filter(s =>
    prompt.toLowerCase().includes(s.slice(0, -1)) || prompt.toLowerCase().includes(s)
  );

  if (relevantSections.length > 0) {
    for (const section of relevantSections.slice(0, 2)) {
      const step = await executeToolStep(
        execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
        `Reading ${section} data`,
        "data_api_get",
        { section, limit: 10 },
      );
      execution.steps.push(step);
    }
  }

  await executeToolStep(
    execution.id, toolCtx.userId, toolCtx.agentId, toolCtx,
    "Notifying user",
    "notify_user",
    { title: "✅ Task Complete", body: `Processed your request. Completed ${execution.steps.length} steps.`, type: "success" },
  );

  execution.finalOutput = {
    message: "Task completed.",
    stepsCompleted: execution.steps.length,
    sectionsQueried: relevantSections.length > 0 ? relevantSections : ["general"],
  };
}

// ── Step Execution ──────────────────────────────────────────────────────────

async function executeReasoningStep(
  _executionId: string,
  _userId: string,
  _agentId: string,
  _toolCtx: ToolContext,
  description: string,
  prompt: string,
  params: Record<string, any>,
): Promise<ExecutionStep> {
  const step: ExecutionStep = {
    id: crypto.randomUUID().slice(0, 8),
    description,
    tool: "reason",
    input: params,
    output: null,
    status: "running",
    startedAt: Date.now(),
  };

  try {
    // Try LLM reasoning
    const availableTools = registry.getAll().map(t => t.name);
    const taskPlan = await planTask(prompt, availableTools);

    step.output = {
      understood: true,
      plan: taskPlan,
      agentName: params.agentName,
      confidence: 0.9,
    };
    step.status = "completed";
    step.confidence = 0.9;
  } catch {
    // Fallback: rule-based reasoning
    const lower = prompt.toLowerCase();
    const intents: string[] = [];
    if (lower.includes("extract") || lower.includes("document") || lower.includes("file")) intents.push("document_processing");
    if (lower.includes("classify") || lower.includes("analyze") || lower.includes("check")) intents.push("analysis");
    if (lower.includes("search") || lower.includes("find") || lower.includes("list") || lower.includes("show")) intents.push("data_query");
    if (lower.includes("notify") || lower.includes("alert") || lower.includes("send")) intents.push("notification");

    step.output = {
      understood: true,
      intents: intents.length > 0 ? intents : ["general_query"],
      agentName: params.agentName,
      confidence: 0.85,
      plan: `Execute ${intents.length > 0 ? intents.join(", ") : "general"} operations.`,
    };
    step.status = "completed";
    step.confidence = 0.85;
  }

  step.completedAt = Date.now();
  return step;
}

async function executeToolStep(
  _executionId: string,
  _userId: string,
  _agentId: string,
  toolCtx: ToolContext,
  description: string,
  tool: string,
  params: Record<string, any>,
): Promise<ExecutionStep> {
  const step: ExecutionStep = {
    id: crypto.randomUUID().slice(0, 8),
    description,
    tool,
    input: params,
    output: null,
    status: "running",
    startedAt: Date.now(),
  };

  try {
    const result = await registry.execute(tool, params, toolCtx);
    step.output = result;
    step.status = result.success ? "completed" : "failed";
    if (!result.success) step.error = result.error;
    step.confidence = result.success ? 0.9 : 0.1;
  } catch (err: any) {
    step.status = "failed";
    step.error = err.message;
  }

  step.completedAt = Date.now();
  return step;
}

// ── Summary Generation ──────────────────────────────────────────────────────

function generateSummary(steps: ExecutionStep[], _prompt: string): string {
  const completed = steps.filter(s => s.status === "completed").length;
  const failed = steps.filter(s => s.status === "failed").length;
  let summary = `Completed ${completed} step(s)`;
  if (failed > 0) summary += ` with ${failed} failure(s)`;
  summary += `.`;
  const lastDataStep = [...steps].reverse().find(
    s => s.tool === "data_api_post" || s.tool === "classify_document" || s.tool === "analyze_sentiment"
  );
  if (lastDataStep?.output?.data) {
    const data = lastDataStep.output.data;
    if (data.documentType) summary += ` Document classified as: ${data.documentType}.`;
    if (data.sentiment) summary += ` Sentiment: ${data.sentiment}.`;
  }
  return summary;
}

// ── Agent Lifecycle ─────────────────────────────────────────────────────────

export async function deployAgent(
  userId: string,
  agentType: string,
  name?: string,
  config?: Record<string, any>,
): Promise<AgentInstance> {
  const agentConfig = agentConfigs.get(agentType);
  if (!agentConfig) {
    throw new Error(`Agent type '${agentType}' not registered`);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const instance: AgentInstance = {
    id,
    userId,
    agentType,
    name: name || agentConfig.name,
    description: agentConfig.description,
    status: "idle",
    config: config || {},
    createdAt: now,
    updatedAt: now,
  };

  await saveAgentInstance(instance);

  try {
    await registry.execute("log_to_audit", {
      action: "agent_deployed",
      resource: id,
      details: { agentType, name: instance.name },
      severity: "info",
    }, { userId, agentId: id, executionId: "", db });
  } catch {}

  return instance;
}

export async function getAgentStatus(agentId: string, userId: string): Promise<{
  instance: AgentInstance | null;
  lastExecutions: ExecutionResult[];
}> {
  const instance = await getAgentInstance(agentId, userId);
  const lastExecutions = instance ? await listAgentExecutions(agentId, userId, 5) : [];
  return { instance, lastExecutions };
}

export async function pauseAgent(agentId: string, userId: string): Promise<AgentInstance> {
  const instance = await getAgentInstance(agentId, userId);
  if (!instance) throw new Error(`Agent '${agentId}' not found`);
  instance.status = "paused";
  instance.updatedAt = Date.now();
  await saveAgentInstance(instance);
  return instance;
}

export async function resumeAgent(agentId: string, userId: string): Promise<AgentInstance> {
  const instance = await getAgentInstance(agentId, userId);
  if (!instance) throw new Error(`Agent '${agentId}' not found`);
  instance.status = "idle";
  instance.updatedAt = Date.now();
  await saveAgentInstance(instance);
  return instance;
}