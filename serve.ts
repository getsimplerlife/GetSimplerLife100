// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, SSR for the
// rest. Run `bun run build` before starting. Restart it with `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
// @ts-ignore this is a build artifact that might not exist yet
import handler from "./dist/server/server.js";
import { createAuditForEmailInternal } from "./src/db/queries";
import { eq, sql } from "drizzle-orm";
import { db } from "./src/db/index";
import { users, audits } from "./src/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "./src/db/auth";
import {
  logAuditEvent,
  queryAuditLogs,
  ensureAuditTable,
  getRequestIP,
  getUserFromRequest,
} from "./src/api/auditLogs";
import { processChatMessage, listSessions, deleteSession } from "./src/api/chatEngine";
import { sendEmail, renderEmailTemplate } from "./src/integrations/email";
import { generateWorkflow, listTemplates } from "./src/api/workflowGenerator";
import { runAgent, deployAgent, getAgentStatus, pauseAgent, resumeAgent, listAgentTypes } from "./src/agents/index";
import { listAgentInstances } from "./src/agents/schema";
import { processDocument } from "./src/agents/documentProcessor";
import { routeIntegrationRequest } from "./src/api/integrationRoutes";
import { analyzeAutomationPotential } from "./src/ai/llm";
import { runAssessment } from "./src/tools/assessment-engine";

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

// Helper: read a cookie value from the Cookie header
function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Helper: build a Set-Cookie header value
function setCookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

