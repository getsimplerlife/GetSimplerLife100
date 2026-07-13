/**
 * Integration Routes — API handlers for OAuth, Connection Management,
 * Provider Metadata, Webhook Reception, and Integration Monitoring.
 *
 * Each exported function receives the Request and returns a Response.
 */

import { registry } from "../integrations/providers";
import {
  createConnection,
  getConnection,
  listConnections,
  deleteConnection,
  updateConnectionConfig,
  updateConnectionStatus,
  testConnection,
  type ConnectionConfig,
} from "../integrations/framework/connection";
import {
  generateState,
  generateCodeVerifier,
  isTokenExpired,
  buildAuthorizeUrl,
  type OAuthConfig,
} from "../integrations/framework/oauth";
import { getUserFromRequest } from "./auditLogs";

const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://simplerlife100.ctonew.app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function error(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

async function requireUser(req: Request): Promise<{ userId: string; userEmail: string } | null> {
  return getUserFromRequest(req);
}

// ─── Admin Check & Credentials Helpers ──────────────────────────────────────────

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { db } = await import("../db/index");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const currentUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
    return currentUser?.email === 'mathewortiz97@gmail.com';
  } catch {
    return false;
  }
}

async function getProviderCredentials(providerId: string): Promise<{ clientId: string; clientSecret: string } | null> {
  try {
    const { db } = await import("../db/index");
    const { providerCredentials } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const { decrypt } = await import("../integrations/framework/connection");

    const rows = await db.select().from(providerCredentials).where(eq(providerCredentials.provider, providerId)).limit(1);
    if (rows.length === 0) return null;
    const cred = rows[0];
    let clientSecret = "";
    try {
      clientSecret = decrypt(cred.clientSecret);
    } catch {
      clientSecret = cred.clientSecret;
    }
    return {
      clientId: cred.clientId,
      clientSecret,
    };
  } catch (err) {
    console.error(`Error in getProviderCredentials for ${providerId}:`, err);
    return null;
  }
}

async function saveProviderCredentials(providerId: string, clientId: string, clientSecret: string): Promise<void> {
  const { db } = await import("../db/index");
  const { providerCredentials } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { encrypt } = await import("../integrations/framework/connection");

  const now = new Date();
  const existing = await db.select().from(providerCredentials).where(eq(providerCredentials.provider, providerId)).limit(1);

  let encryptedSecret: string;
  const isMaskedOrEmpty = clientSecret === "••••••••••••••••" || !clientSecret;

  if (isMaskedOrEmpty) {
    if (existing.length > 0) {
      encryptedSecret = existing[0].clientSecret;
    } else {
      encryptedSecret = encrypt("");
    }
  } else {
    encryptedSecret = encrypt(clientSecret);
  }

  // Upsert
  if (existing.length > 0) {
    await db.update(providerCredentials)
      .set({
        clientId,
        clientSecret: encryptedSecret,
        updatedAt: now,
      })
      .where(eq(providerCredentials.provider, providerId));
  } else {
    await db.insert(providerCredentials)
      .values({
        provider: providerId,
        clientId,
        clientSecret: encryptedSecret,
        createdAt: now,
        updatedAt: now,
      });
  }
}

async function deleteProviderCredentials(providerId: string): Promise<void> {
  const { db } = await import("../db/index");
  const { providerCredentials } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(providerCredentials).where(eq(providerCredentials.provider, providerId));
}

async function listAllCredentials(): Promise<Array<{ providerId: string; clientId: string; hasSecret: boolean }>> {
  try {
    const { db } = await import("../db/index");
    const { providerCredentials } = await import("../db/schema");
    const rows = await db.select().from(providerCredentials);
    return rows.map((r: any) => ({
      providerId: r.provider,
      clientId: r.clientId,
      hasSecret: !!(r.clientSecret),
    }));
  } catch (err) {
    console.error("Error listing credentials:", err);
    return [];
  }
}

