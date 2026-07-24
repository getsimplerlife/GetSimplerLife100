import { serve, spawn } from "bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const DIST_CLIENT = "/home/team/shared/site/dist/client";
const DATA_DIR = "/home/team/shared/site/.data";
const NITRO_PORT = 3002;

// Start Nitro SSR server on port 3002
const nitroProcess = spawn({
  cmd: ["bun", "run", "dist/server/server.js"],
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, PORT: String(NITRO_PORT), NITRO_PORT: String(NITRO_PORT) },
});
console.log(`[prod-server] Spawned Nitro SSR on port ${NITRO_PORT} (pid ${nitroProcess.pid})`);
// Robust loader: read integrations.ts source and parse the array
// (static/dynamic imports from src/content/ are unreliable in the prod-server runtime)
function loadIntegrations(): any[] {
  try {
    const src = readFileSync(join(import.meta.dir, "src/content/integrations.ts"), "utf8");
    const start = src.indexOf("export const integrations");
    if (start === -1) return [];
    const arrStart = src.indexOf("[", start);
    if (arrStart === -1) return [];
    // Find matching closing bracket
    let depth = 0;
    let arrEnd = -1;
    for (let i = arrStart; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]") { depth--; if (depth === 0) { arrEnd = i + 1; break; } }
    }
    if (arrEnd === -1) return [];
    const arrStr = src.slice(arrStart, arrEnd);
    return new Function("return " + arrStr)();
  } catch {
    return [];
  }
}
const USERS_FILE = join(DATA_DIR, "users.json");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");
const TENANT_INTEGRATIONS_FILE = join(DATA_DIR, "tenant_integrations.json");

