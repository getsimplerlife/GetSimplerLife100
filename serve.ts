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
import { processChatMessage as processAIChatMessage, listSessions as listAISessions, deleteSession as deleteAISession } from "./src/api/aiChatEngine";
import { sendEmail, renderEmailTemplate } from "./src/integrations/email";
import { generateWorkflow, listTemplates } from "./src/api/workflowGenerator";
import { runAgent, deployAgent, getAgentStatus, pauseAgent, resumeAgent, listAgentTypes } from "./src/agents/index";
import { processDocument } from "./src/agents/documentProcessor";
import { routeIntegrationRequest } from "./src/api/integrationRoutes";
import { getAgentSetupRequirements, getAgentTypesWithSetup } from "./src/agents/setupRequirements";
import { getWorkflowMapping, getAllWorkflowMappings, getCrossAgentIntegrations } from "./src/agents/workflowMappings";
import { provisionPurchase } from "./src/api/purchaseProvisioner";

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

        // POST /api/chat — send a chat message (AI-powered, guest fallback)
        if (pathname === "/api/chat" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.message) {
              return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const user = await getUserFromRequest(req);
            const isGuest = !user || !user.userId;
            const userId = isGuest ? ("guest-" + (getRequestIP(req) || "anon")) : user!.userId;
            const userEmail = isGuest ? "guest@simplerlife100.com" : (user!.userEmail || "unknown");

            // Process the message through the AI-powered Chat Engine
            const response = await processAIChatMessage(
              userId,
              userEmail,
              body.message,
              body.sessionId,
              isGuest
            );

            // Log the chat interaction (for authenticated users only)
            if (!isGuest) {
              await logAuditEvent({
                userId: user!.userId, userEmail: user!.userEmail,
                action: "chat_message", resource: "ai_assistant",
                details: {
                  message: body.message.slice(0, 200),
                  intent: "ai_powered",
                  sessionId: response.sessionId,
                },
                status: "success", severity: "info",
                ipAddress: getRequestIP(req),
              });
            }

            return new Response(JSON.stringify(response), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Chat error:", err);
            return new Response(JSON.stringify({ error: "Chat failed: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }


        // POST /api/automate — analyze a workflow description via OpenAI
        if (pathname === "/api/automate" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.description) {
              return new Response(JSON.stringify({ error: "Description required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
              return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
            }
            const prompt = "Analyze this workflow description. Return JSON with workflowName, workflowId, description, hoursSavedPerWeek (number), confidence (high/medium/low), agentName, agentEmoji, industry. Description: " + JSON.stringify(body.description) + ". Return ONLY valid JSON.";
            const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
              body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 500 }),
            });
            if (!openaiRes.ok) throw new Error("OpenAI error: " + openaiRes.status);
            const data = await openaiRes.json();
            const content = data.choices?.[0]?.message?.content || "{}";
            const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
            return new Response(JSON.stringify({
              workflow: { id: parsed.workflowId || "data-entry-automation", name: parsed.workflowName || "Data Entry Automation", description: parsed.description || "Automated data processing" },
              hoursSavedPerWeek: parsed.hoursSavedPerWeek || 10, confidence: parsed.confidence || "medium",
              agentName: parsed.agentName || "Automation AI", agentEmoji: parsed.agentEmoji || "🤖", industry: parsed.industry || "General Business",
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (err) {
            console.error("[serve.ts] /api/automate error:", err);
            return new Response(JSON.stringify({ error: "Analysis failed, please try again" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/chat/sessions — list chat sessions (supports guests)
        if (pathname === "/api/chat/sessions" && req.method === "GET") {
          try {
            const user = await getUserFromRequest(req);
            const isGuest = !user || !user.userId;
            const userId = isGuest ? ("guest-" + (getRequestIP(req) || "anon")) : user!.userId;
            const sessions = await listAISessions(userId, isGuest);
            return new Response(JSON.stringify({ sessions }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Chat sessions error:", err);
            return new Response(JSON.stringify({ error: "Failed to list sessions" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // DELETE /api/chat/sessions/:id — delete a chat session (supports guests)
        const deleteSessionMatch = pathname.match(/^\/api\/chat\/sessions\/([a-f0-9-]+)$/);
        if (deleteSessionMatch && req.method === "DELETE") {
          try {
            const user = await getUserFromRequest(req);
            const isGuest = !user || !user.userId;
            const userId = isGuest ? ("guest-" + (getRequestIP(req) || "anon")) : user!.userId;
            await deleteAISession(userId, deleteSessionMatch[1], isGuest);
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

        // ─── Agent Types API ──────────────────────────────────────────────────

        // GET /api/agents/types — list all registered agent types with setup requirements
        if (pathname === "/api/agents/types" && req.method === "GET") {
          try {
            const types = listAgentTypes();
            const typesWithSetup = getAgentTypesWithSetup(types);
            return new Response(JSON.stringify({ success: true, types: typesWithSetup }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent types error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/agents/types/:type — get setup requirements for a specific agent type
        const agentTypeDetailMatch = pathname.match(/^\/api\/agents\/types\/([a-z_]+)$/);
        if (agentTypeDetailMatch && req.method === "GET") {
          try {
            const type = agentTypeDetailMatch[1];
            const requirements = getAgentSetupRequirements(type);
            return new Response(JSON.stringify({ success: true, ...requirements }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent type detail error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Agent Config API ─────────────────────────────────────────────────

        // GET /api/agents/:id/config — get agent instance data + current config
        const agentConfigGetMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/config$/);
        if (agentConfigGetMatch && req.method === "GET") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const agentId = agentConfigGetMatch[1];
            const { getAgentInstance } = await import("./src/agents/schema");
            const instance = await getAgentInstance(agentId, user.userId);
            if (!instance) {
              return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
            }
            const requirements = getAgentSetupRequirements(instance.agentType);
            // Also check if there's any saved config data in portal_data for this agent
            const configRows = await db.all(sql.raw(`SELECT data FROM portal_data WHERE user_id = '${user.userId}' AND section = 'agent_config' ORDER BY created_at DESC LIMIT 1`));
            let savedConfig = {};
            for (const row of configRows as any[]) {
              const data = JSON.parse(typeof row.data === "string" ? row.data : row.data);
              if (data.agentId === agentId) {
                savedConfig = data.config || {};
                break;
              }
            }
            return new Response(JSON.stringify({
              success: true,
              agent: instance,
              config: instance.config || {},
              savedConfig,
              setupRequirements: requirements,
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent config GET error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // POST /api/agents/:id/config — save agent configuration
        if (agentConfigGetMatch && req.method === "POST") {
          try {
            const user = await getUserFromRequest(req);
            if (!user || !user.userId) {
              return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const agentId = agentConfigGetMatch[1];
            const body = await parseJSON(req);
            if (!body) {
              return new Response(JSON.stringify({ error: "Config body required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            // Update the agent instance config
            const { getAgentInstance, saveAgentInstance } = await import("./src/agents/schema");
            const instance = await getAgentInstance(agentId, user.userId);
            if (!instance) {
              return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
            }

            // Merge new config into existing config
            instance.config = { ...(instance.config || {}), ...(body.config || {}) };
            instance.updatedAt = Date.now();
            await saveAgentInstance(instance);

            // Also save config to agent_config section for separate access
            const now = Date.now();
            const configId = crypto.randomUUID();
            await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${configId}', '${user.userId}', 'agent_config', '${JSON.stringify({ agentId, config: instance.config }).replace(/'/g, "''")}', ${now}, ${now})`));

            // Log the config update
            await logAuditEvent({
              userId: user.userId, userEmail: user.userEmail,
              action: "agent_config_update", resource: agentId,
              details: { agentType: instance.agentType, configFields: Object.keys(body.config || {}) },
              status: "success", severity: "info",
              ipAddress: getRequestIP(req),
            });

            return new Response(JSON.stringify({ success: true, agent: instance }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Agent config POST error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // ─── Agent Setup Status API ───────────────────────────────────────────

                    // GET /api/agents/:id/setup-status — return setup completion status for an agent
                    const agentSetupStatusMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/setup-status$/);
                    if (agentSetupStatusMatch && req.method === "GET") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }
                        const agentId = agentSetupStatusMatch[1];
                        const { getAgentInstance } = await import("./src/agents/schema");
                        const instance = await getAgentInstance(agentId, user.userId);
                        if (!instance) {
                          return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
                        }

                        const requirements = getAgentSetupRequirements(instance.agentType);
                        const agentConfig = instance.config || {};

                        // Check which connections are connected
                        const connections: Record<string, boolean> = {};
                        for (const connType of requirements.needsConnections) {
                          // Check if there's a connection saved in the integrations table
                          const connRows = await db.all(sql.raw(`SELECT status FROM integrations WHERE user_id = '${user.userId}' AND provider LIKE '%${connType}%' LIMIT 1`));
                          connections[connType] = connRows.length > 0 && (connRows[0] as any).status === "connected";
                        }

                        // Check if data has been uploaded (for agents that need it)
                        let dataUploaded = false;
                        if (requirements.needsDataUpload) {
                          const docRows = await db.all(sql.raw(`SELECT id FROM portal_data WHERE user_id = '${user.userId}' AND section = 'documents' LIMIT 1`));
                          dataUploaded = docRows.length > 0;
                        }

                        // Check if configuration is complete
                        let configComplete = true;
                        if (requirements.needsConfiguration) {
                          const requiredFields = requirements.configFields.filter(f => f.required);
                          for (const field of requiredFields) {
                            if (!agentConfig[field.key] && !agentConfig[field.key] !== undefined) {
                              // Check if it's a connection type that's already connected
                              if (field.type === "connection") {
                                // Skip connection fields — they're tracked separately
                                continue;
                              }
                              configComplete = false;
                              break;
                            }
                          }
                        }

                        // Check if workflow mapping is complete
                        const workflowMappingRows = await db.all(sql.raw(`SELECT id FROM portal_data WHERE user_id = '${user.userId}' AND section = 'workflow_mappings' AND data LIKE '%"agentId":"${agentId}"%' LIMIT 1`));
                        const workflowMappingComplete = workflowMappingRows.length > 0;

                        // Check if agent has bottlenecks
                        const bottleneckRows = await db.all(sql.raw(`SELECT id FROM portal_data WHERE user_id = '${user.userId}' AND section = 'bottlenecks' AND data LIKE '%"agentId":"${agentId}"%' LIMIT 1`));
                        const hasBottlenecks = bottleneckRows.length > 0;

                        // Calculate completion percentage
                        const totalChecks = requirements.needsConnections.length + (requirements.needsDataUpload ? 1 : 0) + (requirements.needsConfiguration ? 1 : 0) + 1 + 1; // +1 for agent deployed, +1 for workflow mapping
                        let completedChecks = 1; // Agent is deployed

                        // Check each connection
                        const connectedCount = Object.values(connections).filter(Boolean).length;
                        completedChecks += connectedCount;

                        // Check data upload
                        if (requirements.needsDataUpload && dataUploaded) {
                          completedChecks++;
                        }

                        // Check config
                        if (requirements.needsConfiguration && configComplete) {
                          completedChecks++;
                        }

                        // Check workflow mapping
                        if (workflowMappingComplete) {
                          completedChecks++;
                        }

                        const completionPercent = Math.round((completedChecks / totalChecks) * 100);

                        // Determine which steps are complete
                        const stepStatus = requirements.setupSteps.map((step) => {
                          let isComplete = false;
                          switch (step.action) {
                            case "connect":
                              isComplete = step.connectionType ? (connections[step.connectionType] || false) : false;
                              break;
                            case "upload":
                              isComplete = dataUploaded;
                              break;
                            case "configure":
                              isComplete = configComplete;
                              break;
                            case "run":
                              isComplete = instance.status === "running" || instance.status === "idle";
                              break;
                            case "verify":
                              // Verification is considered complete if other steps are done
                              isComplete = configComplete && (dataUploaded || !requirements.needsDataUpload);
                              break;
                          }
                          return { ...step, complete: isComplete };
                        });

                        return new Response(JSON.stringify({
                          success: true,
                          agentId,
                          agentType: instance.agentType,
                          status: instance.status,
                          connections,
                          dataUploaded,
                          configComplete,
                          workflowMappingComplete,
                          hasBottlenecks,
                          completionPercent,
                          totalSteps: requirements.setupSteps.length,
                          completedSteps: stepStatus.filter(s => s.complete).length,
                          steps: stepStatus,
                          setupRequirements: requirements,
                        }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent setup status error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // ─── Agent Workflow Map API ────────────────────────────────────────

                    // GET /api/agents/:id/workflow-map — get the workflow map for an agent
                    const agentWorkflowMapMatch = pathname.match(/^\/api\/agents\/([a-f0-9-]+)\/workflow-map$/);
                    if (agentWorkflowMapMatch && req.method === "GET") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }
                        const agentId = agentWorkflowMapMatch[1];
                        const { getAgentInstance } = await import("./src/agents/schema");
                        const instance = await getAgentInstance(agentId, user.userId);
                        if (!instance) {
                          return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
                        }

                        // Get the default workflow mapping from our definitions
                        const defaultMapping = getWorkflowMapping(instance.agentType);

                        // Check if the customer has saved their own workflow mapping
                        const mappingRows = await db.all(sql.raw(`SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${user.userId}' AND section = 'workflow_mappings' AND data LIKE '%"agentId":"${agentId}"%' ORDER BY created_at DESC LIMIT 1`));
                        let customerMapping = null;
                        if (mappingRows.length > 0) {
                          const row = mappingRows[0] as any;
                          customerMapping = JSON.parse(typeof row.data === "string" ? row.data : row.data);
                        }

                        return new Response(JSON.stringify({
                          success: true,
                          agentId,
                          agentType: instance.agentType,
                          agentName: instance.name,
                          defaultMapping,
                          customerMapping,
                          hasCustomerMapping: customerMapping !== null,
                        }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent workflow map GET error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // POST /api/agents/:id/workflow-map — save customer's workflow mapping
                    if (agentWorkflowMapMatch && req.method === "POST") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }
                        const agentId = agentWorkflowMapMatch[1];
                        const body = await parseJSON(req);
                        if (!body || !body.currentProcessSteps) {
                          return new Response(JSON.stringify({ error: "currentProcessSteps required" }), { status: 400, headers: { "Content-Type": "application/json" } });
                        }

                        const { getAgentInstance } = await import("./src/agents/schema");
                        const instance = await getAgentInstance(agentId, user.userId);
                        if (!instance) {
                          return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
                        }

                        // Save the workflow mapping
                        const now = Date.now();
                        const mappingId = crypto.randomUUID();
                        const mappingData = {
                          agentId,
                          agentType: instance.agentType,
                          agentName: instance.name,
                          currentProcessSteps: body.currentProcessSteps,
                          aiProcessSteps: body.aiProcessSteps || [],
                          humanStepsRemaining: body.humanStepsRemaining || [],
                          bottleneckIndicators: body.bottleneckIndicators || [],
                          crossAgentIntegration: body.crossAgentIntegration || [],
                          createdAt: now,
                          updatedAt: now,
                        };

                        // Delete any existing mapping for this agent
                        await db.run(sql.raw(`DELETE FROM portal_data WHERE user_id = '${user.userId}' AND section = 'workflow_mappings' AND data LIKE '%"agentId":"${agentId}"%'`));

                        // Insert new mapping
                        await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${mappingId}', '${user.userId}', 'workflow_mappings', '${JSON.stringify(mappingData).replace(/'/g, "''")}', ${now}, ${now})`));

                        // Log the workflow mapping
                        await logAuditEvent({
                          userId: user.userId, userEmail: user.userEmail,
                          action: "workflow_mapping_saved", resource: agentId,
                          details: { agentType: instance.agentType, stepCount: body.currentProcessSteps.length },
                          status: "success", severity: "info",
                          ipAddress: getRequestIP(req),
                        });

                        return new Response(JSON.stringify({ success: true, mappingId }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent workflow map POST error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // ─── Agent Link API ────────────────────────────────────────────────

                    // POST /api/agents/link — link two agents together for cross-agent workflows
                    if (pathname === "/api/agents/link" && req.method === "POST") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }
                        const body = await parseJSON(req);
                        if (!body || !body.sourceAgentId || !body.targetAgentId) {
                          return new Response(JSON.stringify({ error: "sourceAgentId and targetAgentId required" }), { status: 400, headers: { "Content-Type": "application/json" } });
                        }

                        const { getAgentInstance } = await import("./src/agents/schema");
                        const source = await getAgentInstance(body.sourceAgentId, user.userId);
                        const target = await getAgentInstance(body.targetAgentId, user.userId);

                        if (!source) {
                          return new Response(JSON.stringify({ error: "Source agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
                        }
                        if (!target) {
                          return new Response(JSON.stringify({ error: "Target agent not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
                        }

                        // Check if the integration is valid
                        const sourceIntegrations = getCrossAgentIntegrations(source.agentType);
                        const targetIntegrations = getCrossAgentIntegrations(target.agentType);
                        const isValid = sourceIntegrations.includes(target.agentType) || targetIntegrations.includes(source.agentType);

                        // Save the link
                        const now = Date.now();
                        const linkId = crypto.randomUUID();
                        const linkData = {
                          sourceAgentId: body.sourceAgentId,
                          sourceAgentType: source.agentType,
                          sourceAgentName: source.name,
                          targetAgentId: body.targetAgentId,
                          targetAgentType: target.agentType,
                          targetAgentName: target.name,
                          isValidIntegration: isValid,
                          config: body.config || {},
                          createdAt: now,
                          updatedAt: now,
                        };

                        await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${linkId}', '${user.userId}', 'agent_links', '${JSON.stringify(linkData).replace(/'/g, "''")}', ${now}, ${now})`));

                        // Log the link
                        await logAuditEvent({
                          userId: user.userId, userEmail: user.userEmail,
                          action: "agent_link_created", resource: linkId,
                          details: { sourceAgent: source.agentType, targetAgent: target.agentType, isValid },
                          status: "success", severity: "info",
                          ipAddress: getRequestIP(req),
                        });

                        return new Response(JSON.stringify({
                          success: true,
                          linkId,
                          isValidIntegration: isValid,
                          suggestedIntegrations: isValid ? [] : getCrossAgentIntegrations(source.agentType),
                        }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent link error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // GET /api/agents/link — list all agent links for the current user
                    if (pathname === "/api/agents/link" && req.method === "GET") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }

                        const rows = await db.all(sql.raw(`SELECT id, data, created_at FROM portal_data WHERE user_id = '${user.userId}' AND section = 'agent_links' ORDER BY created_at DESC`));
                        const links = (rows as any[]).map((r: any) => ({
                          id: r.id,
                          ...JSON.parse(typeof r.data === "string" ? r.data : r.data),
                          createdAt: r.created_at,
                        }));

                        return new Response(JSON.stringify({ success: true, links }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent link list error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // DELETE /api/agents/link/:id — delete an agent link
                    const agentLinkDeleteMatch = pathname.match(/^\/api\/agents\/link\/([a-f0-9-]+)$/);
                    if (agentLinkDeleteMatch && req.method === "DELETE") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }
                        await db.run(sql.raw(`DELETE FROM portal_data WHERE id = '${agentLinkDeleteMatch[1]}' AND user_id = '${user.userId}'`));
                        return new Response(JSON.stringify({ success: true }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent link delete error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // ─── Agent Bottlenecks API ─────────────────────────────────────────

                    // GET /api/agents/bottlenecks — get bottleneck analysis for all deployed agents
                    if (pathname === "/api/agents/bottlenecks" && req.method === "GET") {
                      try {
                        const user = await getUserFromRequest(req);
                        if (!user || !user.userId) {
                          return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
                        }

                        const { listAgentInstances } = await import("./src/agents/schema");
                        const instances = await listAgentInstances(user.userId);

                        if (instances.length === 0) {
                          return new Response(JSON.stringify({ success: true, bottlenecks: [], totalBottlenecks: 0 }), {
                            status: 200,
                            headers: { "Content-Type": "application/json" },
                          });
                        }

                        // Analyze bottlenecks for each agent
                        const bottlenecks: any[] = [];

                        for (const instance of instances) {
                          const mapping = getWorkflowMapping(instance.agentType);
                          if (!mapping) continue;

                          // Get execution history for this agent
                          const executionRows = await db.all(sql.raw(`SELECT data FROM portal_data WHERE user_id = '${user.userId}' AND section = 'agent_executions' ORDER BY created_at DESC LIMIT 50`));
                          const executions = (executionRows as any[])
                            .map((r: any) => JSON.parse(typeof r.data === "string" ? r.data : r.data))
                            .filter((e: any) => e.agentId === instance.id);

                          // Calculate failure rate
                          const totalExecutions = executions.length;
                          const failedExecutions = executions.filter((e: any) => e.status === "failed").length;
                          const failureRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0;

                          // Check if human review steps are being triggered frequently
                          const humanReviewCount = executions.filter((e: any) =>
                            e.steps?.some((s: any) => s.status === "failed" || s.confidence < 0.5)
                          ).length;
                          const humanReviewRate = totalExecutions > 0 ? (humanReviewCount / totalExecutions) * 100 : 0;

                          // Check for execution time anomalies
                          const avgExecutionTime = totalExecutions > 0
                            ? executions.reduce((sum: number, e: any) => {
                                const duration = e.completedAt && e.startedAt ? e.completedAt - e.startedAt : 0;
                                return sum + duration;
                              }, 0) / totalExecutions
                            : 0;

                          // Get bottleneck indicators from workflow mapping
                          const indicators = mapping.bottleneckIndicators.map((indicator) => {
                            let triggered = false;
                            let severity: "low" | "medium" | "high" = "low";

                            // Check if indicator relates to failure rate
                            if (indicator.includes("manual review") && humanReviewRate > 10) {
                              triggered = true;
                              severity = humanReviewRate > 20 ? "high" : "medium";
                            }
                            if (indicator.includes("accuracy") && failureRate > 5) {
                              triggered = true;
                              severity = failureRate > 15 ? "high" : "medium";
                            }
                            if (indicator.includes("error") && failureRate > 10) {
                              triggered = true;
                              severity = failureRate > 20 ? "high" : "medium";
                            }

                            return { indicator, triggered, severity };
                          });

                          const activeBottlenecks = indicators.filter((i) => i.triggered);

                          if (activeBottlenecks.length > 0) {
                            bottlenecks.push({
                              agentId: instance.id,
                              agentName: instance.name,
                              agentType: instance.agentType,
                              status: instance.status,
                              metrics: {
                                totalExecutions,
                                failedExecutions,
                                failureRate: parseFloat(failureRate.toFixed(1)),
                                humanReviewRate: parseFloat(humanReviewRate.toFixed(1)),
                                avgExecutionTimeMs: parseFloat(avgExecutionTime.toFixed(0)),
                              },
                              activeBottlenecks,
                              totalBottlenecks: activeBottlenecks.length,
                            });
                          }
                        }

                        // Save bottleneck analysis results
                        if (bottlenecks.length > 0) {
                          const now = Date.now();
                          const bottleneckId = crypto.randomUUID();
                          await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${bottleneckId}', '${user.userId}', 'bottlenecks', '${JSON.stringify({ bottlenecks, analyzedAt: now }).replace(/'/g, "''")}', ${now}, ${now})`));
                        }

                        return new Response(JSON.stringify({
                          success: true,
                          bottlenecks,
                          totalBottlenecks: bottlenecks.length,
                          totalAgents: instances.length,
                        }), {
                          status: 200,
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch (err: any) {
                        console.error("[serve.ts] Agent bottlenecks error:", err);
                        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
                      }
                    }

                    // ─── Marketplace API ────────────────────────────────────────────────

        // GET /api/marketplace/items — return marketplace items with setup requirements
        if (pathname === "/api/marketplace/items" && req.method === "GET") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            // Get agent types with setup requirements
            const types = listAgentTypes();
            const typesWithSetup = getAgentTypesWithSetup(types);

            // Get marketplace items from database
            const rows = await db.all(sql.raw(`SELECT id, data FROM portal_data WHERE user_id = '${userId}' AND section = 'marketplace' ORDER BY created_at DESC LIMIT 1`));
            let items: any[] = [];
            if (rows.length > 0) {
              const row = rows[0] as any;
              const data = JSON.parse(typeof row.data === "string" ? row.data : row.data);
              items = Array.isArray(data) ? data : (data.data || []);
            }

            // Build a map of agent type name -> setup requirements
            const setupMap: Record<string, any> = {};
            for (const t of typesWithSetup) {
              setupMap[t.name.toLowerCase()] = t.setupRequirements;
            }

            // Enrich items with setup requirements
            const enrichedItems = items.map((item: any) => {
              const key = item.name?.toLowerCase() || "";
              const setup = setupMap[key] || null;
              return {
                ...item,
                setupRequirements: setup,
                badges: setup?.badges || [],
              };
            });

            return new Response(JSON.stringify({
              success: true,
              items: enrichedItems,
              agentTypes: typesWithSetup,
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Marketplace items error:", err);
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/billing/portal — redirect to Stripe customer portal
        // Note: In production, this should call the Stripe Customer Portal API
        // to create a billing portal session. Without a STRIPE_SECRET_KEY, we
        // return a helpful message directing users to contact support.
        if (pathname === "/api/billing/portal" && req.method === "GET") {
          const url = new URL(req.url);
          const email = url.searchParams.get("email");

          // If we have a Stripe secret key, create a real portal session
          if (process.env.STRIPE_SECRET_KEY) {
            try {
              const Stripe = await import("stripe");
              const stripe = new Stripe.default(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-03-31.beta" as any });
              // Look up customer by email
              const customers = await stripe.customers.list({ email: email || "", limit: 1 });
              const customerId = customers.data[0]?.id;
              if (customerId) {
                const session = await stripe.billingPortal.sessions.create({
                  customer: customerId,
                  return_url: "https://simplerlife100.ctonew.app/portal/billing",
                });
                return new Response(JSON.stringify({ url: session.url }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                });
              }
            } catch (err: any) {
              console.error("[billing/portal] Stripe portal error:", err);
            }
          }

          // No Stripe key or no customer found
          return new Response(JSON.stringify({
            url: null,
            message: "To manage your subscription, please contact support at support@simplerlife100.ctonew.app",
            contactEmail: "support@simplerlife100.ctonew.app",
          }), {
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

            // Save permanently to disk for future download
            const permanentPath = `/home/team/shared/uploads/${id}_${file.name}`;
            await fs.mkdir("/home/team/shared/uploads", { recursive: true });
            await fs.writeFile(permanentPath, Buffer.from(arrayBuffer)).catch(err => console.error("[serve.ts] Permanent upload copy error:", err));

            // Map document type to agent
            const docTypeLower = (extractResult.documentType || "unknown").toLowerCase();
            let routedAgent = "Document AI System";
            let routedAgentType = "document_intake";

            if (docTypeLower.includes("invoice") || docTypeLower.includes("bill") || docTypeLower.includes("receipt") || docTypeLower.includes("ledger")) {
              routedAgent = "Invoice & Ledger AI";
              routedAgentType = "invoice_ledger";
            } else if (docTypeLower.includes("medical") || docTypeLower.includes("patient") || docTypeLower.includes("health") || docTypeLower.includes("clinical")) {
              routedAgent = "Healthcare Intake AI";
              routedAgentType = "healthcare_intake";
            } else if (docTypeLower.includes("resume") || docTypeLower.includes("w9") || docTypeLower.includes("w-9") || docTypeLower.includes("background") || docTypeLower.includes("onboarding") || docTypeLower.includes("hr")) {
              routedAgent = "HR Intake & Compliance AI";
              routedAgentType = "hr_compliance";
            } else if (docTypeLower.includes("contract") || docTypeLower.includes("agreement") || docTypeLower.includes("nda") || docTypeLower.includes("lease") || docTypeLower.includes("legal")) {
              routedAgent = "Contract Management AI";
              routedAgentType = "contract_management";
            } else if (docTypeLower.includes("purchase") || docTypeLower.includes("po") || docTypeLower.includes("vendor") || docTypeLower.includes("procurement")) {
              routedAgent = "Procurement & Vendor Management AI";
              routedAgentType = "procurement_vendor";
            } else if (docTypeLower.includes("inventory") || docTypeLower.includes("stock") || docTypeLower.includes("warehouse")) {
              routedAgent = "Inventory Management AI";
              routedAgentType = "inventory_management";
            } else if (docTypeLower.includes("financial") || docTypeLower.includes("p&l") || docTypeLower.includes("p_and_l") || docTypeLower.includes("tax") || docTypeLower.includes("budget") || docTypeLower.includes("planning")) {
              routedAgent = "Financial Planning & FP&A AI";
              routedAgentType = "fp_and_a";
            } else if (docTypeLower.includes("network") || docTypeLower.includes("system") || docTypeLower.includes("it") || docTypeLower.includes("devops") || docTypeLower.includes("terraform")) {
              routedAgent = "IT Operations & DevOps AI";
              routedAgentType = "it_operations";
            } else if (docTypeLower.includes("marketing") || docTypeLower.includes("social") || docTypeLower.includes("campaign") || docTypeLower.includes("ad")) {
              routedAgent = "Marketing & Social Media AI";
              routedAgentType = "marketing_social";
            }

            const dataToStore = {
              file_name: file.name,
              file_size: file.size,
              file_extension: ext,
              extracted_text: extractResult.extractedText,
              document_type: extractResult.documentType,
              key_info: extractResult.keyInfo,
              status: "processed",
              routed_agent: routedAgent,
              routed_agent_type: routedAgentType,
              routing_status: "Auto-Routed"
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
              routedAgent,
              routedAgentType,
              routingStatus: "Auto-Routed"
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Upload POST error:", err);
            return new Response(JSON.stringify({ error: "Failed to upload and process document: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // GET /api/download/:id — download a previously uploaded document
        const downloadMatch = pathname.match(/^\/api\/download\/([a-f0-9-]+)$/);
        if (downloadMatch && req.method === "GET") {
          try {
            const token = getCookie(req, "session");
            if (!token) return new Response(JSON.stringify({ error: "Not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
            const userId = await verifySessionToken(token);
            if (!userId) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });

            const docId = downloadMatch[1];
            const rows = await db.all(sql.raw(`SELECT id, data FROM portal_data WHERE id = '${docId}' AND user_id = '${userId}' AND section = 'documents'`));
            if (rows.length === 0) {
              return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
            }

            const docData = JSON.parse(rows[0].data);
            const fileName = docData.file_name || "document";
            const fileExt = docData.file_extension || fileName.split(".").pop().toLowerCase();
            const filePath = `/home/team/shared/uploads/${docId}_${fileName}`;

            const fs = await import("node:fs/promises");
            try {
              const fileContent = await fs.readFile(filePath);
              const mimeTypes: Record<string, string> = {
                "pdf": "application/pdf",
                "doc": "application/msword",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "xls": "application/vnd.ms-excel",
                "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "csv": "text/csv",
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "tiff": "image/tiff"
              };
              const contentType = mimeTypes[fileExt] || "application/octet-stream";

              return new Response(fileContent, {
                status: 200,
                headers: {
                  "Content-Type": contentType,
                  "Content-Disposition": `attachment; filename="${fileName}"`,
                }
              });
            } catch (fileErr) {
              // If the file is not on disk (e.g. from an old upload, or if we want to fallback), we can return the extracted text as a .txt download
              if (docData.extracted_text) {
                return new Response(docData.extracted_text, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/plain",
                    "Content-Disposition": `attachment; filename="${fileName}.txt"`,
                  }
                });
              }
              return new Response(JSON.stringify({ error: "File content not found on disk" }), { status: 404, headers: { "Content-Type": "application/json" } });
            }
          } catch (err: any) {
            console.error("[serve.ts] Download GET error:", err);
            return new Response(JSON.stringify({ error: "Failed to download document: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
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
              const productName = session.metadata?.product_name || session.metadata?.product || "Document AI System";

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
