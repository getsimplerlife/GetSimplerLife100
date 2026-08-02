import { serve } from "bun";
import { join, basename } from "path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { consumeOAuthState, usableOAuthToken, validateOAuthState } from "./src/lib/oauth-safety";

// ── Provider API module (server-side only — never imported in .tsx) ──
import { executeAgent, executeProviderAction, getHubSpotTrustedTenantId } from "./src/lib/provider-api";
// ── Agent processor (post-query pipeline) ──
import { processAgentResults } from "./src/lib/agent-processor";

const BUILD_ID = Date.now().toString(36);
const DIST_CLIENT = "/home/team/shared/site/dist";
const DATA_DIR = "/home/team/shared/site/.data";
const USERS_FILE = join(DATA_DIR, "users.json");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");
const TENANT_INTEGRATIONS_FILE = join(DATA_DIR, "tenant_integrations.json");
const AI_EMPLOYEES_FILE = join(DATA_DIR, "ai_employees.json");
const LEADS_FILE = join(DATA_DIR, "leads.json");
const CHAT_SESSIONS_FILE = join(DATA_DIR, "chat_sessions.json");
const OAUTH_STATES_FILE = join(DATA_DIR, "oauth_states.json");
const TENANT_PURCHASES_FILE = join(DATA_DIR, "tenant_purchases.json");

const AUDIT_LOG_FILE = join(DATA_DIR, "tenant_audit_logs.json");

const INDUSTRY_BLUEPRINTS = [
  { name: "Healthcare Claims Automation", category: "healthcare", description: "End-to-end claims processing pipeline: intake → validation → adjudication → payment. Integrates with Epic, Cerner, and Availity." },
  { name: "Logistics Last-Mile Optimization", category: "logistics", description: "Real-time delivery route optimization using traffic, weather, and driver availability. Integrates with Onfleet, Samsara, and KeepTruckin." },
  { name: "Manufacturing Quality Control", category: "manufacturing", description: "Computer vision QC pipeline for assembly line defect detection. Real-time alerts and trend analysis via Power BI dashboards." },
  { name: "Financial Reconciliation Suite", category: "finance", description: "Automated bank reconciliation, intercompany settlement matching, and audit trail generation across NetSuite, BlackLine, and SAP." },
];

function readJSON(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function writeJSON(path: string, data: any) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}


// ── OAuth Credential Resolution ────────────────────────────────────
function getOAuthCredentials(provider: string): { clientId: string; clientSecret: string } | null {
  // 1. Try environment variables: OAUTH_<PROVIDER>_CLIENT_ID / OAUTH_<PROVIDER>_CLIENT_SECRET
  const provUpper = provider.replace(/-/g, "_").toUpperCase();
  const envClientId = process.env[`OAUTH_${provUpper}_CLIENT_ID`];
  const envClientSecret = process.env[`OAUTH_${provUpper}_CLIENT_SECRET`];
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }
  // 2. Fall back to tenant_oauth_credentials.json
  const credsFile = join(DATA_DIR, "tenant_oauth_credentials.json");
  const creds = readJSON(credsFile);
  const key = `${provider}`;
  if (creds[key] && creds[key].clientId && creds[key].clientSecret) {
    return { clientId: creds[key].clientId, clientSecret: creds[key].clientSecret };
  }
  return null;
}

function getOAuthRedirectUri(_provider: string, req?: Request): string {
  const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.startsWith("::1");
  const base = process.env.OAUTH_REDIRECT_BASE
    || (host ? `${isLocal ? "http" : "https"}://${host}` : "http://localhost:3000");
  // Xero rejects redirect URIs with query parameters — use path-based format
  if (_provider === "xero") {
    return `${base}/api/xero-callback`;
  }
  return `${base}/api/oauth/callback`;
}

// Provider name → canonical key for module lookup (handles hyphens, etc.)
const PROVIDER_CANONICAL: Record<string, string> = {
  "quickbooks-online": "quickbooks-enterprise",
  "quickbooks": "quickbooks-enterprise",
  "quickbooks-desktop": "quickbooks-enterprise",
  "zoho": "zoho-crm",
  "gmail": "google-workspace",
  "google": "google-workspace",
  "microsoft": "microsoft-365",
  "microsoft-dynamics": "dynamics-365",
  "outlook": "outlook-calendar",
  "bamboohr": "adp",
  "sap": "sap-s4hana",
};

function getCanonicalProvider(provider: string): string {
  return PROVIDER_CANONICAL[provider.toLowerCase()] || provider.toLowerCase();
}

function generateSessionToken(): string {
  return createHash("sha256").update(randomBytes(64)).digest("hex");
}

async function handleLogin(body: any): Promise<Response> {
  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }
  const users = readJSON(USERS_FILE);
  const user = users[email];
  if (!user) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const valid = await compare(password, user.password);
  if (!valid) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = generateSessionToken();
  const sessions = readJSON(SESSIONS_FILE);
  sessions[token] = { email, createdAt: Date.now() };
  writeJSON(SESSIONS_FILE, sessions);
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Set-Cookie", "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (60 * 60 * 24 * 7));
  return new Response(JSON.stringify({ user: { email: user.email, role: user.role || "user" } }), { status: 200, headers });
}

async function handleRegister(body: any): Promise<Response> {
  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }
  const users = readJSON(USERS_FILE);
  if (users[email]) {
    return Response.json({ error: "Account already exists" }, { status: 409 });
  }
  const { hash } = await import("bcryptjs");
  const hashedPassword = await hash(password, 10);
  users[email] = { email, password: hashedPassword, role: "user", createdAt: Date.now() };
  writeJSON(USERS_FILE, users);
  const token = generateSessionToken();
  const sessions = readJSON(SESSIONS_FILE);
  sessions[token] = { email, createdAt: Date.now() };
  writeJSON(SESSIONS_FILE, sessions);
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Set-Cookie", "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (60 * 60 * 24 * 7));
  return new Response(JSON.stringify({ user: { email, role: "user" } }), { status: 200, headers });
}

function handleLogout(req: Request): Response {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/session=([^;]+)/);
  if (match) {
    const sessions = readJSON(SESSIONS_FILE);
    delete sessions[match[1]];
    writeJSON(SESSIONS_FILE, sessions);
  }
  return Response.json({ success: true });
}

async function getUserFromSession(req: Request): Promise<any> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/session=([^;]+)/);
  if (!match) return null;
  const sessions = readJSON(SESSIONS_FILE);
  const session = sessions[match[1]];
  if (!session) return null;
  const users = readJSON(USERS_FILE);
  return users[session.email] || null;
}

async function testProviderConnection(providerId: string, providerName: string, credentials: any): Promise<{ success: boolean; error?: string }> {
  // Test the connection by making a real HTTP request
  const apiKey = credentials.apiKey || "";
  const apiSecret = credentials.apiSecret || credentials.apiUrl || "";
  
  // Provider-specific connection tests
  const testUrls: Record<string, { url: string; headers: Record<string, string> }> = {
    salesforce: { url: "https://login.salesforce.com/services/oauth2/userinfo", headers: { "Authorization": `Bearer ${apiKey}` } },
    hubspot: { url: "https://api.hubapi.com/oauth/v1/access-tokens", headers: { "Authorization": `Bearer ${apiKey}` } },
    slack: { url: "https://slack.com/api/auth.test", headers: { "Authorization": `Bearer ${apiKey}` } },
    zoho: { url: "https://accounts.zoho.com/oauth/user/info", headers: { "Authorization": `Bearer ${apiKey}` } },
    pipedrive: { url: "https://api.pipedrive.com/v1/users/me", headers: {} },
    mailchimp: { url: "https://login.mailchimp.com/oauth2/metadata", headers: { "Authorization": `Bearer ${apiKey}` } },
    stripe: { url: "https://api.stripe.com/v1/balance", headers: { "Authorization": `Bearer ${apiKey}` } },
    quickbooks: { url: "https://quickbooks.api.intuit.com/v3/company", headers: { "Authorization": `Bearer ${apiKey}` } },
    google: { url: "https://www.googleapis.com/oauth2/v3/userinfo", headers: { "Authorization": `Bearer ${apiKey}` } },
    xero: { url: "https://api.xero.com/connections", headers: { "Authorization": `Bearer ${apiKey}` } },
    zendesk: { url: "https://{subdomain}.zendesk.com/api/v2/users/me", headers: { "Authorization": `Bearer ${apiKey}` } },
    netsuite: { url: "https://{account}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql", headers: { "Authorization": `Bearer ${apiKey}` } },
    jira: { url: "https://api.atlassian.com/me", headers: { "Authorization": `Bearer ${apiKey}` } },
    shopify: { url: "https://{store}.myshopify.com/admin/api/2024-01/shop.json", headers: { "X-Shopify-Access-Token": apiKey } },
    intercom: { url: "https://api.intercom.io/me", headers: { "Authorization": `Bearer ${apiKey}` } },
    servicenow: { url: "https://{instance}.service-now.com/api/now/table/sys_user", headers: { "Authorization": `Bearer ${apiKey}` } },
    bamboohr: { url: "https://api.bamboohr.com/api/gateway.php/{subdomain}/v1/employees/directory", headers: { "Authorization": `Bearer ${apiKey}` } },
    asana: { url: "https://app.asana.com/api/1.0/users/me", headers: { "Authorization": `Bearer ${apiKey}` } },
    monday: { url: "https://api.monday.com/v2", headers: { "Authorization": apiKey } },
    airtable: { url: "https://api.airtable.com/v0/meta/bases", headers: { "Authorization": `Bearer ${apiKey}` } },
    linear: { url: "https://api.linear.app/graphql", headers: { "Authorization": apiKey } },
    clickup: { url: "https://api.clickup.com/api/v2/user", headers: { "Authorization": apiKey } },
    trello: { url: "https://api.trello.com/1/members/me", headers: { "Authorization": `Bearer ${apiKey}` } },
    basecamp: { url: "https://3.basecampapi.com/999999999/authorization.json", headers: { "Authorization": `Bearer ${apiKey}` } },
    zoom: { url: "https://api.zoom.us/v2/users/me", headers: { "Authorization": `Bearer ${apiKey}` } },
  };

  const testConfig = testUrls[providerId.toLowerCase()];
  
  if (!testConfig) {
    return { success: false, error: `Cannot verify credentials for ${providerName}. Please provide valid API credentials from your ${providerName} account.` };
  }
  try {
    // Never send credentials to unresolved or customer-supplied host placeholders.
    if (testConfig.url.includes("{")) {
      return { success: false, error: `Cannot verify credentials for ${providerName} without an explicit vetted host.` };
    }
    // Real connection test for known providers
    const res = await fetch(testConfig.url, {
      headers: testConfig.headers,
      signal: AbortSignal.timeout(10000)
    });
    // 401/403 means definitely invalid
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: `Invalid credentials for ${providerName}. Please check your API key.` };
    }
    // 200-series: check response body for provider-specific error indicators
    if (res.status >= 200 && res.status < 300) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        try {
          const body = await res.json();
          // Slack-style: { ok: false, error: "invalid_auth" }
          if (body.ok === false) {
            return { success: false, error: `Invalid credentials for ${providerName}: ${body.error || "authentication failed"}.` };
          }
          // Generic auth-related error in response body
          if (body.error && typeof body.error === "string") {
            const errMsg = body.error.toLowerCase();
            if (errMsg.includes("auth") || errMsg.includes("invalid") || errMsg.includes("unauthorized") || errMsg.includes("permission")) {
              return { success: false, error: `Invalid credentials for ${providerName}: ${body.error}.` };
            }
          }
        } catch {
          // Non-JSON body on 200 — accept cautiously
        }
      }
      return { success: true };
    }
    // 4xx (non 401/403) — likely bad request
    if (res.status >= 400 && res.status < 500) {
      return { success: false, error: `${providerName} rejected the connection (HTTP ${res.status}). Please verify your credentials and API configuration.` };
    }
    // 5xx — server error, could be temporary
    return { success: false, error: `${providerName} is unreachable (HTTP ${res.status}). Please try again later.` };
  } catch (e: any) {
    return { success: false, error: `Could not reach ${providerName} API. Please verify your credentials and network connectivity.` };
  }
}

// CRM/ERP/Accounting category detection — these categories require slot purchases
const CRM_ERP_CATEGORIES = ["CRM", "ERP", "Accounting"];