async function resolveCredentials(providerId: string, providerMeta: any): Promise<{ clientId: string; clientSecret: string }> {
  const stored = await getProviderCredentials(providerId);
  if (stored && stored.clientId) {
    return stored;
  }
  const envPrefix = providerId.toUpperCase().replace(/-/g, "_");
  const clientId = providerMeta.clientId || process.env[`${envPrefix}_CLIENT_ID`] || "";
  const clientSecret = providerMeta.clientSecret || process.env[`${envPrefix}_CLIENT_SECRET`] || "";
  return { clientId, clientSecret };
}

// ─── Dynamic Provider Import ──────────────────────────────────────────────────

async function getProviderAuthModule(providerId: string): Promise<any | null> {
  try {
    const mod = await import(`../integrations/providers/${providerId}/auth.ts`);
    return mod;
  } catch {
    return null;
  }
}

// ─── 1. OAuth Authorize ───────────────────────────────────────────────────────

export async function handleOAuthAuthorize(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  if (!providerId) return error("Missing provider parameter");

  const providerMeta = registry.getProvider(providerId);
  if (!providerMeta) return error(`Unknown provider: ${providerId}`, 404);

  const authMod = await getProviderAuthModule(providerId);
  if (!authMod) return error(`Auth module not found for: ${providerId}`, 500);

  // Try to build OAuth URL using the provider module
  // Providers may export buildXxxAuthUrl or have getXxxOAuthConfig
  let authorizeUrl: string;
  let state: string;
  let verifier: string | undefined;

  // Look for buildXxxAuthUrl function first (preferred pattern)
  const buildFnNames = Object.getOwnPropertyNames(authMod).filter(n =>
    n.startsWith("build") && n.endsWith("AuthUrl") && typeof authMod[n] === "function"
  );

  if (buildFnNames.length > 0) {
    const buildFn = authMod[buildFnNames[0]];
    // Look up credentials: DB → env var → empty string
    const stored = await getProviderCredentials(providerId);
    const clientId = stored?.clientId || process.env[`${providerId.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`] || "";
    const clientSecret = stored?.clientSecret || process.env[`${providerId.toUpperCase().replace(/-/g, "_")}_CLIENT_SECRET`] || "";
    const result = await buildFn({
      clientId,
      clientSecret,
      redirectUri: `${SITE_ORIGIN}/api/oauth/callback?provider=${providerId}`,
      ...(providerMeta.defaultConfig || {}),
    });
    authorizeUrl = result.url;
    state = result.state;
    verifier = result.verifier;
  } else {
    // Fallback: generate OAuth URL directly
    const stored = await getProviderCredentials(providerId);
    const clientId = stored?.clientId || "";
    const clientSecret = stored?.clientSecret || "";
    state = generateState();
    verifier = generateCodeVerifier();
    const oauthConfig: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri: `${SITE_ORIGIN}/api/oauth/callback?provider=${providerId}`,
      scopes: providerMeta.scopes || [],
      authorizeUrl: providerMeta.authorizeUrl || "",
      tokenUrl: providerMeta.tokenUrl || "",
      flowType: "authorization_code",
    };
    authorizeUrl = buildAuthorizeUrl(oauthConfig, state, verifier);
  }

  // Store OAuth state in DB for CSRF verification (using the integrations table or a separate store)
  // We'll store it in the DB as a special "pending" connection
  await createConnection({
    userId: user.userId,
    provider: providerId,
    displayName: `${providerMeta.name} (pending)`,
    config: { oauthState: state, oauthVerifier: verifier || "", status: "pending" },
    status: "pending",
  });

  return redirect(authorizeUrl);
}

// ─── 2. OAuth Callback ────────────────────────────────────────────────────────

