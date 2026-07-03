// Production server for the built site.
// @ts-expect-error this is a build artifact that might not exist yet
import handler from "./dist/server/server.js";
import { createAuditForEmailInternal } from "./src/db/queries";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./src/db/index";
import { users, audits, agentRuns, agentFiles } from "./src/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "./src/db/auth";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function setCookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

async function parseJSON(req: Request): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}

async function getAuthUserId(req: Request): Promise<string | null> {
  const token = getCookie(req, "session");
  if (!token) return null;
  return await verifySessionToken(token);
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function authRequired(userId: string | null): Response | null {
  if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
  return null;
}

function badRequest(msg: string): Response {
  return jsonResponse({ error: msg }, 400);
}

// ─── Agent Runner Helper ──────────────────────────────────────────

async function countAgentRuns(userId: string, agentName: string): Promise<number> {
  const rows = await db.select({ count: sql`count(*)` })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.agentName, agentName)));
  return Number(rows[0]?.count || 0);
}

// Free port
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        console.log(`[serve.ts] FETCH: ${req.method} ${pathname}`);

        // ─── Auth Routes ──────────────────────────────────────────────────

        if (pathname === "/api/register" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) return badRequest("Email and password required");
          try {
            const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
            if (existing) return jsonResponse({ error: "Account already exists, please login" }, 409);
            const hashed = await hashPassword(body.password);
            const id = crypto.randomUUID();
            await db.insert(users).values({ id, email: body.email, password: hashed, createdAt: new Date() });
            const token = await createSessionToken(id);
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json", "Set-Cookie": setCookieHeader("session", token, 7200) },
            });
          } catch (err: any) {
            console.error("[serve.ts] Register error:", err);
            return jsonResponse({ error: "Registration failed" }, 500);
          }
        }

        if (pathname === "/api/login" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) return badRequest("Email and password required");
          try {
            const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
            if (!user || !(await verifyPassword(body.password, user.password))) {
              return jsonResponse({ error: "Invalid email or password" }, 401);
            }
            const token = await createSessionToken(user.id);
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json", "Set-Cookie": setCookieHeader("session", token, 7200) },
            });
          } catch (err: any) {
            console.error("[serve.ts] Login error:", err);
            return jsonResponse({ error: "Login failed" }, 500);
          }
        }

        if (pathname === "/api/logout" && req.method === "POST") {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Set-Cookie": clearCookieHeader("session") },
          });
        }

        if (pathname === "/api/me" && req.method === "GET") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
          if (!user) return jsonResponse({ error: "User not found" }, 401);
          return jsonResponse({ id: user.id, email: user.email });
        }

        // ─── Audit Routes ─────────────────────────────────────────────────

        if (pathname === "/api/audits" && req.method === "GET") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const userAudits = await db.query.audits.findMany({
            where: eq(audits.userId, userId),
            orderBy: (a, { desc }) => [desc(a.createdAt)],
          });
          return jsonResponse(userAudits);
        }

        if (pathname.startsWith("/api/audits/") && pathname !== "/api/audits" && req.method === "GET") {
          const auditId = pathname.replace("/api/audits/", "");
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const audit = await db.query.audits.findFirst({
            where: and(eq(audits.id, auditId), eq(audits.userId, userId)),
          });
          if (!audit) return jsonResponse({ error: "Audit not found" }, 404);
          return jsonResponse(audit);
        }

        // ─── Agent Implementation API ─────────────────────────────────────

        // GET /api/agents — list deployed agents for the logged-in user
        if (pathname === "/api/agents" && req.method === "GET") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);

          const implementedAudits = await db.query.audits.findMany({
            where: and(eq(audits.userId, userId), eq(audits.status, "implemented")),
          });

          interface AgentInfo {
            id: string;
            name: string;
            workflows: string[];
            savings: number;
            status: string;
            auditId: string;
            lastRun: { status: string; message: string; timestamp: Date } | null;
            runCount: number;
          }

          const agents: AgentInfo[] = [];
          for (const audit of implementedAudits) {
            let parsed: any = {};
            try { parsed = JSON.parse(audit.results || "{}"); } catch {}
            const implAgents: Array<{ name: string; workflows: string[]; savings: number }> = parsed?.implementation?.agents || [];

            for (const ag of implAgents) {
              const latestRun = await db.query.agentRuns.findFirst({
                where: and(eq(agentRuns.userId, userId), eq(agentRuns.agentName, ag.name)),
                orderBy: (r, { desc }) => [desc(r.createdAt)],
              });

              agents.push({
                id: `${audit.id}-${ag.name?.toLowerCase().replace(/\s+/g, "-")}`,
                name: ag.name,
                workflows: ag.workflows || [],
                savings: ag.savings || 0,
                status: "active",
                auditId: audit.id,
                lastRun: latestRun ? {
                  status: latestRun.status,
                  message: latestRun.message || "",
                  timestamp: latestRun.createdAt,
                } : null,
                runCount: await countAgentRuns(userId, ag.name),
              });
            }
          }

          return jsonResponse(agents);
        }

        // POST /api/agents/run — run a specific agent workflow
        if (pathname === "/api/agents/run" && req.method === "POST") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);

          const body = await parseJSON(req);
          if (!body || !body.agentName || !body.workflowKey) return badRequest("agentName and workflowKey required");

          try {
            const runId = crypto.randomUUID();
            const now = new Date();

            // Query uploaded files for this agent
            const userFiles = await db.query.agentFiles.findMany({
              where: and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, body.agentName)),
            });
            const fileContext = userFiles.map(f => ({ fileName: f.fileName, filePath: f.filePath }));

            const inputData = {
              ...(body.inputData || {}),
              uploaded_files: fileContext,
            };
            const inputJson = JSON.stringify(inputData);

            // Call the Python agent framework via a temp script
            const scriptPath = `/tmp/agent-run-${runId}.py`;
            const safeJson = inputJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            const pyScript = `
import sys, json
sys.path.insert(0, '/home/team/shared/agents')
from agent import SimplerLife100Agent
agent = SimplerLife100Agent()
input_data = json.loads('${safeJson}')
result = agent.run_industry_workflow("${body.workflowKey.replace(/"/g, '\\"')}", input_data)
print(json.dumps({
  "success": result.success,
  "message": result.message,
  "data": result.data,
  "requires_human_review": result.requires_human_review
}))
`;
            await Bun.write(scriptPath, pyScript);
            const proc = Bun.spawnSync(["python3", scriptPath]);
            const stdout = proc.stdout.toString();
            const stderr = proc.stderr.toString();
            await Bun.$`rm -f ${scriptPath}`.quiet().nothrow();

            let parsed: any = {};
            let runStatus = "success";
            let runMessage = "";

            try {
              parsed = JSON.parse(stdout.trim());
              runStatus = parsed.requires_human_review ? "human_review" : (parsed.success ? "success" : "failed");
              runMessage = parsed.message || "";
            } catch {
              runStatus = "failed";
              runMessage = stderr || "Failed to parse agent output";
            }

            await db.insert(agentRuns).values({
              id: runId,
              userId,
              auditId: body.auditId || null,
              agentName: body.agentName,
              workflowKey: body.workflowKey,
              inputData: JSON.stringify(body.inputData || {}),
              resultData: JSON.stringify(parsed),
              status: runStatus,
              message: runMessage,
              createdAt: now,
              updatedAt: now,
            });

            return jsonResponse({ id: runId, status: runStatus, message: runMessage, data: parsed });
          } catch (err: any) {
            console.error("[serve.ts] Agent run error:", err);
            return jsonResponse({ error: "Failed to run agent" }, 500);
          }
        }

        // GET /api/agents/history — get run history
        if (pathname === "/api/agents/history" && req.method === "GET") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const runs = await db.query.agentRuns.findMany({
            where: eq(agentRuns.userId, userId),
            orderBy: (r, { desc }) => [desc(r.createdAt)],
            limit: 50,
          });
          return jsonResponse(runs);
        }

        // POST /api/agents/feedback — submit feedback on an agent run
        if (pathname === "/api/agents/feedback" && req.method === "POST") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const body = await parseJSON(req);
          if (!body || !body.runId || !body.feedback) return badRequest("runId and feedback required");
          await db.update(agentRuns)
            .set({ feedback: body.feedback, updatedAt: new Date() })
            .where(and(eq(agentRuns.id, body.runId), eq(agentRuns.userId, userId)));
          return jsonResponse({ success: true });
        }

        // POST /api/agents/upload — upload business file for an agent
        if (pathname === "/api/agents/upload" && req.method === "POST") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          try {
            const formData = await req.formData();
            const file = formData.get("file") as File;
            const agentName = formData.get("agentName") as string;
            if (!file || !agentName) return badRequest("file and agentName required");

            const fs = await import("node:fs/promises");
            await fs.mkdir("/home/team/shared/uploads", { recursive: true });

            const fileId = crypto.randomUUID();
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const filePath = `/home/team/shared/uploads/${fileId}_${safeName}`;

            await Bun.write(filePath, await file.arrayBuffer());

            await db.insert(agentFiles).values({
              id: fileId,
              userId,
              agentName,
              fileName: file.name,
              filePath,
              fileSize: file.size,
              createdAt: new Date(),
            });

            return jsonResponse({ success: true, file: { id: fileId, fileName: file.name } });
          } catch (err: any) {
            console.error("[serve.ts] File upload error:", err);
            return jsonResponse({ error: "Failed to upload file" }, 500);
          }
        }

        // GET /api/agents/files — list uploaded files for logged-in user
        if (pathname === "/api/agents/files" && req.method === "GET") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          try {
            const { searchParams } = new URL(req.url);
            const agentName = searchParams.get("agentName");

            let filesList;
            if (agentName) {
              filesList = await db.query.agentFiles.findMany({
                where: and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, agentName)),
                orderBy: (f, { desc }) => [desc(f.createdAt)],
              });
            } else {
              filesList = await db.query.agentFiles.findMany({
                where: eq(agentFiles.userId, userId),
                orderBy: (f, { desc }) => [desc(f.createdAt)],
              });
            }
            return jsonResponse(filesList);
          } catch (err: any) {
            console.error("[serve.ts] Get files error:", err);
            return jsonResponse({ error: "Failed to get files" }, 500);
          }
        }

        // POST /api/agents/files/delete — delete an uploaded file
        if (pathname === "/api/agents/files/delete" && req.method === "POST") {
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const body = await parseJSON(req);
          if (!body || !body.fileId) return badRequest("fileId required");

          try {
            const record = await db.query.agentFiles.findFirst({
              where: and(eq(agentFiles.id, body.fileId), eq(agentFiles.userId, userId)),
            });
            if (!record) return jsonResponse({ error: "File not found" }, 404);

            const fs = await import("node:fs/promises");
            await fs.unlink(record.filePath).catch(() => {});

            await db.delete(agentFiles).where(eq(agentFiles.id, body.fileId));
            return jsonResponse({ success: true });
          } catch (err: any) {
            console.error("[serve.ts] Delete file error:", err);
            return jsonResponse({ error: "Failed to delete file" }, 500);
          }
        }

        // GET /api/agents/live-status — current agent activity from scheduler
        if (pathname === "/api/agents/live-status" && req.method === "GET") {
          const fs = await import("node:fs/promises");
          try {
            const data = await fs.readFile("/home/team/shared/agent_live_status.json", "utf-8");
            return jsonResponse(JSON.parse(data));
          } catch {
            return jsonResponse({ status: "idle", step: "No activity", agent_name: "system", last_updated: new Date().toISOString() });
          }
        }

        // GET /api/agents/integrations — integration monitoring for deployed agents
        if (pathname === "/api/agents/integrations" && req.method === "GET") {
          try {
            const pythonCode = `
import sys, json
sys.path.insert(0, '/home/team/shared/agents')
from integrations import get_integration_summary, INTEGRATION_MAP, ALL_INTEGRATION_CATEGORIES
print(json.dumps({
  "categories": get_integration_summary(),
  "total_agents": len(INTEGRATION_MAP),
  "total_integrations": sum(len(v["integrations"]) for v in INTEGRATION_MAP.values()),
}))
`;
            const proc = Bun.spawnSync(["python3", "-c", pythonCode]);
            if (proc.stdout.toString().trim()) {
              const data = JSON.parse(proc.stdout.toString().trim());
              return jsonResponse(data);
            }
          } catch (err: any) {
            console.error("[serve.ts] Integrations error:", err);
          }
          return jsonResponse({ categories: [], total_agents: 0, total_integrations: 0 });
        }

        // GET /api/agents/integrations/:agent — integrations for a specific agent
        if (pathname.startsWith("/api/agents/integrations/") && req.method === "GET") {
          const agentName = pathname.replace("/api/agents/integrations/", "").replace(/%20/g, " ");
          try {
            const pythonCode = `
import sys, json
sys.path.insert(0, '/home/team/shared/agents')
from integrations import get_integrations_for_agent
print(json.dumps(get_integrations_for_agent("${agentName.replace(/"/g, '\\"')}")))
`;
            const proc = Bun.spawnSync(["python3", "-c", pythonCode]);
            if (proc.stdout.toString().trim()) {
              return jsonResponse(JSON.parse(proc.stdout.toString().trim()));
            }
          } catch {}
          return jsonResponse([]);
        }

        // GET /api/monitoring/status — read cached integration health monitoring status
        if (pathname === "/api/monitoring/status" && req.method === "GET") {
          const fs = await import("node:fs/promises");
          const monitorPath = "/home/team/shared/integration_health_status.json";
          try {
            const data = await fs.readFile(monitorPath, "utf-8");
            return jsonResponse(JSON.parse(data));
          } catch {
            // If the file doesn't exist yet, run the monitor synchronously first
            console.log("[serve.ts] Health status file not found, running monitor.py...");
            const proc = Bun.spawnSync(["python3", "/home/team/shared/agents/monitor.py"]);
            try {
              const data = await fs.readFile(monitorPath, "utf-8");
              return jsonResponse(JSON.parse(data));
            } catch (err: any) {
              return jsonResponse({ error: "Failed to generate health report", details: err.message }, 500);
            }
          }
        }

        // POST /api/monitoring/refresh — force execute live health checks
        if (pathname === "/api/monitoring/refresh" && req.method === "POST") {
          const fs = await import("node:fs/promises");
          const monitorPath = "/home/team/shared/integration_health_status.json";
          console.log("[serve.ts] Triggering live health check refresh via monitor.py...");
          const proc = Bun.spawnSync(["python3", "/home/team/shared/agents/monitor.py"]);
          try {
            const data = await fs.readFile(monitorPath, "utf-8");
            return jsonResponse(JSON.parse(data));
          } catch (err: any) {
            return jsonResponse({ error: "Failed to refresh health report", details: err.message }, 500);
          }
        }

        // ─── Other Existing Routes ─────────────────────────────────────────

        if (pathname === "/api/submit-feedback" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.auditId || !body.requestText) return badRequest("Audit ID and request text required");
          const userId = await getAuthUserId(req);
          if (!userId) return jsonResponse({ error: "Not logged in" }, 401);
          const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
          const fs = await import("node:fs/promises");
          await fs.appendFile("/home/team/shared/feedback.json",
            JSON.stringify({ auditId: body.auditId, userId, email: user?.email, requestText: body.requestText, status: "pending", timestamp: new Date().toISOString() }) + ",\n");
          return jsonResponse({ success: true });
        }

        if (pathname === "/api/submit-lead" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body) return badRequest("Invalid body");
          const fs = await import("node:fs/promises");
          await fs.appendFile("/home/team/shared/leads.json",
            JSON.stringify({ timestamp: new Date().toISOString(), ...body }) + ",\n");
          return jsonResponse({ success: true });
        }

        if (pathname === "/api/check-user-exists" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email) return badRequest("Email required");
          const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
          return jsonResponse({ exists: !!user, needsPasswordReset: user?.needsPasswordReset || false });
        }

        if (pathname === "/api/set-password" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.password) return badRequest("Email and password required");
          if (body.password.length < 8) return badRequest("Password must be at least 8 characters");
          try {
            const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
            if (!user) return jsonResponse({ error: "No account found with this email" }, 404);
            await db.update(users).set({ password: await hashPassword(body.password), needsPasswordReset: false })
              .where(eq(users.email, body.email));
            return jsonResponse({ success: true });
          } catch (err: any) {
            console.error("[serve.ts] Set password error:", err);
            return jsonResponse({ error: "Failed to set password" }, 500);
          }
        }

        if (pathname === "/api/claim-purchase" && req.method === "POST") {
          const body = await parseJSON(req);
          if (!body || !body.email || !body.product) return badRequest("Email and product required");
          try {
            const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
            if (user) {
              const existing = await db.query.audits.findFirst({
                where: and(eq(audits.userId, user.id), eq(audits.type, body.product)),
              });
              if (existing) return jsonResponse({ error: "You already have an audit of this type linked to your account.", email: body.email }, 409);
            }
            const result = await createAuditForEmailInternal(body.email, body.product);
            return jsonResponse({ success: true, email: body.email, product: body.product, auditId: result.auditId });
          } catch (err: any) {
            console.error("[serve.ts] Claim purchase error:", err);
            return jsonResponse({ error: "Failed to claim purchase" }, 500);
          }
        }

        // ─── Stripe Webhook ───────────────────────────────────────

        if (pathname === "/api/stripe-webhook") {
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body.type === "checkout.session.completed") {
                const session = body.data.object;
                const email = session.customer_details?.email || session.customer_email;
                const amount = session.amount_total / 100;
                let auditType = "Custom Audit";
                if (amount === 2500) auditType = "Deep-Dive AI Opportunity Audit";
                else if (amount === 7500) auditType = "Starter Implementation";
                else if (amount === 15000) auditType = "Growth Implementation";
                else if (amount === 30000) auditType = "Scale Implementation";
                else if (amount === 750 || amount === 2000) auditType = "Monthly Operations";
                if (email) {
                  console.log(`[serve.ts] Purchase: ${email} -> ${auditType}`);
                  await createAuditForEmailInternal(email, auditType);
                }
              }
              return jsonResponse({ received: true });
            } catch (err) {
              console.error("[serve.ts] Stripe webhook error:", err);
              return jsonResponse({ error: "Internal Server Error" }, 500);
            }
          }
          return new Response("Method Not Allowed", { status: 405 });
        }

        // ─── Static Files & SSR ────────────────────────────────────

        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) {
            const ext = pathname.split(".").pop()?.toLowerCase();
            const maxAge = ["js","css","woff","woff2","ttf"].includes(ext||"") ? 31536000
                       : ["png","jpg","jpeg","gif","svg","webp","ico"].includes(ext||"") ? 2592000 : 0;
            return new Response(file, {
              headers: maxAge ? { "Cache-Control": `public, max-age=${maxAge}, immutable` } : {},
            });
          }
        }
        return (handler as { fetch: (r: Request) => Response | Promise<Response> }).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

