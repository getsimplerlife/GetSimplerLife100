// src/lib/provider-api.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
// Real API integration for AI agent run logic.
// Each function attempts a live API call using stored credentials.
// In test/dev with placeholder keys, calls fail gracefully — but structure
// and intent are preserved so output reflects real integration wiring.

const TIMEOUT_MS = 8000;

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────
export interface ProviderConnection {
  id: string;
  provider: string;
  providerId: string;
  status: string;
  connectedAt: string;
  lastSync: string;
  credentials: { apiKey?: string; accessToken?: string; refreshToken?: string; instanceUrl?: string };
  category: string;
}

export interface ProviderResult {
  providerId: string;
  provider: string;
  status: "connected" | "unreachable" | "auth_failed" | "rate_limited" | "ok" | "unsupported" | "not_configured";
  recordsFound: number;
  sampleData: any[];
  error?: string;
  endpoint?: string;
}

export interface AgentIntegrationResult {
  agentId: string;
  agentName: string;
  status: string;
  startedAt: string;
  completedAt: string;
  summary: string;
  integrationsUsed: ProviderResult[];
  totalRecordsProcessed: number;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────────
// CRM Providers
// ────────────────────────────────────────────────────────────────────────

async function queryHubSpot(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  if (!apiKey) return { providerId: "hubspot", provider: "HubSpot", status: "auth_failed", recordsFound: 0, sampleData: [], error: "No API key or access token" };

  // Query contacts, deals, and companies in parallel — agents get full CRM context
  const endpoints = [
    {
      url: `https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=firstname,lastname,email,phone,jobtitle,company,hs_object_id,createdate,lastmodifieddate`,
      type: "contact" as const,
      map: (c: any) => ({
        id: c.id,
        _objectType: "contact",
        firstname: c.properties?.firstname,
        lastname: c.properties?.lastname,
        email: c.properties?.email,
        phone: c.properties?.phone,
        jobtitle: c.properties?.jobtitle,
        company: c.properties?.company,
        hs_object_id: c.properties?.hs_object_id,
        createdate: c.properties?.createdate,
        lastmodifieddate: c.properties?.lastmodifieddate,
      }),
    },
    {
      url: `https://api.hubapi.com/crm/v3/objects/deals?limit=10&properties=dealname,dealstage,pipeline,amount,closedate,dealtype,hs_object_id,createdate`,
      type: "deal" as const,
      map: (d: any) => ({
        id: d.id,
        _objectType: "deal",
        dealname: d.properties?.dealname,
        dealstage: d.properties?.dealstage,
        pipeline: d.properties?.pipeline,
        amount: d.properties?.amount ? Number(d.properties.amount) : undefined,
        closedate: d.properties?.closedate,
        dealtype: d.properties?.dealtype,
        hs_object_id: d.properties?.hs_object_id,
        createdate: d.properties?.createdate,
      }),
    },
    {
      url: `https://api.hubapi.com/crm/v3/objects/companies?limit=10&properties=name,domain,industry,phone,city,state,country,numberofemployees,annualrevenue,hs_object_id,createdate`,
      type: "company" as const,
      map: (c: any) => ({
        id: c.id,
        _objectType: "company",
        name: c.properties?.name,
        domain: c.properties?.domain,
        industry: c.properties?.industry,
        phone: c.properties?.phone,
        city: c.properties?.city,
        state: c.properties?.state,
        country: c.properties?.country,
        numberofemployees: c.properties?.numberofemployees ? Number(c.properties.numberofemployees) : undefined,
        annualrevenue: c.properties?.annualrevenue ? Number(c.properties.annualrevenue) : undefined,
        hs_object_id: c.properties?.hs_object_id,
        createdate: c.properties?.createdate,
      }),
    },
  ];

  try {
    const responses = await Promise.allSettled(
      endpoints.map((e) =>
        fetchWithTimeout(e.url, { headers: { Authorization: `Bearer ${apiKey}` } })
      )
    );

    // Check for auth failure on any endpoint
    const authFail = responses.find(
      (r) => r.status === "fulfilled" && r.value.status === 401
    );
    if (authFail && authFail.status === "fulfilled") {
      return {
        providerId: "hubspot", provider: "HubSpot", status: "auth_failed",
        recordsFound: 0, sampleData: [], error: "Invalid API key or expired token",
        endpoint: "crm/v3/objects/*",
      };
    }

    // Merge results from all endpoints, labeling each record with its object type
    const allRecords: any[] = [];
    let totalRecords = 0;
    const queriedEndpoints: string[] = [];

    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      const ep = endpoints[i];
      if (r.status === "fulfilled" && r.value.ok) {
        try {
          const json = await r.value.json();
          const records = (json.results || []).map(ep.map);
          allRecords.push(...records);
          totalRecords += json.total || records.length;
          queriedEndpoints.push(ep.type);
        } catch (_) {
          // JSON parse failed — skip this object type
        }
      }
    }

    if (allRecords.length === 0 && totalRecords === 0) {
      return {
        providerId: "hubspot", provider: "HubSpot", status: "ok",
        recordsFound: 0, sampleData: [], endpoint: queriedEndpoints.join("+") || "crm/v3/objects/*",
      };
    }

    return {
      providerId: "hubspot",
      provider: "HubSpot",
      status: "ok",
      recordsFound: totalRecords,
      sampleData: allRecords.slice(0, 15), // up to 15 records across all object types
      endpoint: queriedEndpoints.join("+"),
    };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return {
      providerId: "hubspot", provider: "HubSpot",
      status: unreachable ? "unreachable" : "auth_failed",
      recordsFound: 0, sampleData: [], error: e.message,
      endpoint: "crm/v3/objects/*",
    };
  }
}