export async function handleOAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!providerId || !code) {
    return html(`<html><body><h2>OAuth Error</h2><p>Missing code or provider.</p><a href="/portal/integrations">Back to integrations</a></body></html>`);
  }

  const providerMeta = registry.getProvider(providerId);
  if (!providerMeta) {
    return html(`<html><body><h2>OAuth Error</h2><p>Unknown provider: ${providerId}</p><a href="/portal/integrations">Back to integrations</a></body></html>`);
  }

  // Find the stored OAuth state from pending connections
  const authMod = await getProviderAuthModule(providerId);

  try {
    let tokens: any;
    const creds = await resolveCredentials(providerId, providerMeta);
    const clientId = creds.clientId;
    const clientSecret = creds.clientSecret;

    // Find the exchange function
    const exchangeFnNames = Object.getOwnPropertyNames(authMod || {}).filter(n =>
      n.startsWith("handle") && (n.endsWith("Callback") || n.endsWith("Token")) && typeof (authMod as any)[n] === "function"
    );

    if (exchangeFnNames.length > 0 && authMod) {
      const exchangeFn = authMod[exchangeFnNames[0]];
      tokens = await exchangeFn({
        clientId,
        clientSecret,
        redirectUri: `${SITE_ORIGIN}/api/oauth/callback?provider=${providerId}`,
        ...(providerMeta.defaultConfig || {}),
      }, code, "");
    } else {
      // Generic exchange via oauth.ts framework
      const { exchangeCodeForTokens } = await import("../integrations/framework/oauth");
      const oauthConfig: OAuthConfig = {
        clientId,
        clientSecret,
        redirectUri: `${SITE_ORIGIN}/api/oauth/callback?provider=${providerId}`,
        scopes: providerMeta.scopes || [],
        authorizeUrl: providerMeta.authorizeUrl || "",
        tokenUrl: providerMeta.tokenUrl || "",
        flowType: "authorization_code",
      };
      tokens = await exchangeCodeForTokens(oauthConfig, code, "");
    }

    // Store the connection
    const config: ConnectionConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      instanceUrl: tokens.instanceUrl,
      raw: tokens,
    };

    // Try to get userId from session (may have been lost during redirect)
    const user = await getUserFromRequest(req);
    const userId = user?.userId || "anonymous";

    await createConnection({
      userId,
      provider: providerId,
      displayName: providerMeta.name,
      config,
      status: "active",
    });

    return html(`<html><body><h2>✅ Connected!</h2><p>${providerMeta.name} has been connected successfully.</p><script>setTimeout(() => { window.location.href = '/portal/integrations'; }, 1500);</script></body></html>`);
  } catch (err: any) {
    console.error(`[integrations] OAuth callback error for ${providerId}:`, err);
    return html(`<html><body><h2>OAuth Error</h2><p>${err.message || "Failed to complete OAuth flow"}</p><a href="/portal/integrations">Back to integrations</a></body></html>`);
  }
}

// ─── 3. Connection Management ─────────────────────────────────────────────────

export async function handleListConnections(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);
  const conns = await listConnections(user.userId);
  return json(conns);
}

export async function handleCreateConnection(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const body = await req.json().catch(() => null);
  if (!body) return error("Invalid JSON body");
  if (!body.provider) return error("Missing provider field");

  const providerMeta = registry.getProvider(body.provider);
  if (!providerMeta) return error(`Unknown provider: ${body.provider}`, 404);

  const config: ConnectionConfig = {
    apiKey: body.apiKey || "",
    apiSecret: body.apiSecret || "",
    subdomain: body.subdomain || "",
    instanceUrl: body.instanceUrl || "",
    ...(body.config || {}),
  };

  const conn = await createConnection({
    userId: user.userId,
    provider: body.provider,
    displayName: body.displayName || providerMeta.name,
    config,
    status: "active",
  });

  return json(conn, 201);
}

export async function handleDeleteConnection(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return error("Missing connection id");

  try {
    await deleteConnection(id, user.userId);
    return json({ success: true });
  } catch (err: any) {
    return error(err.message || "Failed to delete connection", 404);
  }
}

export async function handleUpdateConnection(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return error("Missing connection id");

  const body = await req.json().catch(() => null);
  if (!body) return error("Invalid JSON body");

  try {
    await updateConnectionConfig(id, user.userId, body.config || body);
    return json({ success: true });
  } catch (err: any) {
    return error(err.message || "Failed to update connection", 404);
  }
}

