/**
 * AI Agent Execution Runtime — Tool System
 *
 * Real implementation using LLM for classification, extraction, and sentiment.
 * Falls back to rule-based methods when LLM is unavailable.
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";
import type { ToolDefinition, ToolContext, ToolResult } from "./schema";
import { extractTextFromUpload, createNotification } from "./schema";
import { classifyDocumentLLM, extractInfoLLM, analyzeSentimentLLM } from "../ai/llm";

// ── Tool Registry ───────────────────────────────────────────────────────────

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, params: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }
    try {
      return await tool.handler(params, context);
    } catch (err: any) {
      return { success: false, error: `Tool '${name}' error: ${err.message}` };
    }
  }
}

export const registry = new ToolRegistry();

// ── Built-in Tools ──────────────────────────────────────────────────────────

// Tool: data_api_get — read from portal_data
registry.register({
  name: "data_api_get",
  description: "Read data from the portal_data table by section.",
  parameters: [
    { name: "section", type: "string", description: "The data section to read", required: true },
    { name: "limit", type: "number", description: "Maximum records to return", required: false },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const section = params.section as string;
    if (!section) return { success: false, error: "section parameter is required" };
    const limit = Math.min((params.limit as number) || 50, 200);
    try {
      const rows = await db.all(
        sql.raw(`SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${ctx.userId}' AND section = '${section}' ORDER BY created_at DESC LIMIT ${limit}`)
      );
      const data = (rows as any[]).map((r: any) => {
        const parsed = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        return { _id: r.id, ...parsed, _created_at: r.created_at, _updated_at: r.updated_at };
      });
      return { success: true, data: { section, count: data.length, records: data } };
    } catch (err: any) {
      return { success: false, error: `Failed to read section '${section}': ${err.message}` };
    }
  },
});

// Tool: data_api_post — write to portal_data
registry.register({
  name: "data_api_post",
  description: "Save or create a record in the portal_data table.",
  parameters: [
    { name: "section", type: "string", description: "The data section to write to", required: true },
    { name: "data", type: "object", description: "The data object to store", required: true },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const section = params.section as string;
    const data = params.data;
    if (!section) return { success: false, error: "section parameter is required" };
    if (!data) return { success: false, error: "data parameter is required" };
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      await db.run(sql.raw(
        `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${ctx.userId}', '${section}', '${JSON.stringify(data).replace(/'/g, "''")}', ${now}, ${now})`
      ));
      return { success: true, data: { id, section } };
    } catch (err: any) {
      return { success: false, error: `Failed to write to section '${section}': ${err.message}` };
    }
  },
});

// Tool: document_extract — extract text from uploaded documents
registry.register({
  name: "document_extract",
  description: "Extract text content from a file.",
  parameters: [
    { name: "filePath", type: "string", description: "Absolute path to the file", required: true },
    { name: "mimeType", type: "string", description: "MIME type of the file", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const filePath = params.filePath as string;
    const mimeType = (params.mimeType as string) || "application/octet-stream";
    if (!filePath) return { success: false, error: "filePath parameter is required" };
    try {
      const text = await extractTextFromUpload(filePath, mimeType);
      return { success: true, data: { text, charCount: text.length, filePath } };
    } catch (err: any) {
      return { success: false, error: `Failed to extract text: ${err.message}` };
    }
  },
});

// Tool: notify_user
registry.register({
  name: "notify_user",
  description: "Create a notification for the current user.",
  parameters: [
    { name: "title", type: "string", description: "Notification title", required: true },
    { name: "body", type: "string", description: "Notification body", required: true },
    { name: "type", type: "string", description: "Notification type: 'info', 'success', 'warning', 'error'", required: false },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const title = params.title as string;
    const body = params.body as string;
    const type = (params.type as string) || "info";
    if (!title) return { success: false, error: "title parameter is required" };
    try {
      await createNotification(ctx.userId, title, body, type);
      return { success: true, data: { title, type } };
    } catch (err: any) {
      return { success: false, error: `Failed to create notification: ${err.message}` };
    }
  },
});

// Tool: classify_document — LLM-powered document classification
registry.register({
  name: "classify_document",
  description: "Classify a document based on its text content using AI.",
  parameters: [
    { name: "text", type: "string", description: "The text content to classify", required: true },
    { name: "filename", type: "string", description: "Original filename for context", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";
    const filename = (params.filename as string) || "";
    const lower = (text + " " + filename).toLowerCase();

    try {
      // Try LLM classification
      const result = await classifyDocumentLLM(text, filename);
      return {
        success: true,
        data: {
          documentType: result.documentType,
          confidence: result.confidence,
          subType: result.subType,
          extractableFields: result.extractableFields,
        },
      };
    } catch {
      // Fallback: rule-based
      const patterns: [string, string, number][] = [
        ["invoice", "invoice", 0.9], ["receipt", "invoice", 0.7],
        ["bill", "invoice", 0.7], ["contract", "contract", 0.9],
        ["agreement", "contract", 0.8], ["report", "report", 0.8],
        ["email", "email", 0.8], ["from:", "email", 0.7],
        ["subject:", "email", 0.7], ["application", "form", 0.7],
        ["purchase order", "purchase_order", 0.9],
      ];
      let docType = "other";
      let confidence = 0.5;
      for (const [keyword, type, score] of patterns) {
        if (lower.includes(keyword) && score > confidence) {
          docType = type;
          confidence = score;
        }
      }
      return {
        success: true,
        data: { documentType: docType, confidence, extractableFields: getFieldsForType(docType) },
      };
    }
  },
});

function getFieldsForType(type: string): string[] {
  const fields: Record<string, string[]> = {
    invoice: ["vendor_name", "invoice_number", "date", "total_amount", "tax_amount", "line_items", "due_date"],
    contract: ["title", "parties", "effective_date", "expiry_date", "jurisdiction"],
    report: ["title", "date", "author", "sections", "summary"],
    email: ["sender", "recipient", "subject", "date", "body"],
    form: ["form_type", "submitted_by", "date", "fields"],
    purchase_order: ["po_number", "vendor", "date", "total", "items"],
    other: ["title", "content_type", "date"],
  };
  return fields[type] || fields.other;
}

// Tool: extract_key_info — LLM-powered extraction
registry.register({
  name: "extract_key_info",
  description: "Extract key information from document text using AI.",
  parameters: [
    { name: "text", type: "string", description: "The text to extract information from", required: true },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";

    try {
      // Try LLM extraction
      const result = await extractInfoLLM(text);
      return { success: true, data: result };
    } catch {
      // Fallback: regex-based
      const extracted: Record<string, any> = {};
      const amounts = text.match(/\$[\d,]+(?:\.\d{2})?/g);
      if (amounts) extracted.amounts = amounts;
      const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (emails) extracted.emails = emails;
      const dates = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},?\s*\d{4}\b/g);
      if (dates) extracted.dates = dates;
      const phones = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
      if (phones) extracted.phones = phones;
      const ids = text.match(/(?:INV|PO|ORD|REF|#)\s*[-]?\s*[A-Z0-9]{4,}/gi);
      if (ids) extracted.identifiers = ids;
      return { success: true, data: extracted };
    }
  },
});

// Tool: analyze_sentiment — LLM-powered sentiment analysis
registry.register({
  name: "analyze_sentiment",
  description: "Analyze the sentiment of a piece of text using AI.",
  parameters: [
    { name: "text", type: "string", description: "The text to analyze", required: true },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";

    try {
      const result = await analyzeSentimentLLM(text);
      return {
        success: true,
        data: {
          sentiment: result.sentiment,
          confidence: result.confidence,
          summary: result.summary,
        },
      };
    } catch {
      // Fallback: basic keyword counting
      const lower = text.toLowerCase();
      const positiveWords = ["good", "great", "excellent", "happy", "satisfied", "pleased", "thanks", "thank", "wonderful", "amazing", "love", "best", "outstanding"];
      const negativeWords = ["bad", "terrible", "awful", "angry", "unhappy", "dissatisfied", "poor", "worst", "hate", "horrible", "disappointed", "frustrated", "failed"];
      let positiveCount = 0, negativeCount = 0;
      for (const w of positiveWords) { if (lower.includes(w)) positiveCount++; }
      for (const w of negativeWords) { if (lower.includes(w)) negativeCount++; }
      let sentiment: string, confidence: number;
      if (positiveCount > negativeCount) { sentiment = "positive"; confidence = 0.5 + (positiveCount / (positiveCount + negativeCount + 1)) * 0.5; }
      else if (negativeCount > positiveCount) { sentiment = "negative"; confidence = 0.5 + (negativeCount / (positiveCount + negativeCount + 1)) * 0.5; }
      else { sentiment = "neutral"; confidence = 0.6; }
      return { success: true, data: { sentiment, confidence: Math.round(confidence * 100) / 100, positiveWords: positiveCount, negativeWords: negativeCount } };
    }
  },
});

// Tool: search_files — search for files by name
registry.register({
  name: "search_files",
  description: "Search for uploaded files by name or path pattern.",
  parameters: [
    { name: "pattern", type: "string", description: "Filename search pattern", required: true },
    { name: "limit", type: "number", description: "Maximum results", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const pattern = params.pattern as string;
    const limit = Math.min((params.limit as number) || 20, 100);
    if (!pattern) return { success: false, error: "pattern is required" };
    try {
      const rows = await db.all(
        sql.raw(`SELECT data FROM portal_data WHERE section = 'documents' ORDER BY created_at DESC LIMIT ${limit * 2}`)
      );
      const results = (rows as any[])
        .map((r: any) => JSON.parse(typeof r.data === "string" ? r.data : r.data))
        .filter((d: any) => {
          const name = (d.name || d.filename || d.title || "").toLowerCase();
          const p = pattern.toLowerCase().replace(/\*/g, "");
          return name.includes(p);
        })
        .slice(0, limit);
      return { success: true, data: { count: results.length, files: results } };
    } catch (err: any) {
      return { success: false, error: `Failed to search files: ${err.message}` };
    }
  },
});

