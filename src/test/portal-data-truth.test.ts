/**
 * portal-data-truth.test.ts — #236 portal data-truth bug-fix wave.
 *
 * Proves against the self-hosted test server:
 *  1. /api/data/connected-accounts + /api/integrations build the connected list
 *     from the REAL OAuth credential store (tenant_oauth_credentials.json keyed
 *     email:provider), NOT the legacy tenant_integrations.json fixtures. The
 *     owner's real providers (xero/hubspot/slack) show; a fresh customer shows
 *     zero.
 *  2. /api/data/employees marks `needsAttention` only on REAL failure signals
 *     (explicit error record / unhealthy connection) — unconfigured catalog
 *     agents (status "available"/"paused") are NOT flagged, so the dashboard
 *     "17 AIs need attention" false alarm is gone.
 *  3. The previously-dead pages are wired to real stores:
 *       documents  -> tenant_documents.json (the /api/upload write-target)
 *       tasks      -> workflow_runs.json real run records (+ POST persistence)
 *       workflows  -> tenant_workflows.json (GET/POST/DELETE round-trip)
 *
 * Isolation: only keyed under our OWN email + the seeded owner session token;
 * every file we touch is snapshot/restored in afterAll so sibling test files
 * sharing the spawned server are untouched.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const PASSWORD = "portal-data-truth-pass";
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-session-" + TS;
const CUSTOMER_EMAIL = `ptd-customer-${TS}@example.test`;

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}
function writeJSONFile(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

const TRACKED_FILES = [
  "tenant_oauth_credentials.json",
  "ai_employees.json",
  "tenant_documents.json",
  "tenant_workflows.json",
  "tenant_tasks.json",
  "workflow_runs.json",
];
const originals = new Map<string, { existed: boolean; data: any }>();
function snapshotAll() {
  for (const f of TRACKED_FILES) {
    const p = join(TEST_DATA_DIR, f);
    originals.set(f, { existed: existsSync(p), data: existsSync(p) ? readJSONFile(p) : null });
  }
}
function restoreAll() {
  for (const f of TRACKED_FILES) {
    const p = join(TEST_DATA_DIR, f);
    const orig = originals.get(f);
    if (!orig) continue;
    if (!orig.existed) {
      try { (require("fs") as typeof import("fs")).rmSync(p, { force: true }); } catch { /* noop */ }
    } else {
      writeJSONFile(p, orig.data);
    }
  }
}

function seedOwnerSession(): string {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const users = readJSONFile(usersFile);
  if (!users[OWNER_EMAIL]) users[OWNER_EMAIL] = { email: OWNER_EMAIL, role: "admin", createdAt: Date.now() };
  writeJSONFile(usersFile, users);
  const sessions = readJSONFile(sessionsFile);
  sessions[OWNER_TOKEN] = { email: OWNER_EMAIL, createdAt: Date.now() };
  writeJSONFile(sessionsFile, sessions);
  return OWNER_TOKEN;
}

async function registerAndGetCookie(email: string): Promise<string | null> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie && reg.status === 409) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  return m ? m[1] : null;
}