// Background 24/7 Agent Scheduler
let schedulerCycleCount = 0;
setInterval(async () => {
  try {
    schedulerCycleCount++;
    if (schedulerCycleCount % 5 === 1) { // Run on 1st cycle, then every 5th cycle (5 minutes)
      console.log("[serve.ts] Running scheduled integration health checks...");
      Bun.spawn(["python3", "/home/team/shared/agents/monitor.py"]);
    }

    console.log("[serve.ts] Background scheduler check...");
    // Find all implemented audits
    const implementedAudits = await db.query.audits.findMany({
      where: eq(audits.status, "implemented"),
    });

    for (const audit of implementedAudits) {
      const userId = audit.userId;
      let parsed: any = {};
      try { parsed = JSON.parse(audit.results || "{}"); } catch {}
      const implAgents = parsed?.implementation?.agents || [];

      for (const ag of implAgents) {
        // Randomly decide to run a workflow (e.g., 30% chance every check)
        if (Math.random() > 0.3) continue;

        const workflows = ag.workflows || [];
        if (workflows.length === 0) continue;

        // Choose a random workflow
        const wf = workflows[Math.floor(Math.random() * workflows.length)];

        // Map agent names and workflow names to correct workflow keys using Python resolver
        // Call the Python agent framework to resolve the key
        let workflowKey = "";
        try {
          const resolveScript = `
import sys
sys.path.insert(0, '/home/team/shared/agents')
from agent import resolve_workflow_key
print(resolve_workflow_key("${ag.name.replace(/"/g, '\\"')}", "${wf.replace(/"/g, '\\"')}"))
`;
          const resolvePath = `/tmp/wf-resolve-${crypto.randomUUID()}.py`;
          const fs = await import("node:fs/promises");
          await fs.writeFile(resolvePath, resolveScript);
          const proc = Bun.spawnSync(["python3", resolvePath]);
          await fs.unlink(resolvePath).catch(() => {});
          if (proc.stdout.toString().trim()) {
            workflowKey = proc.stdout.toString().trim();
          }
        } catch {}
        
        if (!workflowKey) {
          workflowKey = `${ag.name.toLowerCase().replace(/\s+/g, "_")}_${wf.toLowerCase().replace(/\s+/g, "_")}`;
        }

        // Check if there's any uploaded file for this agent to use as input
        const userFiles = await db.query.agentFiles.findMany({
          where: and(eq(agentFiles.userId, userId), eq(agentFiles.agentName, ag.name)),
        });

        const fileContext = userFiles.map(f => ({ fileName: f.fileName, filePath: f.filePath }));

        // Check when the last run was. If it was less than 5 minutes ago, skip to avoid spam.
        const latestRun = await db.query.agentRuns.findFirst({
          where: and(eq(agentRuns.userId, userId), eq(agentRuns.agentName, ag.name), eq(agentRuns.workflowKey, workflowKey)),
          orderBy: (r, { desc }) => [desc(r.createdAt)],
        });

        if (latestRun && (Date.now() - new Date(latestRun.createdAt).getTime() < 300000)) {
          // Less than 5 mins ago
          continue;
        }

        console.log(`[serve.ts] Auto-running background agent workflow: ${workflowKey} for user ${userId}`);

        // Update live status
        try {
          await Bun.write("/home/team/shared/agent_live_status.json", JSON.stringify({
            agent_name: ag.name,
            status: "processing",
            step: `Running ${workflowKey.replace(/_/g, " ")}...`,
            file_processing: fileContext[0]?.fileName || "",
            last_updated: new Date().toISOString(),
            timestamp: Date.now(),
          }));
        } catch {}

        const runId = crypto.randomUUID();
        const now = new Date();
        const inputData = {
          test: true,
          scheduled: true,
          timestamp: now.toISOString(),
          uploaded_files: fileContext,
        };
        const inputJson = JSON.stringify(inputData);
        const safeJson = inputJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        // Run Python agent script
        const scriptPath = `/tmp/agent-run-${runId}.py`;
        const pyScript = `
import sys, json
sys.path.insert(0, '/home/team/shared/agents')
from agent import SimplerLife100Agent
agent = SimplerLife100Agent()
input_data = json.loads('${safeJson}')
result = agent.run_industry_workflow("${workflowKey.replace(/"/g, '\\"')}", input_data)
print(json.dumps({
  "success": result.success,
  "message": result.message,
  "data": result.data,
  "requires_human_review": result.requires_human_review
}))
`;
        const fs = await import("node:fs/promises");
        await fs.writeFile(scriptPath, pyScript);
        
        // Spawn Python process
        const proc = Bun.spawnSync(["python3", scriptPath]);
        const stdout = proc.stdout.toString();
        const stderr = proc.stderr.toString();
        await fs.unlink(scriptPath).catch(() => {});

        let parsedOut: any = {};
        let runStatus = "success";
        let runMessage = "";

        try {
          parsedOut = JSON.parse(stdout.trim());
          runStatus = parsedOut.requires_human_review ? "human_review" : (parsedOut.success ? "success" : "failed");
          runMessage = parsedOut.message || "";
        } catch {
          runStatus = "failed";
          runMessage = stderr || "Failed to parse agent output";
        }

        // Save background run
        await db.insert(agentRuns).values({
          id: runId,
          userId,
          auditId: audit.id,
          agentName: ag.name,
          workflowKey,
          inputData: JSON.stringify(inputData),
          resultData: JSON.stringify(parsedOut),
          status: runStatus,
          message: runMessage + " (Auto-Scheduled 24/7 Run)",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.error("[serve.ts] Background scheduler error:", err);
  }
}, 60000); // Check every 60 seconds

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);