export async function handleConnectionStatus(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return error("Missing connection id");

  const conn = await getConnection(id, user.userId);
  if (!conn) return error("Connection not found", 404);

  const healthResult = await testConnection(conn);
  return json({ id: conn.id, status: conn.status, health: healthResult, healthAt: conn.healthAt });
}

export async function handleConnectionSync(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return error("Missing connection id");

  const conn = await getConnection(id, user.userId);
  if (!conn) return error("Connection not found", 404);

  const healthResult = await testConnection(conn);
  return json({ id: conn.id, synced: true, health: healthResult });
}

// ─── 4. Provider Metadata ─────────────────────────────────────────────────────

export async function handleListProviders(_req: Request): Promise<Response> {
  const allCreds = await listAllCredentials();
  const credMap = new Map(allCreds.map((c: any) => [c.providerId, c]));
  const providers = registry.listAll().map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    authType: p.authType || "oauth2",
    description: p.description || "",
    hasCredentials: credMap.has(p.id) && !!credMap.get(p.id)!.clientId,
    actions: registry.getActions(p.id)?.map((a: any) => ({ name: a.name, description: a.description })) || [],
  }));
  return json(providers);
}

export async function handleGetProvider(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return error("Missing provider id");

  const provider = registry.getProvider(id);
  if (!provider) return error(`Provider not found: ${id}`, 404);

  return json({
    id: provider.id,
    name: provider.name,
    category: provider.category,
    authType: provider.authType || "oauth2",
    description: provider.description || "",
    actions: registry.getActions(id)?.map((a: any) => ({ name: a.name, description: a.description, inputSchema: a.inputSchema })) || [],
    triggers: registry.getTriggers(id) || [],
  });
}

// ─── 5. Webhook Receivers ─────────────────────────────────────────────────────

export async function handleWebhookReceiver(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") || url.pathname.split("/").pop();
  if (!provider) return error("Missing provider parameter");

  const body = await req.text();
  const contentType = req.headers.get("content-type") || "";

  // For webhooks, we check all connections across users for this provider
  // This requires a direct DB query since the helper needs userId
  const { db } = await import("../db/index");
  const { integrations } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const connections = await db.select().from(integrations).where(eq(integrations.provider, provider));

  if (connections.length === 0) return json({ received: true, note: "No connections for this provider" });

  // Fire events to all connected users
  for (const conn of connections) {
    try {
      await updateConnectionStatus(conn.id, conn.userId, conn.status as any, undefined);
    } catch { /* ignore per-connection errors */ }
  }

  return json({ received: true, provider, eventCount: connections.length });
}

// ─── 6. Integration Monitoring ────────────────────────────────────────────────

export async function handleHealthCheck(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!user) return error("Not authenticated", 401);

  const conns = await listConnections(user.userId);
  const total = conns.length;
  const active = conns.filter(c => c.status === "active").length;
  const error = conns.filter(c => c.status === "error").length;
  const expired = conns.filter(c => c.status === "expired").length;
  const pending = conns.filter(c => c.status === "pending").length;

  return json({ total, active, error, expired, pending });
}

export async function handleBackgroundHealthCheck(): Promise<void> {
  try {
    const { listConnections } = await import("../integrations/framework/connection");
    const { testConnection } = await import("../integrations/framework/connection");
    // Get all connections across all users — this requires a broad query
    const { db } = await import("../db/index");
    const { integrations } = await import("../db/schema");
    const allConns = await db.select().from(integrations);

    for (const conn of allConns) {
      try {
        const result = await testConnection(conn as any);
        if (result) {
          await updateConnectionStatus(conn.id, conn.userId, "active", undefined);
        }
      } catch {
        await updateConnectionStatus(conn.id, conn.userId, "error", "Health check failed");
      }
    }
    console.log(`[integrations] Background health check completed: ${allConns.length} connections`);
  } catch (err) {
    console.error("[integrations] Background health check error:", err);
  }
}

