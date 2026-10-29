/**
 * cleanup-a-guard.test.ts — CLEANUP (a) consolidation guard (R93 — the final
 * slice of the owner-approved cleanup batch, 10-29).
 *
 * One PR, ONE owning guard, FRESH assertions only (no edits to prior
 * guardrails except the two honest retirement adaptations documented in the
 * PR body: autonomy.test.ts roster test + automation-sprint-retirement
 * USER_DIRS scan-root extension).
 *
 * What this guard pins, per consolidation:
 *   C1 CONNECTIONS: /portal/import (lanes + run ledger) is the ONE surface;
 *      the orphaned connected-accounts / crm / erp / customers pages are gone.
 *   C2 MESSAGING: ONE inbox+bell — the Notifications page (bell → /portal/
 *      notifications); the theater /portal/inbox page and BOTH unused
 *      messaging store handlers are retired fail-closed.
 *   C3 STORAGE: ONE document/files surface — the vault page; the documents +
 *      files routes/pages are retired.
 *   C4 SETTINGS: ONE settings store — tenant_settings.json, served by
 *      /api/settings, /api/data/settings and the workspace-preference
 *      endpoint (proven live by a cross-endpoint write/read probe); the
 *      settings page writes ONLY /api/data/settings; the P2-3 light-surface
 *      residuals (settings bg-white knobs, $auditId bg-stone-50 page) are gone.
 *   R1–R4: employees roster tree, dead aiChatEngine and unmounted vinxi-era
 *      stripe webhook are deleted; anonymous /api/data/purchases is retired
 *      fail-closed and the admin page reads the REAL /api/purchases.
 *
 * Behavioral probes run against the self-hosted test server (same harness
 * pattern as cleanup-b-guard: register → cookie → real authed requests).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");
const P = (rel: string): string => join(REPO, rel);
const cat = (rel: string): string => {
  const p = P(rel);
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
};

const SHELL = cat("src/lazy/portal.page.tsx");
const PROD = cat("prod-server.ts");
const SETTINGS = cat("src/lazy/portal.settings.index.page.tsx");
const AUDIT_DETAIL = cat("src/lazy/portal.$auditId.page.tsx");
const NOTIFS = cat("src/lazy/portal.notifications.index.page.tsx");
const ADMIN = cat("src/lazy/portal.admin.index.page.tsx");
const IMPORT = cat("src/lazy/portal.import.index.page.tsx");

function recursiveTsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !f.includes(".test.")) out.push(p);
    }
  };
  walk(dir);
  return out;
}
const PRODUCT = ["src/lazy", "src/routes", "src/api", "src/native"]
  .flatMap((d) => (existsSync(P(d)) ? recursiveTsFiles(P(d)) : []))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const AGENTS_ALL = recursiveTsFiles(P("src/agents"))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

describe("C1 — ONE Connections surface: /portal/import (lanes + ledger)", () => {
  it("the nav keeps the single data-in entry pointing at /portal/import", () => {
    expect(SHELL).toContain('name: "Bring your data in"');
    expect(SHELL).toContain('path: "/portal/import"');
  });
  it("the orphaned connected-accounts / crm / erp / customers pages are physically gone", () => {
    for (const base of [
      "portal.connected-accounts.index",
      "portal.crm.index",
      "portal.erp.index",
      "portal.customers.index",
    ]) {
      expect(existsSync(P(`src/routes/${base}.tsx`)), `${base} route should be deleted`).toBe(false);
      expect(existsSync(P(`src/lazy/${base}.page.tsx`)), `${base} page should be deleted`).toBe(false);
    }
  });
  it("the surviving import surface still shows the honest ledger framing (history needs no second page)", () => {
    expect(IMPORT).toContain("nothing is imported until you approve");
    expect(IMPORT).toContain('fetch("/api/native/import');
  });
});

describe("C2 — ONE inbox+bell: Notifications is the only attention surface", () => {
  it("the bell points at /portal/notifications and nothing points at a portal inbox page", () => {
    expect(SHELL).toContain('to="/portal/notifications"');
    expect(SHELL).not.toMatch(/name: "Inbox"/);
    expect(SHELL).not.toContain('path: "/portal/inbox"');
  });
  it("the theater inbox route + page are physically gone", () => {
    expect(existsSync(P("src/routes/portal.inbox.index.tsx"))).toBe(false);
    expect(existsSync(P("src/lazy/portal.inbox.index.page.tsx"))).toBe(false);
  });
  it("the surviving Notifications page is the bell-linked honest surface", () => {
    expect(NOTIFS).toContain("The count shown on the bell above comes from the same live data.");
    expect(NOTIFS).not.toContain("AI COGNITIVE ANALYTICS");
  });
  it("the unused messaging store handlers are gone from the server", () => {
    expect(PROD).not.toContain('pathname === "/api/data/inbox"');
    expect(PROD).not.toContain('pathname === "/api/data/notifications"');
    expect(PROD).not.toContain("tenant_inbox.json");
    expect(PROD).not.toContain("tenant_notifications.json");
  });
});

describe("C3 — ONE document/files surface: the vault page", () => {
  it("the storage triad collapses to a single nav item whose destination is the vault", () => {
    expect(SHELL).toContain('name: "Documents & Vault"');
    expect(SHELL).toContain('path: "/portal/vault"');
    expect(SHELL).not.toContain('name: "File Library"');
    expect(SHELL).not.toContain('path: "/portal/documents"');
    expect(SHELL).not.toContain('path: "/portal/files"');
  });
  it("the documents + files routes and pages are physically gone", () => {
    for (const base of ["portal.documents.index", "portal.files.index"]) {
      expect(existsSync(P(`src/routes/${base}.tsx`)), `${base} route should be deleted`).toBe(false);
      expect(existsSync(P(`src/lazy/${base}.page.tsx`)), `${base} page should be deleted`).toBe(false);
    }
  });
  it("the vault page survives as the single storage surface", () => {
    expect(existsSync(P("src/lazy/portal.vault.index.page.tsx"))).toBe(true);
    expect(existsSync(P("src/routes/portal.vault.index.tsx"))).toBe(true);
  });
});

describe("C4 — ONE settings store + the P2-3 visual residuals are gone", () => {
  it("the settings page writes ONLY /api/data/settings as its settings endpoint", () => {
    expect(SETTINGS).toContain('fetch("/api/data/settings"');
    expect(SETTINGS).not.toContain('fetch("/api/settings"');
  });
  it("settings keeps the three REAL tabs (profile / import history / billing)", () => {
    expect(SETTINGS).toContain('"🏢 Business Profile"');
    expect(SETTINGS).toContain('"📥 Import History"');
    expect(SETTINGS).toContain('"💳 Plan & Billing"');
  });
  it("the settings page keeps the honest Import-History description sentence", () => {
    expect(SETTINGS).toContain("Configure business brand profiles, review one-shot import history, and manage plan and billing.");
  });
  it("the server references exactly ONE settings store file (tenant_settings.json)", () => {
    expect(PROD).toContain('SETTINGS_FILE = join(DATA_DIR, "tenant_settings.json")');
    expect(PROD).not.toContain("portal_settings.json");
    expect(PROD).not.toContain("workspace_settings.json");
  });
  it("settings carries no literal bg-white surface and the audit detail page is dark", () => {
    expect(SETTINGS).not.toContain("bg-white");
    expect(AUDIT_DETAIL).not.toContain("bg-stone-50");
    expect(AUDIT_DETAIL).toContain("min-h-screen bg-black");
  });
  it("the admin page reads the REAL /api/purchases, never the anonymous subPath", () => {
    expect(ADMIN).toContain('fetch("/api/purchases"');
    expect(ADMIN).not.toContain('fetch("/api/data/purchases"');
  });
});

describe("R4 + folded messaging — retirements are fail-closed on the server", () => {
  it("the generic catch-all pins the three retired subPaths to 404 JSON", () => {
    expect(PROD).toContain('subPath === "inbox" || subPath === "inbox/"');
    expect(PROD).toContain('subPath === "notifications" || subPath === "notifications/"');
    expect(PROD).toContain('subPath === "purchases" || subPath === "purchases/"');
    expect(PROD).toContain('return Response.json({ error: "not found" }, { status: 404 });');
  });
});

describe("R1–R3 — the orphaned agent-era trees and dead router files are gone", () => {
  it("the employees roster tree is deleted", () => {
    expect(existsSync(P("src/agents/employees"))).toBe(false);
  });
  it("the dead assistant engine and the unmounted vinxi stripe webhook are deleted", () => {
    expect(existsSync(P("src/api/aiChatEngine.ts"))).toBe(false);
    expect(existsSync(P("src/api/stripe-webhook.ts"))).toBe(false);
  });
  it("employee-family vocabulary is ZERO across product src and the whole agents tree", () => {
    for (const needle of [
      "AI Employee",
      "AIEmployee",
      "ai_employee",
      "ai_employees",
      "AI workforce",
      "AI coworker",
      "AI Operations Team",
    ]) {
      expect(PRODUCT, `product src must not contain "${needle}"`).not.toContain(needle);
      expect(AGENTS_ALL, `src/agents must not contain "${needle}"`).not.toContain(needle);
    }
  });
  it("the inbox-page theater copy is ZERO across product src", () => {
    for (const needle of [
      "AI COGNITIVE ANALYTICS",
      "METADATA TRACE",
      "Compose Draft Response",
      "Operations Ticket",
    ]) {
      expect(PRODUCT, `product src must not contain "${needle}"`).not.toContain(needle);
    }
  });
  it("no product surface references the retired routes or anonymous stores", () => {
    for (const needle of [
      '"/api/data/inbox"',
      '"/api/data/notifications"',
      '"/api/data/purchases"',
      '"/portal/inbox"',
      '"/portal/crm"',
      '"/portal/erp"',
      '"/portal/customers"',
      '"/portal/documents"',
      '"/portal/files"',
    ]) {
      expect(PRODUCT, `product src must not contain ${needle}`).not.toContain(needle);
    }
    // The REAL per-tenant data endpoint /api/data/connected-accounts must
    // survive (settings + integrations still read it) — presence pin:
    const INTEGRATIONS = cat("src/lazy/portal.integrations.index.page.tsx");
    expect(INTEGRATIONS).toContain('fetch("/api/data/connected-accounts")');
  });
});

describe("CLEANUP (a) — live self-hosted server behavior", () => {
  const BASE_URL = testBaseUrl();
  const TEST_DATA_DIR = testDataDir();
  const PASSWORD = "cleanup-a-pass";
  const TS = Date.now();
  const CUSTOMER_A = `a-customer-a-${TS}@example.test`;

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
  async function send(path: string, cookie: string | null, method: string, body?: unknown) {
    const headers: Record<string, string> = cookie ? { Cookie: `session=${cookie}` } : {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json, ct: res.headers.get("content-type") || "" };
  }

  beforeAll(async () => {
    await ensureTestServer();
    if (!existsSync(TEST_DATA_DIR)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("anonymous GET on a retired subPath → 401 JSON (auth-gate first)", async () => {
    const r = await send("/api/data/inbox", null, "GET");
    expect(r.status).toBe(401);
    expect(r.ct).toContain("application/json");
  });
  it("an authenticated tenant gets 404 JSON on the retired inbox / notifications / purchases subPaths", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_A);
    expect(cookie).toBeTruthy();
    for (const p of ["/api/data/inbox", "/api/data/notifications", "/api/data/purchases"]) {
      const r = await send(p, cookie, "GET");
      expect(r.status, `${p} should be 404`).toBe(404);
      expect(r.ct).toContain("application/json");
      expect(r.json?.error).toBe("not found");
    }
  });
  it("sibling /api/data stores are untouched — workflows still 200", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_A);
    const r = await send("/api/data/workflows", cookie, "GET");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json?.data)).toBe(true);
  });
  it("ONE settings store, proven live: a preference written via /api/portal/settings appears in /api/data/settings and back again", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_A);
    const w = await send("/api/portal/settings", cookie, "POST", { workspacePreference: "microsoft" });
    expect(w.status).toBe(200);
    const blob = await send("/api/data/settings", cookie, "GET");
    expect(blob.status).toBe(200);
    expect(JSON.stringify(blob.json)).toContain("microsoft");
    const back = await send("/api/portal/settings", cookie, "GET");
    expect(JSON.stringify(back.json)).toContain("microsoft");
  });
  it("the REAL /api/purchases endpoint still serves per-tenant records (empty for a fresh tenant)", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_A);
    const r = await send("/api/purchases", cookie, "GET");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json?.data)).toBe(true);
  });
});