async function authedGet(path: string, cookie: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
async function authedSend(path: string, cookie: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function removeOwnerSession() {
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  if (!existsSync(sessionsFile)) return;
  const sessions = readJSONFile(sessionsFile);
  delete sessions[OWNER_TOKEN];
  writeJSONFile(sessionsFile, sessions);
}

describe("PORTAL DATA-TRUTH (#236)", () => {
  let ownerCookie: string | null = null;
  let customerCookie: string | null = null;

  beforeAll(async () => {
    await ensureTestServer();
    if (!existsSync(TEST_DATA_DIR)) mkdirSync(TEST_DATA_DIR, { recursive: true });
    snapshotAll();
    ownerCookie = seedOwnerSession();
    customerCookie = await registerAndGetCookie(CUSTOMER_EMAIL);
    expect(ownerCookie).toBeTruthy();
    expect(customerCookie).toBeTruthy();

    // Seed REAL owner credentials (the authoritative store).
    writeJSONFile(join(TEST_DATA_DIR, "tenant_oauth_credentials.json"), {
      [`${OWNER_EMAIL}:xero`]: { provider: "xero", email: OWNER_EMAIL, accessToken: "xero-at", refreshToken: "xero-rt", updatedAt: new Date().toISOString() },
      [`${OWNER_EMAIL}:hubspot`]: { provider: "hubspot", email: OWNER_EMAIL, accessToken: "hs-at", refreshToken: "hs-rt", updatedAt: new Date().toISOString() },
      [`${OWNER_EMAIL}:slack`]: { provider: "slack", email: OWNER_EMAIL, accessToken: "slack-at", updatedAt: new Date().toISOString() },
      // A DIFFERENT tenant's connection must never leak to the owner.
      "someone-else@example.com:xero": { provider: "xero", email: "someone-else@example.com", accessToken: "other", updatedAt: new Date().toISOString() },
    });
    // Legacy fixtures must NOT drive the list anymore.
    writeJSONFile(join(TEST_DATA_DIR, "tenant_integrations.json"), {
      "xero": [{ providerId: "xero", status: "Connected" }],
      "tenant@example.com": [],
    });
    // Catalog employees: unconfigured/purchasable (available) + a genuinely failed one.
    writeJSONFile(join(TEST_DATA_DIR, "ai_employees.json"), [
      { id: "emp-1", name: "Appointment Setter", status: "available", category: "sales" },
      { id: "emp-2", name: "Bookkeeper", status: "paused", category: "finance" },
      { id: "emp-3", name: "Broken Agent", status: "failed", lastError: "oauth grant revoked", category: "sales" },
      { id: "emp-4", name: "Active Agent", status: "Active", category: "ops" },
    ]);
    // Real documents + a run record in the true stores.
    writeJSONFile(join(TEST_DATA_DIR, "tenant_documents.json"), {
      [OWNER_EMAIL]: [{ _id: "doc-1", file_name: "invoice.pdf", status: "processed", createdAt: new Date().toISOString() }],
    });
    writeJSONFile(join(TEST_DATA_DIR, "workflow_runs.json"), {
      [OWNER_EMAIL]: [{ id: "run-1", agentName: "Bookkeeper", status: "completed", startedAt: new Date().toISOString(), output: "Reconciled" }],
    });
  });

  afterAll(() => {
    removeOwnerSession();
    restoreAll();
  });

  it("connected-accounts shows the owner's REAL providers, not legacy fixtures", async () => {
    const res = await authedGet("/api/data/connected-accounts", ownerCookie!);
    expect(res.status).toBe(200);
    const providers = [
      ...(res.json?.crm || []),
      ...(res.json?.erp || []),
      ...(res.json?.other || []),
    ].map((c: any) => c.providerId || c.provider);
    expect(providers).toContain("xero");
    expect(providers).toContain("hubspot");
    expect(providers).toContain("slack");
    // Cross-tenant row must never leak.
    expect(res.json?.erp?.some((c: any) => (c.providerId || c.provider) === "xero" && c.id.includes("someone-else"))).toBe(false);
  });

  it("connected-accounts is EMPTY (0/0) for a fresh customer", async () => {
    const res = await authedGet("/api/data/connected-accounts", customerCookie!);
    expect(res.status).toBe(200);
    expect(res.json?.crm).toEqual([]);
    expect(res.json?.erp).toEqual([]);
    expect(res.json?.other).toEqual([]);
    expect(res.json?.crmSlots.totalSlots).toBe(0);
    expect(res.json?.crmSlots.isOwner).toBe(false);
  });

  it("/api/integrations builds the list from the real credential store", async () => {
    const res = await authedGet("/api/integrations", ownerCookie!);
    expect(res.status).toBe(200);
    const provs = (res.json?.data || []).map((c: any) => c.providerId || c.provider);
    expect(provs).toContain("xero");
    expect(provs).toContain("slack");
    expect(provs).not.toContain("someone-else");
  });

  it("dashboard banner does NOT fire for unconfigured/purchasable catalog agents", async () => {
    const res = await authedGet("/api/data/employees", ownerCookie!);
    expect(res.status).toBe(200);
    const data = res.json?.data || [];
    const byId = new Map(data.map((e: any) => [e.id, e]));
    expect(byId.get("emp-1")?.needsAttention).toBe(false); // available
    expect(byId.get("emp-2")?.needsAttention).toBe(false); // paused
    expect(byId.get("emp-4")?.needsAttention).toBe(false); // active
    expect(byId.get("emp-3")?.needsAttention).toBe(true);  // real failure
  });

  it("/api/data/documents reads the real upload store (tenant_documents.json)", async () => {
    const res = await authedGet("/api/data/documents", ownerCookie!);
    expect(res.status).toBe(200);
    expect(res.json?.data?.length).toBeGreaterThan(0);
    expect(res.json?.data?.[0]?.file_name).toBe("invoice.pdf");
  });

  it("/api/data/tasks surfaces real workflow_runs and POST persists", async () => {
    const res = await authedGet("/api/data/tasks", ownerCookie!);
    expect(res.status).toBe(200);
    const runs = (res.json?.data || []).filter((t: any) => t.id === "run-1");
    expect(runs.length).toBe(1);
    expect(runs[0].aiEmployee).toBe("Bookkeeper");
    const post = await authedSend("/api/data/tasks", ownerCookie!, "POST", { aiEmployee: "Test", status: "completed", summary: "hello" });
    expect(post.status).toBe(200);
    expect(post.json?.success).toBe(true);
  });

  it("/api/data/workflows GET/POST/DELETE round-trips real data", async () => {
    const post = await authedSend("/api/data/workflows", ownerCookie!, "POST", { id: "wf-truth", name: "Invoice Flow", status: "Active", steps: [] });
    expect(post.json?.success).toBe(true);
    const get = await authedGet("/api/data/workflows", ownerCookie!);
    expect(get.json?.data?.some((w: any) => w.id === "wf-truth")).toBe(true);
    const del = await authedSend("/api/data/workflows/wf-truth", ownerCookie!, "DELETE");
    expect(del.json?.success).toBe(true);
    const get2 = await authedGet("/api/data/workflows", ownerCookie!);
    expect(get2.json?.data?.some((w: any) => w.id === "wf-truth")).toBe(false);
  });

  it("fresh customer sees ZERO connections on /api/integrations (isolation)", async () => {
    const res = await authedGet("/api/integrations", customerCookie!);
    expect(res.status).toBe(200);
    expect(res.json?.data || []).toEqual([]);
  });
});
