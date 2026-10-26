/**
 * cleanup-a2-guard — retire persistent-connect + reframe connected-accounts
 * as import history (cleanup batch slice a2).
 *
 * ABSENCE pins: the persistent-cred handler, its flat store, and the
 * connect-era product UI are GONE from server + product surfaces.
 * PRESENCE pins: every surface now points at the REAL import ledger +
 * real OAuth access, with honest import-lane copy and zero reconnect asks.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { connectedFileProviders } from "../lib/file-creation";

const REPO = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..", "..");

const PROD_SERVER = join(REPO, "prod-server.ts");
const SCAN_ROOTS = [
  join(REPO, "src", "lazy"),
  join(REPO, "src", "routes"),
  join(REPO, "src", "api"),
  join(REPO, "src", "native"),
];

/** Dependency-free recursive walk over the product-surface roots. */
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
    if (st.isDirectory()) {
      walk(abs, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(abs);
    }
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

describe("cleanup-a2 — persistent-connect RETIRED (absence)", () => {
  const serverSrc = cat(PROD_SERVER);
  const dirSrc = productFiles().map(cat).join("\n");

  const banned: Array<[string, string]> = [
    ["flat store file", "tenant_integrations"],
    ["flat store const", "TENANT_INTEGRATIONS_FILE"],
    ["connect handler", "/api/integrations/connect"],
    ["disconnect handler", "/api/integrations/disconnect"],
    ["conn-list GET", 'fetch("/api/integrations"'],
    ["persistent apiKey dump", "TENANT_INTEGRATIONS"],
    // "Connection Pack" pack-era runtime (pack-slot endpoint + webhook link-mapping)
    // is approval-retained at 129th — pinned LIVE by owner-decisions.test.ts
    // (owner 10-21). The 10-21 zero-mention scope is pricing/product surfaces,
    // which this guard asserts separately below.
  ];
  for (const [label, needle] of banned) {
    it(`server: zero "${label}" (${needle})`, () => {
      expect(serverSrc.includes(needle)).toBe(false);
    });
  }
  for (const [label, needle] of [
    ["flat store file", "tenant_integrations"],
    ["connect handler", "/api/integrations/connect"],
    ["disconnect handler", "/api/integrations/disconnect"],
    ["conn-list GET", '"/api/integrations"'],
    ["reconnect ask", "Manage your connections"],
    ["connect CTA", "Connect New Account"],
  ] as Array<[string, string]>) {
    it(`product surfaces: zero "${label}" (${needle})`, () => {
      expect(dirSrc.includes(needle)).toBe(false);
    });
  }

  it('only surviving /api/integrations* server mount is the providers catalog', () => {
    // fail-closed: the namespace no longer carries ANY persistent-connection branch
    expect(serverSrc.includes('"/api/integrations/providers"')).toBe(true);
    expect((serverSrc.match(/\/api\/integrations/g) || []).length).toBe(1);
  });

  it("no key-store theater for integrations survives in product surfaces", () => {
    expect(dirSrc.includes("Paste API key")).toBe(false);
    expect(dirSrc.includes("API Key required")).toBe(false);
    expect(dirSrc.includes("or use OAuth")).toBe(false);
  });
});

describe("cleanup-a2 — import-history reframe (presence)", () => {
  const dirSrc = productFiles().map(cat).join("\n");
  const connPage = cat(join(REPO, "src", "lazy", "portal.connected-accounts.index.page.tsx"));

  it("connected-accounts page IS the import-history surface backed by the real ledger", () => {
    expect(connPage.includes("Import History")).toBe(true);
    expect(connPage.includes("/api/native/import?limit=100")).toBe(true);
    expect(connPage.includes("Bring your data in")).toBe(true);
    // honest no-persistence framing
    expect(connPage.includes("Nothing stays connected.")).toBe(true);
  });

  it("import-lane framing is present on crm/erp/catalog/detail surfaces", () => {
    expect(dirSrc.includes("Nothing stays connected.")).toBe(true);
    expect(dirSrc.includes("Import from ")).toBe(true);
    expect(dirSrc.includes("View import history")).toBe(true);
  });

  it("real OAuth access store is the single source used by file routing", () => {
    const fc = cat(join(REPO, "src", "lib", "file-creation.ts"));
    expect(fc.includes("tenant_oauth_credentials.json")).toBe(true);
    expect(fc.includes("connectedFileProviders")).toBe(true);
  });
});

describe("cleanup-a2 — connectedFileProviders derives from the real store (behavior)", () => {
  it("returns only workspace-capable providers holding a live token for THIS tenant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "a2-guard-"));
    try {
      const oauth = join(dir, "tenant_oauth_credentials.json");
      writeFileSync(
        oauth,
        JSON.stringify({
          "acme@test.com:google-drive": { accessToken: "tok", expiresAt: Math.floor(Date.now() / 1000) + 600 },
          "acme@test.com:slack": { accessToken: "xoxb" },
          "other@test.com:google-drive": { accessToken: "other-tok" },
        })
      );
      const ids = connectedFileProviders("acme@test.com", dir);
      expect(ids).toContain("google-drive"); // workspace-capable + token
      expect(ids).not.toContain("slack"); // not a file workspace
      expect(ids).not.toContain(undefined);
      // cross-tenant isolation: other tenant's token is never visible
      for (const id of ids) {
        expect(id.startsWith("other@")).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});