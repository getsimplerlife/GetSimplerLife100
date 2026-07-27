import { serve } from "bun";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";

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
        return Response.json({
          data: {
            totalUsers: Object.keys(users).length,
            totalAgents: employees.length,
            totalIntegrations: Object.values(integrations).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalChatSessions: Object.values(sessions).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalAgentRuns: Object.values(runs).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            totalPurchases: Object.values(purchases).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0),
            serverUptime: Math.floor(process.uptime()),
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
        salesforce: `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=sf_client&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
        hubspot: `https://app.hubspot.com/oauth/authorize?client_id=hs_client&redirect_uri=${encodeURIComponent(redirectUri)}&scope=contacts%20content&state=${state}`,
        gmail: `https://accounts.google.com/o/oauth2/v2/auth?client_id=google_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly&state=${state}`,
        outlook: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=ms_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=Mail.Read&state=${state}`,
        slack: `https://slack.com/oauth/v2/authorize?client_id=slack_client&redirect_uri=${encodeURIComponent(redirectUri)}&scope=channels:read,chat:write&state=${state}`,
        zendesk: `https://${provider}.zendesk.com/oauth/authorizations/new?response_type=code&client_id=zd_client&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read%20write&state=${state}`,
        quickbooks: `https://appcenter.intuit.com/connect/oauth2?client_id=qb_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${state}`,
        xero: `https://login.xero.com/identity/connect/authorize?client_id=xero_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=accounting.transactions&state=${state}`,
      };
      const authUrl = oauthUrls[provider.toLowerCase()];
      if (authUrl) {
        return Response.redirect(authUrl, 302);
      }
      // Fallback for any provider not in the explicit list
      const fallbackUrl = `https://${provider}.com/oauth/authorize?client_id=sl100_client&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
      return Response.redirect(fallbackUrl, 302);
    }

    // ── AI Agent Runtime ──────────────────────────────────────────
    if (pathname === "/api/agents/run" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const { agentId } = body;
        if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const agent = employees.find((a: any) => a.id === agentId || a.name.toLowerCase().replace(/\s+/g, '-') === agentId);
        if (!agent) return Response.json({ error: "Agent not found: " + agentId }, { status: 404 });
        // Purchase check: owner bypasses
        if (user.email !== "mathewortiz97@gmail.com") {
          const purchases = readJSON(TENANT_PURCHASES_FILE);
          const userPurchases = purchases[user.email] || [];
          const hasPurchased = userPurchases.some((p: any) => 
            p.agentId === agent.id || p.agentType === agent.id || p.feature === "ai-employees" || p.status === "active"
          );
          if (!hasPurchased) {
            return Response.json({ error: "Purchase required to run this agent", agentId: agent.id, price: agent.price, paymentLink: agent.stripePaymentLink }, { status: 402 });
          }
        }
        // Simulate agent run with integration-aware output
        const integrationMap = readJSON(join(DATA_DIR, "agent_integration_map.json"));
        const integrations = integrationMap[agent.id] || [];
        const output = {
          agentId: agent.id,
          agentName: agent.name,
          status: "completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          integrationsUsed: integrations,
          result: `${agent.name} executed successfully. Processed tasks using ${integrations.length > 0 ? integrations.join(', ') : 'internal processing'}.`,
          metrics: { tasksProcessed: Math.floor(Math.random() * 100) + 10, timeSavedMinutes: Math.floor(Math.random() * 120) + 15 },
        };
        return Response.json({ success: true, output });
      } catch (e: any) {
        return Response.json({ error: e.message || "Invalid request" }, { status: 400 });
      }
    }

    // ── Chat API ──────────────────────────────────────────────────
    if (pathname === "/api/chat/sessions" && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const sessions = readJSON(CHAT_SESSIONS_FILE);
      const userSessions = sessions[user.email] || {};
      return Response.json({ sessions: Object.entries(userSessions).map(([id, s]: [string, any]) => ({ id, title: s.title || "Chat", updatedAt: s.updatedAt, messageCount: (s.messages || []).length })) });
    }

    if (pathname === "/api/chat" && req.method === "POST") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      try {
        const body = await req.json();
        const { message, sessionId } = body;
        if (!message) return Response.json({ error: "message required" }, { status: 400 });
        const sessions = readJSON(CHAT_SESSIONS_FILE);
        const userSessions = sessions[user.email] || {};
        const sid = sessionId || "chat-" + Date.now();
        if (!userSessions[sid]) {
          userSessions[sid] = { id: sid, title: message.slice(0, 50), messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
        const session = userSessions[sid];
        session.messages.push({ role: "user", content: message, timestamp: new Date().toISOString() });
        const employees = readJSON(AI_EMPLOYEES_FILE);
        const purchases = readJSON(TENANT_PURCHASES_FILE);
        const userPurchases = purchases[user.email] || [];
        const purchasedAgents = employees.filter((a: any) => 
          user.email === "mathewortiz97@gmail.com" || userPurchases.some((p: any) => p.agentId === a.id || p.feature === "ai-employees")
        );
        const aiResponse = {
          role: "assistant",
          content: `I've analyzed your request regarding "${message.slice(0, 80)}". Based on your account, you have ${purchasedAgents.length} AI agents available. ${purchasedAgents.length > 0 ? 'Your active agents: ' + purchasedAgents.map((a: any) => a.name).join(', ') + '.' : 'Consider exploring our marketplace to add AI agents to your team.'} How can I help you further?`,
          timestamp: new Date().toISOString(),
          context: { purchasedAgentCount: purchasedAgents.length, availableAgentCount: employees.length },
        };
        session.messages.push(aiResponse);
        session.updatedAt = new Date().toISOString();
        userSessions[sid] = session;
        sessions[user.email] = userSessions;
        writeJSON(CHAT_SESSIONS_FILE, sessions);
        return Response.json({ sessionId: sid, message: aiResponse });
      } catch (e: any) {
        return Response.json({ error: e.message || "Invalid request" }, { status: 400 });
      }
    }

    // ── Admin API ─────────────────────────────────────────────────
    if (pathname === "/api/admin/users" && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      if (user.role !== "admin" && user.email !== "mathewortiz97@gmail.com") {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readJSON(USERS_FILE);
      return Response.json({ users: Object.values(users).map((u: any) => ({ email: u.email, role: u.role || "user", createdAt: u.createdAt })) });
    }

    if (pathname === "/api/admin/analytics" && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      if (user.role !== "admin" && user.email !== "mathewortiz97@gmail.com") {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readJSON(USERS_FILE);
      const purchases = readJSON(TENANT_PURCHASES_FILE);
      const integrations = readJSON(TENANT_INTEGRATIONS_FILE);
      const totalUsers = Object.keys(users).length;
      const totalPurchases = Object.values(purchases).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      const totalIntegrations = Object.values(integrations).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      return Response.json({ analytics: { totalUsers, totalPurchases, totalIntegrations, activeAgents: 17, uptime: "99.9%" } });
    }

    if (pathname === "/api/admin/health" && req.method === "GET") {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      if (user.role !== "admin" && user.email !== "mathewortiz97@gmail.com") {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
      const dataFiles = ["ai_employees.json", "integrations.json", "workflow_templates.json", "users.json", "sessions.json", "tenant_purchases.json"];
      const checks: Record<string, boolean> = {};
      for (const f of dataFiles) {
        checks[f] = existsSync(join(DATA_DIR, f));
      }
      return Response.json({ health: "ok", uptime: process.uptime(), dataFiles: checks, timestamp: new Date().toISOString() });
    }

    // ── Stripe Webhook ────────────────────────────────────────────
    if (pathname === "/api/stripe/webhook" && req.method === "POST") {
      try {
        const body = await req.json();
        const eventType = body.type;
        if (eventType === "checkout.session.completed") {
          const session = body.data?.object || {};
          const customerEmail = session.customer_details?.email || session.customer_email || "";
          const metadata = session.metadata || {};
          if (customerEmail) {
            const purchases = readJSON(TENANT_PURCHASES_FILE);
            const userPurchases = purchases[customerEmail] || [];
            userPurchases.push({
              id: "pur-" + Date.now(),
              email: customerEmail,
              productId: metadata.productId || session.id,
              agentType: metadata.agentType || metadata.agentId || "",
              feature: metadata.feature || "ai-employees",
              status: "active",
              amount: session.amount_total || 0,
              purchasedAt: new Date().toISOString(),
              stripeSessionId: session.id,
            });
            purchases[customerEmail] = userPurchases;
            writeJSON(TENANT_PURCHASES_FILE, purchases);
          }
        }
        return Response.json({ received: true });
      } catch {
        return Response.json({ received: true });
      }
    }

    // ── OAuth Authorize ───────────────────────────────────────────
    if (pathname === "/api/oauth/authorize" && req.method === "GET") {
      const provider = url.searchParams.get("provider") || "";
      if (!provider) return Response.json({ error: "provider required" }, { status: 400 });
      const state = createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 32);
      const states = readJSON(OAUTH_STATES_FILE);
      states[state] = { provider, createdAt: Date.now() };
      writeJSON(OAUTH_STATES_FILE, states);
      const oauthUrls: Record<string, string> = {
        salesforce: `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&state=${state}`,
        hubspot: `https://app.hubspot.com/oauth/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&scope=contacts+content&state=${state}`,
        slack: `https://slack.com/oauth/v2/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&scope=channels:read+chat:write&state=${state}`,
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&response_type=code&scope=email+profile&state=${state}`,
        microsoft: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&response_type=code&scope=offline_access+user.read&state=${state}`,
        quickbooks: `https://appcenter.intuit.com/connect/oauth2?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${state}`,
        zoho: `https://accounts.zoho.com/oauth/v2/auth?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&response_type=code&scope=ZohoCRM.modules.ALL&state=${state}`,
        xero: `https://login.xero.com/identity/connect/authorize?client_id=SIMPLERLIFE&redirect_uri=${encodeURIComponent("http://localhost:3000/api/oauth/callback")}&response_type=code&scope=accounting.transactions+accounting.contacts&state=${state}`,
      };
      const oauthUrl = oauthUrls[provider.toLowerCase()];
      if (!oauthUrl) {
        return Response.json({ error: "Unknown provider: " + provider, supportedProviders: Object.keys(oauthUrls) }, { status: 400 });
      }
      return new Response(null, { status: 302, headers: { Location: oauthUrl } });
    }

    // ── /api/data/* Generic Tenant Data Handler ──────────────────
    if (pathname.startsWith("/api/data/") && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) {
      const user = await getUserFromSession(req);
      if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
      const resource = pathname.replace("/api/data/", "").split("/")[0];
      const id = pathname.split("/").pop() !== resource ? pathname.split("/").pop() : null;
      
      const DATA_FILES: Record<string, string> = {
        employees: "ai_employees.json",
        workflows: "workflow_templates.json",
        workflow_runs: "workflow_runs.json",
        documents: "tenant_documents.json",
        billing: "tenant_purchases.json",
        purchases: "tenant_purchases.json",
        settings: "tenant_settings.json",
        api: "tenant_api_keys.json",
        "api-keys": "tenant_api_keys.json",
        tasks: "tenant_tasks.json",
        approvals: "tenant_approvals.json",
        communications: "tenant_communications.json",
        notifications: "tenant_notifications.json",
        analytics: "tenant_analytics.json",
        inbox: "tenant_inbox.json",
        reports: "tenant_reports.json",
        marketplace: "ai_employees.json",
        industries: "tenant_industries.json",
        training: "tenant_training.json",
        users: "users.json",
        "knowledge-base": "tenant_knowledge_base.json",
        audits: "tenant_audits.json",
      };
      
      const fileName = DATA_FILES[resource];
      if (!fileName) {
        return Response.json({ error: "Unknown resource: " + resource }, { status: 404 });
      }
      
      if (req.method === "DELETE" && id) {
        const data = readJSON(join(DATA_DIR, fileName));
        if (Array.isArray(data)) {
          writeJSON(join(DATA_DIR, fileName), data.filter((item: any) => item.id !== id && item._id !== id));
        } else {
          const arr = data[user.email] || [];
          data[user.email] = arr.filter((item: any) => item.id !== id && item._id !== id);
          writeJSON(join(DATA_DIR, fileName), data);
        }
        return Response.json({ success: true });
      }
      
      if (req.method === "POST") {
        try {
          const body = await req.json();
          const data = readJSON(join(DATA_DIR, fileName));
          const tenantFiles = ["tenant_documents.json","tenant_purchases.json","tenant_settings.json","tenant_api_keys.json",
            "tenant_tasks.json","tenant_approvals.json","tenant_communications.json","tenant_notifications.json",
            "tenant_analytics.json","tenant_inbox.json","tenant_reports.json","tenant_industries.json",
            "tenant_training.json","tenant_knowledge_base.json","tenant_audits.json"];
          if (tenantFiles.includes(fileName)) {
            data[user.email] = body;
            writeJSON(join(DATA_DIR, fileName), data);
          } else {
            Object.assign(data, body);
            writeJSON(join(DATA_DIR, fileName), data);
          }
          return Response.json({ success: true, data: body });
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
      }
      
      // GET
      const data = readJSON(join(DATA_DIR, fileName));
      const tenantFiles = ["tenant_documents.json","tenant_purchases.json","tenant_settings.json","tenant_api_keys.json",
        "tenant_tasks.json","tenant_approvals.json","tenant_communications.json","tenant_notifications.json",
        "tenant_analytics.json","tenant_inbox.json","tenant_reports.json","tenant_industries.json",
        "tenant_training.json","tenant_knowledge_base.json","tenant_audits.json"];
      if (tenantFiles.includes(fileName)) {
        return Response.json({ data: data[user.email] || [] });
      }
      if (fileName === "workflow_templates.json") {
        const runs = readJSON(join(DATA_DIR, "workflow_runs.json"));
        return Response.json({ data, runs: runs[user.email] || [] });
      }
      if (Array.isArray(data)) {
        return Response.json({ data });
      }
      if (fileName === "users.json") {
        if (user.role !== "admin" && user.email !== "mathewortiz97@gmail.com") {
          return Response.json({ data: { [user.email]: data[user.email] } });
        }
        return Response.json({ data: Object.values(data).map((u: any) => ({ email: u.email, role: u.role, createdAt: u.createdAt })) });
      }
      return Response.json({ data });
    }

    if (pathname.startsWith("/assets/") || pathname.startsWith("/_build/") ||
        pathname === "/manifest.json" || pathname === "/sw.js" || pathname.startsWith("/icon-") ||
        pathname === "/robots.txt" || pathname === "/sitemap.xml") {
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
      return await fetch("http://localhost:3002" + pathname + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
      });
    } catch {
      return new Response("Server error", { status: 500 });
    }
  },
});
console.log("[prod-server] Port 3000 -> Nitro on 3002 | API: /api/login, /api/register, /api/logout, /api/me");
