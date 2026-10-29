/**
 * CLEANUP (b) guard — honest-remove /portal/api + settings API section
 * (cleanup batch slice b, owner-approved 10-26).
 *
 * The API-key store NEVER existed (portal audit 10-23): the /portal/api page
 * rendered a pretend "Developer Gateway" that minted sk_live_ keys client-side
 * and POSTed them to /api/data/api, and the settings page carried a
 * Developer-Keys tab with generate/revoke theater — both backed by the dead
 * /api/data/api path (no api.json store; always {data:[]}). This slice deletes
 * the route + page, strips the settings keys tab, and retires the dead path
 * with fail-closed 404 JSON. Real scoped API tokens will be built only when a
 * paying enterprise asks (nothing here mints or manages keys).
 *
 * Guards:
 *  (a) static absence — no key-store-theater literals in product src
 *      (lazy/routes/api/native), components, content, libs, or prod-server;
 *      the /portal/api route + page files are physically gone; the generated
 *      routeTree (when present) and the built dist (when present) carry no
 *      /portal/api route or chunk.
 *  (b) static presence — settings keeps only its real tabs with honest copy;
 *      the nav subtitle is honest; the server retires subPath "api" with 404
 *      JSON while the generic store fallback stays intact; the provider
 *      catalog no longer points users at a nonexistent Settings API-Keys path.
 *  (c) behavioral — anon /api/data/api → 401 JSON; any authenticated tenant
 *      GET/POST /api/data/api → 404 JSON (never a pretend empty key store);
 *      the deleted /portal/api page behaves like any unknown /portal page
 *      (anon → 302 → /login); sibling /api/data stores are untouched.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const REPO = process.cwd();

const SCAN_ROOTS = ["lazy", "routes", "api", "native", "lib", "components", "content"]
  .map((r) => join(REPO, "src", r));

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(abs);
  }
}

function productFiles(): string[] {
  const hits: string[] = [];
  for (const root of SCAN_ROOTS) walk(root, hits);
  return hits;
}

function cat(f: string): string {
  try {
    return readFileSync(f, "utf-8");
  } catch {
    return "";
  }
}

const PROD_SERVER = cat(join(REPO, "prod-server.ts"));

/**
 * Key-store-theater literals retired by slice (b). These appear ONLY in the
 * deleted page, the deleted settings tab, or the false catalog path — verified
 * zero across product src, components, content, libs, and prod-server before
 * the guard was written. Provider ADAPTER code ("API key in X-API-KEY header")
 * is legitimately untouched — it describes how third-party tools authenticate.
 */
const THEATER = [
  "Developer Gateway",
  "Developer Access Gateways",
  "Generate API Key",
  "Generate First Secret API Key",
  "No API Access Tokens Generated",
  "sk_live_",
  "Developer Keys",
  "/api/data/api",
  "API Keys",
];

describe("CLEANUP (b): zero API-key-store theater in product src, server, and libs", () => {
  const dirSrc = productFiles().map(cat).join("\n");

  it.each(THEATER.map((needle) => [needle] as [string]))(
    'product surfaces carry no "%s"',
    (needle) => {
      expect(dirSrc.includes(needle)).toBe(false);
    }
  );

  it.each([
    ["key-store subtab", "Developer Keys"],
    ["generate-key CTA", "Generate API Key"],
    ["minted-key prefix", "sk_live_"],
    ["false settings path", "Settings > Integrations > API Keys"],
  ] as Array<[string, string]>)("prod-server carries no %s", (_label, needle) => {
    expect(PROD_SERVER.includes(needle)).toBe(false);
  });

  it("the provider catalog tells users the Copper key comes from their own Copper admin", () => {
    expect(PROD_SERVER).toContain("API key from your Copper admin account");
    expect(PROD_SERVER).not.toContain("Settings > Integrations");
  });
});

