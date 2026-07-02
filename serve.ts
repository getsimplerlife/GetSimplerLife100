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
// @ts-expect-error this is a build artifact that might not exist yet
import handler from "./dist/server/server.js";
import { createAuditForEmailInternal } from "./src/db/queries";
import { eq } from "drizzle-orm";
import { db } from "./src/db/index";
import { users } from "./src/db/schema";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "./src/db/auth";

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
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": setCookieHeader("session", token, 7200),
              },
            });
          } catch (err: any) {
            console.error("[serve.ts] Register error:", err);
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
              return new Response(JSON.stringify({ error: "Invalid email or password" }), {
                status: 401, headers: { "Content-Type": "application/json" },
              });
            }
            const token = await createSessionToken(user.id);
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

        // ─── Stripe Webhook ────────────────────────────────────────────────

        // Handle Stripe Webhook
        if (pathname === "/api/stripe-webhook") {
          console.log(`[serve.ts] Stripe webhook path matched. Method: ${req.method}`);
          if (req.method === "POST") {
            try {
              const body = await req.json();
              console.log('[serve.ts] Received Stripe event type:', body.type);

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
                  console.log(`[serve.ts] Processing purchase for ${email}: ${auditType}`);
                  await createAuditForEmailInternal(email, auditType);
                  console.log(`[serve.ts] Successfully created audit for ${email}`);
                }
              }
              return new Response(JSON.stringify({ received: true }), {
                headers: { "Content-Type": "application/json" },
              });
            } catch (err) {
              console.error('[serve.ts] Error in Stripe webhook:', err);
              return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
          } else {
             return new Response("Method Not Allowed", { status: 405 });
          }
        }

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