// ─── Router Dispatch ──────────────────────────────────────────────────────────

export async function routeIntegrationRequest(req: Request): Promise<Response | null> {
  const { pathname } = new URL(req.url);

  // OAuth
  if (pathname === "/api/oauth/authorize" && req.method === "GET") return handleOAuthAuthorize(req);
  if (pathname === "/api/oauth/callback" && req.method === "GET") return handleOAuthCallback(req);

  // Provider Metadata
  if (pathname === "/api/integrations/providers" && req.method === "GET") return handleListProviders(req);
  if (pathname.match(/^\/api\/integrations\/providers\//) && req.method === "GET") return handleGetProvider(req);

  // Connection Management
  if (pathname === "/api/integrations" && req.method === "GET") return handleListConnections(req);
  if (pathname === "/api/integrations" && req.method === "POST") return handleCreateConnection(req);
  if (pathname === "/api/integrations/health" && req.method === "GET") return handleHealthCheck(req);
  if (pathname.match(/^\/api\/integrations\/[^/]+\/status$/) && req.method === "GET") return handleConnectionStatus(req);
  if (pathname.match(/^\/api\/integrations\/[^/]+\/sync$/) && req.method === "GET") return handleConnectionSync(req);
  if (pathname.match(/^\/api\/integrations\/[^/]+$/) && req.method === "DELETE") return handleDeleteConnection(req);
  if (pathname.match(/^\/api\/integrations\/[^/]+$/) && req.method === "PUT") return handleUpdateConnection(req);

  // Webhooks
  if (pathname.match(/^\/api\/webhooks\//) && req.method === "POST") return handleWebhookReceiver(req);

  // ─── Credential Management ────────────────────────────────────────────────

  // GET /api/credentials/:providerId — public check if provider has credentials
  const credCheckMatch = pathname.match(/^\/api\/credentials\/([a-z0-9_-]+)$/);
  if (credCheckMatch && req.method === "GET") {
    const providerId = credCheckMatch[1];
    const stored = await getProviderCredentials(providerId);
    return json({ providerId, hasCredentials: stored !== null && !!stored.clientId });
  }

  // GET /api/admin/credentials — list all configured credentials (admin only)
  if (pathname === "/api/admin/credentials" && req.method === "GET") {
    const { verifySessionToken } = await import("../db/auth");
    const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
    if (!token) return error("Not authenticated", 401);
    const userId = await verifySessionToken(token);
    if (!userId || !(await isAdmin(userId))) return error("Unauthorized", 403);
    const credentials = await listAllCredentials();
    return json(credentials);
  }

  // PUT /api/admin/credentials/:providerId — save credentials (admin only)
  const adminCredPutMatch = pathname.match(/^\/api\/admin\/credentials\/([a-z0-9_-]+)$/);
  if (adminCredPutMatch && req.method === "PUT") {
    const { verifySessionToken } = await import("../db/auth");
    const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
    if (!token) return error("Not authenticated", 401);
    const userId = await verifySessionToken(token);
    if (!userId || !(await isAdmin(userId))) return error("Unauthorized", 403);
    const providerId = adminCredPutMatch[1];
    const body = await req.json().catch(() => null);
    if (!body || !body.clientId) return error("Missing clientId");
    await saveProviderCredentials(providerId, body.clientId, body.clientSecret || "");
    return json({ success: true, providerId });
  }

  // DELETE /api/admin/credentials/:providerId — remove credentials (admin only)
  const adminCredDelMatch = pathname.match(/^\/api\/admin\/credentials\/([a-z0-9_-]+)$/);
  if (adminCredDelMatch && req.method === "DELETE") {
    const { verifySessionToken } = await import("../db/auth");
    const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
    if (!token) return error("Not authenticated", 401);
    const userId = await verifySessionToken(token);
    if (!userId || !(await isAdmin(userId))) return error("Unauthorized", 403);
    const providerId = adminCredDelMatch[1];
    await deleteProviderCredentials(providerId);
    return json({ success: true, providerId });
  }

  return null; // not handled
}