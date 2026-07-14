/**
 * Simpler Life 100 — AI Service
 *
 * Real LLM integration using OpenAI's API via native fetch().
 * Powers all AI features: chat, workflow generation, document classification,
 * data extraction, and the agent runtime.
 *
 * Requires OPENAI_API_KEY environment variable.
 * Falls back to GPT-4o-mini (fast, cheap) for most operations.
 */

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY || "";
const BASE_URL = "https://api.openai.com/v1";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

// ── Core LLM Call ──────────────────────────────────────────────────────────

async function callLLM(
  messages: LLMChatMessage[],
  config: LLMConfig = {},
): Promise<string> {
  const apiKey = OPENAI_API_KEY();
  if (!apiKey) {
    console.warn("[LLM] No OPENAI_API_KEY set — returning fallback response");
    return "I'm currently in offline mode. Please set OPENAI_API_KEY to enable AI-powered responses.";
  }

  const model = config.model || "gpt-4o-mini";
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens || 1024;

  const body: Record<string, any> = {
    model,
    messages: config.system
      ? [{ role: "system", content: config.system }, ...messages]
      : messages,
    temperature,
    max_tokens: maxTokens,
  };

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (err: any) {
    console.error("[LLM] Error calling OpenAI:", err.message);
    throw err;
  }
}

// ── Structured JSON Extraction ─────────────────────────────────────────────

async function callLLMJSON<T>(
  messages: LLMChatMessage[],
  config: LLMConfig = {},
): Promise<T> {
  const apiKey = OPENAI_API_KEY();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const model = config.model || "gpt-4o-mini";
  const temperature = config.temperature ?? 0.3;
  const maxTokens = config.maxTokens || 2048;

  const body: Record<string, any> = {
    model,
    messages: config.system
      ? [{ role: "system", content: config.system }, ...messages]
      : messages,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim() || "{}";
    return JSON.parse(content) as T;
  } catch (err: any) {
    console.error("[LLM] JSON call error:", err.message);
    throw err;
  }
}

// ── Feature-Specific Functions ──────────────────────────────────────────────

/**
 * Chat / AI Advisor — conversational response with context
 */
export async function chatResponse(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  contextData?: string,
): Promise<string> {
  const systemPrompt = `You are the Simpler Life 100 AI Operations Assistant. You help users understand how AI automation can help their business.

You have access to their portal data (workflows, employees, activity, etc.) which is provided as context.

Be concise, helpful, and specific. Use the context data when available. If you don't know something, say so honestly.

Keep responses under 300 words unless the user asks for detail.`;

  const messages: LLMChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  if (contextData) {
    messages.push({
      role: "system",
      content: `Here is the user's current portal data for context:\n${contextData.slice(0, 3000)}`,
    });
  }

  // Add recent conversation history (last 10 messages)
  const recent = conversationHistory.slice(-10);
  for (const msg of recent) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current message
  messages.push({ role: "user", content: userMessage });

  return callLLM(messages, { temperature: 0.7, maxTokens: 600 });
}

/**
 * Workflow Generation — from natural language description
 */
export interface GeneratedWorkflow {
  name: string;
  description: string;
  category: string;
  steps: {
    id: string;
    type: "trigger" | "action" | "condition" | "output";
    name: string;
    description: string;
    config: Record<string, any>;
    depends_on?: string[];
  }[];
  tags: string[];
  estimated_savings: string;
}

export async function generateWorkflowLLM(description: string): Promise<GeneratedWorkflow> {
  const system = `You are a workflow automation engineer. Given a natural language description of a business process, generate a structured workflow definition.

Output valid JSON with this exact schema:
{
  "name": "string — short workflow name",
  "description": "string — one-line description",
  "category": "string — one of: Finance, CRM, Operations, HR, Communication, Analytics, Marketing, Compliance, General",
  "steps": [
    {
      "id": "step_1",
      "type": "trigger|action|condition|output",
      "name": "string",
      "description": "string",
      "config": {},
      "depends_on": ["step_X"]   // omit for trigger steps
    }
  ],
  "tags": ["string array"],
  "estimated_savings": "string like '$12,400/mo'"
}

Generate 3-8 steps. Be specific and practical. Use real business tool names where appropriate.`;

  const result = await callLLMJSON<GeneratedWorkflow>(
    [{ role: "user", content: description }],
    { system, temperature: 0.4, maxTokens: 2048 },
  );

  return result;
}

/**
 * Document Classification — classify document type from extracted text
 */
export interface DocumentClassification {
  documentType: "invoice" | "contract" | "report" | "email" | "form" | "receipt" | "purchase_order" | "other";
  confidence: number;
  subType?: string;
  extractableFields: string[];
}

