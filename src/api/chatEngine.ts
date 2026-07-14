/**
 * AI Chat Engine — Real LLM Implementation
 *
 * Processes natural language queries using OpenAI. Falls back to
 * rule-based responses when the LLM is unavailable.
 *
 * Supports session management (conversation history stored in portal_data).
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";
import { chatResponse, analyzeAutomationPotential } from "../ai/llm";

// ── Types ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  sessionId?: string;
  actions?: ChatAction[];
  confidence?: number;
  needs_human_review?: boolean;
  tool_calls?: { name: string; args: Record<string, any> }[];
  tool_results?: { name: string; success: boolean; data?: any; error?: string }[];
}

export interface ChatAction {
  type: "query" | "navigate" | "suggest" | "alert" | "workflow";
  label: string;
  payload?: Record<string, any>;
}

// ── Session Management ───────────────────────────────────────────────────

export async function getOrCreateSession(
  userId: string,
  sessionId?: string
): Promise<ChatSession> {
  if (sessionId) {
    const rows = await db.all(
      sql.raw(
        `SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'chat_sessions' AND id = '${sessionId}'`
      )
    );
    if (rows.length > 0) {
      const row = rows[0] as { data: string };
      const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      return { id: sessionId, userId, ...parsed };
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const session: Omit<ChatSession, "id" | "userId"> = {
    title: "AI Chat",
    created_at: now,
    updated_at: now,
    messages: [
      {
        role: "system",
        content:
          "You are the Simpler Life 100 AI Operations Assistant. You help users manage their AI workforce, monitor workflows, analyze performance, and answer questions about their automated operations.",
        timestamp: now,
      },
    ],
  };

  await db.run(
    sql.raw(
      `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', 'chat_sessions', '${JSON.stringify(session).replace(/'/g, "''")}', ${Date.now()}, ${Date.now()})`
    )
  );

  return { id, userId, ...session };
}

export async function saveSession(userId: string, session: ChatSession): Promise<void> {
  const { id, userId: _, ...data } = session;
  data.updated_at = new Date().toISOString();
  await db.run(
    sql.raw(
      `UPDATE portal_data SET data = '${JSON.stringify(data).replace(/'/g, "''")}', updated_at = ${Date.now()} WHERE id = '${id}' AND user_id = '${userId}'`
    )
  );
}

export async function listSessions(userId: string): Promise<Pick<ChatSession, "id" | "title" | "created_at" | "updated_at">[]> {
  const rows = await db.all(
    sql.raw(
      `SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${userId}' AND section = 'chat_sessions' ORDER BY updated_at DESC LIMIT 50`
    )
  );
  return rows.map((r: any) => {
    const parsed = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    return {
      id: r.id,
      title: parsed.title || "AI Chat",
      created_at: parsed.created_at || r.created_at,
      updated_at: parsed.updated_at || r.updated_at,
    };
  });
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await db.run(
    sql.raw(`DELETE FROM portal_data WHERE id = '${sessionId}' AND user_id = '${userId}' AND section = 'chat_sessions'`)
  );
}

// ── Query Context Builder ────────────────────────────────────────────────

async function buildQueryContext(userId: string): Promise<string> {
  const parts: string[] = [];

  try {
    const wfRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'workflows' ORDER BY created_at`)
    );
    const workflows = wfRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
    if (workflows.length > 0) {
      parts.push(`Workflows (${workflows.length}):`);
      for (const w of workflows.slice(0, 5)) {
        parts.push(`  - ${w.name || "Unnamed"} (${w.status || "draft"})`);
      }
    }

    const empRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'employees' ORDER BY created_at`)
    );
    const employees = empRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
    if (employees.length > 0) {
      parts.push(`AI Employees (${employees.length}):`);
      for (const e of employees.slice(0, 5)) {
        parts.push(`  - ${e.name || "Unnamed"} (${e.status || "idle"})`);
      }
    }

    const actRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'activity' ORDER BY created_at DESC LIMIT 10`)
    );
    const activity = actRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
    if (activity.length > 0) {
      parts.push(`Recent Activity (${activity.length}):`);
      for (const a of activity.slice(0, 3)) {
        parts.push(`  - ${a.action || a.event || "Activity"}`);
      }
    }
  } catch (err) {
    console.error("[chatEngine] Error building query context:", err);
  }

  return parts.length > 0 ? parts.join("\n") : "No portal data found — the user hasn't set up workflows or employees yet.";
}

// ── Action Detection ─────────────────────────────────────────────────────

function detectActions(reply: string): ChatAction[] {
  const actions: ChatAction[] = [];
  const lower = reply.toLowerCase();

  if (lower.includes("workflow") || lower.includes("pipeline") || lower.includes("automation")) {
    actions.push({ type: "navigate", label: "View Workflows", payload: { path: "/portal/workflows" } });
  }
  if (lower.includes("employee") || lower.includes("agent") || lower.includes("deploy")) {
    actions.push({ type: "navigate", label: "View AI Employees", payload: { path: "/portal/employees" } });
  }
  if (lower.includes("money") || lower.includes("save") || lower.includes("cost") || lower.includes("roi")) {
    actions.push({ type: "navigate", label: "Analytics Dashboard", payload: { path: "/portal/analytics" } });
  }
  if (lower.includes("integrat") || lower.includes("connect") || lower.includes("salesforce") || lower.includes("hubspot")) {
    actions.push({ type: "navigate", label: "Open Integrations", payload: { path: "/portal/integrations" } });
  }

  return actions;
}

// ── Main Chat Handler ────────────────────────────────────────────────────

export async function processChatMessage(
  userId: string,
  userEmail: string,
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  const session = await getOrCreateSession(userId, sessionId);

  // Add user message to session
  session.messages.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Build context from user's portal data
  const contextData = await buildQueryContext(userId);

  let reply: string;

  try {
    // Try real LLM first
    const conversationHistory = session.messages
      .filter(m => m.role !== "system")
      .slice(-10)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    reply = await chatResponse(message, conversationHistory, contextData);
  } catch (err: any) {
    console.warn("[chatEngine] LLM call failed, using fallback:", err.message);

    // Fallback: rule-based responses
    const lower = message.toLowerCase();
    if (lower.includes("hello") || lower.includes("hi ") || lower.includes("hey")) {
      reply = `Hello! 👋 I'm your Simpler Life 100 AI Operations Assistant. I can help you with workflow monitoring, AI employee status, cost savings, and more. What would you like to explore?`;
    } else if (lower.includes("workflow") || lower.includes("automation")) {
      reply = `I can help you manage your workflows. You can view all workflows in the Workflow Manager, or build a new one using the Workflow Builder. What specific aspect would you like help with?`;
    } else if (lower.includes("employee") || lower.includes("agent")) {
      reply = `Your AI employees are managed through the Employees page. You can deploy new employees from the Marketplace and monitor their activity.`;
    } else {
      reply = `I'm here to help you get the most out of your AI Operations. You can ask me about workflows, employees, integrations, savings, or anything related to automation.`;
    }
  }

  // Detect actions from the reply
  const actions = detectActions(reply);

  // Add assistant response to session
  session.messages.push({
    role: "assistant",
    content: reply,
    timestamp: new Date().toISOString(),
    metadata: { actions },
  });

  // Save session (keep last 50 messages)
  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }
  await saveSession(userId, session);

  return { reply, sessionId: session.id, actions };
}