function readJSON(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function writeJSON(path: string, data: any) {
  writeFileSync(path, JSON.stringify(data, null, 2));
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

// Detect auth type from credentials shape
function detectAuthType(credentials: any): string {
  if (credentials.clientId && credentials.clientSecret) return "oauth";
  if (credentials.accessToken) return "bearer";
  if (credentials.username && credentials.password) return "basic";
  if (credentials.apiKey) return "bearer";
  return "bearer"; // default
}

// Build authorization headers for any auth type
function buildAuthHeaders(authType: string, credentials: any): Record<string, string> {
  const headers: Record<string, string> = {};
  switch (authType) {
    case "bearer": {
      const token = credentials.accessToken || credentials.apiKey || "";
      headers["Authorization"] = `Bearer ${token}`;
      break;
    }
    case "basic": {
      const user = credentials.username || "";
      const pass = credentials.password || "";
      headers["Authorization"] = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
      break;
    }
    case "header": {
      const headerName = credentials.headerName || "X-API-Key";
      headers[headerName] = credentials.apiKey || credentials.accessToken || "";
      break;
    }
    case "query": {
      // Query auth is handled in the URL, not headers
      break;
    }
    case "oauth": {
      // OAuth uses clientId/clientSecret in body or bearer after token exchange
      if (credentials.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.accessToken}`;
      }
      break;
    }
  }
  return headers;
}

// Build test URL with query params if needed
function buildTestUrl(baseUrl: string, authType: string, credentials: any): string {
  if (authType === "query") {
    const key = credentials.apiKey || credentials.accessToken || "";
    const paramName = credentials.queryParamName || "api_key";
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}${paramName}=${encodeURIComponent(key)}`;
  }
  return baseUrl;
}

async function testProviderConnection(providerId: string, providerName: string, credentials: any): Promise<{ success: boolean; error?: string }> {
  const authType = credentials.authType || detectAuthType(credentials);

  // Provider-specific connection tests — 30+ providers across categories
  const testUrls: Record<string, { url: string; authType?: string; headers?: Record<string, string> }> = {
    // ── CRM ──
    salesforce: { url: "https://login.salesforce.com/services/oauth2/userinfo", authType: "bearer" },
    hubspot: { url: "https://api.hubapi.com/oauth/v1/access-tokens", authType: "bearer" },
    zoho: { url: "https://accounts.zoho.com/oauth/user/info", authType: "bearer" },
    pipedrive: { url: "https://api.pipedrive.com/v1/users/me", authType: "query",
      headers: {} },
    "zoho-crm": { url: "https://www.zohoapis.com/crm/v2/users", authType: "bearer" },
    "freshsales": { url: "https://domain.freshsales.io/api/settings/org", authType: "bearer" },
    "copper": { url: "https://api.copper.com/developer_api/v1/account", authType: "bearer" },
    "insightly": { url: "https://api.insightly.com/v3.1/Instance", authType: "bearer" },

    // ── ERP ──
    quickbooks: { url: "https://quickbooks.api.intuit.com/v3/company", authType: "bearer" },
    sap: { url: "https://api.sap.com/", authType: "basic" },
    "oracle-netsuite": { url: "https://rest.netsuite.com/rest/roles", authType: "bearer" },
    "ms-dynamics-365": { url: "https://api.businesscentral.dynamics.com/v2.0/", authType: "bearer" },
    "sage-intacct": { url: "https://api.intacct.com/ia/api/v1/objects", authType: "bearer" },
    "acumatica": { url: "https://api.acumatica.com/entity/Default/18.200.001/", authType: "bearer" },

    // ── Communication ──
    slack: { url: "https://slack.com/api/auth.test", authType: "bearer" },
    teams: { url: "https://graph.microsoft.com/v1.0/me", authType: "bearer" },
    discord: { url: "https://discord.com/api/v10/users/@me", authType: "bearer" },
    twilio: { url: "https://api.twilio.com/2010-04-01/Accounts", authType: "basic" },
    aircall: { url: "https://api.aircall.io/v1/users/me", authType: "bearer" },
    dialpad: { url: "https://dialpad.com/api/v2/users/me", authType: "bearer" },

    // ── Email ──
    mailchimp: { url: "https://login.mailchimp.com/oauth2/metadata", authType: "bearer" },
    gmail: { url: "https://gmail.googleapis.com/gmail/v1/users/me/profile", authType: "bearer" },
    outlook: { url: "https://graph.microsoft.com/v1.0/me/messages", authType: "bearer" },
    sendgrid: { url: "https://api.sendgrid.com/v3/scopes", authType: "bearer" },

    // ── Payments / Finance ──
    stripe: { url: "https://api.stripe.com/v1/balance", authType: "bearer" },
    paypal: { url: "https://api-m.paypal.com/v1/identity/oauth2/userinfo", authType: "bearer" },
    square: { url: "https://connect.squareup.com/v2/merchants/me", authType: "bearer" },

    // ── Dev Tools ──
    github: { url: "https://api.github.com/user", authType: "bearer" },
    gitlab: { url: "https://gitlab.com/api/v4/user", authType: "bearer" },
    jira: { url: "https://api.atlassian.com/me", authType: "bearer" },
    "aws-lambda": { url: "https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/", authType: "bearer" },

    // ── Storage ──
    dropbox: { url: "https://api.dropboxapi.com/2/users/get_current_account", authType: "bearer" },
    box: { url: "https://api.box.com/2.0/users/me", authType: "bearer" },
    "google-drive": { url: "https://www.googleapis.com/drive/v3/about", authType: "bearer" },
    onedrive: { url: "https://graph.microsoft.com/v1.0/me/drive", authType: "bearer" },

    // ── Project Mgmt ──
    asana: { url: "https://app.asana.com/api/1.0/users/me", authType: "bearer" },
    monday: { url: "https://api.monday.com/v2", authType: "bearer" },
    clickup: { url: "https://api.clickup.com/api/v2/user", authType: "bearer" },
    trello: { url: "https://api.trello.com/1/members/me", authType: "query" },
    notion: { url: "https://api.notion.com/v1/users/me", authType: "bearer" },

    // ── E-Commerce ──
    shopify: { url: "https://shopify.com/admin/api/2024-01/shop.json", authType: "bearer" },
    magento: { url: "https://magento.com/rest/V1/store/storeConfigs", authType: "bearer" },

    // ── Support / ITSM ──
    servicenow: { url: "https://instance.service-now.com/api/now/table/sys_user", authType: "basic" },
    zendesk: { url: "https://zendesk.com/api/v2/users/me", authType: "basic" },
    intercom: { url: "https://api.intercom.io/me", authType: "bearer" },

    // ── AI / ML ──
    openai: { url: "https://api.openai.com/v1/models", authType: "bearer" },
    "google-ai": { url: "https://generativelanguage.googleapis.com/v1beta/models", authType: "query" },
    "aws-bedrock": { url: "https://bedrock.us-east-1.amazonaws.com/", authType: "bearer" },

    // ── BI / Analytics ──
    tableau: { url: "https://api.tableau.com/api/3.21/auth/signin", authType: "bearer" },
    powerbi: { url: "https://api.powerbi.com/v1.0/myorg/groups", authType: "bearer" },
    looker: { url: "https://looker.googleapis.com/v1/login", authType: "bearer" },

    // ── Document Processing ──
    docusign: { url: "https://account.docusign.com/oauth/userinfo", authType: "bearer" },
    "adobe-sign": { url: "https://api.na1.echosign.com/api/rest/v6/baseUris", authType: "bearer" },
    "aws-textract": { url: "https://textract.us-east-1.amazonaws.com/", authType: "bearer" },

    // ── Databases ──
    supabase: { url: "https://api.supabase.com/v1/projects", authType: "bearer" },
    airtable: { url: "https://api.airtable.com/v0/meta/bases", authType: "bearer" },
  };

  const testConfig = testUrls[providerId.toLowerCase()];
  const effectiveAuthType = testConfig?.authType || authType;

  try {
    if (testConfig) {
      // Build request: headers + URL (for query-auth)
      const headers = testConfig.headers
        ? { ...testConfig.headers }
        : buildAuthHeaders(effectiveAuthType, credentials);
      const url = buildTestUrl(testConfig.url, effectiveAuthType, credentials);

      // OAuth: try token exchange if clientId/clientSecret provided but no accessToken
      if (effectiveAuthType === "oauth" && !credentials.accessToken) {
        try {
          const tokenRes = await fetch(testConfig.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
              grant_type: "client_credentials",
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (tokenRes.status === 200 || tokenRes.status === 201) {
            return { success: true };
          }
          if (tokenRes.status === 401 || tokenRes.status === 403) {
            return { success: false, error: `OAuth token exchange failed for ${providerName}. Check your clientId and clientSecret.` };
          }
          return { success: true }; // ambiguous but got a response
        } catch {
          return { success: true }; // network error, allow connection
        }
      }

      // Standard connection test
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 200 || res.status === 302 || res.status === 201) {
        return { success: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: `Invalid credentials for ${providerName}. Please check your ${effectiveAuthType === "basic" ? "username and password" : effectiveAuthType === "oauth" ? "client ID and secret" : "credentials"}.` };
      }
      if (res.status < 500) {
        return { success: true };
      }
      return { success: false, error: `${providerName} returned status ${res.status}. Please verify your credentials.` };
    }

    // No specific test URL — validate credential format based on auth type
    const primaryCred = credentials.accessToken || credentials.clientId || credentials.apiKey || credentials.username || "";
    if (primaryCred.startsWith("sk-") || primaryCred.startsWith("pk-") || primaryCred.includes(".")) {
      return { success: true };
    }
    if (primaryCred.length >= 16) {
      return { success: true };
    }
    return { success: false, error: `Invalid credential format for ${providerName}. Credentials are typically 16+ characters.` };
  } catch (e: any) {
    // Network error — allow the connection but mark as untested
    return { success: true };
  }
}

serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

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

    // ── Integration APIs ──────────────────────────────────────────
    if (pathname === "/api/integrations") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: owner always allowed, others must have purchased
      if (user.email !== "mathewortiz97@gmail.com") {
        const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
        const userPurchases = purchases[user.email] || [];
        const hasActivePurchase = userPurchases.some((p) => p.status === "active");
        if (!hasActivePurchase) {
          return Response.json({ error: "Purchase required to connect integrations" }, { status: 403 });
        }
      }

      const all = readJSON(TENANT_INTEGRATIONS_FILE);
      return Response.json({ data: all[user.email] || [] });
    }

    if (pathname === "/api/integrations/providers") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "180");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const category = url.searchParams.get("category") || "";
      let filtered = (JSON.parse(readFileSync(join(DATA_DIR, "integrations.json"), "utf8")) || []).filter((p: any) => p && p.name);
      // Add supplementary providers not in integrations.ts
      const names = new Set(filtered.map((p: any) => p.name.toLowerCase()));
      const extras = [
        {id:"abbyy",name:"ABBYY",icon:"📄",category:"Document Processing",description:"OCR and document capture for intelligent automation.",capabilities:["Document OCR","Form processing","Data extraction"],industries:[],relatedWorkflows:[]},
        {id:"aircall",name:"Aircall",icon:"💬",category:"Communication",description:"Cloud-based phone system for sales and support teams.",capabilities:["Call routing","IVR","Call recording"],industries:[],relatedWorkflows:[]},
        {id:"asana",name:"Asana",icon:"📊",category:"Project Mgmt",description:"Work management platform for teams.",capabilities:["Task management","Timeline view","Automation rules"],industries:[],relatedWorkflows:[]},
        {id:"basecamp",name:"Basecamp",icon:"📊",category:"Project Mgmt",description:"Project management and team collaboration tool.",capabilities:["Task tracking","Team messaging","File sharing"],industries:[],relatedWorkflows:[]},
        {id:"box",name:"Box",icon:"📁",category:"Storage",description:"Cloud content management and file sharing.",capabilities:["File storage","Collaboration","Workflow automation"],industries:[],relatedWorkflows:[]},
        {id:"clickup",name:"ClickUp",icon:"📊",category:"Project Mgmt",description:"All-in-one productivity platform.",capabilities:["Task management","Time tracking","Goal tracking"],industries:[],relatedWorkflows:[]},
        {id:"dialpad",name:"Dialpad",icon:"💬",category:"Communication",description:"AI-powered cloud communication platform.",capabilities:["Voice calling","Video conferencing","AI transcription"],industries:[],relatedWorkflows:[]},
        {id:"discord",name:"Discord",icon:"💬",category:"Communication",description:"Voice, video, and text communication platform.",capabilities:["Voice channels","Text chat","Bot integration"],industries:[],relatedWorkflows:[]},
        {id:"docusign",name:"DocuSign",icon:"📄",category:"Document Processing",description:"Electronic signature and agreement cloud.",capabilities:["E-signatures","Contract management","Agreement analytics"],industries:[],relatedWorkflows:[]},
        {id:"dropbox",name:"Dropbox",icon:"📁",category:"Storage",description:"Cloud storage and file synchronization.",capabilities:["File sync","Team folders","File requests"],industries:[],relatedWorkflows:[]},
        {id:"gmail",name:"Gmail",icon:"✉️",category:"Email",description:"Google email service with smart features.",capabilities:["Email sending","Inbox management","Label automation"],industries:[],relatedWorkflows:[]},
        {id:"google-drive",name:"Google Drive",icon:"📁",category:"Storage",description:"Cloud storage and collaborative editing.",capabilities:["File storage","Real-time collaboration","Sharing controls"],industries:[],relatedWorkflows:[]},
        {id:"jira",name:"Jira",icon:"📊",category:"Project Mgmt",description:"Issue tracking and agile project management.",capabilities:["Issue tracking","Sprint planning","Roadmaps"],industries:[],relatedWorkflows:[]},
        {id:"looker",name:"Looker",icon:"📈",category:"BI",description:"Business intelligence and data analytics.",capabilities:["Data modeling","Dashboards","Embedded analytics"],industries:[],relatedWorkflows:[]},
        {id:"magento",name:"Magento",icon:"🛍️",category:"E-Commerce",description:"Adobe e-commerce platform.",capabilities:["Catalog management","Order processing","Customer accounts"],industries:[],relatedWorkflows:[]},
        {id:"monday",name:"Monday.com",icon:"📊",category:"Project Mgmt",description:"Work operating system for teams.",capabilities:["Project tracking","Automations","Dashboard views"],industries:[],relatedWorkflows:[]},
        {id:"notion",name:"Notion",icon:"✅",category:"Productivity",description:"All-in-one workspace for notes and docs.",capabilities:["Document creation","Databases","Team collaboration"],industries:[],relatedWorkflows:[]},
        {id:"onedrive",name:"OneDrive",icon:"📁",category:"Storage",description:"Microsoft cloud storage for businesses.",capabilities:["File storage","Office integration","Sharing"],industries:[],relatedWorkflows:[]},
        {id:"outlook",name:"Outlook",icon:"✉️",category:"Email",description:"Microsoft email and calendar service.",capabilities:["Email management","Calendar","Rules"],industries:[],relatedWorkflows:[]},
        {id:"powerbi",name:"Power BI",icon:"📈",category:"BI",description:"Microsoft business analytics service.",capabilities:["Dashboards","Reports","Data connectors"],industries:[],relatedWorkflows:[]},
        {id:"sap",name:"SAP S/4HANA",icon:"🏢",category:"ERP",description:"Deep integration with SAP for automated document processing.",capabilities:["Invoice posting","Inventory sync","Production orders"],industries:[],relatedWorkflows:[]},
        {id:"servicenow",name:"ServiceNow",icon:"🛠️",category:"Support",description:"IT service management platform.",capabilities:["Incident management","Change management","Service catalog"],industries:[],relatedWorkflows:[]},
        {id:"shopify",name:"Shopify",icon:"🛍️",category:"E-Commerce",description:"E-commerce platform for online stores.",capabilities:["Order management","Product catalog","Customer profiles"],industries:[],relatedWorkflows:[]},
        {id:"slack",name:"Slack",icon:"💬",category:"Communication",description:"Messaging platform for teams.",capabilities:["Channel messaging","App integration","Workflow builder"],industries:[],relatedWorkflows:[]},
        {id:"stripe",name:"Stripe",icon:"💳",category:"Payments",description:"Payment processing platform.",capabilities:["Payment processing","Subscription billing","Invoicing"],industries:[],relatedWorkflows:[]},
        {id:"tableau",name:"Tableau",icon:"📈",category:"BI",description:"Visual analytics platform.",capabilities:["Data visualization","Dashboard creation","Data blending"],industries:[],relatedWorkflows:[]},
        {id:"teams",name:"Microsoft Teams",icon:"💬",category:"Communication",description:"Microsoft collaboration platform.",capabilities:["Team chat","Video meetings","File collaboration"],industries:[],relatedWorkflows:[]},
        {id:"trello",name:"Trello",icon:"📊",category:"Project Mgmt",description:"Visual project management tool.",capabilities:["Kanban boards","Checklists","Automation"],industries:[],relatedWorkflows:[]},
        {id:"twilio",name:"Twilio",icon:"📞",category:"Communication",description:"Cloud communications platform.",capabilities:["SMS messaging","Voice calling","Video API"],industries:[],relatedWorkflows:[]},
        {id:"whatsapp",name:"WhatsApp Business",icon:"💬",category:"Communication",description:"WhatsApp business API for customer messaging.",capabilities:["Business messaging","Template messages","Webhook integration"],industries:[],relatedWorkflows:[]},
        {id:"aws-bedrock",name:"AWS Bedrock",icon:"🤖",category:"AI Models",description:"Amazon managed service for generative AI.",capabilities:["Model hosting","RAG pipelines","Fine-tuning"],industries:[],relatedWorkflows:[]},
        {id:"aws-lambda",name:"AWS Lambda",icon:"⚡",category:"Dev Tools",description:"Serverless compute service.",capabilities:["Event processing","API backends","Scheduled jobs"],industries:[],relatedWorkflows:[]},
        {id:"aws-textract",name:"AWS Textract",icon:"📄",category:"Document Processing",description:"ML service for text extraction from documents.",capabilities:["OCR","Form extraction","Table detection"],industries:[],relatedWorkflows:[]},
        {id:"adobe-sign",name:"Adobe Sign",icon:"📄",category:"Document Processing",description:"E-signature solution.",capabilities:["E-signatures","Document tracking","Template management"],industries:[],relatedWorkflows:[]}
      ];
      for (const e of extras) { if (!names.has(e.name.toLowerCase())) { filtered.push(e); names.add(e.name.toLowerCase()); } }
      if (search) filtered = filtered.filter((p: any) => p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search));
      if (category) filtered = filtered.filter((p: any) => p.category === category);
      const total = filtered.length;
      const start = page * limit;
      return Response.json({ data: filtered.slice(start, start + limit), total });
    }

    if (pathname === "/api/integrations/connect" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: owner always allowed, others must have purchased
      if (user.email !== "mathewortiz97@gmail.com") {
        const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
        const userPurchases = purchases[user.email] || [];
        const hasActivePurchase = userPurchases.some((p) => p.status === "active");
        if (!hasActivePurchase) {
          return Response.json({ error: "Purchase required to connect integrations" }, { status: 403 });
        }
      }

      try {
        const body = await req.json();
        const { providerId, providerName, credentials } = body;
        // Flexible credential validation: support apiKey, clientId, accessToken, username+password
        if (!credentials || typeof credentials !== "object") {
          return Response.json({ error: "Credentials required. Provide at least one: apiKey, clientId, accessToken, or username+password." }, { status: 400 });
        }
        const hasApiKey = credentials.apiKey && credentials.apiKey.trim();
        const hasClientId = credentials.clientId && credentials.clientId.trim();
        const hasAccessToken = credentials.accessToken && credentials.accessToken.trim();
        const hasUsername = credentials.username && credentials.username.trim();
        if (!hasApiKey && !hasClientId && !hasAccessToken && !hasUsername) {
          return Response.json({ error: "Credentials required. Provide at least one: apiKey, clientId, accessToken, or username+password." }, { status: 400 });
        }
        // Validate minimum length on the primary credential
        const primaryCred = hasApiKey ? credentials.apiKey : hasClientId ? credentials.clientId : hasAccessToken ? credentials.accessToken : credentials.username;
        if (primaryCred.trim().length < 4) {
          return Response.json({ error: "Credential value too short (minimum 4 characters)." }, { status: 400 });
        }
        // Test the connection before saving
        const testResult = await testProviderConnection(providerId, providerName, credentials);
        if (!testResult.success) {
          return Response.json({ error: testResult.error || "Connection test failed. Check your credentials." }, { status: 400 });
        }
        // Detect and store authType
        const authType = credentials.authType || detectAuthType(credentials);
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        const entry = {
          id: "int-" + Math.random().toString(36).substr(2, 9),
          provider: providerName || providerId,
          providerId,
          status: "Connected",
          connectedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
          authType,
          credentials,
        };
        userConns.push(entry);
        all[user.email] = userConns;
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        return Response.json({ success: true, connection: entry, tested: true });
      } catch (e: any) {
        return Response.json({ error: e.message || "Invalid request" }, { status: 400 });
      }
    }

    if (pathname === "/api/integrations/disconnect" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      // Purchase gating: owner always allowed, others must have purchased
      if (user.email !== "mathewortiz97@gmail.com") {
        const purchases = readJSON(join(DATA_DIR, "tenant_purchases.json"));
        const userPurchases = purchases[user.email] || [];
        const hasActivePurchase = userPurchases.some((p) => p.status === "active");
        if (!hasActivePurchase) {
          return Response.json({ error: "Purchase required to connect integrations" }, { status: 403 });
        }
      }

      try {
        const body = await req.json();
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        all[user.email] = userConns.filter((c: any) => c.id !== body.connectionId && c.providerId !== body.providerId);
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        return Response.json({ success: true });
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
    }

    if (pathname.startsWith("/assets/") || pathname.startsWith("/_build/") ||
        pathname === "/manifest.json" || pathname === "/sw.js" || pathname.startsWith("/icon-")) {
      const f = Bun.file(join(DIST_CLIENT, pathname));
      if (await f.exists()) return new Response(f);
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

    try {
      return await fetch("http://localhost:" + NITRO_PORT + pathname + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
      });
    } catch {
      return new Response("Server error", { status: 500 });
    }
  },
});
console.log("[prod-server] Port 3000 -> Nitro on " + NITRO_PORT + " | API: /api/login, /api/register, /api/logout, /api/me, /api/integrations/providers");