// Tool: log_to_audit
registry.register({
  name: "log_to_audit",
  description: "Log an event to the audit trail.",
  parameters: [
    { name: "action", type: "string", description: "The action name", required: true },
    { name: "resource", type: "string", description: "The resource", required: false },
    { name: "details", type: "object", description: "Additional details", required: false },
    { name: "severity", type: "string", description: "Severity: 'info', 'warning', 'error', 'critical'", required: false },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const { logAuditEvent } = await import("../api/auditLogs");
    try {
      await logAuditEvent({
        userId: ctx.userId,
        action: params.action as string || "agent_action",
        resource: params.resource as string || ctx.agentId,
        details: (params.details as Record<string, any>) || {},
        status: "success",
        severity: (params.severity as any) || "info",
      });
      return { success: true, data: { logged: true } };
    } catch (err: any) {
      return { success: false, error: `Failed to log audit event: ${err.message}` };
    }
  },
});

// Tool: send_email — send an email notification
registry.register({
  name: "send_email",
  description: "Send an email to a specified recipient.",
  parameters: [
    { name: "to", type: "string", description: "Recipient email address", required: true },
    { name: "subject", type: "string", description: "Email subject line", required: true },
    { name: "body", type: "string", description: "Email body text", required: true },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const to = params.to as string;
    const subject = params.subject as string;
    const body = params.body as string;
    if (!to) return { success: false, error: "to parameter is required" };
    if (!subject) return { success: false, error: "subject parameter is required" };
    if (!body) return { success: false, error: "body parameter is required" };
    try {
      const { sendEmail } = await import("../integrations/email");
      await sendEmail({ to, subject, text: body });
      return { success: true, data: { to, subject, sent: true } };
    } catch (err: any) {
      return { success: false, error: `Failed to send email: ${err.message}` };
    }
  },
});