function isCrmErpCategory(category: string): boolean {
  const cat = (category || "").toLowerCase();
  return CRM_ERP_CATEGORIES.some(c => cat.includes(c.toLowerCase()));
}

function consumeCrmErpSlot(email: string, packType: "crm-pack" | "erp-pack"): boolean {
  const purchases = readJSON(TENANT_PURCHASES_FILE);
  const userPurchases = purchases[email] || [];
  const crmPack = userPurchases.find((p: any) => p.type === packType && p.status === "active");
  if (!crmPack) return false;
  const usedSlots = crmPack.usedSlots || 0;
  const totalSlots = crmPack.slots || 0;
  if (usedSlots >= totalSlots) return false;
  crmPack.usedSlots = usedSlots + 1;
  purchases[email] = userPurchases;
  writeJSON(TENANT_PURCHASES_FILE, purchases);
  return true;
}

function freeCrmErpSlot(email: string, packType: "crm-pack" | "erp-pack"): void {
  const purchases = readJSON(TENANT_PURCHASES_FILE);
  const userPurchases = purchases[email] || [];
  const crmPack = userPurchases.find((p: any) => p.type === packType && p.status === "active");
  if (crmPack && (crmPack.usedSlots || 0) > 0) {
    crmPack.usedSlots = Math.max(0, (crmPack.usedSlots || 0) - 1);
    purchases[email] = userPurchases;
    writeJSON(TENANT_PURCHASES_FILE, purchases);
  }
}

function getPackTypeForCategory(category: string): "crm-pack" | "erp-pack" | null {
  const cat = (category || "").toLowerCase();
  if (cat.includes("crm")) return "crm-pack";
  if (cat.includes("erp") || cat.includes("accounting") || cat.includes("finance")) return "erp-pack";
  return null;
}

function getProviderCategory(providerId: string): string {
  // Quick lookup for known CRM/ERP/Accounting providers
  const id = providerId.toLowerCase();
  if (["salesforce","hubspot","zoho","pipedrive","copper","creatio","freshsales","insightly","nimble","close",
       "caspio","salesmate","freshworks","agilecrm","nutshell","sugarcrm"].includes(id)) return "CRM";
  if (["netsuite","sage","sap","infor","acumatica","dynamics-365","oracle","epicor","syspro","odoo","microsoft-dynamics",
       "ifs","deltek","qad","ramco","unit4","ifs-applications"].includes(id)) return "ERP";
  if (["quickbooks-online","quickbooks","quickbooks-desktop","xero","freshbooks","wave","sage-intacct","netsuite",
       "blackline","floqast","bill.com"].includes(id)) return "Accounting";
  return "";
}

// ── Monitoring tenant gate hydration ──────────────────────────────────
import { hydrateTenants, configureTenant } from "./src/monitoring/gates";