async function querySalesforce(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const instanceUrl = creds.instanceUrl || "https://login.salesforce.com";
  const baseUrl = instanceUrl.replace(/\/$/, "");
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/services/data/v58.0/query?q=SELECT+Id,Name,Industry+FROM+Account+LIMIT+10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401) return { providerId: "salesforce", provider: "Salesforce", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid credentials" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const records = (json.records || []).slice(0, 5).map((r: any) => ({ id: r.Id, name: r.Name, industry: r.Industry }));
    return { providerId: "salesforce", provider: "Salesforce", status: "ok", recordsFound: json.totalSize || records.length, sampleData: records, endpoint: "services/data/v58.0/query" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "salesforce", provider: "Salesforce", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "services/data/v58.0/query" };
  }
}

async function queryPipedrive(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://api.pipedrive.com/v1/persons?limit=10&api_token=${apiKey}`
    );
    if (res.status === 401) return { providerId: "pipedrive", provider: "Pipedrive", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid API token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = (json.data || []).slice(0, 5).map((p: any) => ({ id: p.id, name: p.name, email: p.email?.[0]?.value }));
    return { providerId: "pipedrive", provider: "Pipedrive", status: "ok", recordsFound: json.additional_data?.pagination?.total_items || data.length, sampleData: data, endpoint: "v1/persons" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "pipedrive", provider: "Pipedrive", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v1/persons" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// ERP / Accounting
// ────────────────────────────────────────────────────────────────────────

async function queryQuickBooks(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const realmId = creds.realmId || creds.companyId || "";
  try {
    const res = await fetchWithTimeout(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select+*+from+Customer+maxresults+10`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (res.status === 401) return { providerId: "quickbooks", provider: "QuickBooks", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const entities = (json.QueryResponse?.Customer || []).slice(0, 5).map((c: any) => ({ id: c.Id, name: c.DisplayName }));
    return { providerId: "quickbooks", provider: "QuickBooks", status: "ok", recordsFound: entities.length, sampleData: entities, endpoint: "v3/company/{realmId}/query" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "quickbooks", provider: "QuickBooks", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v3/company/{realmId}/query" };
  }
}

async function queryXero(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://api.xero.com/api.xro/2.0/Contacts?pageSize=10`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (res.status === 401) return { providerId: "xero", provider: "Xero", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const contacts = (json.Contacts || []).slice(0, 5).map((c: any) => ({ id: c.ContactID, name: c.Name }));
    return { providerId: "xero", provider: "Xero", status: "ok", recordsFound: contacts.length, sampleData: contacts, endpoint: "api.xro/2.0/Contacts" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "xero", provider: "Xero", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "api.xro/2.0/Contacts" };
  }
}

async function queryNetSuite(creds: Record<string, string>): Promise<ProviderResult> {
  // NetSuite uses SuiteTalk SOAP or REST Web Services; try the REST API
  const accessToken = creds.accessToken || creds.apiKey || "";
  const accountId = creds.accountId || "";
  try {
    const res = await fetchWithTimeout(
      `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/customer?limit=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401) return { providerId: "netsuite", provider: "NetSuite", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid credentials" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = (json.items || []).slice(0, 5).map((c: any) => ({ id: c.id, name: c.companyName }));
    return { providerId: "netsuite", provider: "NetSuite", status: "ok", recordsFound: json.totalResults || items.length, sampleData: items, endpoint: "record/v1/customer" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "netsuite", provider: "NetSuite", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "record/v1/customer" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Support / Ticketing
// ────────────────────────────────────────────────────────────────────────

async function queryZendesk(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const subdomain = creds.subdomain || "test";
  try {
    const res = await fetchWithTimeout(
      `https://${subdomain}.zendesk.com/api/v2/tickets.json?per_page=10`,
      { headers: { Authorization: `Basic ${btoa(`${creds.email || "agent"}/token:${apiKey}`)}` } }
    );
    if (res.status === 401) return { providerId: "zendesk", provider: "Zendesk", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid credentials" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const tickets = (json.tickets || []).slice(0, 5).map((t: any) => ({ id: t.id, subject: t.subject, status: t.status }));
    return { providerId: "zendesk", provider: "Zendesk", status: "ok", recordsFound: json.count || tickets.length, sampleData: tickets, endpoint: "api/v2/tickets" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "zendesk", provider: "Zendesk", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "api/v2/tickets" };
  }
}

async function queryIntercom(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://api.intercom.io/contacts?per_page=10`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (res.status === 401) return { providerId: "intercom", provider: "Intercom", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const contacts = (json.data || []).slice(0, 5).map((c: any) => ({ id: c.id, name: c.name, email: c.email }));
    return { providerId: "intercom", provider: "Intercom", status: "ok", recordsFound: json.total_count || contacts.length, sampleData: contacts, endpoint: "contacts" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "intercom", provider: "Intercom", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "contacts" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Marketing
// ────────────────────────────────────────────────────────────────────────

async function queryMailchimp(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const dc = creds.datacenter || creds.dc || "us1";
  try {
    const res = await fetchWithTimeout(
      `https://${dc}.api.mailchimp.com/3.0/lists?count=10`,
      { headers: { Authorization: `Basic ${btoa(`apikey:${apiKey}`)}` } }
    );
    if (res.status === 401) return { providerId: "mailchimp", provider: "Mailchimp", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid API key" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const lists = (json.lists || []).slice(0, 5).map((l: any) => ({ id: l.id, name: l.name, memberCount: l.stats?.member_count }));
    return { providerId: "mailchimp", provider: "Mailchimp", status: "ok", recordsFound: json.total_items || lists.length, sampleData: lists, endpoint: "3.0/lists" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "mailchimp", provider: "Mailchimp", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "3.0/lists" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Communication
// ────────────────────────────────────────────────────────────────────────

async function querySlack(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://slack.com/api/conversations.list?limit=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) return { providerId: "slack", provider: "Slack", status: "auth_failed", recordsFound: 0, sampleData: [], error: json.error };
    const channels = (json.channels || []).slice(0, 5).map((c: any) => ({ id: c.id, name: c.name, members: c.num_members }));
    return { providerId: "slack", provider: "Slack", status: "ok", recordsFound: channels.length, sampleData: channels, endpoint: "conversations.list" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "slack", provider: "Slack", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "conversations.list" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// E-Commerce
// ────────────────────────────────────────────────────────────────────────

async function queryShopify(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const store = creds.store || creds.shop || "test";
  try {
    const res = await fetchWithTimeout(
      `https://${store}.myshopify.com/admin/api/2024-01/products.json?limit=10`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (res.status === 401) return { providerId: "shopify", provider: "Shopify", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid access token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const products = (json.products || []).slice(0, 5).map((p: any) => ({ id: p.id, title: p.title, inventory: p.variants?.[0]?.inventory_quantity }));
    return { providerId: "shopify", provider: "Shopify", status: "ok", recordsFound: products.length, sampleData: products, endpoint: "admin/api/2024-01/products" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "shopify", provider: "Shopify", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "admin/api/2024-01/products" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Project Management / ITSM
// ────────────────────────────────────────────────────────────────────────

async function queryJira(creds: Record<string, string>): Promise<ProviderResult> {
  const apiToken = creds.apiKey || creds.accessToken || "";
  const domain = creds.domain || "test";
  const email = creds.email || "";
  try {
    const res = await fetchWithTimeout(
      `https://${domain}.atlassian.net/rest/api/3/search?maxResults=10`,
      { headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}` } }
    );
    if (res.status === 401) return { providerId: "jira", provider: "Jira", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid credentials" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const issues = (json.issues || []).slice(0, 5).map((i: any) => ({ key: i.key, summary: i.fields?.summary, status: i.fields?.status?.name }));
    return { providerId: "jira", provider: "Jira", status: "ok", recordsFound: json.total || issues.length, sampleData: issues, endpoint: "rest/api/3/search" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "jira", provider: "Jira", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "rest/api/3/search" };
  }
}

async function queryServiceNow(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const instance = creds.instance || creds.subdomain || "test";
  try {
    const res = await fetchWithTimeout(
      `https://${instance}.service-now.com/api/now/table/incident?sysparm_limit=10`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
    );
    if (res.status === 401) return { providerId: "servicenow", provider: "ServiceNow", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid credentials" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const incidents = (json.result || []).slice(0, 5).map((inc: any) => ({ number: inc.number, short_description: inc.short_description, priority: inc.priority }));
    return { providerId: "servicenow", provider: "ServiceNow", status: "ok", recordsFound: incidents.length, sampleData: incidents, endpoint: "api/now/table/incident" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "servicenow", provider: "ServiceNow", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "api/now/table/incident" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// HR
// ────────────────────────────────────────────────────────────────────────

async function queryBambooHR(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const subdomain = creds.subdomain || "test";
  try {
    const res = await fetchWithTimeout(
      `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/directory`,
      { headers: { Authorization: `Basic ${btoa(`${apiKey}:x`)}`, Accept: "application/json" } }
    );
    if (res.status === 401) return { providerId: "bamboohr", provider: "BambooHR", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid API key" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const employees = (json.employees || []).slice(0, 5).map((e: any) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, department: e.department }));
    return { providerId: "bamboohr", provider: "BambooHR", status: "ok", recordsFound: employees.length, sampleData: employees, endpoint: "v1/employees/directory" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "bamboohr", provider: "BambooHR", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v1/employees/directory" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Social / Content
// ────────────────────────────────────────────────────────────────────────

async function queryLinkedIn(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://api.linkedin.com/v2/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401) return { providerId: "linkedin", provider: "LinkedIn", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return { providerId: "linkedin", provider: "LinkedIn", status: "ok", recordsFound: 1, sampleData: [{ id: json.id, name: json.localizedFirstName + " " + json.localizedLastName }], endpoint: "v2/me" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "linkedin", provider: "LinkedIn", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v2/me" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Spreadsheets / Databases
// ────────────────────────────────────────────────────────────────────────

async function queryGoogleSheets(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const spreadsheetId = creds.spreadsheetId || creds.sheetId || "";
  try {
    const res = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:D50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401) return { providerId: "googlesheets", provider: "Google Sheets", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = (json.values || []).slice(0, 5);
    return { providerId: "googlesheets", provider: "Google Sheets", status: "ok", recordsFound: rows.length, sampleData: rows, endpoint: "v4/spreadsheets/{id}/values" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "googlesheets", provider: "Google Sheets", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v4/spreadsheets/{id}/values" };
  }
}

async function queryAirtable(creds: Record<string, string>): Promise<ProviderResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const baseId = creds.baseId || "";
  const tableId = creds.tableId || creds.tableName || "";
  try {
    const res = await fetchWithTimeout(
      `https://api.airtable.com/v0/${baseId}/${tableId}?maxRecords=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401) return { providerId: "airtable", provider: "Airtable", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid token" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const records = (json.records || []).slice(0, 5).map((r: any) => ({ id: r.id, fields: r.fields }));
    return { providerId: "airtable", provider: "Airtable", status: "ok", recordsFound: records.length, sampleData: records, endpoint: "v0/{baseId}/{tableId}" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "airtable", provider: "Airtable", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "v0/{baseId}/{tableId}" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Maps / Logistics
// ───────────────────────────────────────────��────────────────────────────

async function queryGoogleMaps(creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || "";
  try {
    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/directions/json?origin=San+Francisco&destination=San+Jose&key=${apiKey}`
    );
    if (res.status === 403) return { providerId: "google-maps", provider: "Google Maps", status: "auth_failed", recordsFound: 0, sampleData: [], error: "Invalid API key" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const routes = (json.routes || []).map((r: any) => ({
      summary: r.summary,
      distance: r.legs?.[0]?.distance?.text,
      duration: r.legs?.[0]?.duration?.text
    }));
    return { providerId: "google-maps", provider: "Google Maps", status: "ok", recordsFound: routes.length, sampleData: routes, endpoint: "maps/api/directions" };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId: "google-maps", provider: "Google Maps", status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: "maps/api/directions" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Catch-all / Generic REST
// ────────────────────────────────────────────────────────────────────────

// Generic read endpoints. FAIL-CLOSED RULES:
// 1. Only vetted, provider-owned domains may appear here. Never guess a domain.
// 2. `{placeholder}` segments are resolved from stored credentials; if a
//    required credential is missing, we return "not_configured" WITHOUT making
//    any network call (credentials must never travel to an unresolved URL).
// 3. Providers whose APIs cannot be probed safely/correctly by a generic GET
//    (wrong method, wrong auth scheme, tenant-specific hosts, nonexistent
//    endpoints) are marked `unsupported` and never called.
interface GenericEndpointDef {
  url?: string;
  requiredCreds?: string[];
  unsupported?: string;
}

const GENERIC_READ_ENDPOINTS: Record<string, GenericEndpointDef> = {
  "zoom": { url: `https://api.zoom.us/v2/users/me` },
  "outlook": { url: `https://graph.microsoft.com/v1.0/me` },
  "gmail": { url: `https://gmail.googleapis.com/gmail/v1/users/me/profile` },
  "meta": { url: `https://graph.facebook.com/v18.0/me` },
  "hootsuite": { url: `https://platform.hootsuite.com/v1/me` },
  "zoho-books": { url: `https://books.zoho.com/api/v3/organizations` },
  "rippling": { url: `https://api.rippling.com/api/app/employees` },
  "outreach": { url: `https://api.outreach.io/api/v2/accounts` },
  "marketo": { url: `https://{munchkin}.mktorest.com/rest/v1/leads.json`, requiredCreds: ["munchkin"] },
  // Phase 2a: Freshdesk is not yet backed by an audited live-path handler.
  // Do not resolve a customer domain and fall through to generic bearer auth;
  // unsupported providers must return before any network request.
  "freshdesk": { unsupported: "Freshdesk is not supported by the live write-safe provider path yet — no request was made." },
  "monday-com": { unsupported: "Monday.com's API is GraphQL-only (POST); a generic GET probe cannot query it. Support is planned — no request was made." },
  "onfleet": { unsupported: "Onfleet requires HTTP Basic authentication, which the generic read probe does not support. No request was made." },
  "quickbooks-payroll": { unsupported: "QuickBooks Payroll has no standalone public REST endpoint. No request was made." },
  "sap": { unsupported: "SAP data APIs are instance-specific; there is no generic endpoint to query. No request was made." },
  "sap-ariba": { unsupported: "SAP Ariba APIs require a realm-specific host and application key. No request was made." },
  "coupa": { unsupported: "Coupa APIs are instance-specific ({company}.coupahost.com). No request was made." },
  "workday": { unsupported: "Workday APIs require a tenant-specific host. No request was made." },
  "adp": { unsupported: "ADP APIs require certificate-based OAuth, which the generic read probe does not support. No request was made." },
  "gusto": { unsupported: "Gusto reads are company-scoped and require company configuration. No request was made." },
};

async function queryGeneric(providerId: string, providerName: string, creds: Record<string, string>): Promise<ProviderResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const def = GENERIC_READ_ENDPOINTS[providerId];
  if (!def) {
    return { providerId, provider: providerName, status: "unsupported", recordsFound: 0, sampleData: [], error: "No vetted API endpoint for this provider yet — no request was made", endpoint: "none" };
  }
  if (def.unsupported || !def.url) {
    return { providerId, provider: providerName, status: "unsupported", recordsFound: 0, sampleData: [], error: def.unsupported || "Not supported", endpoint: "none" };
  }

  // Resolve {placeholder} segments strictly from stored credentials.
  let url = def.url;
  for (const key of def.requiredCreds || []) {
    const value = (creds[key] || "").trim();
    if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
      return { providerId, provider: providerName, status: "not_configured", recordsFound: 0, sampleData: [], error: `Missing or invalid '${key}' in connection settings — no request was made`, endpoint: "none" };
    }
    url = url.replaceAll(`{${key}}`, value);
  }
  if (url.includes("{")) {
    // Defensive: never send a request (or credentials) to an unresolved URL.
    return { providerId, provider: providerName, status: "not_configured", recordsFound: 0, sampleData: [], error: "Endpoint template could not be fully resolved — no request was made", endpoint: "none" };
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (providerId === "meta" || providerId === "marketo") {
      // These providers take the token as a query parameter per their own docs
      url += (url.includes("?") ? "&" : "?") + `access_token=${encodeURIComponent(apiKey)}`;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetchWithTimeout(url, { headers });
    if (res.status === 401 || res.status === 403) {
      return { providerId, provider: providerName, status: "auth_failed", recordsFound: 0, sampleData: [], error: `HTTP ${res.status}: Invalid credentials`, endpoint: url };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      const json = await res.json();
      // Try to extract array or count
      const keys = Object.keys(json);
      const dataKey = keys.find(k => Array.isArray(json[k]));
      const records = dataKey ? json[dataKey] : [json];
      return { providerId, provider: providerName, status: "ok", recordsFound: records.length, sampleData: records.slice(0, 5), endpoint: url };
    }
    return { providerId, provider: providerName, status: "ok", recordsFound: 0, sampleData: [], endpoint: url };
  } catch (e: any) {
    const unreachable = e.name === "TimeoutError" || e.message?.includes("DNS") || e.message?.includes("fetch");
    return { providerId, provider: providerName, status: unreachable ? "unreachable" : "auth_failed", recordsFound: 0, sampleData: [], error: e.message, endpoint: url };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Main Dispatch
// ────────────────────────────────────────────────────────────────────────

const PROVIDER_DISPATCH: Record<string, (creds: Record<string, string>) => Promise<ProviderResult>> = {
  "hubspot": queryHubSpot,
  "salesforce": querySalesforce,
  "pipedrive": queryPipedrive,
  "quickbooks": queryQuickBooks,
  "xero": queryXero,
  "netsuite": queryNetSuite,
  "zendesk": queryZendesk,
  "intercom": queryIntercom,
  "mailchimp": queryMailchimp,
  "slack": querySlack,
  "shopify": queryShopify,
  "jira": queryJira,
  "servicenow": queryServiceNow,
  "bamboohr": queryBambooHR,
  "linkedin": queryLinkedIn,
  "googlesheets": queryGoogleSheets,
  "airtable": queryAirtable,
  "google-maps": queryGoogleMaps,
};

/**
 * Query a single provider using its stored credentials.
 * Returns a structured result even when the call fails.
 */
export async function querySingleProvider(
  providerId: string,
  providerName: string,
  credentials: Record<string, string>
): Promise<ProviderResult> {
  const handler = PROVIDER_DISPATCH[providerId];
  if (handler) return handler(credentials);
  return queryGeneric(providerId, providerName, credentials);
}

/**
 * Execute an AI agent across the user's connected integrations.
 * Only queries integrations that are relevant to the agent (per agent_integration_map).
 * For each connected/relevant integration, makes a real API call.
 */
/**
 * Action result from a provider write operation.
 */
export interface ProviderActionResult {
  providerId: string;
  provider: string;
  action: string;
  status: "executed" | "failed" | "skipped";
  detail: string;
  result?: any;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Write Operation Dispatch
// ────────────────────────────────────────────────────────────────────────

/**
 * Temporary launch guard: HubSpot writes are enabled only for the configured
 * single-user tenant owner. Other authenticated users fail closed until a
 * canonical DB-backed tenant membership lookup replaces this guard.
 */
export function getHubSpotTrustedTenantId(userEmail: string, ownerEmail = process.env.HUBSPOT_SINGLE_USER_TENANT_EMAIL || "mathewortiz97@gmail.com"): string | null {
  const email = String(userEmail || "").trim().toLowerCase();
  const owner = String(ownerEmail || "").trim().toLowerCase();
  return email && owner && email === owner ? email : null;
}

function hubSpotCredentialToken(creds: Record<string, string>): string {
  return (creds.accessToken || "").trim();
}
function hubSpotWritePayload(payload: Record<string, any>, trustedTenantId?: string): Record<string, any> | null {
  // tenantId is supplied by the authenticated live-path caller; never trust a
  // tenant identifier from an unscoped external request.
  if (typeof trustedTenantId !== "string" || !trustedTenantId.trim()) return null;
  // The caller-supplied payload tenantId is deliberately ignored. Only the
  // authenticated live-path tenant context may scope a HubSpot resource.
  return { ...payload, tenantId: trustedTenantId };
}
async function hubSpotWrite(
  action: string,
  method: "POST" | "PATCH",
  path: string,
  creds: Record<string, string>,
  payload: Record<string, any>,
  properties: Record<string, any>,
  trustedTenantId?: string,
): Promise<ProviderActionResult> {
  const token = hubSpotCredentialToken(creds);
  const scoped = hubSpotWritePayload(payload, trustedTenantId);
  if (!token || !scoped) return { providerId: "hubspot", provider: "HubSpot", action, status: "skipped", detail: "HubSpot write requires scoped tenant context and access token; no request was made." };
  try {
    const res = await fetchWithTimeout(`https://api.hubapi.com${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ properties }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { providerId: "hubspot", provider: "HubSpot", action, status: "failed", detail: `HTTP ${res.status}`, error: json.message || `HTTP ${res.status}` };
    return { providerId: "hubspot", provider: "HubSpot", action, status: "executed", detail: `${action} completed for tenant ${scoped.tenantId}`, result: json };
  } catch (e: any) { return { providerId: "hubspot", provider: "HubSpot", action, status: "failed", detail: e.message, error: e.message }; }
}
async function createHubSpotContact(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const { action: _a, tenantId: _t, __trustedTenantId: _trusted, ...properties } = payload;
  return hubSpotWrite("create_contact", "POST", "/crm/v3/objects/contacts", creds, payload, properties, payload.__trustedTenantId);
}
async function updateHubSpotContact(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const id = String(payload.contactId || payload.id || "").trim();
  if (!/^[0-9]+$/.test(id)) return { providerId: "hubspot", provider: "HubSpot", action: "update_contact", status: "skipped", detail: "A numeric HubSpot contact ID is required; no request was made." };
  const { action: _a, tenantId: _t, __trustedTenantId: _trusted, contactId: _c, id: _i, ...properties } = payload;
  return hubSpotWrite("update_contact", "PATCH", `/crm/v3/objects/contacts/${id}`, creds, payload, properties, payload.__trustedTenantId);
}
async function createHubSpotTask(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const { action: _a, tenantId: _t, __trustedTenantId: _trusted, ...properties } = payload;
  return hubSpotWrite("create_task", "POST", "/crm/v3/objects/tasks", creds, payload, properties, payload.__trustedTenantId);
}
async function createHubSpotDeal(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const { action: _a, tenantId: _t, __trustedTenantId: _trusted, ...properties } = payload;
  return hubSpotWrite("create_deal", "POST", "/crm/v3/objects/deals", creds, payload, properties, payload.__trustedTenantId);
}
async function createHubSpotCompany(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const { action: _a, tenantId: _t, __trustedTenantId: _trusted, ...properties } = payload;
  return hubSpotWrite("create_company", "POST", "/crm/v3/objects/companies", creds, payload, properties, payload.__trustedTenantId);
}
async function updateHubSpotPipelineStage(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const stage = String(payload.dealstage || payload.pipelineStage || "").trim();
  if (!stage || !/^[A-Za-z0-9_.-]+$/.test(stage)) return { providerId: "hubspot", provider: "HubSpot", action: "update_pipeline_stage", status: "skipped", detail: "A valid pipeline stage is required; no request was made." };
  const id = String(payload.dealId || payload.id || "").trim();
  if (!/^[0-9]+$/.test(id)) return { providerId: "hubspot", provider: "HubSpot", action: "update_pipeline_stage", status: "skipped", detail: "A numeric HubSpot deal ID is required; no request was made." };
  return hubSpotWrite("update_pipeline_stage", "PATCH", `/crm/v3/objects/deals/${id}`, creds, payload, { dealstage: stage }, payload.__trustedTenantId);
}
async function updateSalesforceAccount(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const instanceUrl = creds.instanceUrl || "https://login.salesforce.com";
  const baseUrl = instanceUrl.replace(/\/$/, "");
  const accountId = payload.id || payload.accountId;
  if (!accountId) return { providerId: "salesforce", provider: "Salesforce", action: "update_account", status: "skipped", detail: "No account ID provided" };
  try {
    const res = await fetchWithTimeout(`${baseUrl}/services/data/v58.0/sobjects/Account/${accountId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload.fields || payload),
    });
    if (!res.ok) return { providerId: "salesforce", provider: "Salesforce", action: "update_account", status: "failed", detail: `HTTP ${res.status}`, error: `HTTP ${res.status}` };
    return { providerId: "salesforce", provider: "Salesforce", action: "update_account", status: "executed", detail: `Account ${accountId} updated` };
  } catch (e: any) {
    return { providerId: "salesforce", provider: "Salesforce", action: "update_account", status: "failed", detail: e.message, error: e.message };
  }
}

async function createZendeskTicket(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const apiKey = creds.apiKey || creds.accessToken || "";
  const subdomain = creds.subdomain || "test";
  const email = creds.email || "agent@test.com";
  const body = { ticket: { subject: payload.subject || "Auto-created ticket", comment: { body: payload.body || payload.detail || "" }, priority: payload.priority || "normal" } };
  try {
    const res = await fetchWithTimeout(`https://${subdomain}.zendesk.com/api/v2/tickets.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${email}/token:${apiKey}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { providerId: "zendesk", provider: "Zendesk", action: "create_ticket", status: "failed", detail: `HTTP ${res.status}`, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { providerId: "zendesk", provider: "Zendesk", action: "create_ticket", status: "executed", detail: `Ticket created: ${json.ticket?.id}`, result: json.ticket };
  } catch (e: any) {
    return { providerId: "zendesk", provider: "Zendesk", action: "create_ticket", status: "failed", detail: e.message, error: e.message };
  }
}

async function sendSlackMessage(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const channel = payload.channel || payload.channelId || "general";
  const text = payload.text || payload.detail || "Automated message from AI agent";
  try {
    const res = await fetchWithTimeout("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text }),
    });
    const json = await res.json();
    if (!json.ok) return { providerId: "slack", provider: "Slack", action: "send_message", status: "failed", detail: json.error || "Slack API error", error: json.error };
    return { providerId: "slack", provider: "Slack", action: "send_message", status: "executed", detail: `Message sent to ${channel}`, result: { ts: json.ts, channel: json.channel } };
  } catch (e: any) {
    return { providerId: "slack", provider: "Slack", action: "send_message", status: "failed", detail: e.message, error: e.message };
  }
}

async function createJiraIssue(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const apiToken = creds.apiKey || creds.accessToken || "";
  const domain = creds.domain || "test";
  const email = creds.email || "";
  const body = {
    fields: {
      project: { key: payload.projectKey || "PROJ" },
      summary: payload.summary || payload.detail || "Auto-created issue",
      description: payload.description || payload.detail || "",
      issuetype: { name: payload.issueType || "Task" },
    },
  };
  try {
    const res = await fetchWithTimeout(`https://${domain}.atlassian.net/rest/api/3/issue`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { providerId: "jira", provider: "Jira", action: "create_issue", status: "failed", detail: `HTTP ${res.status}`, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { providerId: "jira", provider: "Jira", action: "create_issue", status: "executed", detail: `Issue created: ${json.key}`, result: { key: json.key, id: json.id } };
  } catch (e: any) {
    return { providerId: "jira", provider: "Jira", action: "create_issue", status: "failed", detail: e.message, error: e.message };
  }
}

async function createQuickBooksInvoice(creds: Record<string, string>, payload: Record<string, any>): Promise<ProviderActionResult> {
  const accessToken = creds.accessToken || creds.apiKey || "";
  const realmId = creds.realmId || creds.companyId || "";
  const body = {
    Line: payload.lines || [{ Amount: payload.amount || 0, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1" } } }],
    CustomerRef: { value: payload.customerId || "1" },
  };
  try {
    const res = await fetchWithTimeout(`https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/invoice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { providerId: "quickbooks", provider: "QuickBooks", action: "create_invoice", status: "failed", detail: `HTTP ${res.status}`, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { providerId: "quickbooks", provider: "QuickBooks", action: "create_invoice", status: "executed", detail: `Invoice created: ${json.Invoice?.Id}`, result: json.Invoice };
  } catch (e: any) {
    return { providerId: "quickbooks", provider: "QuickBooks", action: "create_invoice", status: "failed", detail: e.message, error: e.message };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Write allowlist — FAIL CLOSED.
//
// A write executes ONLY when the exact (providerId, action) pair is
// explicitly mapped below to a handler whose behavior matches the action's
// intent. Anything else — unknown provider, unknown action, or a mismatched
// pair — is skipped with NO network call and NO credential use.
//
// Never add a "generic" fallback here: an unvetted POST can create junk
// records in a client's live system, and a guessed URL can leak the
// client's credentials to a domain we do not control.
// ────────────────────────────────────────────────────────────────────────
const WRITE_DISPATCH: Record<string, (creds: Record<string, string>, payload: Record<string, any>) => Promise<ProviderActionResult>> = {
  "hubspot:create_contact": createHubSpotContact,
  "hubspot:update_contact": updateHubSpotContact,
  "hubspot:create_task": createHubSpotTask,
  "hubspot:create_deal": createHubSpotDeal,
  "hubspot:create_company": createHubSpotCompany,
  "hubspot:update_pipeline_stage": updateHubSpotPipelineStage,
  "salesforce:update_account": updateSalesforceAccount,
  "zendesk:create_ticket": createZendeskTicket,
  "slack:send_message": sendSlackMessage,
  "jira:create_issue": createJiraIssue,
  // An audit finding is intentionally recorded as a Jira issue — intent matches.
  "jira:create_audit_finding": createJiraIssue,
  "quickbooks:create_invoice": createQuickBooksInvoice,
};

/**
 * Execute a write action against a specific provider.
 * Fail-closed: only explicitly allowlisted (provider, action) pairs run.
 * Everything else returns "skipped" without any network call.
 */
export async function executeProviderAction(
  providerId: string,
  providerName: string,
  credentials: Record<string, string>,
  payload: Record<string, any>
): Promise<ProviderActionResult> {
  const action = payload.action || "write";
  if (!credentials || (!credentials.apiKey && !credentials.accessToken)) {
    return {
      providerId,
      provider: providerName,
      action,
      status: "skipped",
      detail: "No valid credentials — write operation requires API key or access token",
    };
  }
  const handler = WRITE_DISPATCH[`${providerId}:${action}`];
  if (!handler) {
    return {
      providerId,
      provider: providerName,
      action,
      status: "skipped",
      detail: `Write skipped: no vetted handler for ${providerName} action '${action}'. No request was made. This action requires a purpose-built integration (planned).`,
    };
  }
  const result = await handler(credentials, payload);
  // Report the action the caller asked for (handlers may share implementations).
  return { ...result, action };
}

export async function executeAgent(
  agentId: string,
  agentName: string,
  agentIntegrationIds: string[],
  userConnections: ProviderConnection[]
): Promise<AgentIntegrationResult> {
  const startedAt = new Date().toISOString();
  const results: ProviderResult[] = [];

  // Build a lookup of connected providers: providerId → connection
  const connectedMap = new Map<string, ProviderConnection>();
  for (const conn of userConnections) {
    if (conn.status === "Connected") {
      connectedMap.set(conn.providerId, conn);
    }
  }

  // For each integration the agent needs, check if user has it connected
  const relevantConnections = agentIntegrationIds
    .map((pid) => connectedMap.get(pid))
    .filter((c): c is ProviderConnection => !!c);

  // Query each connected provider
  for (const conn of relevantConnections) {
    const result = await querySingleProvider(conn.providerId, conn.provider, conn.credentials || {});
    results.push(result);
  }

  // Also include unmatched integrations as "not connected" entries
  const connectedIds = new Set(results.map(r => r.providerId));
  for (const pid of agentIntegrationIds) {
    if (!connectedIds.has(pid)) {
      const conn = connectedMap.get(pid);
      results.push({
        providerId: pid,
        provider: conn?.provider || pid,
        status: conn ? "unreachable" : "unreachable",
        recordsFound: 0,
        sampleData: [],
        error: conn ? "API call failed (test credentials)" : "Not connected — connect this integration first",
      });
    }
  }

  const totalRecords = results.reduce((sum, r) => sum + r.recordsFound, 0);
  const connectedCount = results.filter(r => r.status === "ok").length;
  const failedCount = results.filter(r => r.status !== "ok").length;

  let summary = `Agent "${agentName}" executed. `;
  if (connectedCount > 0) {
    summary += `Queried ${connectedCount} connected integration${connectedCount > 1 ? "s" : ""}${failedCount > 0 ? ` (${failedCount} unavailable)` : ""}. `;
  } else if (relevantConnections.length > 0) {
    summary += `${relevantConnections.length} connected integration${relevantConnections.length > 1 ? "s" : ""} queried but unavailable with test credentials. `;
  } else {
    const totalRelevant = agentIntegrationIds.length;
    summary += `None of the ${totalRelevant} required integration${totalRelevant > 1 ? "s" : ""} are connected. Connect them to unlock full functionality. `;
  }
  summary += `Processed ${totalRecords} record${totalRecords !== 1 ? "s" : ""} total.`;

  const completedAt = new Date().toISOString();

  return {
    agentId,
    agentName,
    status: "completed",
    startedAt,
    completedAt,
    summary,
    integrationsUsed: results,
    totalRecordsProcessed: totalRecords,
  };
}
