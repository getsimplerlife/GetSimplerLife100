/**
 * AI Chat Engine — OpenAI-powered multi-turn chat with company context.
 *
 * Replaces the rule-based chatEngine.ts with real AI reasoning.
 * - Logged-in users get full company context (workflows, employees, activity, etc.)
 * - Guest users get product/company info context but no personal data
 * - Multi-turn conversation with session management
 * - Handles "how to use", company data Q&A, and general operations questions
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";

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
  isGuest?: boolean;
}

export interface ChatAction {
  type: "query" | "navigate" | "suggest" | "alert" | "workflow";
  label: string;
  payload?: Record<string, any>;
}

interface QueryContext {
  workflows: any[];
  employees: any[];
  activity: any[];
  approvals: any[];
  analytics: any;
  userEmail: string;
  integrationCount: number;
}

// ── System Prompts ──────────────────────────────────────────────────────

const GUEST_SYSTEM_PROMPT = `You are the Simpler Life 100 AI Operations Assistant. You help visitors understand the platform and answer questions about how our AI workforce can automate their operations.

About Simpler Life 100:
- We sell industry-specific AI Operations Teams — not generic AI agents.
- We serve 23 industry verticals: healthcare, manufacturing, logistics, retail, finance, construction, energy, automotive, aerospace, agriculture, e-commerce, hospitality, insurance, pharma, tech, telecom, media, professional services, real estate, education, legal, government, nonprofit.
- We have 18 AI agent types: document_intake, healthcare_intake, invoice_ledger, sales_outreach, hr_compliance, dispatch_logistics, audit_logger, voice_receptionist, support_agent, knowledge_assistant, inventory_management, contract_management, customer_success, project_management, procurement_vendor, it_operations, fp_and_a, marketing_social.
- Pricing starts at $750/mo for individual agent deployment, with implementation packages available.
- Our tools include: "Can We Automate This?" analyzer, AI Operations Advisor, AI Automation Assessment (11-question), and ROI Calculator — all free to use.
- The portal (requires signup) includes: Dashboard, Workflow Builder, AI Employees Marketplace, Document Upload/OCR, Integrations (180+ providers), Billing, Approvals, and more.

When answering:
- Be helpful, concise, and specific. Use markdown formatting.
- If a visitor asks about automating a specific process, describe which agent types would help.
- If they ask about pricing, be transparent.
- Suggest relevant free tools on the site when appropriate.
- If they ask about their own data/workflows, politely explain they need to sign up/login first.
- Keep responses friendly but professional.`;

function getAuthenticatedSystemPrompt(ctx: QueryContext): string {
  const activeEmployees = ctx.employees.filter((e: any) => e.status?.toLowerCase() === "active").length;
  const failedWorkflows = ctx.workflows.filter((w: any) => w.status?.toLowerCase() === "failed").length;
  const pendingApprovals = ctx.approvals.filter((a: any) => a.status === "pending" || a.status === "needs_review").length;
  const recentActivityCount = ctx.activity.length;

  const employeeSummaries = ctx.employees.length > 0
    ? ctx.employees.map((e: any) =>
        `- ${e.name || "Unnamed"} (${e.role || "Generalist"}): ${e.status || "unknown"}, current task: ${e.currentTask || "idle"}`
      ).join("\n")
    : "No AI employees deployed yet.";

  const workflowSummaries = ctx.workflows.length > 0
    ? ctx.workflows.map((w: any) =>
        `- ${w.name || "Unnamed"} (${w.id || "unknown"}): status=${w.status || "unknown"}, success=${w.successRate || "N/A"}%`
      ).join("\n")
    : "No workflows configured yet.";

  const recentActivities = ctx.activity.slice(0, 10).map((a: any) =>
    `- [${a.timestamp || "unknown time"}] ${a.action || a.event || "Activity"}: ${a.employee || a.agent || "System"} — ${a.status || "unknown"}`
  ).join("\n");

  const approvalSummaries = ctx.approvals.filter((a: any) => a.status === "pending" || a.status === "needs_review").slice(0, 5).map((a: any) =>
    `- ${a.title || a.name || "Approval"}: from ${a.employee || a.agent || "AI"} — priority: ${a.priority || "normal"}`
  ).join("\n");

  return `You are the Simpler Life 100 AI Operations Assistant. You have access to this user's live company data and can answer questions about their automations, AI workforce, and operations.

USER CONTEXT:
- Email: ${ctx.userEmail}
- Integration connections: ${ctx.integrationCount}

AI WORKFORCE (${ctx.employees.length} total, ${activeEmployees} active):
${employeeSummaries}

WORKFLOWS (${ctx.workflows.length} total, ${failedWorkflows} failed):
${workflowSummaries}

RECENT ACTIVITY (${recentActivityCount} events, showing latest 10):
${recentActivities}

PENDING APPROVALS (${pendingApprovals}):
${approvalSummaries || "None"}

When answering:
- Reference the user's actual data above. Be specific — mention workflow names, employee names, counts.
- If the user asks about something not in their data (e.g., "show my Salesforce contacts"), explain you can only see what's in their portal.
- Use markdown formatting for readability.
- Suggest actions they can take: navigate to specific portal pages, create workflows, deploy agents, review approvals.
- For "how to use" questions, give clear step-by-step instructions referencing the portal.
- Flag any issues you see: failed workflows, idle employees, pending approvals needing attention.
- Keep responses concise but thorough.
- If they ask to take action (run, stop, deploy, create), guide them to the right portal page — you can't execute actions directly.`;
}

// ── Session Management ───────────────────────────────────────────────────

const SESSION_SECTION = "ai_chat_sessions";

export async function getOrCreateSession(
  userId: string,
  sessionId?: string,
  isGuest: boolean = false
): Promise<ChatSession> {
  const section = isGuest ? "guest_chat_sessions" : SESSION_SECTION;

  if (sessionId) {
    try {
      const rows = await db.all(
        sql.raw(
          `SELECT data FROM portal_data WHERE id = '${sessionId}' AND user_id = '${userId}' AND section = '${section}'`
        )
      );
      if (rows.length > 0) {
        const row = rows[0] as { data: string };
        const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        if (!Array.isArray(parsed.messages)) {
          parsed.messages = [];
        }
        return { id: sessionId, userId, ...parsed };
      }
    } catch (err) {
      console.error("[aiChatEngine] Error loading session:", err);
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const systemPrompt = isGuest ? GUEST_SYSTEM_PROMPT : "placeholder";
  const session: Omit<ChatSession, "id" | "userId"> = {
    title: "New Chat",
    created_at: now,
    updated_at: now,
    messages: [
      {
        role: "system",
        content: systemPrompt,
        timestamp: now,
      },
    ],
  };

  try {
    await db.run(
      sql.raw(
        `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', '${section}', '${JSON.stringify(session).replace(/'/g, "''")}', ${Date.now()}, ${Date.now()})`
      )
    );
  } catch (err) {
    console.error("[aiChatEngine] Error creating session:", err);
  }

  return { id, userId, ...session };
}

export async function saveSession(
  userId: string,
  session: ChatSession,
  isGuest: boolean = false
): Promise<void> {
  const { id, userId: _, ...data } = session;
  data.updated_at = new Date().toISOString();
  const section = isGuest ? "guest_chat_sessions" : SESSION_SECTION;

  try {
    await db.run(
      sql.raw(
        `UPDATE portal_data SET data = '${JSON.stringify(data).replace(/'/g, "''")}', updated_at = ${Date.now()} WHERE id = '${id}' AND user_id = '${userId}' AND section = '${section}'`
      )
    );
  } catch (err) {
    console.error("[aiChatEngine] Error saving session:", err);
  }
}

export async function listSessions(userId: string, isGuest: boolean = false): Promise<Pick<ChatSession, "id" | "title" | "created_at" | "updated_at">[]> {
  const section = isGuest ? "guest_chat_sessions" : SESSION_SECTION;
  try {
    const rows = await db.all(
      sql.raw(
        `SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${userId}' AND section = '${section}' ORDER BY updated_at DESC LIMIT 50`
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
  } catch (err) {
    console.error("[aiChatEngine] Error listing sessions:", err);
    return [];
  }
}

export async function deleteSession(userId: string, sessionId: string, isGuest: boolean = false): Promise<void> {
  const section = isGuest ? "guest_chat_sessions" : SESSION_SECTION;
  try {
    await db.run(
      sql.raw(`DELETE FROM portal_data WHERE id = '${sessionId}' AND user_id = '${userId}' AND section = '${section}'`)
    );
  } catch (err) {
    console.error("[aiChatEngine] Error deleting session:", err);
  }
}

// ── Context Builder ──────────────────────────────────────────────────────

async function buildQueryContext(userId: string, userEmail: string): Promise<QueryContext> {
  const context: QueryContext = {
    workflows: [],
    employees: [],
    activity: [],
    approvals: [],
    analytics: {},
    userEmail,
    integrationCount: 0,
  };

  try {
    const wfRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'workflows' ORDER BY created_at`)
    );
    context.workflows = wfRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    const empRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'employees' ORDER BY created_at`)
    );
    context.employees = empRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    const actRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'activity' ORDER BY created_at DESC LIMIT 50`)
    );
    context.activity = actRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    const appRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'approvals' ORDER BY created_at`)
    );
    context.approvals = appRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    const anRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'analytics' ORDER BY created_at DESC LIMIT 1`)
    );
    if (anRows.length > 0) {
      const anRow = anRows[0] as { data: string };
      context.analytics = typeof anRow.data === "string" ? JSON.parse(anRow.data) : anRow.data;
    }

    const intRows = await db.all(
      sql.raw(`SELECT COUNT(*) as cnt FROM portal_data WHERE user_id = '${userId}' AND section = 'integrations'`)
    );
    if (intRows.length > 0) {
      context.integrationCount = (intRows[0] as any).cnt || 0;
    }
  } catch (err) {
    console.error("[aiChatEngine] Error building query context:", err);
  }

  return context;
}

// ── Action Extraction ────────────────────────────────────────────────────

function extractActions(reply: string): ChatAction[] {
  const actions: ChatAction[] = [];

  const navPatterns: { pattern: RegExp; path: string; label: string }[] = [
    { pattern: /workflow/i, path: "/portal/workflows", label: "View Workflows" },
    { pattern: /employee|agent|workforce/i, path: "/portal/employees", label: "View AI Employees" },
    { pattern: /approval/i, path: "/portal/approvals", label: "Review Approvals" },
    { pattern: /dashboard|analytics/i, path: "/portal/dashboard", label: "Open Dashboard" },
    { pattern: /integration/i, path: "/portal/integrations", label: "Manage Integrations" },
    { pattern: /billing|plan|subscription/i, path: "/portal/billing", label: "View Billing" },
    { pattern: /deploy|marketplace/i, path: "/portal/employees", label: "AI Employees Marketplace" },
    { pattern: /document|upload|ocr/i, path: "/portal/documents", label: "Upload Documents" },
    { pattern: /knowledge|rag|search/i, path: "/portal/knowledge-base", label: "Knowledge Base" },
  ];

  for (const np of navPatterns) {
    if (np.pattern.test(reply) && !actions.find(a => a.label === np.label)) {
      actions.push({ type: "navigate", label: np.label, payload: { path: np.path } });
      if (actions.length >= 3) break;
    }
  }

  return actions;
}

// ── Main AI Chat Handler ─────────────────────────────────────────────────

export async function processChatMessage(
  userId: string,
  userEmail: string,
  message: string,
  sessionId?: string,
  isGuest: boolean = false
): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      reply: "AI chat service is not configured. Please contact support to enable the AI-powered assistant.",
      sessionId,
    };
  }

  const session = await getOrCreateSession(userId, sessionId, isGuest);

  const userMsg: ChatMessage = {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(userMsg);

  let systemContent: string;
  if (isGuest) {
    systemContent = GUEST_SYSTEM_PROMPT;
  } else {
    const ctx = await buildQueryContext(userId, userEmail);
    systemContent = getAuthenticatedSystemPrompt(ctx);
  }

  const recentMessages = session.messages
    .filter(m => m.role !== "system")
    .slice(-20);

  const openaiMessages = [
    { role: "system", content: systemContent },
    ...recentMessages.map(m => ({ role: m.role, content: m.content })),
  ];

  if (session.title === "New Chat" && session.messages.filter(m => m.role === "user").length <= 2) {
    session.title = message.length > 60 ? message.slice(0, 57) + "..." : message;
  }

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[aiChatEngine] OpenAI error:", openaiRes.status, errText);
      const fallbackReply = generateFallbackReply(message, isGuest);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: fallbackReply,
        timestamp: new Date().toISOString(),
        metadata: { fallback: true, error: `OpenAI ${openaiRes.status}` },
      };
      session.messages.push(assistantMsg);
      await saveSession(userId, session, isGuest);
      return {
        reply: fallbackReply,
        sessionId: session.id,
        confidence: 0.3,
        isGuest,
      };
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";

    const actions = extractActions(reply);

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
      metadata: { model: "gpt-4o-mini" },
    };
    session.messages.push(assistantMsg);

    if (session.messages.length > 50) {
      const systemMsg = session.messages.find(m => m.role === "system");
      const otherMsgs = session.messages.filter(m => m.role !== "system").slice(-49);
      session.messages = systemMsg ? [systemMsg, ...otherMsgs] : otherMsgs;
    }

    await saveSession(userId, session, isGuest);

    return {
      reply,
      sessionId: session.id,
      actions: actions.length > 0 ? actions : undefined,
      confidence: 0.85,
      isGuest,
    };
  } catch (err: any) {
    console.error("[aiChatEngine] Fetch error:", err);
    const fallbackReply = generateFallbackReply(message, isGuest);
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: fallbackReply,
      timestamp: new Date().toISOString(),
      metadata: { fallback: true, error: err.message },
    };
    session.messages.push(assistantMsg);
    await saveSession(userId, session, isGuest);
    return {
      reply: fallbackReply,
      sessionId: session.id,
      confidence: 0.3,
      isGuest,
    };
  }
}

function generateFallbackReply(message: string, isGuest: boolean): string {
  const lower = message.toLowerCase();

  if (lower.includes("hello") || lower.includes("hi ") || lower.includes("hey")) {
    return isGuest
      ? "Hello! I'm the Simpler Life 100 AI Assistant. I can help you understand our platform, AI agent types, pricing, and how we can automate your operations. What would you like to know?"
      : "Hello! I'm your AI Operations Assistant. I can help you manage your AI workforce, monitor workflows, and answer questions about your operations. How can I help?";
  }

  if (lower.includes("workflow") || lower.includes("automation")) {
    return isGuest
      ? "Our platform offers 18 specialized AI agent types for automating different business processes. We have document processing, invoice management, sales outreach, HR compliance, dispatch logistics, and many more. Would you like to know about a specific type of automation?"
      : "You can manage your workflows from the Workflow Manager in the portal. To create a new workflow, use the Workflow Builder where you can describe your process in natural language and our AI will generate the automation for you.";
  }

  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) {
    return "Our AI agents start at $750/month per agent. We also offer implementation packages that deploy a team of agents for specific business functions. Visit the AI Employees Marketplace to see all available plans.";
  }

  if (lower.includes("employee") || lower.includes("agent") || lower.includes("ai team")) {
    return isGuest
      ? "We offer 18 types of AI employees spanning document processing, healthcare intake, invoice management, sales outreach, HR compliance, dispatch logistics, customer support, IT operations, financial planning, and more. Which area interests you?"
      : "You can view all your AI employees in the Employee Directory. Deploy new agents from the AI Employees Marketplace.";
  }

  if (lower.includes("integration") || lower.includes("connect")) {
    return isGuest
      ? "Simpler Life 100 integrates with over 180 business platforms including Salesforce, HubSpot, QuickBooks, Slack, Gmail, Shopify, Jira, and many more."
      : "Manage your integrations from the Integrations page. We support 180+ providers with OAuth connections.";
  }

  return isGuest
    ? "I'm here to help you learn about Simpler Life 100! Ask me about our AI agents, pricing, integrations, or how we can automate your specific business processes."
    : "I'm your AI Operations Assistant. I can help with workflows, employee status, activity monitoring, approvals, analytics, integrations, and more. What would you like help with?";
}