// ── Startup: hydrate tenant monitoring gates from purchase data ──────
const initialPurchases = readJSON(TENANT_PURCHASES_FILE);
hydrateTenants(initialPurchases);
configureTenant("mathewortiz97@gmail.com", { purchased: true, status: "Active" });

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Server-side form POST fallback for /login — works without JS hydration
    if (pathname === "/login" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const email = formData.get("email")?.toString() || "";
        const password = formData.get("password")?.toString() || "";
        if (!email || !password) {
          return new Response(null, { status: 302, headers: { Location: "/login?error=Email+and+password+required" } });
        }
        const users = readJSON(USERS_FILE);
        const user = users[email];
        if (!user || !(await compare(password, user.password))) {
          return new Response(null, { status: 302, headers: { Location: "/login?error=Invalid+credentials" } });
        }
        const token = generateSessionToken();
        const sessions = readJSON(SESSIONS_FILE);
        sessions[token] = { email, createdAt: Date.now() };
        writeJSON(SESSIONS_FILE, sessions);
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/portal",
            "Set-Cookie": "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (60 * 60 * 24 * 7),
          },
        });
      } catch {
        return new Response(null, { status: 302, headers: { Location: "/login?error=Something+went+wrong" } });
      }
    }

    if (pathname === "/api/login" && req.method === "POST") {
      try { const body = await req.json(); return await handleLogin(body); }
      catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    }
    if (pathname === "/api/register" && req.method === "POST") {
      try { const body = await req.json(); return await handleRegister(body); }
      catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    }
    if (pathname === "/api/logout" && req.method === "POST") return handleLogout(req);
    if (pathname === "/api/me") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      return Response.json({ user: { email: user.email, role: user.role || "user" } });
    }

    if (pathname === "/api/check-user-exists" && req.method === "POST") {
      try {
        const { email } = await req.json();
        if (!email) return Response.json({ error: "Email required" }, { status: 400 });
        const users = readJSON(USERS_FILE);
        return Response.json({ exists: !!users[email] });
      } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    }

    if (pathname === "/api/set-password" && req.method === "POST") {
      try {
        const { email, password } = await req.json();
        if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
        if (password.length < 6) return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
        const { hash } = await import("bcryptjs");
        const hashedPassword = await hash(password, 10);
        const users = readJSON(USERS_FILE);
        users[email] = { email, password: hashedPassword, role: users[email]?.role || "user", createdAt: users[email]?.createdAt || Date.now() };
        writeJSON(USERS_FILE, users);
        return Response.json({ success: true });
      } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
    }

    // ── Purchase Verification ─────────────────────────────────────
    if (pathname === "/api/purchases") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
      return Response.json({ data: purchases[user.email] || [] });
    }

    if (pathname === "/api/purchases/has-access" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const { feature } = body; // "workflows", "ai-employees", "agent-{type}"
        // Owner (mathewortiz97@gmail.com) always has access
        if (user.email === "mathewortiz97@gmail.com") {
          return Response.json({ hasAccess: true, reason: "owner" });
        }
        const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
        const userPurchases = purchases[user.email] || [];
        // Check if user has purchased the feature
        const hasFeature = userPurchases.some((p: any) => 
          p.feature === feature || p.agentType === feature || p.productId === feature
        );
        return Response.json({ hasAccess: hasFeature, reason: hasFeature ? "purchased" : "not purchased" });
      } catch {
        return Response.json({ hasAccess: false, reason: "error" });
      }
    }

    // ── CRM/ERP Slot API ──────────────────────────────────────────
    if (pathname === "/api/data/crm-slots" || pathname === "/api/data/erp-slots") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Determine pack type from path or query param
      let packType: "crm-pack" | "erp-pack" = pathname === "/api/data/erp-slots" ? "erp-pack" : "crm-pack";
      const typeParam = url.searchParams.get("type");
      if (typeParam === "erp") packType = "erp-pack";
      else if (typeParam === "crm") packType = "crm-pack";
      // Owner always has unlimited slots
      if (user.email === "mathewortiz97@gmail.com") {
        return Response.json({ totalSlots: 999, usedSlots: 0, remainingSlots: 999, isOwner: true });
      }
      const purchases = readJSON(TENANT_PURCHASES_FILE);
      const userPurchases = purchases[user.email] || [];
      const packs = userPurchases.filter((p: any) => p.type === packType && p.status === "active");
      const totalSlots = packs.reduce((sum: number, p: any) => sum + (p.slots || 0), 0);
      const usedSlots = packs.reduce((sum: number, p: any) => sum + (p.usedSlots || 0), 0);
      const remainingSlots = Math.max(0, totalSlots - usedSlots);
      return Response.json({ totalSlots, usedSlots, remainingSlots, isOwner: false });
    }


    // ── Connected Accounts API ─────────────────────────────────────
    if (pathname === "/api/data/connected-accounts") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const all = readJSON(TENANT_INTEGRATIONS_FILE);
      const userConns = all[user.email] || [];
      const crmConns: any[] = [];
      const erpConns: any[] = [];
      const otherConns: any[] = [];
      for (const c of userConns) {
        const cat = (c.category || "").toLowerCase();
        if (cat.includes("crm")) {
          crmConns.push(c);
        } else if (cat.includes("erp") || cat.includes("accounting")) {
          erpConns.push(c);
        } else {
          otherConns.push(c);
        }
      }
      const getSlotInfo = (packType: string) => {
        if (user.email === "mathewortiz97@gmail.com") return { totalSlots: 999, usedSlots: 0, remainingSlots: 999, isOwner: true };
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const userPurchases = purchases[user.email] || [];
        const packs = userPurchases.filter((p: any) => p.type === packType && p.status === "active");
        const totalSlots = packs.reduce((sum: number, p: any) => sum + (p.slots || 0), 0);
        const usedSlots = packs.reduce((sum: number, p: any) => sum + (p.usedSlots || 0), 0);
        return { totalSlots, usedSlots, remainingSlots: Math.max(0, totalSlots - usedSlots), isOwner: false };
      };
      return Response.json({
        crm: crmConns,
        erp: erpConns,
        other: otherConns,
        crmSlots: getSlotInfo("crm-pack"),
        erpSlots: getSlotInfo("erp-pack"),
      });
    }

    // ── Data APIs ─────────────────────────────────────────────────
    // ── /api/data/approvals (GET + POST) ───────────────────────────
    if (pathname === "/api/data/approvals") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const APPROVALS_FILE = join(DATA_DIR, "tenant_approvals.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          console.log(`[approvals] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(APPROVALS_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/communications (GET + POST) ──────────────────────
    if (pathname === "/api/data/communications") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const COMMS_FILE = join(DATA_DIR, "tenant_communications.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          console.log(`[communications] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(COMMS_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/inbox (GET + POST) ───────────────────────────────
    if (pathname === "/api/data/inbox") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const INBOX_FILE = join(DATA_DIR, "tenant_inbox.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          const { action, resource } = body;
          if (action && resource) {
            const all = readJSON(INBOX_FILE);
            const userMessages = all[user.email] || [];
            if (action === "mark_read") {
              const msg = userMessages.find((m: any) => m.id === resource);
              if (msg) msg.read = true;
            } else if (action === "archive" || action === "delete") {
              all[user.email] = userMessages.filter((m: any) => m.id !== resource);
            }
            writeJSON(INBOX_FILE, all);
          }
          console.log(`[inbox] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(INBOX_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/notifications (GET + POST) ───────────────────────
    if (pathname === "/api/data/notifications") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const NOTIFS_FILE = join(DATA_DIR, "tenant_notifications.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          console.log(`[notifications] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(NOTIFS_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/customers (GET) ──────────────────────────────────
    if (pathname === "/api/data/customers") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const all = readJSON(TENANT_INTEGRATIONS_FILE);
      const userConns = all[user.email] || [];
      const crmErpConns = userConns.filter((c: any) => {
        const cat = (c.category || "").toLowerCase();
        return cat.includes("crm") || cat.includes("erp") || cat.includes("accounting");
      });
      return Response.json({ data: crmErpConns });
    }

    // ── /api/data/industries (GET + POST) ──────────────────────────
    if (pathname === "/api/data/industries") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const IND_FILE = join(DATA_DIR, "tenant_industries.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          const { action, resource } = body;
          if (action && resource) {
            const all = readJSON(IND_FILE);
            let items = all[user.email] || [];
            const blueprint = INDUSTRY_BLUEPRINTS.find((b: any) => b.name === resource);
            if (blueprint) {
              // Accept both prefixed ("industry_activate") and plain ("activate") forms
              if (action === "toggle" || action === "activate" || action === "industry_activate") {
                const existing = items.find((i: any) => i.name === resource);
                if (existing) {
                  existing.status = existing.status === "active" ? "paused" : "active";
                } else {
                  items.push({
                    name: blueprint.name,
                    status: "active",
                    category: blueprint.category,
                    description: blueprint.description,
                    activatedAt: new Date().toISOString(),
                  });
                }
              } else if (action === "deactivate" || action === "industry_deactivate") {
                items = items.filter((i: any) => i.name !== resource);
              }
            }
            all[user.email] = items;
            writeJSON(IND_FILE, all);
          }
          console.log(`[industries] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(IND_FILE);
      const userActivated = Array.isArray(data) ? data : (data[user.email] || []);
      // Merge catalog with user's activated blueprints
      const merged = INDUSTRY_BLUEPRINTS.map((bp) => {
        const activated = userActivated.find((a: any) => a.name === bp.name);
        return {
          name: bp.name,
          status: activated ? ((activated.status === "active" || activated.status === "Activated") ? "Activated" : "Paused") : "Available",
          category: bp.category,
          description: bp.description,
          activatedAt: activated ? (activated.activatedAt || null) : null,
        };
      });
      return Response.json({ data: merged });
    }

    // ── /api/data/knowledge-base (GET) ─────────────────────────────
    if (pathname === "/api/data/knowledge-base") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const KB_FILE = join(DATA_DIR, "tenant_knowledge_base.json");
      const data = readJSON(KB_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/reports (GET + POST) ─────────────────────────────
    if (pathname === "/api/data/reports") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const REPORTS_FILE = join(DATA_DIR, "tenant_reports.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          console.log(`[reports] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(REPORTS_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/training (GET + POST) ────────────────────────────
    if (pathname === "/api/data/training") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const TRAINING_FILE = join(DATA_DIR, "tenant_training.json");
      if (req.method === "POST") {
        try {
          const body = await req.json();
          console.log(`[training] POST by ${user.email}:`, body);
          return Response.json({ success: true });
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
      }
      const data = readJSON(TRAINING_FILE);
      const userData = Array.isArray(data) ? data : (data[user.email] || []);
      return Response.json({ data: userData });
    }

    // ── /api/data/users (GET) ──────────────────────────────────────
    if (pathname === "/api/data/users") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const users = readJSON(USERS_FILE);
      const userList = Object.values(users).map((u: any) => ({
        id: u.email, email: u.email, role: u.role || "user", createdAt: u.createdAt,
      }));
      return Response.json({ data: userList, total: userList.length });
    }

    // ── /api/audit-logs (GET) ──────────────────────────────────────
    if (pathname === "/api/audit-logs") {
      const user = await getUserFromSession(req);
      if (user === null || user === undefined) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const AUDIT_FILE = join(DATA_DIR, "tenant_audit_logs.json");
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const data = readJSON(AUDIT_FILE);
      let logs = Array.isArray(data) ? data : (data[user.email] || []);
      if (search) {
        logs = logs.filter((l: any) =>
          (l.action || "").toLowerCase().includes(search) ||
          (l.resource || "").toLowerCase().includes(search) ||
          (l.detail || "").toLowerCase().includes(search)
        );
      }
      const total = logs.length;
      const start = (page - 1) * limit;
      const paged = logs.slice(start, start + limit);
      return Response.json({ data: paged, total, page, limit });
    }

    // ── Integration APIs ──────────────────────────────────────────
    if (pathname === "/api/integrations") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: non-owners need active purchases for CRM/ERP/Accounting.
      // Other integrations (Communication, Marketing, Data, etc.) are ungated.
      const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
      const userPurchases = (user.email !== "mathewortiz97@gmail.com") ? (purchases[user.email] || []) : [{ status: "active", type: "owner" }];
      const hasActivePurchase = userPurchases.some((p: any) => p.status === "active");

      const all = readJSON(TENANT_INTEGRATIONS_FILE);
      return Response.json({ data: all[user.email] || [] });
    }

    if (pathname === "/api/integrations/providers") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "180");
      const search = url.searchParams.get("search") || "";
      const category = url.searchParams.get("category") || "";
      try {
        const { integrations } = await import("./src/content/integrations");
        let filtered = integrations as any[];
        // Supplement with additional providers not yet in integrations.ts
        const existingNames = new Set(filtered.map((p: any) => p.name.toLowerCase()));
        const extraProviders = [
          { id: "abbyy", name: "ABBYY", icon: "📄", category: "Document Processing", description: "OCR and document capture for intelligent automation of forms, invoices, and unstructured documents.", capabilities: ["Document OCR", "Form processing", "Data extraction"], industries: [], relatedWorkflows: [] },
          { id: "aws-bedrock", name: "AWS Bedrock", icon: "🤖", category: "AI Models", description: "Amazon's managed service for building and scaling generative AI applications with foundation models.", capabilities: ["Model hosting", "RAG pipelines", "Fine-tuning"], industries: [], relatedWorkflows: [] },
          { id: "aws-lambda", name: "AWS Lambda", icon: "🛠️", category: "Dev Tools", description: "Serverless compute service that runs code in response to events and automatically manages resources.", capabilities: ["Event processing", "API backends", "Scheduled jobs"], industries: [], relatedWorkflows: [] },
          { id: "aws-textract", name: "AWS Textract", icon: "📄", category: "Document Processing", description: "Machine learning service that extracts text, handwriting, and data from scanned documents.", capabilities: ["OCR", "Form extraction", "Table detection"], industries: [], relatedWorkflows: [] },
          { id: "adobe-sign", name: "Adobe Sign", icon: "📄", category: "Document Processing", description: "E-signature solution for sending, signing, tracking, and managing signature processes.", capabilities: ["E-signatures", "Document tracking", "Template management"], industries: [], relatedWorkflows: [] },
          { id: "aircall", name: "Aircall", icon: "💬", category: "Communication", description: "Cloud-based phone system for sales and support teams with CRM integrations.", capabilities: ["Call routing", "IVR", "Call recording"], industries: [], relatedWorkflows: [] },
          { id: "asana", name: "Asana", icon: "📊", category: "Project Mgmt", description: "Work management platform for teams to organize, track, and manage their work.", capabilities: ["Task management", "Timeline view", "Automation rules"], industries: [], relatedWorkflows: [] },
          { id: "basecamp", name: "Basecamp", icon: "📊", category: "Project Mgmt", description: "Project management and team collaboration tool with message boards, to-dos, and schedules.", capabilities: ["Task tracking", "Team messaging", "File sharing"], industries: [], relatedWorkflows: [] },
          { id: "box", name: "Box", icon: "📁", category: "Storage", description: "Cloud content management and file sharing service for businesses.", capabilities: ["File storage", "Collaboration", "Workflow automation"], industries: [], relatedWorkflows: [] },
          { id: "clickup", name: "ClickUp", icon: "📊", category: "Project Mgmt", description: "All-in-one productivity platform with tasks, docs, goals, and chat.", capabilities: ["Task management", "Time tracking", "Goal tracking"], industries: [], relatedWorkflows: [] },
          { id: "dialpad", name: "Dialpad", icon: "💬", category: "Communication", description: "AI-powered cloud communication platform for voice, video, and messaging.", capabilities: ["Voice calling", "Video conferencing", "AI transcription"], industries: [], relatedWorkflows: [] },
          { id: "discord", name: "Discord", icon: "💬", category: "Communication", description: "Voice, video, and text communication platform for communities and teams.", capabilities: ["Voice channels", "Text chat", "Bot integration"], industries: [], relatedWorkflows: [] },
          { id: "docusign", name: "DocuSign", icon: "📄", category: "Document Processing", description: "Electronic signature and agreement cloud for automating the entire agreement process.", capabilities: ["E-signatures", "Contract management", "Agreement analytics"], industries: [], relatedWorkflows: [] },
          { id: "dropbox", name: "Dropbox", icon: "📁", category: "Storage", description: "Cloud storage and file synchronization service for teams and individuals.", capabilities: ["File sync", "Team folders", "File requests"], industries: [], relatedWorkflows: [] },
          { id: "gmail", name: "Gmail", icon: "✉️", category: "Email", description: "Google's email service with smart features, spam protection, and integrations.", capabilities: ["Email sending", "Inbox management", "Label automation"], industries: [], relatedWorkflows: [] },
          { id: "google-drive", name: "Google Drive", icon: "📁", category: "Storage", description: "Cloud storage, file sharing, and collaborative document editing from Google.", capabilities: ["File storage", "Real-time collaboration", "Sharing controls"], industries: [], relatedWorkflows: [] },
          { id: "jira", name: "Jira", icon: "📊", category: "Project Mgmt", description: "Issue tracking and agile project management tool for software teams.", capabilities: ["Issue tracking", "Sprint planning", "Roadmaps"], industries: [], relatedWorkflows: [] },
          { id: "looker", name: "Looker", icon: "📈", category: "BI", description: "Business intelligence and data analytics platform for exploring and visualizing data.", capabilities: ["Data modeling", "Dashboards", "Embedded analytics"], industries: [], relatedWorkflows: [] },
          { id: "magento", name: "Magento", icon: "🛍️", category: "E-Commerce", description: "Adobe's e-commerce platform for building and managing online stores.", capabilities: ["Catalog management", "Order processing", "Customer accounts"], industries: [], relatedWorkflows: [] },
          { id: "monday", name: "Monday.com", icon: "📊", category: "Project Mgmt", description: "Work operating system for teams to manage projects, workflows, and everyday tasks.", capabilities: ["Project tracking", "Automations", "Dashboard views"], industries: [], relatedWorkflows: [] },
          { id: "notion", name: "Notion", icon: "✅", category: "Productivity", description: "All-in-one workspace for notes, docs, wikis, and project management.", capabilities: ["Document creation", "Databases", "Team collaboration"], industries: [], relatedWorkflows: [] },
          { id: "onedrive", name: "OneDrive", icon: "📁", category: "Storage", description: "Microsoft's cloud storage service for files, photos, and document collaboration.", capabilities: ["File storage", "Office integration", "Sharing"], industries: [], relatedWorkflows: [] },
          { id: "outlook", name: "Outlook", icon: "✉️", category: "Email", description: "Microsoft's email and calendar service for business communication and scheduling.", capabilities: ["Email management", "Calendar", "Contact management"], industries: [], relatedWorkflows: [] },
          { id: "power-bi", name: "Power BI", icon: "📈", category: "BI", description: "Microsoft's business analytics service for interactive visualizations and intelligence.", capabilities: ["Data visualization", "Dashboards", "Report sharing"], industries: [], relatedWorkflows: [] },
          { id: "ringcentral", name: "RingCentral", icon: "💬", category: "Communication", description: "Cloud-based business communications platform for voice, video, and team messaging.", capabilities: ["VoIP", "Video meetings", "Team messaging"], industries: [], relatedWorkflows: [] },
          { id: "sharepoint", name: "SharePoint", icon: "📁", category: "Storage", description: "Microsoft's web-based collaborative platform for document management and storage.", capabilities: ["Document libraries", "Intranet", "Team sites"], industries: [], relatedWorkflows: [] },
          { id: "slack", name: "Slack", icon: "💬", category: "Communication", description: "Business communication platform with channels, messaging, and extensive app integrations.", capabilities: ["Channels", "Direct messaging", "App integrations"], industries: [], relatedWorkflows: [] },
          { id: "smartsheet", name: "Smartsheet", icon: "📊", category: "Project Mgmt", description: "Work execution platform for project management, collaboration, and automation.", capabilities: ["Sheet views", "Workflow automation", "Resource management"], industries: [], relatedWorkflows: [] },
          { id: "tableau", name: "Tableau", icon: "📈", category: "BI", description: "Visual analytics platform transforming how people use data to solve problems.", capabilities: ["Data visualization", "Dashboards", "Data prep"], industries: [], relatedWorkflows: [] },
          { id: "teams", name: "Microsoft Teams", icon: "💬", category: "Communication", description: "Microsoft's collaboration app for chat, calls, meetings, and file sharing.", capabilities: ["Team chat", "Video meetings", "File collaboration"], industries: [], relatedWorkflows: [] },
          { id: "trello", name: "Trello", icon: "📊", category: "Project Mgmt", description: "Visual collaboration tool for project management using boards, lists, and cards.", capabilities: ["Kanban boards", "Task cards", "Power-ups"], industries: [], relatedWorkflows: [] },
          { id: "twilio", name: "Twilio", icon: "💬", category: "Communication", description: "Cloud communications platform for SMS, voice, video, and email APIs.", capabilities: ["SMS API", "Voice API", "Verify API"], industries: [], relatedWorkflows: [] },
          { id: "webex", name: "Webex", icon: "💬", category: "Communication", description: "Cisco's video conferencing and collaboration platform for enterprises.", capabilities: ["Video meetings", "Screen sharing", "Webinars"], industries: [], relatedWorkflows: [] },
          { id: "wrike", name: "Wrike", icon: "📊", category: "Project Mgmt", description: "Collaborative work management platform for scaling across teams.", capabilities: ["Task management", "Gantt charts", "Proofing"], industries: [], relatedWorkflows: [] },
          { id: "zoom", name: "Zoom", icon: "💬", category: "Communication", description: "Video-first unified communications platform for meetings, chat, and webinars.", capabilities: ["Video conferencing", "Team chat", "Webinars"], industries: [], relatedWorkflows: [] },
          { id: "freshbooks", name: "FreshBooks", icon: "📒", category: "Accounting", description: "Cloud accounting software for invoicing, expenses, and time tracking.", capabilities: ["Invoicing", "Expense tracking", "Time tracking"], industries: [], relatedWorkflows: [] },
          { id: "greenhouse", name: "Greenhouse", icon: "👥", category: "HR", description: "Hiring platform for recruiting, interviewing, and onboarding at scale.", capabilities: ["Applicant tracking", "Structured interviews", "Onboarding"], industries: [], relatedWorkflows: [] },
          { id: "gusto", name: "Gusto", icon: "👥", category: "HR", description: "Cloud-based payroll, benefits, and human resource management for businesses.", capabilities: ["Payroll", "Benefits admin", "Compliance"], industries: [], relatedWorkflows: [] },
          { id: "lever", name: "Lever", icon: "👥", category: "HR", description: "Talent acquisition platform combining ATS and CRM for hiring teams.", capabilities: ["Applicant tracking", "Candidate CRM", "Reporting"], industries: [], relatedWorkflows: [] },
          { id: "paychex", name: "Paychex", icon: "👥", category: "HR", description: "HR, payroll, and benefits outsourcing for small to mid-sized businesses.", capabilities: ["Payroll", "HR services", "Retirement plans"], industries: [], relatedWorkflows: [] },
          { id: "rippling", name: "Rippling", icon: "👥", category: "HR", description: "Unified platform for HR, IT, and finance with employee management automation.", capabilities: ["Onboarding", "Payroll", "Device management"], industries: [], relatedWorkflows: [] },
          { id: "ukg", name: "UKG", icon: "👥", category: "HR", description: "HR and workforce management solutions for payroll, time, and talent.", capabilities: ["Workforce management", "Payroll", "HR service delivery"], industries: [], relatedWorkflows: [] },
          { id: "calendly", name: "Calendly", icon: "📅", category: "Scheduling", description: "Automated scheduling platform for meetings, interviews, and appointments.", capabilities: ["Meeting scheduling", "Calendar sync", "Team scheduling"], industries: [], relatedWorkflows: [] },
          { id: "typeform", name: "Typeform", icon: "📝", category: "Forms", description: "Interactive form and survey builder for collecting data beautifully.", capabilities: ["Form builder", "Survey logic", "Payment forms"], industries: [], relatedWorkflows: [] },
          { id: "jotform", name: "Jotform", icon: "📝", category: "Forms", description: "Online form builder with drag-and-drop interface and extensive integrations.", capabilities: ["Form creation", "PDF generation", "Payment collection"], industries: [], relatedWorkflows: [] },
          { id: "gravity-forms", name: "Gravity Forms", icon: "📝", category: "Forms", description: "WordPress form builder plugin for contact forms, surveys, and data collection.", capabilities: ["Form builder", "Conditional logic", "File uploads"], industries: [], relatedWorkflows: [] },
          { id: "copper", name: "Copper", icon: "📋", category: "CRM", description: "CRM built for Google Workspace users with native Gmail integration.", capabilities: ["Contact management", "Pipeline tracking", "Gmail integration"], industries: [], relatedWorkflows: [] },
          { id: "creatio", name: "Creatio", icon: "📋", category: "CRM", description: "Low-code platform for CRM and business process automation.", capabilities: ["Sales automation", "Service management", "Marketing"], industries: [], relatedWorkflows: [] },
          { id: "dat", name: "DAT", icon: "🚛", category: "Logistics", description: "Freight marketplace and load board for carriers and brokers.", capabilities: ["Load matching", "Rate negotiation", "Tracking"], industries: [], relatedWorkflows: [] },
          { id: "samsara", name: "Samsara", icon: "🚛", category: "Logistics", description: "Connected operations platform for fleet tracking, safety, and compliance.", capabilities: ["GPS tracking", "Dash cams", "Compliance"], industries: [], relatedWorkflows: [] },
          { id: "motive", name: "Motive", icon: "🚛", category: "Logistics", description: "Fleet management and driver safety platform for logistics operations.", capabilities: ["Fleet tracking", "Driver safety", "Compliance"], industries: [], relatedWorkflows: [] },
          { id: "exchange", name: "Microsoft Exchange", icon: "✉️", category: "Email", description: "Microsoft's enterprise email server with calendar and contact management.", capabilities: ["Email hosting", "Calendar sharing", "Mobile sync"], industries: [], relatedWorkflows: [] },
          { id: "imap", name: "IMAP", icon: "✉️", category: "Email", description: "Internet Message Access Protocol for email retrieval and management.", capabilities: ["Email retrieval", "Folder sync", "Cross-device"], industries: [], relatedWorkflows: [] },
          { id: "graphql", name: "GraphQL", icon: "🛠️", category: "Dev Tools", description: "Query language for APIs providing a flexible alternative to REST.", capabilities: ["Data queries", "Mutations", "Subscriptions"], industries: [], relatedWorkflows: [] },
  { id: "quickbooks-desktop", name: "QuickBooks Desktop", icon: "📒", category: "Accounting", description: "Desktop accounting software for small businesses.", capabilities: ["Invoicing", "Expense tracking", "Reporting"], industries: [], relatedWorkflows: [] },
  { id: "authorize-net", name: "Authorize.net", icon: "💳", category: "Payments", description: "Payment gateway for accepting credit card and e-check payments.", capabilities: ["Payment processing", "Fraud detection", "Recurring billing"], industries: [], relatedWorkflows: [] },
  { id: "clickhouse", name: "ClickHouse", icon: "🗄️", category: "Databases", description: "Column-oriented database for real-time analytics and data processing.", capabilities: ["Real-time analytics", "Data compression", "SQL support"], industries: [], relatedWorkflows: [] },
  { id: "dat", name: "DAT", icon: "🚛", category: "Logistics", description: "Freight marketplace and load board for carriers and brokers.", capabilities: ["Load matching", "Rate negotiation", "Tracking"], industries: [], relatedWorkflows: [] },
        ];
        for (const ep of extraProviders) {
          if (!existingNames.has(ep.name.toLowerCase())) {
            filtered.push(ep);
            existingNames.add(ep.name.toLowerCase());
          }
        }
        if (search) filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
        if (category) filtered = filtered.filter((p: any) => p.category?.toLowerCase() === category.toLowerCase());

        // Inject connection requirements for CRM/ERP/Accounting providers
        const connectionRequirements: Record<string, any> = {
          salesforce: { authType: "OAuth2", scopes: ["api", "refresh_token", "offline_access"], apiKeyType: "Connected App credentials", prerequisites: ["Salesforce admin account", "Connected App configured"] },
          hubspot: { authType: "OAuth2", scopes: ["contacts", "content", "oauth"], apiKeyType: "Private App access token", prerequisites: ["HubSpot developer account"] },
          zoho: { authType: "OAuth2", scopes: ["ZohoCRM.modules.ALL"], apiKeyType: "Self Client credentials", prerequisites: ["Zoho developer console account"] },
          pipedrive: { authType: "OAuth2", scopes: ["deals:read", "contacts:read"], apiKeyType: "API token (Settings > Personal preferences > API)", prerequisites: ["Pipedrive admin account"] },
          copper: { authType: "API Key", scopes: [], apiKeyType: "API key from Settings > Integrations > API Keys", prerequisites: ["Copper admin account"] },
          creatio: { authType: "OAuth2", scopes: ["read", "write"], apiKeyType: "OAuth2 app credentials", prerequisites: ["Creatio system administrator account"] },
          netsuite: { authType: "OAuth2", scopes: ["restlets", "rest_webservices"], apiKeyType: "SuiteApp client credentials", prerequisites: ["NetSuite administrator account", "SuiteApp enabled"] },
          sage: { authType: "API Key", scopes: [], apiKeyType: "Sage ID API credentials", prerequisites: ["Sage Business Cloud subscription", "Developer account"] },
          sap: { authType: "OAuth2", scopes: ["openid"], apiKeyType: "Cloud Platform service key", prerequisites: ["SAP Cloud Platform account", "S/4HANA or Business One instance"] },
          "microsoft-dynamics": { authType: "OAuth2", scopes: ["user_impersonation"], apiKeyType: "Azure AD application registration", prerequisites: ["Azure AD admin account", "Dynamics 365 license"] },
          acumatica: { authType: "OAuth2", scopes: ["api", "offline_access"], apiKeyType: "Client secret + client ID", prerequisites: ["Acumatica ERP instance", "System administrator access"] },
          odoo: { authType: "API Key", scopes: [], apiKeyType: "API key from user profile", prerequisites: ["Odoo admin account", "API access enabled in settings"] },
          "quickbooks-online": { authType: "OAuth2", scopes: ["com.intuit.quickbooks.accounting"], apiKeyType: "Intuit Developer app credentials", prerequisites: ["Intuit Developer account", "QuickBooks Online subscription"] },
          "quickbooks": { authType: "OAuth2", scopes: ["com.intuit.quickbooks.accounting"], apiKeyType: "Intuit Developer app credentials", prerequisites: ["Intuit Developer account"] },
          "quickbooks-desktop": { authType: "API Key", scopes: [], apiKeyType: "QBD Web Connector key", prerequisites: ["QuickBooks Desktop installed", "Web Connector configured"] },
          xero: { authType: "OAuth2", scopes: ["accounting.transactions", "accounting.contacts", "offline_access"], apiKeyType: "Xero Developer app credentials", prerequisites: ["Xero partner account", "Xero organization"] },
          freshbooks: { authType: "OAuth2", scopes: ["user:read"], apiKeyType: "FreshBooks app credentials", prerequisites: ["FreshBooks account", "Developer application"] },
          wave: { authType: "OAuth2", scopes: ["read", "write"], apiKeyType: "Wave API token", prerequisites: ["Wave Business account"] },
          "sage-intacct": { authType: "API Key", scopes: [], apiKeyType: "Web Services sender credentials", prerequisites: ["Sage Intacct admin account", "Web Services enabled"] },
        };

        const total = filtered.length;
        const slice = filtered.slice(page * limit, (page + 1) * limit);
        // Augment with connection requirements
        const augmented = slice.map((p: any) => ({
          ...p,
          connectionRequirements: connectionRequirements[p.id] || null,
        }));
        return Response.json({ data: augmented, total, page, limit });
      } catch {
        return Response.json({ data: [], total: 0 });
      }
    }

    if (pathname === "/api/integrations/connect" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: non-owners need active purchases for CRM/ERP/Accounting.
      // Other integrations (Communication, Marketing, Data, etc.) are ungated.
      const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
      const userPurchases = (user.email !== "mathewortiz97@gmail.com") ? (purchases[user.email] || []) : [{ status: "active", type: "owner" }];
      const hasActivePurchase = userPurchases.some((p: any) => p.status === "active");

      try {
        const body = await req.json();
        // Accept flexible field names: providerId/provider, providerName/name, credentials.apiKey or flat apiKey
        const providerId = body.providerId || body.provider || "";
        const providerName = body.providerName || body.provider || body.name || providerId;
        const providerCategory = body.category || getProviderCategory(providerId) || "";
        // Prevent duplicate connections
        const allConns = readJSON(TENANT_INTEGRATIONS_FILE);
        const existingConns = allConns[user.email] || [];
        const alreadyConnected = existingConns.find((c: any) => c.providerId === providerId && c.status === "Connected");
        if (alreadyConnected) {
          return Response.json({
            error: `${providerName || providerId} is already connected (since ${new Date(alreadyConnected.connectedAt).toLocaleDateString()}). Disconnect it first to reconnect with new credentials.`,
          }, { status: 409 });
        }
        const creds = body.credentials || body;
        const apiKey = creds.apiKey || creds.api_key || creds.key || "";
        if (!apiKey || !apiKey.trim()) {
          return Response.json({ error: "API credentials required. Please provide at least an API key." }, { status: 400 });
        }
        if (apiKey.trim().length < 4) {
          return Response.json({ error: "Invalid API key — too short." }, { status: 400 });
        }

        // CRM/ERP slot check — only for non-owner users connecting CRM/ERP/Accounting providers
        if (user.email !== "mathewortiz97@gmail.com" && isCrmErpCategory(providerCategory)) {
          const packType = getPackTypeForCategory(providerCategory);
          if (!packType) {
            return Response.json({
              error: "Could not determine slot type for provider",
            }, { status: 400 });
          }
          const purchases = readJSON(TENANT_PURCHASES_FILE);
          const userPurchases = purchases[user.email] || [];
          const pack = userPurchases.find((p: any) => p.type === packType && p.status === "active");
          if (!pack) {
            return Response.json({
              error: `This provider requires a ${packType === "crm-pack" ? "CRM" : "ERP"} Connection Pack purchase`,
              requiresPurchase: true,
              upgradeUrl: "/portal/marketplace",
            }, { status: 402 });
          }
          const remainingSlots = (pack.slots || 0) - (pack.usedSlots || 0);
          if (remainingSlots <= 0) {
            return Response.json({
              error: `No ${packType === "crm-pack" ? "CRM" : "ERP"} connection slots remaining (${pack.slots || 0}/${pack.slots || 0} used). Purchase more slots.`,
              requiresPurchase: true,
              upgradeUrl: "/portal/marketplace",
            }, { status: 402 });
          }
        }

        const credentials = { apiKey: apiKey.trim() };
        // Test the connection before saving
        const testResult = await testProviderConnection(providerId, providerName, credentials);
        if (!testResult.success) {
          return Response.json({ error: testResult.error || "Connection test failed. Check your credentials." }, { status: 400 });
        }

        // Consume a CRM/ERP slot if applicable (non-owner)
        if (user.email !== "mathewortiz97@gmail.com" && isCrmErpCategory(providerCategory)) {
          const packType = getPackTypeForCategory(providerCategory);
          if (packType && !consumeCrmErpSlot(user.email, packType)) {
            return Response.json({ error: "Failed to reserve slot. Please try again." }, { status: 500 });
          }
        }

        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        const entry = {
          id: "int-" + Math.random().toString(36).substr(2, 9),
          provider: providerName || providerId,
          providerId,
          category: providerCategory || getProviderCategory(providerId),
          status: "Connected",
          connectedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          credentials,
        };
        userConns.push(entry);
        all[user.email] = userConns;
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        // Audit log
        const alogs2 = readJSON(AUDIT_LOG_FILE);
        const alogUser2 = alogs2[user.email] || [];
        alogUser2.push({
          id: "log-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: user.email,
          action: "integration.connect",
          resource: providerId,
          detail: "Connected " + (providerName || providerId) + " via API key",
          ip: "127.0.0.1",
        });
        alogs2[user.email] = alogUser2;
        writeJSON(AUDIT_LOG_FILE, alogs2);
        return Response.json({ success: true, connection: entry, tested: true });
      } catch (e: any) {
        return Response.json({ error: e.message || "Invalid request" }, { status: 400 });
      }
    }

    if (pathname === "/api/integrations/disconnect" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: non-owners need active purchases for CRM/ERP/Accounting.
      // Other integrations (Communication, Marketing, Data, etc.) are ungated.
      const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
      const userPurchases = (user.email !== "mathewortiz97@gmail.com") ? (purchases[user.email] || []) : [{ status: "active", type: "owner" }];
      const hasActivePurchase = userPurchases.some((p: any) => p.status === "active");

      try {
        const body = await req.json();
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        // Find the connection to check if it's CRM/ERP before removing
        const conn = userConns.find((c: any) => c.id === body.connectionId || c.providerId === body.providerId);
        // Free CRM/ERP slot if applicable (non-owner)
        if (conn && user.email !== "mathewortiz97@gmail.com") {
          const connCategory = conn.category || getProviderCategory(conn.providerId || "") || "";
          if (isCrmErpCategory(connCategory)) {
            const packType = getPackTypeForCategory(connCategory);
            if (packType) freeCrmErpSlot(user.email, packType);
          }
        }
        all[user.email] = userConns.filter((c: any) => c.id !== body.connectionId && c.providerId !== body.providerId);
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        // Audit log
        const alogs3 = readJSON(AUDIT_LOG_FILE);
        const alogUser3 = alogs3[user.email] || [];
        alogUser3.push({
          id: "log-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: user.email,
          action: "integration.disconnect",
          resource: body.connectionId || body.providerId || "",
          detail: "Disconnected " + ((conn && conn.provider) || body.providerId || "integration"),
          ip: "127.0.0.1",
        });
        alogs3[user.email] = alogUser3;
        writeJSON(AUDIT_LOG_FILE, alogs3);
        return Response.json({ success: true });
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
    }
    if (pathname === "/api/tools/analyze" && req.method === "POST") {
      try {
        const body = await req.json();
        const desc = (body.description || "").toLowerCase();
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const matches = employees.filter((e: any) => 
          e.name.toLowerCase().includes(desc.split(" ")[0]) || 
          desc.includes(e.name.toLowerCase().split(" ")[0])
        );
        const top = matches[0] || employees[0];
        return Response.json({ analysis: {
          topMatch: top?.name || "Automation AI",
          allMatches: matches.slice(0,5).map((m: any) => ({ name: m.name, match: m === top ? "high" : "medium" })),
          industryGuess: "General Business",
          savingsSummary: "20 hours/week",
          suggestedAgentPriceId: top?.priceId || "",
          suggestedAgentName: top?.name || "Automation AI",
          paymentLink: top?.paymentLink || ""
        }});
      } catch { return Response.json({ analysis: { topMatch: "Automation AI", allMatches: [] } }); }
    }
    if (pathname === "/api/tools/capture-lead" && req.method === "POST") {
      try {
        const body = await req.json();
        const leads = readJSON(LEADS_FILE) || {};
        leads[body.email] = { email: body.email, toolName: body.toolName, result: body.result || {}, capturedAt: new Date().toISOString() };
        writeJSON(LEADS_FILE, leads);
        return Response.json({ success: true });
      } catch { return Response.json({ success: false }, { status: 400 }); }
    }

    // ── /api/upload ─────────────────────────────────────────────
    if (pathname === "/api/upload" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const docs = readJSON(join(DATA_DIR, "tenant_documents.json"));
        const userDocs = docs[user.email] || [];
        const userDocsArr = Array.isArray(userDocs) ? userDocs : (userDocs._id ? [userDocs] : []);
        const newDoc = {
          _id: "doc-" + Math.random().toString(36).substr(2, 9),
          file_name: "uploaded-document-" + Date.now() + ".pdf",
          type: "upload",
          status: "processed",
          createdAt: new Date().toISOString(),
          file_path: "/uploads/" + Date.now() + ".pdf",
        };
        userDocsArr.push(newDoc);
        docs[user.email] = userDocsArr;
        writeJSON(join(DATA_DIR, "tenant_documents.json"), docs);
        // Audit log
        const alogs4 = readJSON(AUDIT_LOG_FILE);
        const alogUser4 = alogs4[user.email] || [];
        alogUser4.push({
          id: "log-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: user.email,
          action: "document.upload",
          resource: newDoc.file_name,
          detail: "Uploaded document: " + newDoc.file_name,
          ip: "127.0.0.1",
        });
        alogs4[user.email] = alogUser4;
        writeJSON(AUDIT_LOG_FILE, alogs4);
        return Response.json({ success: true, document: newDoc });
      } catch (e: any) {
        return Response.json({ error: e.message || "Upload failed" }, { status: 500 });
      }
    }

    // ── /api/settings & /api/data/settings (GET + POST) ─────────
    if (pathname === "/api/settings" || pathname === "/api/data/settings") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const SETTINGS_FILE = join(DATA_DIR, "tenant_settings.json");
      
      if (req.method === "GET") {
        const settings = readJSON(SETTINGS_FILE);
        return Response.json({ data: settings[user.email] || {} });
      }
      
      if (req.method === "POST") {
        try {
          const body = await req.json();
          const settings = readJSON(SETTINGS_FILE);
          settings[user.email] = { ...(settings[user.email] || {}), ...body };
          writeJSON(SETTINGS_FILE, settings);
          return Response.json({ success: true, settings: settings[user.email] });
        } catch (e: any) {
          return Response.json({ error: e.message || "Failed to save settings" }, { status: 500 });
        }
      }
    }

    // ── /api/data/payment-method (GET) ─────────────────────────
    if (pathname === "/api/data/payment-method") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Seed payment method data — the owner always has a card on file.
      // In production this would pull real data from Stripe's API.
      if (user.email === "mathewortiz97@gmail.com") {
        return Response.json({ data: { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2027, isDefault: true } });
      }
      // For other users, check tenant data or return null
      const pmFile = join(DATA_DIR, "tenant_payment_methods.json");
      const pmData = readJSON(pmFile);
      return Response.json({ data: pmData[user.email] || null });
    }

    // ── /api/integrations/:id/sync & /api/integrations/:id DELETE ──
    const integrationDetailMatch = pathname.match(/^\/api\/integrations\/([^/]+)$/);
    if (integrationDetailMatch && (req.method === "DELETE" || req.method === "POST")) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const connectionId = integrationDetailMatch[1];
      try {
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        if (req.method === "DELETE") {
          // Free CRM/ERP slot before removing connection
          const conn = userConns.find((c: any) => c.id === connectionId || c.providerId === connectionId);
          if (conn && user.email !== "mathewortiz97@gmail.com") {
            const connCategory = conn.category || getProviderCategory(conn.providerId || "") || "";
            if (isCrmErpCategory(connCategory)) {
              const packType = getPackTypeForCategory(connCategory);
              if (packType) freeCrmErpSlot(user.email, packType);
            }
          }
          all[user.email] = userConns.filter((c: any) => c.id !== connectionId && c.providerId !== connectionId);
          writeJSON(TENANT_INTEGRATIONS_FILE, all);
          return Response.json({ success: true });
        }
        // POST = sync. A timestamp/status update is not a provider health check.
        // Fail closed until this provider has an explicit tenant-scoped read handler.
        const conn = userConns.find((c: any) => c.id === connectionId || c.providerId === connectionId);
        if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });
        return Response.json({ error: "Integration verification is not available for this provider; no request was made", verificationRequired: true, synced: false }, { status: 409 });
      } catch (e: any) {
        return Response.json({ error: e.message || "Failed" }, { status: 500 });
      }
    }
    const integrationSyncMatch = pathname.match(/^\/api\/integrations\/([^/]+)\/sync$/);
    if (integrationSyncMatch && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const connectionId = integrationSyncMatch[1];
      try {
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        const conn = userConns.find((c: any) => c.id === connectionId || c.providerId === connectionId);
        if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });
        return Response.json({ error: "Integration verification is not available for this provider; no request was made", verificationRequired: true, synced: false }, { status: 409 });
      } catch (e: any) {
        return Response.json({ error: e.message || "Sync failed" }, { status: 500 });
      }
    }

    // ── /api/integrations/:id/logs GET ──
    const integrationLogsMatch = pathname.match(/^\/api\/integrations\/([^/]+)\/logs$/);
    if (integrationLogsMatch && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const connectionId = integrationLogsMatch[1];
      try {
        const activity = readJSON(join(DATA_DIR, "tenant_activity.json"));
        const userActivity = activity[user.email] || {};
        const connActivity = userActivity[connectionId] || [];
        const logs = Array.isArray(connActivity) ? connActivity : [];
        return Response.json({ data: logs, connectionId });
      } catch (e: any) {
        return Response.json({ error: e.message || "Failed to fetch logs" }, { status: 500 });
      }
    }

    // ── /api/agents/run ──────────────────────────────────────────
    if (pathname === "/api/agents/run" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const { agentId } = body;
        if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
        // Look up agent
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const agent = employees.find((e: any) => e.id === agentId || e.id === agentId + "-v1");
        if (!agent) return Response.json({ error: "Agent not found: " + agentId }, { status: 404 });
        // Purchase check — owner bypasses
        if (user.email !== "mathewortiz97@gmail.com") {
          const purchases = readJSON(TENANT_PURCHASES_FILE);
          const userPurchases = purchases[user.email] || [];
          const hasAgent = userPurchases.some((p: any) =>
            p.agentId === agentId || p.agentType === agentId || p.productId === agentId
          );
          if (!hasAgent) {
            return Response.json({
              error: "Purchase required to run this agent",
              agentId,
              paymentLink: agent.stripePaymentLink || null,
            }, { status: 402 });
          }
        }
        // Execute agent — real API calls to connected integrations
        const integrationMap = readJSON(join(DATA_DIR, "agent_integration_map.json"));
        const agentIntegrations = integrationMap[agent.id] || [];
        // Get user's connected integrations
        const tenantInts = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConnections = tenantInts[user.email] || [];
        // Execute with real queries
        const agentResult = await executeAgent(agent.id, agent.name, agentIntegrations, userConnections);

        // ── Post-query processing pipeline ──
        let processedData: any = {};
        let processorInsights: any[] = [];
        let processorAlerts: any[] = [];
        let actionsTaken: any[] = [];
        try {
          const processorResult = processAgentResults(
            { id: agent.id, name: agent.name, category: agent.category || "general", instructions: agent.instructions || "" },
            agentResult,
            userConnections.filter((c: any) => c.status === "Connected")
          );
          processedData = processorResult.processedData;
          processorInsights = processorResult.insights;
          processorAlerts = processorResult.alerts;

          // Execute write actions the processor recommended
          for (const action of processorResult.actionsTaken) {
            const connected = userConnections.find((c: any) =>
              c.providerId === action.providerId && c.status === "Connected"
            );
            if (connected) {
              // Actual launch guard: only the configured single-user tenant owner may execute HubSpot writes. Other users receive no trusted scope and fail closed until DB-backed tenant membership exists.
              const hubSpotTenant = action.providerId === "hubspot" ? getHubSpotTrustedTenantId(user.email, undefined, readJSON(USERS_FILE)) : null;
              const actionPayload = { action: action.action, detail: action.detail, ...(action.payload || {}), tenantId: user.email, __trustedTenantId: hubSpotTenant || undefined };
              const execResult = await executeProviderAction(
                action.providerId,
                action.provider,
                connected.credentials || {},
                actionPayload
              );
              actionsTaken.push({
                provider: action.provider,
                providerId: action.providerId,
                action: action.action,
                status: execResult.status,
                detail: execResult.detail,
                result: execResult.result || null,
                error: execResult.error || null,
              });
            } else {
              actionsTaken.push({
                provider: action.provider,
                providerId: action.providerId,
                action: action.action,
                status: "skipped",
                detail: `${action.provider} is not connected — write operation skipped`,
              });
            }
          }
        } catch (procErr: any) {
          // Processor failed — continue with query results only
          processorInsights = [{ type: "summary", severity: "info", message: `Agent "${agent.name}" completed. Post-processing skipped: ${procErr.message}` }];
        }

        // ── Build enhanced response ──
        const enhancedSummary = processorInsights.length > 0
          ? processorInsights.find((i: any) => i.type === "summary")?.message || agentResult.summary
          : agentResult.summary;
        const summaryWithActions = actionsTaken.length > 0
          ? `${enhancedSummary} Took ${actionsTaken.filter((a: any) => a.status === "executed").length} action(s).`
          : enhancedSummary;

        const output = {
          success: true,
          agentId: agent.id,
          status: "completed",
          summary: summaryWithActions,
          // Original query results
          queryResults: agentResult.integrationsUsed,
          totalRecordsProcessed: agentResult.totalRecordsProcessed,
          startedAt: agentResult.startedAt,
          completedAt: agentResult.completedAt,
          // Processor output
          processedData,
          actionsTaken,
          insights: processorInsights,
          alerts: processorAlerts.filter((a: any) => a.requiresAttention),
        };

        // ── Log run in workflow_runs (enriched) ──
        const runs = readJSON(join(DATA_DIR, "workflow_runs.json"));
        const userRuns = runs[user.email] || [];
        userRuns.push({
          id: "run-" + Math.random().toString(36).substr(2, 9),
          type: "agent-run",
          agentId: agent.id,
          agentName: agent.name,
          status: "completed",
          startedAt: output.startedAt,
          completedAt: output.completedAt,
          output: output.summary,
          insightsCount: processorInsights.length,
          actionsCount: actionsTaken.filter((a: any) => a.status === "executed").length,
          alertsCount: processorAlerts.filter((a: any) => a.requiresAttention).length,
        });
        runs[user.email] = userRuns;
        writeJSON(join(DATA_DIR, "workflow_runs.json"), runs);

        // ── Log to agent_insights.json ──
        const insightsFile = join(DATA_DIR, "agent_insights.json");
        const allInsights = readJSON(insightsFile);
        const userInsights = allInsights[user.email] || [];
        userInsights.push({
          id: "insight-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          agentId: agent.id,
          agentName: agent.name,
          category: agent.category,
          insights: processorInsights,
          actionsTaken,
          alerts: processorAlerts,
        });
        // Keep last 100 insights per user
        allInsights[user.email] = userInsights.slice(-100);
        writeJSON(insightsFile, allInsights);

        // ── Audit log (enriched) ──
        const alogs1 = readJSON(AUDIT_LOG_FILE);
        const alogUser1 = alogs1[user.email] || [];
        alogUser1.push({
          id: "log-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: user.email,
          action: "agent.run",
          resource: agent.name,
          detail: "Agent executed with processing: " + output.summary,
          actions: actionsTaken.map((a: any) => ({ providerId: a.providerId, action: a.action, status: a.status, error: a.error || null })),
          ip: "127.0.0.1",
        });
        alogs1[user.email] = alogUser1;
        writeJSON(AUDIT_LOG_FILE, alogs1);

        return Response.json(output);
      } catch (e: any) {
        return Response.json({ error: e.message || "Agent execution failed" }, { status: 500 });
      }
    }

    // ── /api/agents/:id/pause, /api/agents/:id/resume, /api/agents/:id/status ──
    const agentActionMatch = pathname.match(/^\/api\/agents\/([^/]+)\/(pause|resume|status)$/);
    if (agentActionMatch && (req.method === "POST" || (req.method === "GET" && agentActionMatch[2] === "status"))) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const agentId = agentActionMatch[1];
      const action = agentActionMatch[2];
      try {
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const agent = employees.find((e: any) => e.id === agentId);
        if (!agent) return Response.json({ error: "Agent not found: " + agentId }, { status: 404 });
        if (action === "status") {
          return Response.json({ agentId, status: agent.status || "Active", lastRun: agent.lastRun || null, capabilities: agent.capabilities || [] });
        }
        // pause or resume
        const newStatus = action === "pause" ? "Paused" : "Active";
        // Update the agent status in employees file
        const idx = employees.findIndex((e: any) => e.id === agentId);
        if (idx >= 0) {
          employees[idx].status = newStatus;
          writeJSON(AI_EMPLOYEES_FILE, employees);
        }
        return Response.json({ success: true, agentId, status: newStatus, action });
      } catch (e: any) {
        return Response.json({ error: e.message || "Agent action failed" }, { status: 500 });
      }
    }

    // ── /api/chat & /api/chat/sessions ───────────────────────────
    if (pathname === "/api/chat/sessions") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const all = readJSON(CHAT_SESSIONS_FILE);
      const userSessions = all[user.email] || [];
      return Response.json({ data: userSessions });
    }

    if (pathname === "/api/chat" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const { message, sessionId } = body;
        if (!message) return Response.json({ error: "message required" }, { status: 400 });
        const all = readJSON(CHAT_SESSIONS_FILE);
        const userSessions = all[user.email] || [];
        // Find or create session
        let session = sessionId ? userSessions.find((s: any) => s.id === sessionId) : null;
        if (!session) {
          session = {
            id: "chat-" + Math.random().toString(36).substr(2, 9),
            title: message.slice(0, 40) + (message.length > 40 ? "..." : ""),
            createdAt: new Date().toISOString(),
            messages: [],
          };
          userSessions.push(session);
        }
        // Generate contextual response
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const integrationMap = readJSON(join(DATA_DIR, "agent_integration_map.json"));
        const userIntegrations = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = userIntegrations[user.email] || [];
        const responseText = `I'm your AI assistant at Simpler Life 100. ${userConns.length > 0 ?
          `I can see you have ${userConns.length} integration(s) connected (${userConns.map((c: any) => c.provider).join(", ")}). ` :
          "You don't have any integrations connected yet — I can help you set those up. "
        }Our platform has ${employees.length} AI employees available for deployment across 23 industries. How can I help you optimize your operations today?`;
        const msg = { role: "user", content: message, timestamp: new Date().toISOString() };
        const reply = { role: "assistant", content: responseText, timestamp: new Date().toISOString() };
        session.messages.push(msg, reply);
        session.updatedAt = new Date().toISOString();
        all[user.email] = userSessions;
        writeJSON(CHAT_SESSIONS_FILE, all);
        return Response.json({ sessionId: session.id, reply, session });
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
    }

    // ── /api/data/* ──────────────────────────────────────────────
    if (pathname.startsWith("/api/data/")) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const subPath = pathname.replace("/api/data/", "");

      if (subPath === "analytics" || subPath === "analytics/") {
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const integrations = readJSON(TENANT_INTEGRATIONS_FILE);
        const sessions = readJSON(CHAT_SESSIONS_FILE);
        const runs = readJSON(join(DATA_DIR, "workflow_runs.json"));
        const users = readJSON(USERS_FILE);
        const categoryLabels: Record<string, string> = {
          finance: "Finance & Accounting",
          sales: "Sales & CRM",
          support: "Customer Support",
          communications: "Communications",
          logistics: "Logistics & Operations",
          hr: "HR & People",
          marketing: "Marketing",
          compliance: "Compliance & Legal",
        };
        const catCounts: Record<string, number> = {};
        for (const emp of employees) {
          const cat = emp.category || "other";
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
        const totalCat = Object.values(catCounts).reduce((a, b) => a + b, 0) || 1;
        const deptColors = ["bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-stone-600"];
        const departments = Object.entries(catCounts).map(([cat, count], idx) => ({
          name: categoryLabels[cat] || cat,
          percentage: Math.round((count / totalCat) * 100),
          hours: Math.round(count * 47.3 * 10) / 10,
          color: deptColors[idx % deptColors.length],
        }));
        return Response.json({
          data: {
            totalUsers: Object.keys(users).length,
            totalAgents: employees.length,
            totalIntegrations: Object.values(integrations).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalChatSessions: Object.values(sessions).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalAgentRuns: Object.values(runs).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalPurchases: Object.values(purchases).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            serverUptime: Math.floor(process.uptime()),
            departments,
          },
        });
      }

      if (subPath === "marketplace" || subPath === "marketplace/") {
        const employees = readJSON(AI_EMPLOYEES_FILE);
        return Response.json({ data: employees });
      }

      if (subPath === "employees" || subPath === "employees/") {
        const employees = readJSON(AI_EMPLOYEES_FILE);
        // Only return purchased agents — owner sees all
        if (user.email !== "mathewortiz97@gmail.com") {
          const purchases = readJSON(TENANT_PURCHASES_FILE);
          const userPurchases = purchases[user.email] || [];
          const purchasedIds = new Set(
            userPurchases
              .filter((p: any) => p.agentId)
              .map((p: any) => p.agentId)
          );
          const filtered = employees
            .filter((e: any) => purchasedIds.has(e.id))
            .map((e: any) => ({ ...e, purchased: true }));
          return Response.json({ data: filtered });
        }
        // Owner: return all, all purchased
        return Response.json({ data: employees.map((e: any) => ({ ...e, purchased: true })) });
      }

      if (subPath === "billing" || subPath === "billing/") {
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const userPurchases = purchases[user.email] || [];
        return Response.json({ data: userPurchases });
      }

      // Generic: return data from matching JSON file
      const fileName = `${subPath.replace(/\/$/, "")}.json`;
      const filePath = join(DATA_DIR, fileName);
      try {
        const data = readJSON(filePath);
        // Tenant-scoped files store data as { "email": [...] }. 
        // Non-tenant files store data as a plain array.
        // Always return an array so the client can safely call .filter(), .map(), etc.
        const userData = Array.isArray(data) ? data : (data[user.email] || []);
        return Response.json({ data: userData });
      } catch {
        return Response.json({ data: [] });
      }
    }

    // ── /api/admin/* ──────────────────────────────────────────────
    if (pathname.startsWith("/api/admin/")) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      if (user.email !== "mathewortiz97@gmail.com") {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const subPath = pathname.replace("/api/admin/", "");

      if (subPath === "users") {
        const users = readJSON(USERS_FILE);
        const userList = Object.values(users).map((u: any) => ({
          id: u.email, email: u.email, role: u.role || "user", createdAt: u.createdAt,
        }));
        return Response.json({ data: userList, total: userList.length });
      }
      if (subPath === "analytics") {
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const integrations = readJSON(TENANT_INTEGRATIONS_FILE);
        const sessions = readJSON(CHAT_SESSIONS_FILE);
        const runs = readJSON(join(DATA_DIR, "workflow_runs.json"));
        const users = readJSON(USERS_FILE);
        // Compute department shares from real agent categories
        const categoryLabels: Record<string, string> = {
          finance: "Finance & Accounting",
          sales: "Sales & CRM",
          support: "Customer Support",
          communications: "Communications",
          logistics: "Logistics & Operations",
          hr: "HR & People",
          marketing: "Marketing",
          compliance: "Compliance & Legal",
        };
        const catCounts: Record<string, number> = {};
        for (const emp of employees) {
          const cat = emp.category || "other";
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
        const totalCat = Object.values(catCounts).reduce((a, b) => a + b, 0) || 1;
        const deptColors = ["bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-stone-600"];
        const departments = Object.entries(catCounts).map(([cat, count], idx) => ({
          name: categoryLabels[cat] || cat,
          percentage: Math.round((count / totalCat) * 100),
          hours: Math.round(count * 47.3 * 10) / 10, // avg hours per agent type
          color: deptColors[idx % deptColors.length],
        }));
        return Response.json({
          data: {
            totalUsers: Object.keys(users).length,
            totalAgents: employees.length,
            totalIntegrations: Object.values(integrations).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalChatSessions: Object.values(sessions).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalAgentRuns: Object.values(runs).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalPurchases: Object.values(purchases).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            serverUptime: Math.floor(process.uptime()),
            departments,
          },
        });
      }
      if (subPath === "health") {
        return Response.json({
          status: "healthy",
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        });
      }
      if (subPath === "credentials") {
        const credsFile = join(DATA_DIR, "tenant_oauth_credentials.json");
        const creds = readJSON(credsFile);
        const list = Object.entries(creds).map(([providerId, c]) => ({
          providerId,
          clientId: c.clientId || "",
          hasSecret: !!(c.clientSecret && c.clientSecret.length > 0),
        }));
        return Response.json(list);
      }
      if (subPath.startsWith("credentials/") && req.method === "PUT") {
        const providerId = subPath.replace("credentials/", "");
        const body = await req.json().catch(() => ({}));
        const { clientId, clientSecret } = body;
        if (!clientId) return Response.json({ error: "clientId required" }, { status: 400 });
        const credsFile = join(DATA_DIR, "tenant_oauth_credentials.json");
        const creds = readJSON(credsFile);
        const existing = creds[providerId] || {};
        const keepSecret = !clientSecret || clientSecret === "••••••••••••••••" || clientSecret.trim() === "";
        creds[providerId] = { clientId, clientSecret: keepSecret ? (existing.clientSecret || "") : clientSecret };
        writeJSON(credsFile, creds);
        return Response.json({ success: true, providerId });
      }
      if (subPath.startsWith("credentials/") && req.method === "DELETE") {
        const providerId = subPath.replace("credentials/", "");
        const credsFile = join(DATA_DIR, "tenant_oauth_credentials.json");
        const creds = readJSON(credsFile);
        delete creds[providerId];
        writeJSON(credsFile, creds);
        return Response.json({ success: true, providerId });
      }
      return Response.json({ error: "Unknown admin resource: " + subPath }, { status: 404 });
    }

    // ── /api/stripe/webhook ──────────────────────────────────────
    // ── /api/monitoring/webhook/:providerId ─────────────────────────
    const monitorMatch = pathname.match(/^\/api\/monitoring\/webhook\/([a-z0-9_-]+)$/);
    if (monitorMatch && req.method === "POST") {
      const providerId = monitorMatch[1];
      try {
        // ── Webhook signature verification (per provider) ──────────
        const rawBody = await req.text();
        if (providerId === "xero") {
          const webhookKey = process.env.XERO_WEBHOOK_KEY;
          if (!webhookKey) {
            console.error("[monitor] Xero webhook key not configured");
            return Response.json({ error: "Webhook key not configured" }, { status: 500 });
          }
          const signature = req.headers.get("x-xero-signature");
          if (!signature) {
            return Response.json({ error: "Missing x-xero-signature header" }, { status: 401 });
          }
          const encoder = new TextEncoder();
          const keyData = encoder.encode(webhookKey);
          const bodyData = encoder.encode(rawBody);
          try {
            const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
            const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
            const valid = await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, bodyData);
            if (!valid) {
              console.error("[monitor] Invalid Xero webhook signature");
              return Response.json({ error: "Invalid signature" }, { status: 401 });
            }
          } catch (sigErr) {
            console.error("[monitor] Xero signature verification failed:", sigErr);
            return Response.json({ error: "Signature verification failed" }, { status: 401 });
          }
        }
        const body = JSON.parse(rawBody);
        if (!body || !body.eventType || !body.employeeId) {
          return Response.json({ error: "eventType and employeeId required" }, { status: 400 });
        }
        const { dispatch } = await import("./src/monitoring/dispatcher");
        const event = {
          id: body.id || crypto.randomUUID(),
          employeeId: body.employeeId,
          providerId,
          eventType: body.eventType,
          payload: body.payload || {},
          receivedAt: new Date().toISOString(),
          tenantId: body.tenantId,
        };
        const config = {
          employeeId: body.employeeId,
          providerId,
          eventTypes: [body.eventType],
        };
        const outcome = await dispatch(event, config, {
          holderId: `webhook-${providerId}`,
          async execute(event) {
            console.log(`[monitor] Processing event: ${event.eventType} for ${event.employeeId}`);
          },
        });
        return Response.json(outcome, {
          status: outcome.status === "processed" ? 200 : outcome.status === "skipped" ? 409 : 400,
        });
      } catch (err: any) {
        console.error("[prod-server] Monitoring webhook error:", err);
        return Response.json({ error: "Internal error" }, { status: 500 });
      }
    }

    if (pathname === "/api/stripe/webhook" && req.method === "POST") {
      try {
        const body = await req.json();
        const eventType = body.type || "unknown";
        // Handle checkout.session.completed
        if (eventType === "checkout.session.completed" || body.data?.object?.object === "checkout.session") {
          const session = body.data?.object || body;
          const customerEmail = session.customer_details?.email || session.customer_email || "";
          const paymentLink = session.payment_link || "";
          const amountTotal = session.amount_total || 0;

          // Check for CRM or ERP Connection Pack purchase
          const CRM_PACK_PAYMENT_LINK = "https://buy.stripe.com/test_crm_pack_5slots";
          const ERP_PACK_PAYMENT_LINK = "https://buy.stripe.com/test_erp_pack_5slots";
          const isCrmPack = paymentLink.includes("crm_pack") || paymentLink.includes("crm-pack") ||
                            (session.metadata?.productType === "crm-pack");
          const isErpPack = paymentLink.includes("erp_pack") || paymentLink.includes("erp-pack") ||
                            (session.metadata?.productType === "erp-pack") ||
                            // Legacy combined pack detection
                            paymentLink.includes("crm_erp_pack");

          if ((isCrmPack || isErpPack) && customerEmail) {
            const purchases = readJSON(TENANT_PURCHASES_FILE);
            const userPurchases = purchases[customerEmail] || [];

            if (isCrmPack) {
              userPurchases.push({
                id: "purchase-" + Math.random().toString(36).substr(2, 9),
                type: "crm-pack",
                productName: "CRM Connection Pack",
                slots: 5,
                usedSlots: 0,
                amount: amountTotal,
                stripeSessionId: session.id || "unknown",
                status: "active",
                purchasedAt: new Date().toISOString(),
              });
              console.log(`[webhook] Provisioned CRM Connection Pack (5 slots) for ${customerEmail}`);
            }

            if (isErpPack) {
              userPurchases.push({
                id: "purchase-" + Math.random().toString(36).substr(2, 9),
                type: "erp-pack",
                productName: "ERP Connection Pack",
                slots: 5,
                usedSlots: 0,
                amount: amountTotal,
                stripeSessionId: session.id || "unknown",
                status: "active",
                purchasedAt: new Date().toISOString(),
              });
              console.log(`[webhook] Provisioned ERP Connection Pack (5 slots) for ${customerEmail}`);
            }

            purchases[customerEmail] = userPurchases;
            writeJSON(TENANT_PURCHASES_FILE, purchases);
            configureTenant(customerEmail, { purchased: true, status: "Active" });
            return Response.json({ received: true });
          }

          // Match payment link to agent
          const employees = readJSON(AI_EMPLOYEES_FILE);
          const matchedAgent = employees.find((e: any) =>
            e.stripePaymentLink && session.payment_link && e.stripePaymentLink.includes(session.payment_link)
          ) || employees.find((e: any) =>
            e.stripePriceId && session.metadata?.priceId === e.stripePriceId
          );
          if (customerEmail && matchedAgent) {
            // Provision the purchase
            const purchases = readJSON(TENANT_PURCHASES_FILE);
            const userPurchases = purchases[customerEmail] || [];
            userPurchases.push({
              id: "purchase-" + Math.random().toString(36).substr(2, 9),
              agentId: matchedAgent.id,
              agentName: matchedAgent.name,
              amount: amountTotal,
              stripeSessionId: session.id || "unknown",
              status: "active",
              purchasedAt: new Date().toISOString(),
            });
            purchases[customerEmail] = userPurchases;
            writeJSON(TENANT_PURCHASES_FILE, purchases);
            configureTenant(customerEmail, { purchased: true, status: "Active" });
            console.log(`[webhook] Provisioned ${matchedAgent.name} for ${customerEmail}`);
          } else if (customerEmail) {
            // Generic purchase — record it
            const purchases = readJSON(TENANT_PURCHASES_FILE);
            const userPurchases = purchases[customerEmail] || [];
            userPurchases.push({
              id: "purchase-" + Math.random().toString(36).substr(2, 9),
              amount: amountTotal,
              stripeSessionId: session.id || "unknown",
              status: "active",
              purchasedAt: new Date().toISOString(),
            });
            purchases[customerEmail] = userPurchases;
            writeJSON(TENANT_PURCHASES_FILE, purchases);
            configureTenant(customerEmail, { purchased: true, status: "Active" });
            console.log(`[webhook] Recorded purchase for ${customerEmail}`);
          }
        }
        return Response.json({ received: true });
      } catch {
        return Response.json({ received: true });
      }
    }


    // ── /api/oauth/callback ───────────────────────────────────────
    if (pathname === "/api/oauth/callback" || pathname === "/api/xero-callback" || pathname.match(/^\/api\/oauth\/callback\/(.+)$/)) {
      // Path-based providers (e.g. xero) embed the provider ID in the URL path
      const pathProvider = pathname === "/api/xero-callback" ? "xero" : (pathname.match(/^\/api\/oauth\/callback\/(.+)$/) || [])[1] || null;
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");
      
      // Provider denied authorization
      if (errorParam) {
        const msg = encodeURIComponent(errorDesc || errorParam);
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Authorization denied: " + (errorDesc || errorParam))}`, 302);
      }
      
      if (!code || !state) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Missing code or state parameter")}`, 302);
      }
      
      // Validate CSRF state
      const states = readJSON(OAUTH_STATES_FILE);
      const stateEntry = states[state];
      const callbackUser = await getUserFromSession(req);
      if (!callbackUser?.email) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Session expired. Please login and try again.")}`, 302);
      }
      const stateError = validateOAuthState(stateEntry, callbackUser.email);
      if (stateError === "mismatch") {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("OAuth state belongs to a different tenant")}`, 302);
      }
      if (stateError === "expired") {
        consumeOAuthState(states, state);
        writeJSON(OAUTH_STATES_FILE, states);
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("OAuth state expired. Please try again.")}`, 302);
      }
      if (stateError) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Invalid OAuth state")}`, 302);
      }
      if (!stateEntry) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Invalid state — possible CSRF attack or expired session")}`, 302);
      }
      
      // Check TTL (10 minutes)
      const TEN_MINUTES = 10 * 60 * 1000;
      if (Date.now() - stateEntry.createdAt > TEN_MINUTES) {
        delete states[state];
        writeJSON(OAUTH_STATES_FILE, states);
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("OAuth state expired. Please try again.")}`, 302);
      }
      
      const authProvider = stateEntry.provider;
      const verifier = stateEntry.verifier;
      
      // Clean up consumed state (single-process serialized file update)
      consumeOAuthState(states, state);
      writeJSON(OAUTH_STATES_FILE, states);
      
      // Get user from session (for connection record)
      const user = callbackUser;
      if (!user) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("Session expired. Please login and try again.")}`, 302);
      }
      
      const creds = getOAuthCredentials(authProvider);
      if (!creds) {
        return Response.redirect(`/portal/integrations?error=${encodeURIComponent("OAuth not configured for " + authProvider + ". Add credentials in Admin → OAuth Settings.")}`, 302);
      }
      
      const redirectUri = getOAuthRedirectUri(authProvider, req);
      
      try {
        // Exchange code for tokens using the provider's auth module
        const canonicalProvider = getCanonicalProvider(authProvider);
        const authModulePath = `./src/integrations/providers/${canonicalProvider}/auth.ts`;
        const authMod = await import(authModulePath);
        
        // Find handle*Callback function — iterate exports for any matching function
        const handleCb = Object.keys(authMod).find(k => 
          k.startsWith("handle") && k.endsWith("Callback")
        ) ? authMod[Object.keys(authMod).find(k => k.startsWith("handle") && k.endsWith("Callback"))!] : undefined;
        
        let tokens: any;
        if (handleCb) {
          tokens = await handleCb(
            { clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri },
            code,
            verifier || "",
          );
        } else {
          // No audited callback handler: fail closed rather than guessing a token host.
          throw new Error(`OAuth callback is not implemented for ${authProvider}`);
        }
                if (!usableOAuthToken(tokens)) throw new Error("OAuth provider returned no usable access token");
        // Store tokens in tenant_oauth_credentials.json
        const tokenFile = join(DATA_DIR, "tenant_oauth_credentials.json");
        const tokenData = readJSON(tokenFile);
        const tokenKey = `${user.email}:${authProvider}`;
        tokenData[tokenKey] = {
          provider: authProvider,
          email: user.email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
          tokenType: tokens.tokenType,
          instanceUrl: tokens.instanceUrl,
          updatedAt: new Date().toISOString(),
        };
        writeJSON(tokenFile, tokenData);
        
        // Create connection record in tenant_integrations.json
        const allConns = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = allConns[user.email] || [];
        
        // Check for existing connection
        const existingIdx = userConns.findIndex((c: any) => c.providerId === authProvider);
        const entry = {
          id: "int-" + Math.random().toString(36).substr(2, 9),
          provider: authProvider,
          providerId: authProvider,
          category: getProviderCategory(authProvider) || "Integration",
          status: "Connected",
          connectedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          credentials: { apiKey: tokens.accessToken, oauth: true },
        };
        
        if (existingIdx >= 0) {
          // Update existing connection
          userConns[existingIdx] = { ...userConns[existingIdx], ...entry, id: userConns[existingIdx].id };
        } else {
          userConns.push(entry);
        }
        allConns[user.email] = userConns;
        writeJSON(TENANT_INTEGRATIONS_FILE, allConns);
        
        // Audit log
        const alogs = readJSON(AUDIT_LOG_FILE);
        const alogUser = alogs[user.email] || [];
        alogUser.push({
          id: "log-" + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          user: user.email,
          action: "integration.connect",
          resource: authProvider,
          detail: `Connected ${authProvider} via OAuth`,
          ip: "127.0.0.1",
        });
        alogs[user.email] = alogUser;
        writeJSON(AUDIT_LOG_FILE, alogs);
        
        // Redirect to integrations with success
        const successMsg = encodeURIComponent(`✅ Connected to ${authProvider} successfully!`);
        return Response.redirect(`/portal/integrations?success=${successMsg}`, 302);
        
      } catch (e: any) {
        console.error("OAuth callback error:", e);
        const errMsg = encodeURIComponent(`OAuth failed for ${authProvider}: ${e.message || "Unknown error"}`);
        return Response.redirect(`/portal/integrations?error=${errMsg}`, 302);
      }
    }


    // ── /api/oauth/authorize ─────────────────────────────────────
    if (pathname === "/api/oauth/authorize") {
      const provider = url.searchParams.get("provider");
      if (!provider) return Response.json({ error: "provider param required" }, { status: 400 });
      // Look up provider in integrations.json
      const integrations = readJSON(join(DATA_DIR, "integrations.json"));
      const providerData = integrations.find((p: any) =>
        p.id === provider || p.id?.toLowerCase() === provider.toLowerCase()
      );
      if (!providerData) return Response.json({ error: "Unknown provider: " + provider }, { status: 404 });
      // Generate CSRF state bound to the authenticated tenant.
      const initiatingUser = await getUserFromSession(req);
      if (!initiatingUser?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });
      let state = randomBytes(32).toString("hex");
      const states = readJSON(OAUTH_STATES_FILE);
      states[state] = { provider, email: initiatingUser.email, createdAt: Date.now() };
      writeJSON(OAUTH_STATES_FILE, states);
      // Build OAuth redirect URL dynamically via provider auth modules
      const redirectUri = getOAuthRedirectUri(provider, req);
      const canonicalProvider = getCanonicalProvider(provider);
      const creds = getOAuthCredentials(provider);
      
      // Try to use a real provider auth module
      let authUrl: string | null = null;
      let verifier: string | undefined;
      
      try {
        const authModulePath = `./src/integrations/providers/${canonicalProvider}/auth.ts`;
        const authMod = await import(authModulePath);
        // Find build*AuthUrl function — iterate exports for any matching function
        const buildFn = Object.keys(authMod).find(k => 
          k.startsWith("build") && k.endsWith("AuthUrl")
        ) ? authMod[Object.keys(authMod).find(k => k.startsWith("build") && k.endsWith("AuthUrl"))!] : undefined;
        
        if (buildFn && creds) {
          const result = await buildFn({
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            redirectUri,
          });
          authUrl = typeof result === "string" ? result : result.url;
          
          // Auth modules generate their own state — use it instead to prevent CSRF mismatch
          if (result.state && result.state !== state) {
            delete states[state];
            state = result.state;
            states[state] = { provider, email: initiatingUser.email, createdAt: Date.now() };
          }
          
          // Store PKCE verifier if the module generated one
          if (result.verifier) {
            states[state].verifier = result.verifier;
            verifier = result.verifier;
          }
          
          writeJSON(OAUTH_STATES_FILE, states);
        }
      } catch (_) {
        // Auth module not available — fall through to env-var-based URL
      }
      
      if (authUrl) {
        return Response.redirect(authUrl, 302);
      }
      
      // No auth module or no credentials: show configuration error
      if (!creds) {
        const provUpper = provider.replace(/-/g, "_").toUpperCase();
        return new Response(
          `<!DOCTYPE html><html><head><title>OAuth Not Configured</title><meta charset="utf-8"></head><body style="font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;background:#1c1917;color:#f5f5f4;border-radius:12px;border:1px solid #292524;"><h2>🔒 OAuth not configured</h2><p>OAuth is not configured for <strong>${provider}</strong>. Add credentials in Admin → OAuth Settings or set environment variables:</p><pre style="background:#292524;padding:12px;border-radius:8px;overflow-x:auto;">OAUTH_${provUpper}_CLIENT_ID=your_client_id
OAUTH_${provUpper}_CLIENT_SECRET=your_client_secret</pre><p style="font-size:0.85em;color:#78716c;"><a href="/portal/integrations" style="color:#60a5fa;">← Back to Integrations</a></p></body></html>`,
          { status: 503, headers: { "Content-Type": "text/html" } }
        );
      }
      
      // No audited provider module means no guessed OAuth host or token endpoint.
      return Response.json({ error: `OAuth is not implemented for ${provider}` }, { status: 501 });
    }
    if (pathname.startsWith("/assets/") || pathname.startsWith("/_build/") ||
        pathname === "/manifest.json" || pathname === "/sw.js" || pathname.startsWith("/icon-") ||
        pathname === "/robots.txt" || pathname === "/sitemap.xml") {
      const f = Bun.file(join(DIST_CLIENT, pathname));
      if (await f.exists()) {
        // Hashed assets (fingerprinted JS/CSS): cache long-term
        // Non-hashed (manifest, sw, robots): no-store to prevent staleness
        const isHashed = /-[A-Za-z0-9_]{8,}\.(js|css)$/.test(pathname);
        const cacheControl = isHashed
          ? "public, max-age=31536000, immutable"
          : "no-store";
        return new Response(f, {
          headers: { "Cache-Control": cacheControl },
        });
      }
      // CDN cache fallback: redirect old hashes to current file
      // Using 301 so browsers that cached old broken content (with
      // immutable) will re-fetch the correct file at the new URL.
      try {
        const fileName = pathname.split('/').pop() || '';
        const base = fileName.replace(/-[A-Za-z0-9_]{8,}\.(js|css)$/, '');
        const ext = fileName.split('.').pop();
        const assetsDir = join(DIST_CLIENT, 'assets');
        const entries = readdirSync(assetsDir).filter(e => e.startsWith(base + '-') && e.endsWith('.' + ext)).sort();
        if (entries.length > 0) {
          const newFile = entries[entries.length - 1];
          return new Response(null, {
            status: 301,
            headers: {
              "Location": "/assets/" + newFile,
              "Cache-Control": "no-store",
            },
          });
        }
      } catch (_) {}
    }

    // Auth guard: redirect unauthenticated portal requests to /login
    if (pathname.startsWith("/portal") && pathname !== "/portal/login" && pathname !== "/portal/register") {
      const user = await getUserFromSession(req);
      if (!user) {
        return new Response(null, {
          status: 302,
          headers: { "Location": "/login" },
        });
      }
    }

    // Purchase gate: CRM/ERP pages require a purchase (owner bypasses)
    if ((pathname === "/portal/crm" || pathname === "/portal/erp") && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (user && user.email !== "mathewortiz97@gmail.com") {
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const userPurchases = purchases[user.email] || [];
        // Per-portal pack type check: CRM portal needs crm-pack, ERP portal needs erp-pack
        const requiredPackType = pathname === "/portal/crm" ? "crm-pack" : "erp-pack";
        const crmErpAgents = ["crm-sync-agent","email-assistant","lead-scoring-agent","customer-onboarding","sales-follow-up",
          "support-triage-agent","support-ticket-router","invoice-processor","po-management","payroll-reconciliation"];
        const hasCrmErpPurchase = userPurchases.some((p: any) => {
          if (p.type === requiredPackType) return true; // CRM or ERP Connection Pack grants access
          if (p.agents) return p.agents.some((a: any) => crmErpAgents.includes(a));
          if (p.agentId) return crmErpAgents.includes(p.agentId);
          if (p.type === "builder" || p.package) return true; // builder packages include CRM/ERP
          return false;
        });
        if (!hasCrmErpPurchase) {
          return Response.json({
            error: "Purchase required",
            message: `${pathname === "/portal/crm" ? "CRM" : "ERP"} integrations require an active AI employee, builder package, or Connection Pack purchase.`,
            cta: "/portal/marketplace",
          }, { status: 402 });
        }
      }
    }

      // SPA mode: serve index.html for all non-API, non-asset GET requests.
      // The React router handles routing client-side.
      try {
        const indexPath = join(DIST_CLIENT, "index.html");
        if (!existsSync(indexPath)) {
          return new Response("SPA not built — run `bun run build` first", { status: 503 });
        }

        let html = readFileSync(indexPath, "utf-8");

        // Cache-bust asset URLs to force CDN revalidation on new deploys
        html = html.replace(
          /(src|href)="(\/assets\/[^"]+)"/g,
          `$1="$2?_v=${BUILD_ID}"`
        );

        // Inject portal user data so the client skips /api/me fetch
        if (pathname.startsWith("/portal") && req) {
          try {
            const cookieHeader = req.headers.get("cookie") || "";
            const match = cookieHeader.match(/session=([^;]+)/);
            if (match) {
              const sessions = readJSON(SESSIONS_FILE);
              const session = sessions[match[1]];
              if (session?.email) {
                const userScript = `<script>window.__PORTAL_USER__=${JSON.stringify({email:session.email})};window.__PORTAL_READY__=true;</script>`;
                html = html.replace("</head>", userScript + "</head>");
              }
            }
          } catch {}
        }

        // Inject method/action on login form for no-JS fallback
        if (pathname === "/login") {
          html = html.replace('<form class="mt-8 space-y-5"', '<form class="mt-8 space-y-5" method="post" action="/login"');
        }

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, must-revalidate",
            "ETag": `"${Date.now().toString(36)}"`,
          },
        });
      } catch {
        return new Response("Server error", { status: 500 });
      }
  },
});
console.log("[prod-server] Port 3000 — SPA mode: serving dist/index.html | API: /api/login, /api/register, /api/logout, /api/me");
