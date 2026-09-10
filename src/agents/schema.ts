/**
 * AI Agent Execution Runtime — Data Model & Schema
 *
 * Defines the core types for agents, tools, execution state, and results.
 * All agent state is stored in the portal_data table (section: 'agents').
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";

// ── Agent Instance ──────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "paused" | "error";

export interface AgentInstance {
  id: string;
  userId: string;
  agentType: string;
  name: string;
  description: string;
  status: AgentStatus;
  config: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ── Execution State ─────────────────────────────────────────────────────────

export interface ExecutionStep {
  id: string;
  description: string;
  tool: string;
  input: Record<string, any>;
  output: any;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  error?: string;
  startedAt?: number;
  completedAt?: number;
  confidence?: number;
}

export interface ExecutionResult {
  id: string;
  agentId: string;
  userId: string;
  input: string;
  steps: ExecutionStep[];
  finalOutput: any;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  summary?: string;
  error?: string;
}

// ── Tool Definition ─────────────────────────────────────────────────────────

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: (params: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  agentId: string;
  executionId: string;
  db: typeof db;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ── Agent Configuration ─────────────────────────────────────────────────────

export interface AgentConfig {
  type: string;
  name: string;
  description: string;
  defaultTools: string[];
  systemPrompt: string;
  triggers: string[];
  supportedIndustries?: string[];
}

// ── Database Operations ─────────────────────────────────────────────────────

export async function getAgentInstance(agentId: string, userId: string): Promise<AgentInstance | null> {
  const rows = await db.all(
    sql.raw(`SELECT id, data, created_at, updated_at FROM portal_data WHERE id = '${agentId}' AND user_id = '${userId}' AND section = 'agents'`)
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { id: string; data: string; created_at: number; updated_at: number };
  const data = JSON.parse(row.data);
  return { id: row.id, ...data, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listAgentInstances(userId: string): Promise<AgentInstance[]> {
  const rows = await db.all(
    sql.raw(`SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${userId}' AND section = 'agents' ORDER BY created_at DESC`)
  );
  return (rows as any[]).map((row: any) => {
    const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    return { id: row.id, ...data, createdAt: row.created_at, updatedAt: row.updated_at };
  });
}

export async function saveAgentInstance(instance: AgentInstance): Promise<void> {
  const now = Date.now();
  const { id, userId, createdAt, ...data } = instance;
  // Check if exists
  const existing = await db.all(
    sql.raw(`SELECT id FROM portal_data WHERE id = '${id}' AND user_id = '${userId}' AND section = 'agents'`)
  );
  const payload = JSON.stringify(data).replace(/'/g, "''");
  if (existing.length > 0) {
    await db.run(sql.raw(`UPDATE portal_data SET data = '${payload}', updated_at = ${now} WHERE id = '${id}' AND user_id = '${userId}'`));
  } else {
    await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', 'agents', '${payload}', ${now}, ${now})`));
  }
}

export async function getAgentExecution(executionId: string, userId: string): Promise<ExecutionResult | null> {
  const rows = await db.all(
    sql.raw(`SELECT data FROM portal_data WHERE id = '${executionId}' AND user_id = '${userId}' AND section = 'agent_executions'`)
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { data: string };
  return JSON.parse(row.data);
}

export async function saveAgentExecution(execution: ExecutionResult): Promise<void> {
  const now = Date.now();
  const existing = await db.all(
    sql.raw(`SELECT id FROM portal_data WHERE id = '${execution.id}' AND user_id = '${execution.userId}' AND section = 'agent_executions'`)
  );
  const payload = JSON.stringify(execution).replace(/'/g, "''");
  if (existing.length > 0) {
    await db.run(sql.raw(`UPDATE portal_data SET data = '${payload}', updated_at = ${now} WHERE id = '${execution.id}' AND user_id = '${execution.userId}'`));
  } else {
    await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${execution.id}', '${execution.userId}', 'agent_executions', '${payload}', ${now}, ${now})`));
  }
}

export async function listAgentExecutions(agentId: string, userId: string, limit = 10): Promise<ExecutionResult[]> {
  const rows = await db.all(
    sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'agent_executions' ORDER BY created_at DESC LIMIT ${limit}`)
  );
  const all = (rows as any[]).map((r: any) => JSON.parse(typeof r.data === "string" ? r.data : r.data));
  return all.filter((e: ExecutionResult) => e.agentId === agentId).slice(0, limit);
}

// ── Notification Helper ─────────────────────────────────────────────────────

export async function createNotification(userId: string, title: string, body: string, type = "info"): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const notification = { title, body, type, read: false, createdAt: now };
  await db.run(
    sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', 'notifications', '${JSON.stringify(notification).replace(/'/g, "''")}', ${now}, ${now})`)
  );
}

// ── Text Extract Helper ─────────────────────────────────────────────────────

export async function extractTextFromUpload(filePath: string, mimeType: string): Promise<string> {
  try {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath);

    if (mimeType.includes("text") || mimeType.includes("json") || filePath.endsWith(".txt") || filePath.endsWith(".json") || filePath.endsWith(".csv") || filePath.endsWith(".md")) {
      return content.toString("utf-8");
    }

    if (filePath.endsWith(".pdf")) {
      // Try pdftotext if available, otherwise return metadata
      try {
        const proc = Bun.spawnSync(["pdftotext", filePath, "-"], { timeout: 10000 });
        if (proc.exitCode === 0) return proc.stdout.toString();
      } catch {}
      return `[PDF file: ${filePath}] Unable to extract text — pdftotext not available. File size: ${content.length} bytes`;
    }

    if (filePath.endsWith(".xlsx") || filePath.endsWith(".xls")) {
      return `[Excel file: ${filePath}] File size: ${content.length} bytes`;
    }

    // Fallback: return first 2000 chars
    const text = content.toString("utf-8");
    return text.slice(0, 2000);
  } catch (err: any) {
    return `[Error reading file: ${err.message}]`;
  }
}