describe("CLEANUP (b): the /portal/api route and page are physically gone", () => {
  it("no route file and no lazy page remain", () => {
    expect(existsSync(join(REPO, "src", "routes", "portal.api.index.tsx"))).toBe(false);
    expect(existsSync(join(REPO, "src", "lazy", "portal.api.index.page.tsx"))).toBe(false);
  });

  it("the generated routeTree (when present) has no /portal/api route", () => {
    const routeTree = join(REPO, "src", "routeTree.gen.ts");
    if (!existsSync(routeTree)) return; // regenerated at build; absent pre-build
    expect(cat(routeTree)).not.toContain("/portal/api");
  });

  it("the built dist (when present) has no portal-api chunk or Developer-Gateway literal", () => {
    const distAssets = join(REPO, "dist", "assets");
    if (!existsSync(distAssets)) return; // built dist is produced before the canonical suite
    const offenders: string[] = [];
    for (const entry of readdirSync(distAssets)) {
      const body = cat(join(distAssets, entry));
      if (entry.includes("portal.api.index") || body.includes("Developer Gateway")) {
        offenders.push(entry);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("CLEANUP (b): settings keeps only its real tabs — honest copy stays", () => {
  const settings = cat(join(REPO, "src", "lazy", "portal.settings.index.page.tsx"));
  const nav = cat(join(REPO, "src", "lazy", "portal.page.tsx"));

  it("the settings page keeps the three REAL tabs (profile / import history / billing)", () => {
    expect(settings).toContain('label: "🏢 Business Profile"');
    expect(settings).toContain('label: "📥 Import History"');
    expect(settings).toContain('label: "💳 Plan & Billing"');
    // The keys tab is gone and so is every generate/revoke handler.
    expect(settings).not.toContain('id: "keys"');
    expect(settings).not.toContain("handleKeyAction");
    expect(settings).not.toContain("fetchDeveloperKeys");
  });

  it("the settings header copy no longer promises API-key generation", () => {
    expect(settings).toContain(
      "Configure business brand profiles, review one-shot import history, and manage plan and billing."
    );
    expect(settings).not.toMatch(/generate secure API keys/i);
  });

  it("the portal nav subtitle for Settings is honest (no API Keys)", () => {
    expect(nav).toContain('subtitle: "Profile · Billing · Import History"');
    expect(nav).not.toContain("API Keys");
  });

  it("the server retires subPath api with fail-closed 404 while the generic store stays", () => {
    expect(PROD_SERVER).toContain('subPath === "api" || subPath === "api/"');
    expect(PROD_SERVER).toContain('Response.json({ error: "not found" }, { status: 404 })');
    // The honest generic file-store fallback (used by every real tenant file)
    // must still be intact below the retirement branch.
    expect(PROD_SERVER).toContain("const fileName = `${subPath.replace(/\\/$/, \"\")}.json`;");
    expect(PROD_SERVER).toContain("const filePath = join(DATA_DIR, fileName);");
  });
});

describe("CLEANUP (b): the retired path and page answer fail-closed (live self-hosted server)", () => {
  const BASE_URL = testBaseUrl();
  const TEST_DATA_DIR = testDataDir();
  const PASSWORD = "cleanup-b-pass";
  const TS = Date.now();
  const CUSTOMER_A = `b-customer-a-${TS}@example.test`;
  const CUSTOMER_B = `b-customer-b-${TS}@example.test`;

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
    return { status: res.status, json, ct: res.headers.get("content-type") || "", location: res.headers.get("location") };
  }

  beforeAll(async () => {
    await ensureTestServer();
    // The spawner wipes + recreates the isolated dir on boot; seeding AFTER
    // health means our sessions land in the fresh store the server reads.
    if (!existsSync(TEST_DATA_DIR)) mkdirSync(TEST_DATA_DIR, { recursive: true });
    // No api.json may exist for any tenant — the guard proves it by absence.
  });

  it("anonymous GET /api/data/api → 401 JSON (auth-gate first, never HTML, never a key list)", async () => {
    const r = await send("/api/data/api", null, "GET");
    expect(r.status).toBe(401);
    expect(r.ct).toContain("application/json");
    expect(r.ct).not.toContain("text/html");
  });

  it.each([
    ["GET", undefined],
    ["POST", { name: "probe", action: "generate_key" }],
    ["POST", { name: "probe", action: "revoke" }],
  ] as Array<[string, unknown]>)(
    "an authenticated tenant %s /api/data/api → 404 JSON (key store never existed)",
    async (method, body) => {
      const cookie = await registerAndGetCookie(CUSTOMER_A);
      expect(cookie).toBeTruthy();
      const r = await send("/api/data/api", cookie, method, body);
      expect(r.status).toBe(404);
      expect(r.ct).toContain("application/json");
      expect(r.json?.error).toBe("not found");
    }
  );

  it("a SECOND tenant also gets 404 — no key store exists for ANY workspace", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_B);
    expect(cookie).toBeTruthy();
    const r = await send("/api/data/api", cookie, "GET");
    expect(r.status).toBe(404);
    expect(r.ct).toContain("application/json");
  });

  it("the deleted /portal/api page is an unknown portal page: anon → 302 → /login", async () => {
    const r = await send("/portal/api", null, "GET");
    expect(r.status).toBe(302);
    expect(r.location).toBe("/login");
  });

  it("sibling /api/data stores are untouched by the retirement (workflows still 200)", async () => {
    const cookie = await registerAndGetCookie(CUSTOMER_A);
    const r = await send("/api/data/workflows", cookie, "GET");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json?.data)).toBe(true);
  });
});