// Tool: search_web — search the web using Brave Search API
registry.register({
  name: "search_web",
  description: "Search the web for current information using a text query.",
  parameters: [
    { name: "query", type: "string", description: "The search query", required: true },
    { name: "limit", type: "number", description: "Maximum number of results", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const query = params.query as string;
    if (!query) return { success: false, error: "query parameter is required" };
    const limit = Math.min((params.limit as number) || 10, 20);
    const apiKey = process.env.BRAVE_API_KEY || "";

    if (!apiKey) {
      return {
        success: true,
        data: {
          query,
          results: "Web search is not configured. Set BRAVE_API_KEY to enable real web search.",
        },
      };
    }

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
      const response = await fetch(url, {
        headers: { "X-Subscription-Token": apiKey, "Accept": "application/json" },
      });
      if (!response.ok) {
        return { success: false, error: `Brave Search API returned ${response.status}` };
      }
      const data = await response.json() as any;
      const results = (data.web?.results || []).map((r: any, i: number) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description || ""}`
      ).join("\n\n");
      return { success: true, data: { query, count: results.length, results } };
    } catch (err: any) {
      return { success: false, error: `Search failed: ${err.message}` };
    }
  },
});

// Tool: search_knowledge_base
registry.register({
  name: "search_knowledge_base",
  description: "Search the knowledge base for answers to natural language questions or document context using semantic search.",
  parameters: [
    { name: "query", type: "string", description: "The natural language question or search query", required: true },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const query = params.query as string;
    if (!query) return { success: false, error: "query parameter is required" };
    try {
      const { queryKnowledgeBase } = await import("../ai/rag");
      const result = await queryKnowledgeBase(query, ctx.userId);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: `Failed to search knowledge base: ${err.message}` };
    }
  },
});

// Tool: read_ticket — read a support ticket by ID
registry.register({
  name: "read_ticket",
  description: "Read a support ticket by its ID to see the customer's issue, priority, and status.",
  parameters: [
    { name: "ticketId", type: "string", description: "The ticket ID to read", required: true },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const ticketId = params.ticketId as string;
    if (!ticketId) return { success: false, error: "ticketId parameter is required" };
    try {
      const rows = await db.all(
        sql.raw(`SELECT data, created_at, updated_at FROM portal_data WHERE id = '${ticketId}' AND section = 'tickets'`)
      );
      if (rows.length === 0) return { success: false, error: `Ticket '${ticketId}' not found` };
      const row = rows[0] as { data: string };
      return { success: true, data: { ticketId, ...JSON.parse(row.data) } };
    } catch (err: any) {
      return { success: false, error: `Failed to read ticket: ${err.message}` };
    }
  },
});

// Tool: reply_ticket — reply to a support ticket
registry.register({
  name: "reply_ticket",
  description: "Reply to a support ticket, storing the response and updating ticket status.",
  parameters: [
    { name: "ticketId", type: "string", description: "The ticket ID to reply to", required: true },
    { name: "response", type: "string", description: "The reply message text", required: true },
    { name: "status", type: "string", description: "New ticket status (open, pending, resolved, closed)", required: false },
  ],
  handler: async (params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    const ticketId = params.ticketId as string;
    const response = params.response as string;
    const status = (params.status as string) || "pending";
    if (!ticketId) return { success: false, error: "ticketId parameter is required" };
    if (!response) return { success: false, error: "response parameter is required" };
    try {
      // Fetch existing ticket
      const rows = await db.all(
        sql.raw(`SELECT data FROM portal_data WHERE id = '${ticketId}' AND section = 'tickets'`)
      );
      if (rows.length === 0) return { success: false, error: `Ticket '${ticketId}' not found` };
      const existing = JSON.parse((rows[0] as any).data);

      // Update ticket with reply
      const replies = existing.replies || [];
      replies.push({
        id: crypto.randomUUID().slice(0, 8),
        from: ctx.userId,
        message: response,
        timestamp: Date.now(),
      });

      const now = Date.now();
      const updatedData = { ...existing, replies, status, updatedAt: now };
      await db.run(sql.raw(
        `UPDATE portal_data SET data = '${JSON.stringify(updatedData).replace(/'/g, "''")}', updated_at = ${now} WHERE id = '${ticketId}'`
      ));

      return { success: true, data: { ticketId, replyCount: replies.length, status } };
    } catch (err: any) {
      return { success: false, error: `Failed to reply to ticket: ${err.message}` };
    }
  },
});

// Tool: get_dashboard_analytics — get real dashboard analytics metrics
registry.register({
  name: "get_dashboard_analytics",
  description: "Get real dashboard analytics metrics for the current user: tasks completed, hours saved, cost saved, active agents, error rate, uptime, and recent activity.",
  parameters: [],
  handler: async (_params: Record<string, any>, ctx: ToolContext): Promise<ToolResult> => {
    try {
      const { getDashboardMetrics } = await import("../api/analytics");
      const metrics = await getDashboardMetrics(ctx.userId);
      return { success: true, data: metrics };
    } catch (err: any) {
      return { success: false, error: `Failed to get dashboard analytics: ${err.message}` };
    }
  },
});

export default registry;