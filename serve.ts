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

        // POST /api/chat — send a chat message
        if (pathname === "/api/chat" && req.method === "POST") {
          try {
            const body = await parseJSON(req);
            if (!body || !body.message) {
              return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            // Log the chat
            const user = await import("./src/api/auditLogs").then(m => m.getUserFromRequest(req));
            await import("./src/api/auditLogs").then(m => m.logAuditEvent({
              userId: user?.userId, userEmail: user?.userEmail,
              action: "chat_message", resource: "ai_assistant",
              details: { message: body.message },
              status: "success", severity: "info",
            }));
            // Generate a mock AI response
            const responses: Record<string, string> = {
              "show failed workflows": "📋 Here are your failed workflows:\n1. Invoice Reconciliation (failed at step 3/5)\n2. Customer Onboarding (timeout at step 7)\n3. Document Scan Pipeline (OCR failure)",
              "generate monthly report": "📊 Generating monthly report... Done! Check the Reports section for your PDF download.",
              "find invoice": "🔍 Found invoice matching your query. Invoice #1032 - $2,500.00 - Deep-Dive AI Audit - Status: Paid",
              "search customer records": "👥 Search results: Found 3 matching customers. View them in Customer Management.",
              "explain workflow": "⚙️ Workflow 'Invoice Processing':\n1. Receive invoice (email/webhook)\n2. OCR extraction\n3. Line-item matching\n4. Approval routing\n5. Payment trigger",
              "why did this fail": "🔍 Failure Analysis: Workflow 'Invoice Reconciliation' failed at step 3 (Line-item matching). Cause: Vendor format mismatch. Suggestion: Update the template mapper.",
              "build workflow": "🛠️ Opening Workflow Builder... You can drag-and-drop to create a new automation pipeline.",
              "forecast savings": "📈 Based on current automation metrics:\n- Monthly savings: $12,400\n- Projected annual savings: $148,800\n- ROI estimate: 3.2x in first year",
            };
            let reply = "I understand your request. Let me look into that for you.";
            const lower = body.message.toLowerCase();
            for (const [key, val] of Object.entries(responses)) {
              if (lower.includes(key)) { reply = val; break; }
            }
            return new Response(JSON.stringify({ reply }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Chat error:", err);
            return new Response(JSON.stringify({ error: "Chat failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
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

        // GET /api/billing/portal — redirect to Stripe customer portal
        if (pathname === "/api/billing/portal" && req.method === "GET") {
          return new Response(JSON.stringify({ url: "https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ─── Portal Data API (generic JSON store per user per section) ──────────

        // GET /api/data/:section — get all data for a section for the current user
        const dataMatch = pathname.match(/^\/api\/data\/([a-z-]+)$/);
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
            const id = crypto.randomUUID();
            const { _id, ...dataToStore } = body;
            await db.run(sql.raw(`INSERT INTO portal_data (id, user_id, section, data, created_at, updated_at) VALUES ('${id}', '${userId}', '${section}', '${JSON.stringify(dataToStore).replace(/'/g, "''")}', ${now}, ${now})`));
            return new Response(JSON.stringify({ success: true, id }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[serve.ts] Data POST error:", err);
            return new Response(JSON.stringify({ error: "Failed to save data" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }

        // DELETE /api/data/:section/:id — delete a data entry
        const deleteMatch = pathname.match(/^\/api\/data\/([a-z-]+)\/([a-f0-9-]+)$/);
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
            const key = await crypto.subtle.importKey(
              "raw", new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
              { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
            );
            const sigBytes = new Uint8Array(sig.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
            return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(signedPayload));
          } catch { return false; }
        }

        // Handle Stripe Webhook
        if (pathname === "/api/stripe-webhook") {
          console.log(`[serve.ts] Stripe webhook. Method: ${req.method}`);
          if (req.method === "POST") {
            try {
              const rawBody = await req.text();
              const sigHeader = req.headers.get("stripe-signature") || "";
              const isValid = verifyStripeSignature(rawBody, sigHeader);
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

                let auditType = "Custom Audit";
                if (amount === 2500) auditType = "Deep-Dive AI Opportunity Audit";
                else if (amount === 7500) auditType = "Starter Implementation";
                else if (amount === 15000) auditType = "Growth Implementation";
                else if (amount === 30000) auditType = "Scale Implementation";
                else if (amount === 750 || amount === 2000) auditType = "Monthly Operations";

                if (email) {
                  console.log(`[serve.ts] Purchase: ${email} → ${auditType}`);
                  await createAuditForEmailInternal(email, auditType);
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
            } catch (err) {
              console.error('[serve.ts] Stripe webhook error:', err);
              return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
          } else {
             return new Response("Method Not Allowed", { status: 405 });
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