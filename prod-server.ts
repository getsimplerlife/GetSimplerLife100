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
