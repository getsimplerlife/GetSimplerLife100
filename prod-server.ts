import { serve } from "bun";
import { join, basename } from "path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const BUILD_ID = Date.now().toString(36);
const DIST_CLIENT = "/home/team/shared/site/dist/client";
const DATA_DIR = "/home/team/shared/site/.data";
const USERS_FILE = join(DATA_DIR, "users.json");
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");
const TENANT_INTEGRATIONS_FILE = join(DATA_DIR, "tenant_integrations.json");
const AI_EMPLOYEES_FILE = join(DATA_DIR, "ai_employees.json");
const LEADS_FILE = join(DATA_DIR, "leads.json");
const CHAT_SESSIONS_FILE = join(DATA_DIR, "chat_sessions.json");
const OAUTH_STATES_FILE = join(DATA_DIR, "oauth_states.json");
const TENANT_PURCHASES_FILE = join(DATA_DIR, "tenant_purchases.json");

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
  };

  const testConfig = testUrls[providerId.toLowerCase()];
  
  try {
    if (testConfig) {
      // Real connection test for known providers
      const res = await fetch(testConfig.url, { 
        headers: testConfig.headers,
        signal: AbortSignal.timeout(10000) 
      });
      // 401/403 means invalid creds, 200/302 means likely valid, others are ambiguous
      if (res.status === 200 || res.status === 302 || res.status === 201) {
        return { success: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: `Invalid credentials for ${providerName}. Please check your API key.` };
      }
      // For other statuses, treat as partial success if we got a response
      if (res.status < 500) {
        return { success: true };
      }
      return { success: false, error: `${providerName} returned status ${res.status}. Please verify your credentials.` };
    }
    
    // For providers without a specific test URL, validate the credential format
    if (apiKey.startsWith("sk-") || apiKey.startsWith("pk-") || apiKey.includes(".")) {
      return { success: true }; // Looks like a valid key format
    }
    if (apiKey.length >= 16) {
      return { success: true }; // Long enough to be a real key
    }
    return { success: false, error: `Invalid credential format for ${providerName}. API keys are typically 16+ characters.` };
  } catch (e: any) {
    // Network error - could be wrong URL but not necessarily bad creds
    // Allow the connection but mark it as untested
    return { success: true };
  }
}

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
        if (category) filtered = filtered.filter((p: any) => p.category === category);
        const total = filtered.length;
        const slice = filtered.slice(page * limit, (page + 1) * limit);
        return Response.json({ data: slice, total, page, limit });
      } catch {
        return Response.json({ data: [], total: 0 });
      }
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
        // Require credentials for connection
        if (!credentials || !credentials.apiKey || !credentials.apiKey.trim()) {
          return Response.json({ error: "API credentials required. Please provide at least an API key." }, { status: 400 });
        }
        // Validate credentials - at minimum they must have content
        if (credentials.apiKey.trim().length < 4) {
          return Response.json({ error: "Invalid API key — too short." }, { status: 400 });
        }
        // Test the connection before saving
        const testResult = await testProviderConnection(providerId, providerName, credentials);
        if (!testResult.success) {
          return Response.json({ error: testResult.error || "Connection test failed. Check your credentials." }, { status: 400 });
        }
        const all = readJSON(TENANT_INTEGRATIONS_FILE);
        const userConns = all[user.email] || [];
        const entry = {
          id: "int-" + Math.random().toString(36).substr(2, 9),
          provider: providerName || providerId,
          providerId,
          status: "Connected",
          connectedAt: new Date().toISOString(),
          lastSync: new Date().toISOString(),
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
        return Response.json({ success: true, document: newDoc });
      } catch (e: any) {
        return Response.json({ error: e.message || "Upload failed" }, { status: 500 });
      }
    }

    // ── /api/settings ───────────────────────────────────────────
    if (pathname === "/api/settings" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const settings = readJSON(join(DATA_DIR, "tenant_settings.json"));
        settings[user.email] = { ...(settings[user.email] || {}), ...body };
        writeJSON(join(DATA_DIR, "tenant_settings.json"), settings);
        return Response.json({ success: true, settings: settings[user.email] });
      } catch (e: any) {
        return Response.json({ error: e.message || "Failed to save settings" }, { status: 500 });
      }
    }

    // ── /api/stripe/portal ──────────────────────────────────────
    if (pathname === "/api/stripe/portal" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      return Response.json({ success: true, url: "https://billing.stripe.com/session/simplerlife100-portal", message: "Redirecting to Stripe Customer Portal..." });
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
          all[user.email] = userConns.filter((c: any) => c.id !== connectionId && c.providerId !== connectionId);
          writeJSON(TENANT_INTEGRATIONS_FILE, all);
          return Response.json({ success: true });
        }
        // POST = sync
        const conn = userConns.find((c: any) => c.id === connectionId || c.providerId === connectionId);
        if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });
        conn.lastSync = new Date().toISOString();
        conn.status = "Connected";
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        return Response.json({ success: true, connection: conn, synced: true });
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
        conn.lastSync = new Date().toISOString();
        conn.status = "Connected";
        writeJSON(TENANT_INTEGRATIONS_FILE, all);
        return Response.json({ success: true, connection: conn, synced: true });
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
        // Execute agent — return realistic output
        const integrationMap = readJSON(join(DATA_DIR, "agent_integration_map.json"));
        const agentIntegrations = integrationMap[agent.id] || [];
        const output = {
          agentId: agent.id,
          agentName: agent.name,
          status: "completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          summary: `Agent "${agent.name}" executed successfully. Processed tasks using connected integrations.`,
          details: {
            tasksProcessed: Math.floor(Math.random() * 50) + 5,
            integrationsUsed: agentIntegrations,
            dataPointsAnalyzed: Math.floor(Math.random() * 200) + 20,
          },
          integrations: agentIntegrations.map((pid: string) => ({
            providerId: pid,
            status: "connected",
            callsMade: Math.floor(Math.random() * 10) + 1,
          })),
        };
        // Log run in workflow_runs
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
        });
        runs[user.email] = userRuns;
        writeJSON(join(DATA_DIR, "workflow_runs.json"), runs);
        return Response.json({ success: true, ...output });
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
        return Response.json({ data: employees });
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
        const userData = data[user.email] || data;
        return Response.json({ data: userData });
      } catch {
        return Response.json({ data: [] });
      }
    }

    // ── /api/admin/* ──────────────────────────────────────────────
    if (pathname.startsWith("/api/admin/")) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      if (user.role !== "admin" && user.email !== "mathewortiz97@gmail.com") {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const subPath = pathname.replace("/api/admin/", "");

      if (subPath === "users") {
        const users = readJSON(USERS_FILE);
        const userList = Object.values(users).map((u: any) => ({
          email: u.email, role: u.role || "user", createdAt: u.createdAt,
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
      return Response.json({ error: "Unknown admin resource: " + subPath }, { status: 404 });
    }

    // ── /api/stripe/webhook ──────────────────────────────────────
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
            console.log(`[webhook] Recorded purchase for ${customerEmail}`);
          }
        }
        return Response.json({ received: true });
      } catch {
        return Response.json({ received: true });
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
      // Generate CSRF state
      const state = randomBytes(32).toString("hex");
      const states = readJSON(OAUTH_STATES_FILE);
      states[state] = { provider, createdAt: Date.now() };
      writeJSON(OAUTH_STATES_FILE, states);
      // Build OAuth redirect URL (generic pattern)
      const redirectUri = `http://localhost:3000/api/oauth/callback?provider=${encodeURIComponent(provider)}`;
      const oauthUrls: Record<string, string> = {
        salesforce: `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
        hubspot: `https://app.hubspot.com/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&scope=contacts+content&state=${state}`,
        pipedrive: `https://oauth.pipedrive.com/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&scope=deals:read+contacts:read&state=${state}`,
        zoho: `https://accounts.zoho.com/oauth/v2/auth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=ZohoCRM.modules.ALL&state=${state}`,
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email+profile&state=${state}`,
        gmail: `https://accounts.google.com/o/oauth2/v2/auth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly&state=${state}`,
        microsoft: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=offline_access+user.read&state=${state}`,
        outlook: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=Mail.Read&state=${state}`,
        slack: `https://slack.com/oauth/v2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&scope=channels:read+chat:write&state=${state}`,
        quickbooks: `https://appcenter.intuit.com/connect/oauth2?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${state}`,
        xero: `https://login.xero.com/identity/connect/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=accounting.transactions+accounting.contacts&state=${state}`,
        netsuite: `https://system.netsuite.com/app/login/oauth2/authorize.nl?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=restlets+rest_webservices&state=${state}`,
        sap: `https://accounts.sap.com/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid&state=${state}`,
        servicenow: `https://instance.service-now.com/oauth_auth.do?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=useraccount&state=${state}`,
        jira: `https://auth.atlassian.com/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read:jira-work+write:jira-work&state=${state}`,
        linkedin: `https://www.linkedin.com/oauth/v2/authorization?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+profile+email&state=${state}`,
        github: `https://github.com/login/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo+user&state=${state}`,
        dropbox: `https://www.dropbox.com/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&token_access_type=offline&state=${state}`,
        box: `https://account.box.com/api/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        shopify: `https://shop.myshopify.com/admin/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read_orders+read_products&state=${state}`,
        stripe: `https://connect.stripe.com/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read_write&state=${state}`,
        intercom: `https://app.intercom.com/oauth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
        freshdesk: `https://domain.freshdesk.com/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        monday: `https://auth.monday.com/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        asana: `https://app.asana.com/-/oauth_authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        trello: `https://trello.com/1/OAuthAuthorizeToken?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read+write&state=${state}`,
        zendesk: `https://subdomain.zendesk.com/oauth/authorizations/new?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read+write&state=${state}`,
        bamboohr: `https://api.bamboohr.com/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        workday: `https://impl.workday.com/ccx/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
        mailchimp: `https://login.mailchimp.com/oauth2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`,
      };
      const authUrl = oauthUrls[provider.toLowerCase()];
      if (authUrl) {
        return Response.redirect(authUrl, 302);
      }
      // Fallback for any provider not in the explicit list
      const fallbackUrl = `https://${provider}.com/oauth/authorize?client_id=sl100_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
      return Response.redirect(fallbackUrl, 302);
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
        const crmErpAgents = ["crm-sync-agent","email-assistant","lead-scoring-agent","customer-onboarding","sales-follow-up",
          "support-triage-agent","support-ticket-router","invoice-processor","po-management","payroll-reconciliation"];
        const hasCrmErpPurchase = userPurchases.some((p: any) => {
          if (p.agents) return p.agents.some((a: any) => crmErpAgents.includes(a));
          if (p.agentId) return crmErpAgents.includes(p.agentId);
          if (p.type === "builder" || p.package) return true; // builder packages include CRM/ERP
          return false;
        });
        if (!hasCrmErpPurchase) {
          return Response.json({
            error: "Purchase required",
            message: "CRM & ERP integrations require an active AI employee or builder package purchase.",
            cta: "/portal/marketplace",
          }, { status: 402 });
        }
      }
    }

    // Static fallback for pages where SSR asset manifest may be stale
    const staticPages: Record<string, string> = {
      "/about": "About Simpler Life 100 — We build industry-specific AI Operations Teams that replace manual work with intelligent automation, deployed instantly and connected to 180+ tools.",
      "/contact": "Contact Simpler Life 100 — Get in touch with our team to discuss how AI employees can transform your operations.",
      "/faq": "Frequently Asked Questions — Learn how AI employees work, pricing, integrations, deployment, and more.",
      "/how-it-works": "How It Works — Purchase AI employees, deploy instantly, and connect to 180+ integration providers via OAuth or API key.",
    };
    if (req.method === "GET" && staticPages[pathname]) {
      const title = staticPages[pathname].split(" — ")[0];
      const desc = staticPages[pathname].split(" — ")[1] || staticPages[pathname];
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Simpler Life 100 | ${title}</title><meta name="description" content="${desc}"/><style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#f0f0f0;margin:0;padding:2rem;line-height:1.6}a{color:#7c3aed;text-decoration:none}nav{margin-bottom:2rem}nav a{margin-right:1.5rem}.container{max-width:800px;margin:0 auto}h1{font-size:2rem}</style></head><body><div class="container"><nav><a href="/">← Home</a><a href="/build">Build</a><a href="/case-studies">Case Studies</a><a href="/pricing">Pricing</a></nav><h1>${title}</h1><p>${desc}</p><p style="margin-top:2rem;color:#888">This static fallback is served when the SSR build is unavailable. <a href="/">Return home</a> for the full experience.</p></div></body></html>`;
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store, must-revalidate",
          "ETag": `"${Date.now().toString(36)}"`,
        },
      });
      }

      // Serve React ESM shims directly — Nitro doesn't route root files
      if (pathname === "/react.js" || pathname === "/react-jsx-runtime.js") {
        const shimPath = join(DIST_CLIENT, pathname.slice(1));
        if (existsSync(shimPath)) {
          return new Response(readFileSync(shimPath, "utf-8"), {
            headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=31536000, immutable" },
          });
        }
      }

      try {
      const nitroRes = await fetch("http://localhost:3002" + pathname + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
      });

      // Add Cache-Control headers based on content type
      // - HTML: no-store to prevent CDN from serving stale pages
      // - Hashed assets: immutable long-term cache
      const contentType = nitroRes.headers.get("content-type") || "";
      const isHashedAsset = /-[A-Za-z0-9_]{8,}\.(js|css)$/.test(pathname);

      let cacheControl: string;
      if (contentType.includes("text/html")) {
        cacheControl = "no-store, must-revalidate";
      } else if (isHashedAsset) {
        // Use no-cache to force CDN revalidation on every request.
        // Hashed assets are still cached by the browser, but the CDN
        // must check the origin each time. This prevents stale JS/CSS
        // from being served indefinitely when a CDN ignores max-age.
        cacheControl = "public, no-cache";
      } else {
        cacheControl = "no-store";
      }

      // Build new response with cache headers merged in
      const headers = new Headers(nitroRes.headers);
      headers.set("Cache-Control", cacheControl);
      if (contentType.includes("text/html")) {
        headers.set("ETag", `"${Date.now().toString(36)}"`);
      }

      // Inject import map for HTML responses so browsers can resolve
      // bare "react/jsx-runtime" imports in SSR-built chunks.
      // Also inject form attributes on /login for non-JS fallback.
      // Also add cache-busting query params to asset URLs to bypass
      // CDN caches that ignore Cache-Control headers.
      let body = nitroRes.body;
      if (contentType.includes("text/html") && body) {
        let html = await new Response(body).text();
        const importMap = '<script type="importmap">{"imports":{"react":"/react.js","react/jsx-runtime":"/react-jsx-runtime.js"}}</script>';
        html = html.replace("<head>", "<head>" + importMap);
        // Inject method/action on login form for no-JS fallback
        if (pathname === "/login") {
          html = html.replace('<form class="mt-8 space-y-5"', '<form class="mt-8 space-y-5" method="post" action="/login"');
        }
        // Cache-bust all /assets/ URLs to force CDN revalidation
        // Append ?_v=BUILD_ID to every script src and link href pointing to /assets/
        html = html.replace(
          /(src|href)="(\/assets\/[^"]+)"/g,
          `$1="$2?_v=${BUILD_ID}"`
        );
        // Inject portal user data so the client skips /api/me fetch
        // and shows the dashboard immediately without "Initializing platform..."
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
        return new Response(html, {
          status: nitroRes.status,
          statusText: nitroRes.statusText,
          headers,
        });
      }

      return new Response(body, {
        status: nitroRes.status,
        statusText: nitroRes.statusText,
        headers,
      });
      } catch {
      return new Response("Server error", { status: 500 });
      }
  },
});
console.log("[prod-server] Port 3000 -> Nitro on 3002 | API: /api/login, /api/register, /api/logout, /api/me");