export async function classifyDocumentLLM(text: string, filename?: string): Promise<DocumentClassification> {
  const system = `You are a document classification AI. Analyze the provided text and classify the document type.

Output valid JSON with this exact schema:
{
  "documentType": "invoice|contract|report|email|form|receipt|purchase_order|other",
  "confidence": 0.0-1.0,
  "subType": "optional more specific type",
  "extractableFields": ["field names that should be extracted from this document"]
}

Be accurate. If the text is too short or unclear, set confidence low and documentType to "other".`;

  const content = `Filename: ${filename || "unknown"}\n\nText content:\n${text.slice(0, 4000)}`;

  return callLLMJSON<DocumentClassification>(
    [{ role: "user", content }],
    { system, temperature: 0.2, maxTokens: 500 },
  );
}

/**
 * Key Information Extraction — extract structured data from document text
 */
export interface ExtractedInfo {
  amounts?: string[];
  dates?: string[];
  emails?: string[];
  phones?: string[];
  identifiers?: string[];
  vendor_name?: string;
  customer_name?: string;
  total_amount?: string;
  invoice_number?: string;
  po_number?: string;
  [key: string]: any;
}

export async function extractInfoLLM(text: string, docType?: string): Promise<ExtractedInfo> {
  const system = `You are a data extraction AI. Extract structured information from the provided document text.

Output valid JSON with as many of these fields as you can find:
{
  "amounts": ["list of dollar amounts found"],
  "dates": ["list of dates found"],
  "emails": ["list of email addresses"],
  "phones": ["list of phone numbers"],
  "identifiers": ["list of IDs, invoice numbers, PO numbers, etc."],
  "vendor_name": "string or null",
  "customer_name": "string or null",
  "total_amount": "string or null",
  "invoice_number": "string or null",
  "po_number": "string or null",
  "description": "brief summary of what this document is about"
}

Only include fields you actually found data for. Be precise.`;

  const content = `Document type: ${docType || "unknown"}\n\nText:\n${text.slice(0, 5000)}`;

  return callLLMJSON<ExtractedInfo>(
    [{ role: "user", content }],
    { system, temperature: 0.1, maxTokens: 1000 },
  );
}

/**
 * Sentiment Analysis
 */
export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  confidence: number;
  summary: string;
}

export async function analyzeSentimentLLM(text: string): Promise<SentimentResult> {
  const system = `Analyze the sentiment of the text. Output JSON: { "sentiment": "positive|negative|neutral|mixed", "confidence": 0.0-1.0, "summary": "one-line explanation" }`;

  return callLLMJSON<SentimentResult>(
    [{ role: "user", content: text.slice(0, 2000) }],
    { system, temperature: 0.2, maxTokens: 200 },
  );
}

/**
 * "Can We Automate This?" — analyze a workflow description and return automation plan
 */
export interface AutomationPlan {
  automatable: boolean;
  confidence: number;
  estimatedTimeSavings: string;
  recommendedApproach: string;
  steps: { name: string; description: string; complexity: "easy" | "medium" | "hard" }[];
  toolsNeeded: string[];
  fallback?: string;
}

export async function analyzeAutomationPotential(description: string): Promise<AutomationPlan> {
  const system = `You are an automation consultant. Given a description of a manual business process, analyze whether it can be automated and how.

Output JSON with this schema:
{
  "automatable": true/false,
  "confidence": 0.0-1.0,
  "estimatedTimeSavings": "percentage or hours saved, e.g. '85% reduction'",
  "recommendedApproach": "one-sentence recommendation",
  "steps": [{"name": "step name", "description": "what the automation does", "complexity": "easy|medium|hard"}],
  "toolsNeeded": ["list of tools or integrations required"],
  "fallback": "what to do if automation isn't feasible (optional)"
}

Be practical and honest. Not everything can be fully automated.`;

  return callLLMJSON<AutomationPlan>(
    [{ role: "user", content: description.slice(0, 2000) }],
    { system, temperature: 0.4, maxTokens: 1500 },
  );
}

/**
 * Task Planning — for the agent runtime (break a prompt into executable steps)
 */
export interface TaskPlan {
  steps: {
    id: string;
    tool: string;
    input: Record<string, any>;
    description: string;
  }[];
  summary: string;
}

export async function planTask(prompt: string, availableTools: string[]): Promise<TaskPlan> {
  const system = `You are a task planner for an AI agent runtime. Given a user's request and a list of available tools, break the request into a sequence of tool calls.

Available tools: ${availableTools.join(", ")}

Output JSON:
{
  "steps": [
    {"id": "step_1", "tool": "tool_name", "input": {"param": "value"}, "description": "what this step does"}
  ],
  "summary": "brief summary of the plan"
}

Only use tools from the available list. 1-5 steps max.`;

  return callLLMJSON<TaskPlan>(
    [{ role: "user", content: prompt.slice(0, 1500) }],
    { system, temperature: 0.3, maxTokens: 1500 },
  );
}

export default {
  chatResponse,
  generateWorkflowLLM,
  classifyDocumentLLM,
  extractInfoLLM,
  analyzeSentimentLLM,
  analyzeAutomationPotential,
  planTask,
};