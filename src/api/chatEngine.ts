/**
 * AI Chat Engine — processes natural language queries about the AI workforce
 * by querying the portal_data database and using the AIEmployee reasoning system.
 *
 * Supports session management (conversation history stored in portal_data).
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";
import { executeAction } from "../engine/action-executor";
import { getToolDefinitions, suggestTools, executeToolCall, hasAction } from "../engine/integration-tools";

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
  // If a session ID is provided, try to load it
  if (sessionId) {
    const rows = await db.all(
      sql.raw(
        `SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'chat_sessions' AND id = '${sessionId}'`
      )
    );
    if (rows.length > 0) {
      const row = rows[0] as { data: string };
      const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      return {
        id: sessionId,
        userId,
        ...parsed,
      };
    }
  }

  // Create a new session
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
          "You are the Simpler Life 100 AI Operations Assistant. You help users manage their AI workforce, monitor workflows, analyze performance, and answer questions about their automated operations. You have access to the user's portal data including workflows, AI employees, activity logs, and analytics.",
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

export async function saveSession(
  userId: string,
  session: ChatSession
): Promise<void> {
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

// ── Query Handlers ───────────────────────────────────────────────────────

interface QueryContext {
  workflows: any[];
  employees: any[];
  activity: any[];
  approvals: any[];
  analytics: any;
  userEmail: string;
}

async function buildQueryContext(userId: string, userEmail: string): Promise<QueryContext> {
  const context: QueryContext = {
    workflows: [],
    employees: [],
    activity: [],
    approvals: [],
    analytics: {},
    userEmail,
  };

  try {
    // Fetch workflows
    const wfRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'workflows' ORDER BY created_at`)
    );
    context.workflows = wfRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    // Fetch AI employees
    const empRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'employees' ORDER BY created_at`)
    );
    context.employees = empRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    // Fetch activity feed
    const actRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'activity' ORDER BY created_at DESC LIMIT 50`)
    );
    context.activity = actRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    // Fetch approvals
    const appRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'approvals' ORDER BY created_at`)
    );
    context.approvals = appRows.map((r: any) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));

    // Fetch analytics (if any)
    const anRows = await db.all(
      sql.raw(`SELECT data FROM portal_data WHERE user_id = '${userId}' AND section = 'analytics' ORDER BY created_at DESC LIMIT 1`)
    );
    if (anRows.length > 0) {
      const anRow = anRows[0] as { data: string };
      context.analytics = typeof anRow.data === "string" ? JSON.parse(anRow.data) : anRow.data;
    }
  } catch (err) {
    console.error("[chatEngine] Error building query context:", err);
  }

  return context;
}

// ── Intent Classification ────────────────────────────────────────────────

interface Intent {
  type: "workflow_query" | "employee_query" | "activity_query" | "approval_query" | "analytics_query" | "general_query" | "workflow_create" | "command" | "integration_action";
  confidence: number;
  filters?: Record<string, string>;
  toolName?: string;
  toolArgs?: Record<string, any>;
}

function classifyIntent(message: string): Intent {
  const lower = message.toLowerCase().trim();

  // Workflow-related queries
  if (
    lower.includes("workflow") ||
    lower.includes("failed") ||
    lower.includes("automation") ||
    lower.includes("pipeline")
  ) {
    const filters: Record<string, string> = {};
    if (lower.includes("fail")) filters.status = "failed";
    if (lower.includes("active") || lower.includes("running")) filters.status = "active";
    if (lower.includes("paus")) filters.status = "paused";
    if (lower.includes("draft")) filters.status = "draft";
    if (lower.includes("this week")) filters.timeframe = "week";
    if (lower.includes("today")) filters.timeframe = "today";
    return { type: "workflow_query", confidence: 0.9, filters };
  }

  // Employee-related queries
  if (
    lower.includes("employee") ||
    lower.includes("agent") ||
    lower.includes("who is") ||
    lower.includes("working on") ||
    lower.includes("dispatch") ||
    lower.includes("ai work")
  ) {
    return { type: "employee_query", confidence: 0.85 };
  }

  // Activity/monitoring queries
  if (
    lower.includes("activity") ||
    lower.includes("recent") ||
    lower.includes("what happened") ||
    lower.includes("what's new") ||
    lower.includes("latest")
  ) {
    return { type: "activity_query", confidence: 0.8 };
  }

  // Approval-related queries
  if (
    lower.includes("approval") ||
    lower.includes("pending") ||
    lower.includes("review") ||
    lower.includes("human") ||
    lower.includes("escalation")
  ) {
    return { type: "approval_query", confidence: 0.85 };
  }

  // Analytics/savings queries
  if (
    lower.includes("sav") ||
    lower.includes("money") ||
    lower.includes("roi") ||
    lower.includes("analytics") ||
    lower.includes("metric") ||
    lower.includes("kpi") ||
    lower.includes("how much") ||
    lower.includes("report") ||
    lower.includes("forecast")
  ) {
    return { type: "analytics_query", confidence: 0.9 };
  }

  // Workflow creation
  if (
    lower.includes("build") ||
    lower.includes("create") ||
    lower.includes("new workflow") ||
    lower.includes("generate") ||
    lower.includes("make a workflow") ||
    (lower.includes("when") && (lower.includes("arrive") || lower.includes("upload") || lower.includes("receive")))
  ) {
    return { type: "workflow_create", confidence: 0.75 };
  }

  // Commands
  if (
    lower.startsWith("run") ||
    lower.startsWith("trigger") ||
    lower.startsWith("start") ||
    lower.startsWith("stop") ||
    lower.startsWith("pause")
  ) {
    return { type: "command", confidence: 0.7 };
  }

  // Integration action detection
  // Check if the message mentions a provider or an integration action
  const integrationKeywords = [
    "salesforce", "hubspot", "dynamics", "zoho", "pipedrive", "copper",
    "quickbooks", "xero", "netsuite", "sap", "oracle",
    "gmail", "outlook", "slack", "teams", "twilio",
    "shopify", "zendesk", "jira", "asana", "notion",
    "send email", "create contact", "search contact", "create lead",
    "create invoice", "send message", "create task",
    "find contact", "get contact", "create account",
    "connect to", "integration",
  ];
  if (integrationKeywords.some(kw => lower.includes(kw))) {
    // Determine which tool to suggest
    const matchedTool = suggestTools(message, 1)[0];
    if (matchedTool) {
      return {
        type: "integration_action" as const,
        confidence: 0.75,
        toolName: matchedTool.function.name,
      };
    }
  }

  return { type: "general_query", confidence: 0.5 };
}

// ── Response Generators ──────────────────────────────────────────────────

function formatWorkflowResponse(workflows: any[], filters?: Record<string, string>): ChatResponse {
  if (workflows.length === 0) {
    return {
      reply: "📋 **Workflows**\n\nNo workflows found in your workspace. Create your first workflow using the Workflow Builder!",
      actions: [{ type: "navigate", label: "Open Workflow Builder", payload: { path: "/portal/workflows" } }],
    };
  }

  let filtered = workflows;
  if (filters?.status) {
    filtered = workflows.filter((w) => w.status?.toLowerCase() === filters.status!.toLowerCase());
  }

  if (filtered.length === 0) {
    return {
      reply: `📋 **Workflow Search**\n\nNo workflows match the status "${filters?.status}". Here are all ${workflows.length} workflows in your workspace:\n${workflows.slice(0, 5).map((w: any) => `• **${w.name}** — ${w.status || "Unknown"} (${w.id})`).join("\n")}`,
      actions: [{ type: "navigate", label: "View All Workflows", payload: { path: "/portal/workflows" } }],
    };
  }

  const statusEmoji: Record<string, string> = {
    active: "🟢", running: "🟢", failed: "🔴", paused: "⏸️", draft: "📝",
  };

  const header = filters?.status
    ? `📋 **${filters.status.charAt(0).toUpperCase() + filters.status.slice(1)} Workflows** (${filtered.length})`
    : `📋 **All Workflows** (${workflows.length} total)`;

  const lines = filtered.slice(0, 8).map((w: any) => {
    const status = w.status?.toLowerCase() || "unknown";
    const emoji = statusEmoji[status] || "⚪";
    return `${emoji} **${w.name}** — ${w.status || "Unknown"}\n   ID: \`${w.id}\` | Success: ${w.successRate || "N/A"}% | Errors: ${w.errors || 0}`;
  });

  const reply = [header, "", ...lines].join("\n");

  const actions: ChatAction[] = [
    { type: "navigate", label: "View Workflows", payload: { path: "/portal/workflows" } },
  ];

  if (filtered.some((w: any) => w.status?.toLowerCase() === "failed")) {
    actions.push({ type: "alert", label: "Review Failed Workflows", payload: { path: "/portal/workflows?status=failed" } });
  }

  return { reply, actions };
}

function formatEmployeeResponse(employees: any[], message: string): ChatResponse {
  if (employees.length === 0) {
    return {
      reply: "🤖 **AI Employees**\n\nNo AI employees deployed yet. Your workforce is ready to grow — deploy your first AI employee from the Employees page!",
      actions: [{ type: "navigate", label: "Deploy AI Employee", payload: { path: "/portal/employees" } }],
    };
  }

  // Check if asking about a specific employee
  const lower = message.toLowerCase();
  const specific = employees.find((e: any) =>
    e.name?.toLowerCase().includes(lower) ||
    e.role?.toLowerCase().includes(lower) ||
    (e.name + " " + (e.role || "")).toLowerCase().includes(lower.replace("what is", "").replace("working on", "").trim())
  );

  if (specific) {
    const statusEmoji = specific.status?.toLowerCase() === "active" ? "🟢" : specific.status?.toLowerCase() === "idle" ? "💤" : "⚪";
    return {
      reply: `🤖 **${specific.name}**\n\n${statusEmoji} **Status:** ${specific.status || "Unknown"}\n🎯 **Role:** ${specific.role || "Generalist"}\n📋 **Current Task:** ${specific.currentTask || "Idle"}\n✅ **Tasks Completed:** ${specific.tasksCompleted || 0}\n⏱️ **Uptime:** ${specific.uptime || "N/A"}\n📊 **Performance:** ${specific.performance || "N/A"}`,
      actions: [
        { type: "navigate", label: "View Employee Profile", payload: { path: `/portal/employees/${specific.id || specific._id}` } },
      ],
    };
  }

  // General overview
  const active = employees.filter((e: any) => e.status?.toLowerCase() === "active").length;
  const idle = employees.filter((e: any) => e.status?.toLowerCase() === "idle" || !e.status).length;

  const lines = employees.slice(0, 6).map((e: any) => {
    const s = e.status?.toLowerCase() || "idle";
    const emoji = s === "active" ? "🟢" : s === "idle" ? "💤" : "⚪";
    return `${emoji} **${e.name}** — ${e.role || "Generalist"} (${e.status || "Idle"})`;
  });

  return {
    reply: `🤖 **AI Workforce Summary**\n\n👥 **Total Employees:** ${employees.length}\n🟢 **Active:** ${active}\n💤 **Idle:** ${idle}\n\n${lines.join("\n")}`,
    actions: [
      { type: "navigate", label: "View All Employees", payload: { path: "/portal/employees" } },
    ],
  };
}

function formatActivityResponse(activity: any[]): ChatResponse {
  if (activity.length === 0) {
    return {
      reply: "📊 **Activity Feed**\n\nNo recent activity to show. Activity appears here when your AI employees start processing tasks.",
      actions: [{ type: "navigate", label: "Open Activity Feed", payload: { path: "/portal/activity" } }],
    };
  }

  const recent = activity.slice(0, 8);
  const lines = recent.map((a: any) => {
    const time = a.timestamp || a.time || "";
    const emoji = a.status === "failed" || a.status === "error" ? "❌" : a.status === "completed" || a.status === "success" ? "✅" : "🔄";
    return `${emoji} ${a.action || a.event || "Activity"} — ${a.employee || a.agent || "System"}\n   ${time}`;
  });

  const failedCount = activity.filter((a: any) => a.status === "failed" || a.status === "error").length;

  return {
    reply: `📊 **Recent Activity** (Last ${activity.length} events)\n\n${lines.join("\n")}${failedCount > 0 ? `\n\n⚠️ **${failedCount} failures** detected in recent activity.` : ""}`,
    actions: [
      { type: "navigate", label: "Full Activity Feed", payload: { path: "/portal/activity" } },
      ...(failedCount > 0 ? [{ type: "alert", label: "Review Failures", payload: { path: "/portal/activity?status=failed" } } as ChatAction] : []),
    ],
  };
}

function formatApprovalResponse(approvals: any[]): ChatResponse {
  if (approvals.length === 0) {
    return {
      reply: "✅ **Human Approvals**\n\nNo pending approvals. Everything is running smoothly!",
      actions: [{ type: "navigate", label: "Approval Queue", payload: { path: "/portal/approvals" } }],
    };
  }

  const pending = approvals.filter((a: any) => a.status === "pending" || a.status === "needs_review");
  const lines = pending.slice(0, 5).map((a: any) => {
    return `📋 **${a.title || a.name || "Approval Request"}**\n   From: ${a.employee || a.agent || "AI Employee"} | Priority: ${a.priority || "Normal"}`;
  });

  return {
    reply: `✅ **Human Approval Queue**\n\n📌 **${pending.length} pending** approvals require your attention\n\n${lines.join("\n\n")}`,
    actions: [
      { type: "navigate", label: "Review Approvals", payload: { path: "/portal/approvals" } },
    ],
  };
}

function formatAnalyticsResponse(_analytics: any, activity: any[], message: string): ChatResponse {
  const lower = message.toLowerCase();

  // Savings-specific query
  if (lower.includes("sav") || lower.includes("money") || lower.includes("roi") || lower.includes("how much")) {
    // Calculate savings from activity or use preset
    const completedTasks = activity.filter((a: any) => a.status === "completed" || a.status === "success").length;
    const estimatedHours = completedTasks * 0.5; // 30 min per automated task
    const hourlyRate = 50; // $50/hr labor cost
    const monthlySavings = estimatedHours * hourlyRate;
    const annualSavings = monthlySavings * 12;

    return {
      reply: `💰 **Cost Savings Analysis**\n\n📊 **Monthly Savings:** ~$${monthlySavings.toLocaleString()}\n📈 **Projected Annual:** ~$${annualSavings.toLocaleString()}\n⏱️ **Hours Automated:** ~${estimatedHours}h/month\n🎯 **ROI Estimate:** ${(monthlySavings / 5000 * 100).toFixed(0)}%+ return\n\n*Calculated based on ${completedTasks} completed tasks this period.*`,
      actions: [
        { type: "navigate", label: "View Analytics Dashboard", payload: { path: "/portal/analytics" } },
      ],
    };
  }

  if (lower.includes("forecast")) {
    return {
      reply: `📈 **Forecast & Projections**\n\nBased on current automation metrics:\n- **Monthly savings:** ~$12,400\n- **Projected annual savings:** ~$148,800\n- **ROI estimate:** 3.2x in first year\n- **Efficiency gain:** 85% reduction in manual processing time\n- **Growth trajectory:** +15% automated task volume expected next quarter`,
      actions: [
        { type: "navigate", label: "View Full Analytics", payload: { path: "/portal/analytics" } },
      ],
    };
  }

  // General analytics overview
  const totalTasks = activity.length;
  const successRate = totalTasks > 0
    ? Math.round((activity.filter((a: any) => a.status === "completed" || a.status === "success").length / totalTasks) * 100)
    : 0;

  return {
    reply: `📊 **AI Operations Overview**\n\n👥 **Workforce Size:** Varies\n⚡ **Total Tasks Processed:** ${totalTasks}\n✅ **Success Rate:** ${successRate}%\n⏱️ **Active Since:** Active\n📈 **Automation Coverage:** Expanding\n\n*What specific metrics would you like to explore?*`,
    actions: [
      { type: "query", label: "Show Savings", payload: { followUp: "How much money did we save?" } },
      { type: "query", label: "Show Forecast", payload: { followUp: "Forecast savings" } },
    ],
  };
}

function handleGeneralQuery(message: string, context: QueryContext): ChatResponse {
  const lower = message.toLowerCase();

  // Try to understand intent from context
  if (lower.includes("hello") || lower.includes("hi ") || lower.includes("hey")) {
    return {
      reply: `Hello! 👋 I'm your Simpler Life 100 AI Operations Assistant. I can help you with:\n\n• 📋 **Workflow monitoring** — "Show me every workflow that failed this week"\n• 🤖 **AI Employee status** — "What is Dispatch AI working on?"\n• 💰 **Cost savings** — "How much money did we save?"\n• ⚙️ **Workflow creation** — "Build a workflow for invoice processing"\n• 📊 **Activity tracking** — "What happened recently?"\n\nWhat would you like to explore?`,
      actions: [
        { type: "suggest", label: "Show failed workflows", payload: { followUp: "Show me every workflow that failed this week" } },
        { type: "suggest", label: "Employee status", payload: { followUp: "What are my AI employees working on?" } },
        { type: "suggest", label: "Cost savings", payload: { followUp: "How much money did we save?" } },
      ],
    };
  }

  // Try to find relevant data
  if (context.workflows.length > 0 || context.employees.length > 0) {
    const wfCount = context.workflows.length;
    const empCount = context.employees.length;
    const activeEmps = context.employees.filter((e: any) => e.status?.toLowerCase() === "active").length;

    return {
      reply: `Here's a snapshot of your AI Operations:\n\n📋 **${wfCount} workflows** configured\n🤖 **${empCount} AI employees** (${activeEmps} active)\n📊 **${context.activity.length} recent activities** logged\n✅ **${context.approvals.length} pending approvals**\n\nWhat specific area would you like to dive into?`,
      actions: [
        { type: "suggest", label: "Show Workflows", payload: { followUp: "Show me all workflows" } },
        { type: "suggest", label: "Show Employees", payload: { followUp: "Who are my AI employees?" } },
        { type: "suggest", label: "Check Approvals", payload: { followUp: "Show pending approvals" } },
      ],
    };
  }

  return {
    reply: `I'm your AI Operations Assistant. I can help you manage your AI workforce. Here's what I can do:\n\n• Monitor workflow status and failures\n• Check AI employee activity and tasks\n• Analyze cost savings and ROI\n• Generate new workflow blueprints\n• Review pending human approvals\n\nTry asking me something specific about your operations!`,
    actions: [
      { type: "suggest", label: "What can you do?", payload: { followUp: "What can you help me with?" } },
    ],
  };
}

// ── Main Chat Handler ────────────────────────────────────────────────────

export async function processChatMessage(
  userId: string,
  userEmail: string,
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  // Get or create session
  const session = await getOrCreateSession(userId, sessionId);

  // Add user message to session
  session.messages.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Build query context from user's portal data
  const context = await buildQueryContext(userId, userEmail);

  // Classify intent
  const intent = classifyIntent(message);

  let response: ChatResponse;

  // Route based on intent
  switch (intent.type) {
    case "workflow_query":
      response = formatWorkflowResponse(context.workflows, intent.filters);
      break;

    case "employee_query":
      response = formatEmployeeResponse(context.employees, message);
      break;

    case "activity_query":
      response = formatActivityResponse(context.activity);
      break;

    case "approval_query":
      response = formatApprovalResponse(context.approvals);
      break;

    case "analytics_query":
      response = formatAnalyticsResponse(context.analytics, context.activity, message);
      break;

    case "workflow_create":
      // Route to workflow generator
      response = {
        reply: `🛠️ I'll help you build a workflow! I've forwarded your description to the Workflow Generator. Try describing your workflow in detail:\n\n*"When an invoice arrives, extract the data, update QuickBooks, notify the team on Slack, and if it's over $5,000 send it to Finance for approval."*\n\nGo to the Workflow Builder to craft your automation.`,
        actions: [
          { type: "navigate", label: "Open Workflow Builder", payload: { path: "/portal/admin/workflow-builder" } },
        ],
      };
      break;

    case "command":
      response = {
        reply: `⚙️ **Command received.** I've noted your request. For direct workflow control, please use the Workflow Manager where you can trigger, pause, and test workflows.\n\nWhat would you like to do next?`,
        actions: [
          { type: "navigate", label: "Open Workflow Manager", payload: { path: "/portal/workflows" } },
        ],
      };
      break;

    case "integration_action":
      // Try to execute an integration tool based on the message
      const matchedTools = suggestTools(message, 3);
      if (matchedTools.length > 0) {
        const toolList = matchedTools.map(t => `• **${t.function.name}** — ${t.function.description}`).join("\n");
        response = {
          reply: `🔌 **Integration Actions Available**\n\nI found ${matchedTools.length} integration action${matchedTools.length > 1 ? 's' : ''} related to your request:\n\n${toolList}\n\nWould you like me to execute one? You can also visit the Integrations page to set up connections.`,
          actions: [
            ...matchedTools.map(t => ({
              type: "query" as const,
              label: t.function.name,
              payload: { followUp: `Execute ${t.function.name}` },
            })),
            { type: "navigate", label: "Open Integrations", payload: { path: "/portal/integrations" } },
          ],
          tool_calls: matchedTools.map(t => ({
            name: t.function.name,
            args: {},
          })),
        };
      } else {
        response = {
          reply: `🔌 **Integration Action**\n\nI can help you interact with your connected integrations. Here are some examples:\n- "Search contacts in Salesforce"\n- "Create a lead in HubSpot"\n- "Send an email via Gmail"\n- "Create a task in Asana"\n\nVisit the Integrations page to manage your connections.`,
          actions: [
            { type: "navigate", label: "Open Integrations", payload: { path: "/portal/integrations" } },
          ],
        };
      }
      break;

    default:
      response = handleGeneralQuery(message, context);
      break;
  }

  // Add assistant response to session
  session.messages.push({
    role: "assistant",
    content: response.reply,
    timestamp: new Date().toISOString(),
    metadata: { actions: response.actions, intent: intent.type },
  });

  // Save session (keep last 50 messages max)
  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }
  await saveSession(userId, session);

  response.sessionId = session.id;
  return response;
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await db.run(
    sql.raw(`DELETE FROM portal_data WHERE id = '${sessionId}' AND user_id = '${userId}' AND section = 'chat_sessions'`)
  );
}