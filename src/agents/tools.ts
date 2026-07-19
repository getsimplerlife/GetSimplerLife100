/**
 * AI Agent Execution Runtime — Tool System
 *
 * Provides a tool registry and built-in tools for agents to use.
 * Tools are registered with a name, description, parameter schema, and handler function.
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";
import type { ToolDefinition, ToolContext, ToolResult } from "./schema";
import { extractTextFromUpload, createNotification } from "./schema";

// Import tool modules — they self-register on import
import "./tools/hl7FhirTools";
import "./tools/terraformTools";
import "./tools/phpTools";

// ── Tool Registry ───────────────────────────────────────────────────────────

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
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

// Tool: data_api_get — read from portal_data by section
registry.register({
  name: "data_api_get",
  description: "Read data from the portal_data table by section. Returns all records for the current user in the specified section.",
  parameters: [
    { name: "section", type: "string", description: "The data section to read (e.g., 'workflows', 'employees', 'documents')", required: true },
    { name: "limit", type: "number", description: "Maximum number of records to return (default 50)", required: false },
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
  description: "Save or create a record in the portal_data table under a specified section.",
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
  description: "Extract text content from a file. Supports PDF, text, CSV, JSON, and other common formats.",
  parameters: [
    { name: "filePath", type: "string", description: "Absolute path to the file to extract text from", required: true },
    { name: "mimeType", type: "string", description: "MIME type of the file (e.g., 'text/plain', 'application/pdf')", required: false },
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

// Tool: notify_user — create a notification for a user
registry.register({
  name: "notify_user",
  description: "Create a notification for the current user in their notifications panel.",
  parameters: [
    { name: "title", type: "string", description: "Notification title", required: true },
    { name: "body", type: "string", description: "Notification body text", required: true },
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

// Tool: classify_document — classify document type based on content
registry.register({
  name: "classify_document",
  description: "Classify a document based on its text content into predefined types (invoice, contract, report, email, form, other).",
  parameters: [
    { name: "text", type: "string", description: "The text content to classify", required: true },
    { name: "filename", type: "string", description: "Original filename for additional context", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";
    const filename = (params.filename as string) || "";
    const lower = (text + " " + filename).toLowerCase();

    // Simple rule-based classification
    let docType = "other";
    let confidence = 0.5;

    const patterns: [string, string, number][] = [
      ["invoice", "invoice", 0.9],
      ["receipt", "invoice", 0.7],
      ["bill", "invoice", 0.7],
      ["payment", "invoice", 0.6],
      ["contract", "contract", 0.9],
      ["agreement", "contract", 0.8],
      ["terms", "contract", 0.7],
      ["lease", "contract", 0.7],
      ["report", "report", 0.8],
      ["summary", "report", 0.7],
      ["analysis", "report", 0.7],
      ["email", "email", 0.8],
      ["from:", "email", 0.7],
      ["subject:", "email", 0.7],
      ["application", "form", 0.7],
      ["registration", "form", 0.7],
      ["questionnaire", "form", 0.7],
    ];

    for (const [keyword, type, score] of patterns) {
      if (lower.includes(keyword) && score > confidence) {
        docType = type;
        confidence = score;
      }
    }

    return {
      success: true,
      data: {
        documentType: docType,
        confidence,
        extractableFields: getFieldsForType(docType),
      },
    };
  },
});

function getFieldsForType(type: string): string[] {
  const fields: Record<string, string[]> = {
    invoice: ["vendor_name", "invoice_number", "date", "total_amount", "tax_amount", "line_items", "due_date"],
    contract: ["title", "parties", "effective_date", "expiry_date", "jurisdiction", "clauses"],
    report: ["title", "date", "author", "sections", "summary", "conclusions"],
    email: ["sender", "recipient", "subject", "date", "body", "attachments"],
    form: ["form_type", "submitted_by", "date", "fields"],
    other: ["title", "content_type", "date"],
  };
  return fields[type] || fields.other;
}

// Tool: analyze_sentiment — basic sentiment analysis
registry.register({
  name: "analyze_sentiment",
  description: "Analyze the sentiment of a piece of text. Returns positive, negative, or neutral with confidence score.",
  parameters: [
    { name: "text", type: "string", description: "The text to analyze", required: true },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";
    const lower = text.toLowerCase();

    const positiveWords = ["good", "great", "excellent", "happy", "satisfied", "pleased", "thanks", "thank", "wonderful", "amazing", "love", "best", "outstanding"];
    const negativeWords = ["bad", "terrible", "awful", "angry", "unhappy", "dissatisfied", "poor", "worst", "hate", "horrible", "disappointed", "frustrated", "failed"];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lower.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) negativeCount++;
    }

    let sentiment: string;
    let confidence: number;

    if (positiveCount > negativeCount) {
      sentiment = "positive";
      confidence = 0.5 + (positiveCount / (positiveCount + negativeCount + 1)) * 0.5;
    } else if (negativeCount > positiveCount) {
      sentiment = "negative";
      confidence = 0.5 + (negativeCount / (positiveCount + negativeCount + 1)) * 0.5;
    } else {
      sentiment = "neutral";
      confidence = 0.6;
    }

    return { success: true, data: { sentiment, confidence: Math.round(confidence * 100) / 100, positiveWords: positiveCount, negativeWords: negativeCount } };
  },
});

// Tool: extract_key_info — extract key information from text
registry.register({
  name: "extract_key_info",
  description: "Extract key information fields from document text (dates, amounts, names, IDs, email addresses).",
  parameters: [
    { name: "text", type: "string", description: "The text to extract information from", required: true },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const text = (params.text as string) || "";
    const extracted: Record<string, any> = {};

    // Extract dollar amounts
    const amountRegex = /\$[\d,]+(?:\.\d{2})?/g;
    const amounts = text.match(amountRegex);
    if (amounts) extracted.amounts = amounts;

    // Extract email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex);
    if (emails) extracted.emails = emails;

    // Extract dates (various formats)
    const dateRegex = /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},?\s*\d{4}\b/g;
    const dates = text.match(dateRegex);
    if (dates) extracted.dates = dates;

    // Extract phone numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phones = text.match(phoneRegex);
    if (phones) extracted.phones = phones;

    // Extract invoice/PO numbers
    const idRegex = /(?:INV|PO|ORD|REF|#)\s*[-]?\s*[A-Z0-9]{4,}/gi;
    const ids = text.match(idRegex);
    if (ids) extracted.identifiers = ids;

    return { success: true, data: extracted };
  },
});

// Tool: search_files — search for files by name pattern
registry.register({
  name: "search_files",
  description: "Search for uploaded files by name or path pattern.",
  parameters: [
    { name: "pattern", type: "string", description: "Filename search pattern (glob-style, e.g. '*.pdf', 'invoice*')", required: true },
    { name: "limit", type: "number", description: "Maximum results to return", required: false },
  ],
  handler: async (params: Record<string, any>): Promise<ToolResult> => {
    const pattern = params.pattern as string;
    const limit = Math.min((params.limit as number) || 20, 100);
    if (!pattern) return { success: false, error: "pattern is required" };

    try {
      // Search in portal_data documents section
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

// Tool: log_to_audit — log an audit event
registry.register({
  name: "log_to_audit",
  description: "Log an event to the audit trail for compliance and monitoring.",
  parameters: [
    { name: "action", type: "string", description: "The action name to log", required: true },
    { name: "resource", type: "string", description: "The resource the action applies to", required: false },
    { name: "details", type: "object", description: "Additional details as key-value pairs", required: false },
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

export default registry;