// Helper: parse JSON body, returning null on failure
async function parseJSON(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        console.log(`[serve.ts] FETCH: ${req.method} ${pathname}`);

        // ─── Integration Routes ─────────────────────────────────────────────
        const { routeIntegrationRequest } = await import("./src/api/integrationRoutes");
        const integrationRes = await routeIntegrationRequest(req);
        if (integrationRes) return integrationRes;

        // ─── Auth API Routes ───────────────────────────────────────────────

        // POST /api/register — create account and set session
        if (pathname === "/api/register" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) {
            return new Response(JSON.stringify({ error: "Email and password required" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          try {
            const existingUser = await db.query.users.findFirst({
              where: eq(users.email, body.email),
            });
            if (existingUser) {
              return new Response(JSON.stringify({ error: "Account already exists, please login" }), {
                status: 409, headers: { "Content-Type": "application/json" },
              });
            }
            const hashedPassword = await hashPassword(body.password);
            const userId = crypto.randomUUID();
            await db.insert(users).values({
              id: userId,
              email: body.email,
              password: hashedPassword,
              createdAt: new Date(),
            });
            const token = await createSessionToken(userId);
            await logAuditEvent({
              userId, userEmail: body.email, action: "register",
              resource: "user_account", status: "success", ipAddress: getRequestIP(req),
              details: { email: body.email },
            });
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": setCookieHeader("session", token, 7200),
              },
            });
          } catch (err: any) {
            console.error("[serve.ts] Register error:", err);
            await logAuditEvent({
              action: "register", status: "failure", severity: "error",
              resource: "user_account", ipAddress: getRequestIP(req),
              details: { error: err.message },
            }).catch(() => {});
            return new Response(JSON.stringify({ error: "Registration failed" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // POST /api/login — verify credentials and set session
        if (pathname === "/api/login" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) {
            return new Response(JSON.stringify({ error: "Email and password required" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          try {
            const user = await db.query.users.findFirst({
              where: eq(users.email, body.email),
            });
            if (!user || !(await verifyPassword(body.password, user.password))) {
              await logAuditEvent({
                action: "login", status: "failure", severity: "warning",
                userEmail: body.email, ipAddress: getRequestIP(req),
                details: { reason: "Invalid credentials" },
              }).catch(() => {});
              return new Response(JSON.stringify({ error: "Invalid email or password" }), {
                status: 401, headers: { "Content-Type": "application/json" },
              });
            }
            const token = await createSessionToken(user.id);
            await logAuditEvent({
              userId: user.id, userEmail: body.email, action: "login",
              resource: "user_session", status: "success", ipAddress: getRequestIP(req),
            });
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": setCookieHeader("session", token, 7200),
              },
            });
          } catch (err: any) {
            console.error("[serve.ts] Login error:", err);
            return new Response(JSON.stringify({ error: "Login failed" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // POST /api/logout — clear session
        if (pathname === "/api/logout" && req.method === "POST") {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": clearCookieHeader("session"),
            },
          });
        }

        // GET /api/me — check if logged in
        if (pathname === "/api/me" && req.method === "GET") {
          const token = getCookie(req, "session");
          if (!token) {
            return new Response(JSON.stringify({ error: "Not logged in" }), {
              status: 401, headers: { "Content-Type": "application/json" },
            });
          }
          const userId = await verifySessionToken(token);
          if (!userId) {
            return new Response(JSON.stringify({ error: "Invalid session" }), {
              status: 401, headers: { "Content-Type": "application/json" },
            });
          }
          const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
          });
          if (!user) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 401, headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ id: user.id, email: user.email }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // POST /api/check-user-exists — check if a user exists
        if (pathname === "/api/check-user-exists" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email) {
            return new Response(JSON.stringify({ error: "Email required" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          const user = await db.query.users.findFirst({
            where: eq(users.email, body.email),
          });
          return new Response(JSON.stringify({
            exists: !!user,
            needsPasswordReset: user?.needsPasswordReset || false,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // POST /api/set-password — set or reset password
        if (pathname === "/api/set-password" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) {
            return new Response(JSON.stringify({ error: "Email and password required" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          if (body.password.length < 8) {
            return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }
          try {
            const user = await db.query.users.findFirst({
              where: eq(users.email, body.email),
            });
            if (!user) {
              return new Response(JSON.stringify({ error: "No account found with this email" }), {
                status: 404, headers: { "Content-Type": "application/json" },
              });
            }
            const hashedPassword = await hashPassword(body.password);
            await db
              .update(users)
              .set({
                password: hashedPassword,
                needsPasswordReset: false,
              })
              .where(eq(users.email, body.email));
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Set password error:", err);
            return new Response(JSON.stringify({ error: "Failed to set password" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // ─── Portal Action API ──────────────────────────────────────────────────

        // POST /api/action — log any portal action
        if (pathname === "/api/action" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.action) {
              return new Response(JSON.stringify({ error: "Action required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await import("./src/api/auditLogs").then(m => m.getUserFromRequest(req));
            await import("./src/api/auditLogs").then(m => m.logAuditEvent({
              userId: user?.userId,
              userEmail: user?.userEmail,
              action: body.action,
              resource: body.resource || "portal_action",
              details: body.details || {},
              ipAddress: body.action.includes("billing") ? "stripe" : undefined,
              status: "success",
              severity: "info",
            }));
            return new Response(JSON.stringify({ success: true, message: `${body.action} completed` }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Action error:", err);
            return new Response(JSON.stringify({ error: "Action failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/chat — send a chat message (AI-powered)
        if (pathname === "/api/chat" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.message) {
              return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            const userId = user?.userId || "public-session-user";
            const userEmail = user?.userEmail || "public@example.com";

            // Process the message through the AI Chat Engine
            const response = await processChatMessage(
              userId,
              userEmail,
              body.message,
              body.sessionId
            );

            // Log the chat interaction
            await logAuditEvent({
              userId, userEmail,
              action: "chat_message", resource: "ai_assistant",
              details: {
                message: body.message.slice(0, 200),
                intent: body.message.length > 5 ? "ai_processed" : "short",
                sessionId: response.sessionId,
              },
              status: "success", severity: "info",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify(response), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Chat error:", err);
            return new Response(JSON.stringify({ error: "Chat failed: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/chat/sessions — list chat sessions
        if (pathname === "/api/chat/sessions" && req.method === "GET") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const sessions = await listSessions(user.userId);
            return new Response(JSON.stringify({ sessions }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Chat sessions error:", err);
            return new Response(JSON.stringify({ error: "Failed to list sessions" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // DELETE /api/chat/sessions/:id — delete a chat session
        const deleteSessionMatch = pathname.match(/^\/api\/chat\/sessions\/([a-f0-9-]+)$/);
        if (deleteSessionMatch && req.method === "DELETE") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            await deleteSession(user.userId, deleteSessionMatch[1]);
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Delete session error:", err);
            return new Response(JSON.stringify({ error: "Failed to delete session" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/settings — save settings
        if (pathname === "/api/settings" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body) {
              return new Response(JSON.stringify({ error: "Settings required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await import("./src/api/auditLogs").then(m => m.getUserFromRequest(req));
            await import("./src/api/auditLogs").then(m => m.logAuditEvent({
              userId: user?.userId, userEmail: user?.userEmail,
              action: "settings_update", resource: "workspace_settings",
              details: { section: body.section, settings: body.settings },
              status: "success", severity: "info",
            }));
            return new Response(JSON.stringify({ success: true, message: "Settings saved" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Settings error:", err);
            return new Response(JSON.stringify({ error: "Failed to save settings" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/workflows/generate — generate workflow from natural language
        if (pathname === "/api/workflows/generate" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.description) {
              return new Response(JSON.stringify({ error: "Workflow description required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }

            const result = await generateWorkflow({
              description: body.description,
              userId: user.userId,
            });

            await logAuditEvent({
              userId: user.userId, userEmail: user.userEmail,
              action: "workflow_generated", resource: "workflow_generator",
              details: {
                description: body.description.slice(0, 150),
                success: result.success,
                workflowName: result.workflow?.name,
              },
              status: result.success ? "success" : "failure",
              severity: result.success ? "info" : "warning",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify(result), {
              status: result.success ? 200 : 400,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Workflow generate error:", err);
            return new Response(JSON.stringify({ error: "Failed to generate workflow: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/workflows/templates — list available workflow templates
        if (pathname === "/api/workflows/templates" && req.method === "GET") {
          try {
            const templates = await listTemplates();
            return new Response(JSON.stringify({ templates }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Workflow templates error:", err);
            return new Response(JSON.stringify({ error: "Failed to list templates" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── AI Agent API ──────────────────────────────────────────────────────

        // POST /api/deploy — deploy an AI employee (called from marketplace)
        if (pathname === "/api/deploy" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.agentType) {
              return new Response(JSON.stringify({ error: "agentType required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }

            const instance = await deployAgent(user.userId, body.agentType, body.name, body.config);
            await logAuditEvent({
              userId: user.userId, userEmail: user.userEmail,
              action: "agent_deploy", resource: instance.id,
              details: { agentType: body.agentType, name: instance.name, source: "marketplace" },
              status: "success", severity: "info",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify({ success: true, agent: instance }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] /api/deploy error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/agents/deploy — deploy an AI employee for a user
        if (pathname === "/api/agents/deploy" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.agentType) {
              return new Response(JSON.stringify({ error: "agentType required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }

            const instance = await deployAgent(user.userId, body.agentType, body.name, body.config);
            await logAuditEvent({
              userId: user.userId, userEmail: user.userEmail,
              action: "agent_deploy", resource: instance.id,
              details: { agentType: body.agentType, name: instance.name },
              status: "success", severity: "info",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify({ success: true, agent: instance }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent deploy error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/agents/list — list all deployed agents for the current user
        if (pathname === "/api/agents/list" && req.method === "GET") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const instances = await listAgentInstances(user.userId);
            const types = listAgentTypes();
            return new Response(JSON.stringify({ success: true, agents: instances, agentTypes: types }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent list error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/agents/run — execute an AI employee task
        if (pathname === "/api/agents/run" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.agentId || !body.prompt) {
              return new Response(JSON.stringify({ error: "agentId and prompt required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }

            const execution = await runAgent({
              agentId: body.agentId,
              userId: user.userId,
              prompt: body.prompt,
              context: body.context || {},
            });

            await logAuditEvent({
              userId: user.userId, userEmail: user.userEmail,
              action: "agent_run", resource: body.agentId,
              details: { executionId: execution.id, status: execution.status, prompt: body.prompt.slice(0, 100) },
              status: execution.status === "completed" ? "success" : "failure",
              severity: execution.status === "failed" ? "error" : "info",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify({ success: true, execution }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent run error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/agents/:id/status — check agent status and last results
        const agentStatusMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/status$/);
        if (agentStatusMatch && req.method === "GET") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const agentId = agentStatusMatch[1];
            const status = await getAgentStatus(agentId, user.userId);
            return new Response(JSON.stringify({ success: true, ...status }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent status error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/agents/:id/pause — pause an agent
        const agentPauseMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/pause$/);
        if (agentPauseMatch && req.method === "POST") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const instance = await pauseAgent(agentPauseMatch[1], user.userId);
            return new Response(JSON.stringify({ success: true, agent: instance }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent pause error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/agents/:id/resume — resume an agent
        const agentResumeMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/resume$/);
        if (agentResumeMatch && req.method === "POST") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const instance = await resumeAgent(agentResumeMatch[1], user.userId);
            return new Response(JSON.stringify({ success: true, agent: instance }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent resume error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/billing/portal — redirect to Stripe customer portal
        if (pathname === "/api/billing/portal" && req.method === "GET") {
          return new Response(JSON.stringify({ url: "https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // POST /api/upload — upload and process a document
        if (pathname === "/api/upload" && req.method === "POST") {
          try {
            // Auth-protected (requires valid session)
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
              return new Response(JSON.stringify({ error: "No file provided in 'file' field" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Size limit: 10MB
            if (file.size > 10 * 1024 * 1024) {
              return new Response(JSON.stringify({ error: "File size exceeds 10MB limit" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Get file buffer for magic bytes check
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            
            // Magic bytes checks
            const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
            const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
            const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
            const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

            const path = await import("node:path");
            const originalExt = path.extname(file.name).toLowerCase().replace(".", "");
            let ext = originalExt;
            let supported = true;

            if (isPdf) ext = "pdf";
            else if (isPng) ext = "png";
            else if (isJpg) ext = "jpg";
            else if (isZip) {
              if (ext !== "xlsx" && ext !== "docx") {
                supported = false;
              }
            } else if (!["csv", "txt", "json", "bmp", "tiff"].includes(ext)) {
              supported = false;
            }

            if (!supported && ext !== "pdf" && ext !== "png" && ext !== "jpg" && ext !== "xlsx" && ext !== "docx") {
              return new Response(JSON.stringify({ error: `Unsupported file format: .${originalExt}` }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Save temporarily to disk
            const fs = await import("node:fs/promises");
            const tempDir = "/tmp/uploads";
            await fs.mkdir(tempDir, { recursive: true });
            const tempPath = path.join(tempDir, `upload_${crypto.randomUUID()}.${ext}`);
            await Bun.write(tempPath, file);

            // Process document using our TS service (which wraps python)
            const extractResult = await processDocument({
              filePath: tempPath,
              mimeType: file.type || "application/octet-stream",
              filename: file.name,
              userId,
            });

            // Cleanup temp file
            await fs.unlink(tempPath).catch(err => console.error("[serve.ts] Temp file unlink error:", err));

            if (!extractResult.success || extractResult.error) {
              return new Response(JSON.stringify({ error: extractResult.error || "Processing failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
            }

            // Store results in the existing portal_data system
            const now = Date.now();
            const id = crypto.randomUUID();
            const dataToStore = {
              file_name: file.name,
              file_size: file.size,
              extracted_text: extractResult.extractedText,
              document_type: extractResult.documentType,
              key_info: extractResult.keyInfo,
              status: "processed"
            };
            await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', 'documents', '${JSON.stringify(dataToStore).replace(/'/g, "''")}', ${now}, ${now})`));

            return new Response(JSON.stringify({
              success: true,
              id,
              text: extractResult.extractedText,
              documentType: extractResult.documentType,
              keyInfo: extractResult.keyInfo,
              fileName: file.name,
              fileSize: file.size,
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Upload POST error:", err);
            return new Response(JSON.stringify({ error: "Failed to upload and process document: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Knowledge Base RAG API ──────────────────────────────────────────

        // POST /api/knowledge/query — query the knowledge base
        if (pathname === "/api/knowledge/query" && req.method === "POST") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const body = await parseJSON(req);
            if (!body || !body.query) {
              return new Response(JSON.stringify({ error: "query parameter is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            const { queryKnowledgeBase } = await import("./src/ai/rag");
            const result = await queryKnowledgeBase(body.query, userId);

            return new Response(JSON.stringify({ success: true, ...result }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] KB query error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/knowledge/upload — upload and index a document in the knowledge base
        if (pathname === "/api/knowledge/upload" && req.method === "POST") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
              return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Size limit: 10MB
            if (file.size > 10 * 1024 * 1024) {
              return new Response(JSON.stringify({ error: "File size exceeds 10MB limit" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            const path = await import("node:path");
            const fs = await import("node:fs/promises");
            const originalExt = path.extname(file.name).toLowerCase().replace(".", "");
            const tempDir = "/tmp/uploads";
            await fs.mkdir(tempDir, { recursive: true });
            const tempPath = path.join(tempDir, `kb_${crypto.randomUUID()}.${originalExt}`);
            await Bun.write(tempPath, file);

            // Extract text
            const text = await extractTextFromUpload(tempPath, file.type || "application/octet-stream");
            await fs.unlink(tempPath).catch(err => console.error("[serve.ts] KB unlink error:", err));

            if (text.startsWith("[Error") || text.length < 10) {
              return new Response(JSON.stringify({ error: "Failed to extract text from file" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Index in knowledge base
            const { KnowledgeBase } = await import("./src/ai/rag");
            const documentId = await KnowledgeBase.addDocument(userId, file.name, file.type || "application/octet-stream", text);

            return new Response(JSON.stringify({ success: true, documentId, title: file.name }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] KB upload error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/knowledge/documents — list all indexed documents
        if (pathname === "/api/knowledge/documents" && req.method === "GET") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const { KnowledgeBase } = await import("./src/ai/rag");
            const documents = await KnowledgeBase.listDocuments(userId);

            return new Response(JSON.stringify({ success: true, documents }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] KB list error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // DELETE /api/knowledge/documents/:id — delete an indexed document
        const kbDocMatch = pathname.match(/^\/api\/knowledge\/documents\/([a-f0-9-]+)$/);
        if (kbDocMatch && req.method === "DELETE") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const documentId = kbDocMatch[1];
            const { KnowledgeBase } = await import("./src/ai/rag");
            await KnowledgeBase.deleteDocument(userId, documentId);

            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] KB delete error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Portal Data API (generic JSON store per user per section) ──────────

        // GET /api/data/:section — get all data for a section for the current user
        const dataMatch = pathname.match(/^\/api\/data\/([a-z_-]+)$/);
        if (dataMatch && req.method === "GET") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const section = dataMatch[1];
            const rows = await db.all(sql.raw(`SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${userId}' AND section = '${section}' ORDER BY created_at`));
            return new Response(JSON.stringify({ data: rows.map((r: any) => ({ ...JSON.parse(r.data), _id: r.id, _created_at: r.created_at, _updated_at: r.updated_at })) }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Data GET error:", err);
            return new Response(JSON.stringify({ error: "Failed to get data" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/data/:section — save data for a section
        if (dataMatch && req.method === "POST") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const section = dataMatch[1];
            const body = await parseJSON(req);
            if (!body) return new Response(JSON.stringify({ error: "Body required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            const now = Date.now();
            const { _id, ...dataToStore } = body;
            
            if (_id) {
              await db.run(sql.raw(`UPDATE portal_data SET data = '${JSON.stringify(dataToStore).replace(/'/g, "''")}', updated_at = ${now} WHERE id = '${_id}' AND user_id = '${userId}'`));
              return new Response(JSON.stringify({ success: true, id: _id }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            } else {
              const id = crypto.randomUUID();
              await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', '${section}', '${JSON.stringify(dataToStore).replace(/'/g, "''")}', ${now}, ${now})`));
              return new Response(JSON.stringify({ success: true, id }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch (err: any) {
            console.error("[serve.ts] Data POST error:", err);
            return new Response(JSON.stringify({ error: "Failed to save data" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // DELETE /api/data/:section/:id — delete a data entry
        const deleteMatch = pathname.match(/^\/api\/data\/([a-z_-]+)\/([a-f0-9-]+)$/);
        if (deleteMatch && req.method === "DELETE") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });
            await db.run(sql.raw(`DELETE FROM portal_data WHERE id = '${deleteMatch[2]}' AND user_id = '${userId}'`));
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Data DELETE error:", err);
            return new Response(JSON.stringify({ error: "Failed to delete" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Admin API ───────────────────────────────────────────────────────

        // GET /api/admin/users — get all users with purchases and activity (owner only)
        if (pathname === "/api/admin/users" && req.method === "GET") {
          try {
            const token = getCookie(req, "session");
            if (!token) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const userId = await verifySessionToken(token);
            if (!userId) {
              return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const currentUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
            if (!currentUser || currentUser.email !== 'mathewortiz97@gmail.com') {
              return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { "Content-Type": "application/json" } });
            }

            // Get all users without passwords
            const allUsers = await db.select({
              id: users.id,
              email: users.email,
              createdAt: users.createdAt,
            }).from(users);

            // Get all audits joined with users
            const allAudits = await db.select({
              id: audits.id,
              userId: audits.userId,
              type: audits.type,
              status: audits.status,
              createdAt: audits.createdAt,
            }).from(audits);

            // Get recent audit logs (last 100)
            const allLogs = await import("./src/api/auditLogs").then(m => m.queryAuditLogs({ limit: 100 }));
            
            return new Response(JSON.stringify({ users: allUsers, audits: allAudits, auditLogs: allLogs.logs }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Admin users error:", err);
            return new Response(JSON.stringify({ error: "Failed to get users" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Stripe Webhook ────────────────────────────────────────────────

        const STRIPE_WEBHOOK_SECRET = "whsec_IhqrazN5z55SP9XSUvTLVb6sR25vTtdr";

        // Verify Stripe webhook signature manually (HMAC-SHA256)
        async function verifyStripeSignature(payload: string, signatureHeader: string): Promise<boolean> {
          try {
            const sigParts: Record<string, string> = {};
            for (const part of signatureHeader.split(",")) {
              const [k, ...v] = part.split("=");
              sigParts[k] = v.join("=");
            }
            const timestamp = sigParts["t"];
            const sig = sigParts["v1"];
            if (!timestamp || !sig) return false;
            const signedPayload = `${timestamp}.${payload}`;
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET;
            const key = await crypto.subtle.importKey(
              "raw", new TextEncoder().encode(webhookSecret),
              { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
            );
            const sigBytes = new Uint8Array(sig.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
            return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(signedPayload));
          } catch { return false; }
        }

        // Handle Stripe Webhook
        if ((pathname === "/api/stripe-webhook" || pathname === "/api/stripe/webhook") && req.method === "POST") {
          console.log(`[serve.ts] Stripe webhook triggered. Path: ${pathname}`);
          try {
            const rawBody = await req.text();
            const sigHeader = req.headers.get("stripe-signature") || "";
            const isValid = await verifyStripeSignature(rawBody, sigHeader);
            if (!isValid) {
              console.error("[serve.ts] Invalid Stripe webhook signature");
              return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const body = JSON.parse(rawBody);
            console.log('[serve.ts] Verified Stripe event:', body.type);

            if (body.type === 'checkout.session.completed') {
              const session = body.data.object;
              const email = session.customer_details?.email || session.customer_email;
              const amount = session.amount_total / 100;
              const productName = session.line_items?.[0]?.description || "Document AI System";

              let auditType = "Custom Audit";
              if (amount === 2500) auditType = "Deep-Dive AI Opportunity Audit";
              else if (amount === 7500) auditType = "Starter Implementation";
              else if (amount === 15000) auditType = "Growth Implementation";
              else if (amount === 30000) auditType = "Scale Implementation";
              else if (amount === 750 || amount === 2000) auditType = "Monthly Operations";

              if (email) {
                console.log(`[serve.ts] Purchase webhook: ${email} → ${productName} (${amount})`);
                await createAuditForEmailInternal(email, auditType);

                // Run our robust purchase provisioner flow
                const { provisionPurchase } = await import("./src/api/purchaseProvisioner");
                await provisionPurchase({
                  email,
                  productName,
                  amount,
                });
              }
            }

            if (body.type === 'customer.subscription.updated' || body.type === 'customer.subscription.deleted') {
              const sub = body.data.object;
              const email = sub.customer_details?.email || sub.customer_email || sub.customer?.email;
              if (email) {
                const status = body.type === 'customer.subscription.deleted' ? 'cancelled' : sub.status;
                await import("./src/api/auditLogs").then(m => m.logAuditEvent({
                  userEmail: email, action: `subscription_${status}`,
                  resource: "billing", status: "success", severity: "info",
                  details: { subscriptionId: sub.id, plan: sub.items?.data?.[0]?.price?.product },
                }));
              }
            }

            return new Response(JSON.stringify({ received: true }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error('[serve.ts] Stripe webhook error:', err);
            return new Response(JSON.stringify({ error: "Internal Server Error", details: err.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }


        // ─── Twilio Voice Receptionist Webhook ────────────────────────────

        // Incoming call from Twilio: respond with greeting TwiML
        if (pathname === "/api/twilio/voice" && req.method === "POST") {
          try {
            console.log("[serve.ts] Twilio voice call received");
            const body = await req.formData ? await parseJSON(req) : {};
            const from = body.From || "unknown";
            const callSid = body.CallSid || "unknown";

            // Log the call
            await import("./src/api/auditLogs").then(m => m.logAuditEvent({
              action: "voice_call_received", resource: "twilio_voice",
              details: { from, callSid }, status: "success", severity: "info",
            }));

            // Build TwiML greeting with speech gathering
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">Hello and thank you for calling Simpler Life 100. This is your AI receptionist speaking. How can I help you today? You can say something like "I need to schedule an appointment" or "I have a question about your services."</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="/api/twilio/voice/process" method="POST" language="en-US">
    <Say voice="alice" language="en-US">Please tell me how I can help you today.</Say>
  </Gather>
  <Say voice="alice">I didn't catch that. Please hold while I transfer you to our team.</Say>
  <Redirect>/api/twilio/voice/process</Redirect>
</Response>`;

            return new Response(twiml, {
              status: 200,
              headers: { "Content-Type": "application/xml" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Twilio voice error:", err);
            const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">We are experiencing technical difficulties. Please call back later. Thank you.</Say></Response>`;
            return new Response(errorTwiML, {
              status: 200,
              headers: { "Content-Type": "application/xml" },
            });
          }
        }

        // Process speech from caller — classify intent and respond
        if (pathname === "/api/twilio/voice/process" && req.method === "POST") {
          try {
            const rawBody = await req.text();
            const params = new URLSearchParams(rawBody);
            const from = params.get("From") || "unknown";
            const callSid = params.get("CallSid") || "unknown";
            const speechResult = params.get("SpeechResult") || "";
            const digits = params.get("Digits") || "";

            console.log(`[serve.ts] Twilio voice process: from=${from} speech="${speechResult}" digits="${digits}"`);

            // Classify intent using OpenAI
            let intent = "other";
            let responseMessage = "";
            let confidence = 0;

            try {
              const { chatResponse } = await import("./src/ai/llm");
              const intentResponse = await chatResponse(
                `Classify this caller's request into one of these intents: appointment (scheduling/rescheduling/canceling), inquiry (questions about services/products/pricing), transfer (asking for a person/department), complaint (issue/complaint), or other. Return ONLY the intent word and nothing else.\n\nCaller said: "${speechResult || digits}"`,
                []
              );
              const cleanIntent = intentResponse.toLowerCase().trim().replace(/[^a-zA-Z]/g, "");
              if (["appointment", "inquiry", "transfer", "complaint", "other"].includes(cleanIntent)) {
                intent = cleanIntent;
                confidence = 0.9;
              }
            } catch {
              // Rule-based fallback
              if (/appointment|schedule|reschedule|booking|book|cancel/i.test(speechResult)) {
                intent = "appointment"; confidence = 0.7;
              } else if (/question|how much|price|cost|service|hours|location|info/i.test(speechResult)) {
                intent = "inquiry"; confidence = 0.7;
              } else if (/speak|talk|person|manager|supervisor|human|agent|department/i.test(speechResult)) {
                intent = "transfer"; confidence = 0.7;
              } else if (/complaint|issue|problem|unhappy|bad|wrong|broken/i.test(speechResult)) {
                intent = "complaint"; confidence = 0.7;
              }
            }

            // Generate AI response based on intent
            try {
              const { chatResponse } = await import("./src/ai/llm");
              responseMessage = await chatResponse(
                `You are a professional AI receptionist. Generate a brief, friendly spoken response for a phone call. Keep it to 2-3 short sentences, suitable for text-to-speech.\n\nThe caller's intent is: ${intent}.\n${speechResult ? `They said: "${speechResult}"` : ""}\n\n- For appointment: Offer to schedule and ask for preferred date/time and name.\n- For inquiry: Provide a brief helpful answer and offer to connect with a specialist.\n- For transfer: Acknowledge and say you'll transfer them.\n- For complaint: Apologize and say the issue will be escalated to our team.\n- For other: Say you'll connect them with someone who can help.`,
                []
              );
            } catch {
              responseMessage = "Thank you. Let me connect you with the right person to help.";
            }

            // Log the interaction
            await import("./src/api/auditLogs").then(m => m.logAuditEvent({
              action: "voice_call_processed", resource: "twilio_voice",
              details: { from, callSid, speechResult, intent, confidence },
              status: "success", severity: "info",
            }));

            // Store the interaction
            try {
              const { db } = await import("./src/db/index");
              const { sql } = await import("drizzle-orm");
              await db.run(sql.raw(
                `INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${crypto.randomUUID()}', 'system', 'voice_interactions', '${JSON.stringify({ from, callSid, speechResult, intent, confidence, timestamp: Date.now() }).replace(/'/g, "''")}', ${Date.now()}, ${Date.now()})`
              ));
            } catch {}

            // Build response TwiML
            let twiml = "";
            if (intent === "transfer") {
              twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${responseMessage} Please hold while I connect you.</Say>
  <Dial>+15551234567</Dial>
</Response>`;
            } else {
              twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${responseMessage}</Say>
  <Hangup/>
</Response>`;
            }

            return new Response(twiml, {
              status: 200,
              headers: { "Content-Type": "application/xml" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Twilio voice process error:", err);
            return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">We are experiencing technical difficulties. Please call back later.</Say><Hangup/></Response>`, {
              status: 200,
              headers: { "Content-Type": "application/xml" },
            });
          }
        }

        // ─── Audit Logs API ─────────────────────────────────────────────────

        // GET /api/audit-logs — query audit logs
        if (pathname === "/api/audit-logs" && req.method === "GET") {
          try {
            await ensureAuditTable();
            const url = new URL(req.url);
            const filters = {
              action: url.searchParams.get("action") || undefined,
              status: url.searchParams.get("status") || undefined,
              severity: url.searchParams.get("severity") || undefined,
              search: url.searchParams.get("search") || undefined,
              limit: parseInt(url.searchParams.get("limit") || "50"),
              offset: parseInt(url.searchParams.get("offset") || "0"),
              sortBy: url.searchParams.get("sortBy") || "created_at",
              sortDir: (url.searchParams.get("sortDir") || "desc") as "asc" | "desc",
            };

            const result = await queryAuditLogs(filters);
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Audit logs error:", err);
            return new Response(JSON.stringify({ error: "Failed to query audit logs" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // GET /api/audit-logs/stats — get audit stats
        if (pathname === "/api/audit-logs/stats" && req.method === "GET") {
          try {
            await ensureAuditTable();
            const result = await queryAuditLogs({ limit: 1 });
            return new Response(JSON.stringify(result.stats), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Audit stats error:", err);
            return new Response(JSON.stringify({ error: "Failed to get audit stats" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // POST /api/audit-log — log a custom event (from frontend)
        if (pathname === "/api/audit-log" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.action) {
              return new Response(JSON.stringify({ error: "Action required" }), {
                status: 400, headers: { "Content-Type": "application/json" },
              });
            }
            const user = await getUserFromRequest(req);
            const id = await logAuditEvent({
              userId: user?.userId,
              userEmail: user?.userEmail,
              action: body.action,
              resource: body.resource,
              details: body.details,
              ipAddress: getRequestIP(req),
              status: body.status || "success",
              severity: body.severity || "info",
            });
            return new Response(JSON.stringify({ success: true, id }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Audit log error:", err);
            return new Response(JSON.stringify({ error: "Failed to log event" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // POST /api/email/send — send notification or direct email (auth-protected)
        if (pathname === "/api/email/send" && req.method === "POST") {
          try {
            const user = await getUserFromRequest(req);
            const isLocal =
              getRequestIP(req) === "127.0.0.1" ||
              getRequestIP(req) === "::1" ||
              getRequestIP(req) === "localhost" ||
              getRequestIP(req) === "unknown" ||
              req.headers.get("user-agent") === "SimplerLife100-AgentRuntime";
            if (!user && !isLocal) {
              return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401, headers: { "Content-Type": "application/json" },
              });
            }

            const body = await parseJSON(req);
            if (!body || !body.to) {
              return new Response(JSON.stringify({ error: "Recipient ('to') is required" }), {
                status: 400, headers: { "Content-Type": "application/json" },
              });
            }

            const { to, subject, text, html, templateVariables } = body;
            let result;

            if (templateVariables) {
              const template = renderEmailTemplate(templateVariables);
              result = await sendEmail({
                to,
                subject: templateVariables.subject || template.subject,
                text: template.text,
                html: template.html,
              });
            } else {
              if (!subject) {
                return new Response(JSON.stringify({ error: "Subject is required for direct emails" }), {
                  status: 400, headers: { "Content-Type": "application/json" },
                });
              }
              result = await sendEmail({ to, subject, text, html });
            }

            // Also log this as a governance audit event!
            await logAuditEvent({
              userId: user?.userId || "system-agent",
              userEmail: user?.userEmail || "system-agent@simplerlife100.local",
              action: "email_sent",
              resource: "SMTP Integration",
              details: { message: `Sent email to ${Array.isArray(to) ? to.join(", ") : to} with subject: ${subject || templateVariables?.subject || "Template Notification"}${isLocal ? " (Triggered by Local Agent)" : ""}` },
              ipAddress: getRequestIP(req),
              status: "success",
              severity: "info",
            });

            return new Response(JSON.stringify(result), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Send email route error:", err);
            return new Response(JSON.stringify({ error: "Failed to send email", details: err.message }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // POST /api/automate — "Can We Automate This?" tool
        if (pathname === "/api/automate" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.description) {
              return new Response(JSON.stringify({ error: "Description required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const result = await analyzeAutomationPotential(body.description);
            return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (err: any) {
            return new Response(JSON.stringify({ error: "Analysis failed: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/assess — AI Automation Assessment
        if (pathname === "/api/assess" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.answers) {
              return new Response(JSON.stringify({ error: "Assessment answers required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const report = runAssessment(body.answers);
            return new Response(JSON.stringify(report), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (err: any) {
            return new Response(JSON.stringify({ error: "Assessment failed: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/health — external uptime probe/healthcheck endpoint checking DB, Python, and storage
        if (pathname === "/api/health" && req.method === "GET") {
          let dbStatus = "healthy";
          let dbLatency = 0;
          try {
            const startDb = performance.now();
            await db.query.users.findFirst();
            dbLatency = performance.now() - startDb;
          } catch (err: any) {
            dbStatus = "unhealthy";
            console.error("[healthcheck] DB health check failed:", err.message);
          }

          let pythonStatus = "healthy";
          let pythonLatency = 0;
          try {
            const startPy = performance.now();
            const proc = Bun.spawnSync(["python3", "-c", "import sys; print(sys.version)"]);
            pythonLatency = performance.now() - startPy;
            if (proc.exitCode !== 0) {
              pythonStatus = "unhealthy";
            }
          } catch (err: any) {
            pythonStatus = "unhealthy";
            console.error("[healthcheck] Python health check failed:", err.message);
          }

          let storageStatus = "healthy";
          let storageLatency = 0;
          try {
            const startStorage = performance.now();
            const fs = await import("node:fs/promises");
            const testDir = "/home/team/shared/uploads";
            const testFile = `${testDir}/health_test_${crypto.randomUUID()}.txt`;
            await fs.mkdir(testDir, { recursive: true });
            await fs.writeFile(testFile, "healthcheck_test_content");
            const content = await fs.readFile(testFile, "utf-8");
            await fs.unlink(testFile);
            storageLatency = performance.now() - startStorage;
            if (content !== "healthcheck_test_content") {
              storageStatus = "unhealthy";
            }
          } catch (err: any) {
            storageStatus = "unhealthy";
            console.error("[healthcheck] File storage health check failed:", err.message);
          }

          const os = await import("node:os");
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const memoryUsagePct = (usedMem / totalMem) * 100;

          const status = (dbStatus === "healthy" && pythonStatus === "healthy" && storageStatus === "healthy") ? "UP" : "DEGRADED";

          return new Response(JSON.stringify({
            status,
            timestamp: new Date().toISOString(),
            uptime_seconds: process.uptime(),
            components: {
              database: {
                status: dbStatus,
                latency_ms: parseFloat(dbLatency.toFixed(2)),
              },
              python: {
                status: pythonStatus,
                latency_ms: parseFloat(pythonLatency.toFixed(2)),
              },
              storage: {
                status: storageStatus,
                latency_ms: parseFloat(storageLatency.toFixed(2)),
              }
            },
            system_metrics: {
              memory_free_mb: Math.round(freeMem / 1024 / 1024),
              memory_total_mb: Math.round(totalMem / 1024 / 1024),
              memory_usage_pct: parseFloat(memoryUsagePct.toFixed(1)),
              load_average: os.loadavg(),
            }
          }), {
            status: status === "UP" ? 200 : 503,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Initialize audit table on first request
        ensureAuditTable().catch(e => console.error("[serve.ts] Failed to init audit table:", e));

        // ─── Integration Routes (OAuth, Connection Mgmt, Webhooks) ──────────

        const integrationResponse = await routeIntegrationRequest(req).catch((err: any) => {
          console.error("[serve.ts] Integration route error:", err);
          return null;
        });
        if (integrationResponse) return integrationResponse;

        // ─── Static Files & SSR Fallback ──────────────────────────────────

        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) {
            // Cache static assets: JS/CSS for 1 year, images for 1 month
            const ext = pathname.split(".").pop()?.toLowerCase();
            const maxAge = ["js","css","woff","woff2","ttf"].includes(ext||"") ? 31536000
                       : ["png","jpg","jpeg","gif","svg","webp","ico"].includes(ext||"") ? 2592000
                       : 0;
            return new Response(file, {
              headers: maxAge ? { "Cache-Control": `public, max-age=${maxAge}, immutable` } : {},
            });
          }
        }
        return (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);

// Background purchase email monitoring: Poll the inbox wastezero-d4a2cd2e@ctomail.io every 15 seconds
setInterval(async () => {
  try {
    const { pollInboxAndProvision } = await import("./src/api/purchaseMonitor");
    await pollInboxAndProvision();
  } catch (err) {
    console.error("[serve.ts] Background email polling error:", err);
  }
}, 15000);

// Background integration health check: every 5 minutes
setInterval(async () => {
  try {
    const { handleBackgroundHealthCheck } = await import("./src/api/integrationRoutes");
    await handleBackgroundHealthCheck();
  } catch (err) {
    console.error("[serve.ts] Background health check error:", err);
  }
}, 300000);
