/**
 * cleanup-a2-guard — retire persistent-connect + reframe connected-accounts
 * as import history (cleanup batch slice a2).
 *
 * ABSENCE pins: the persistent-cred handler, its flat store, and the
 * connect-era product UI are GONE from server + product surfaces.
 * PRESENCE pins: every surface now points at the REAL import ledger +
 * real OAuth access, with honest import-lane copy and zero reconnect asks.
 *
 * Post-(a) adaptation (documented in the R93 PR body): consolidation folded
 * the connected-accounts PAGE and the crm/erp pages into the single
 * Connections surface (/portal/import) and the integrations catalog/detail
 * pages. The pins below were adapted old→new: subjects that are physically
 * gone are pinned as ABSENT; survivors keep presence pins on their real
 * strings. The retained connected-accounts ENDPOINT + OAuth lib are NOT
 * swept (they are owner/OAuth layers, out of scope for product surfaces).
 */
import { describe, expect, it } from "vitest";
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
    ["pack-era copy", "Connection Pack"],
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
  it("the single Connections surface (import page) IS the ledger surface — the connected-accounts page is retired", () => {
    // (a) folded the connected-accounts page into the import page: gone.
    expect(existsSync(join(REPO, "src", "lazy", "portal.connected-accounts.index.page.tsx"))).toBe(false);
    expect(existsSync(join(REPO, "src", "routes", "portal.connected-accounts.index.tsx"))).toBe(false);
    // The survivor carries the honest ledger framing (real /api/native/import
    // path + approval-gated, nothing-imported-until-approve copy).
    const imp = cat(join(REPO, "src", "lazy", "portal.import.index.page.tsx"));
    expect(imp.includes('"/api/native/import')).toBe(true);
    expect(imp.includes("nothing is imported until you approve")).toBe(true);
    expect(imp.includes("approval-gated")).toBe(true);
  });
  it("import-lane framing survives on the integrations catalog + detail; crm/erp pages are retired", () => {
    // (a) folded crm/erp away — the pages are physically gone (absence pins).
    expect(existsSync(join(REPO, "src", "lazy", "portal.crm.index.page.tsx"))).toBe(false);
    expect(existsSync(join(REPO, "src", "lazy", "portal.erp.index.page.tsx"))).toBe(false);
    // Catalog arm — the surviving integrations index carries the lane framing.
    const catalog = cat(join(REPO, "src", "lazy", "portal.integrations.index.page.tsx"));
    expect(catalog.includes("nothing stays connected")).toBe(true);
    expect(catalog.includes("Import from ")).toBe(true);
    expect(catalog.includes("View import history")).toBe(true);
    // Detail arm — the provider detail page too (capital-N phrasing).
    const detail = cat(join(REPO, "src", "lazy", "portal.integrations.$id.page.tsx"));
    expect(detail.includes("Nothing stays connected")).toBe(true);
    expect(detail.includes("Import from ")).toBe(true);
    // Aggregate net unchanged: the framed phrases exist across the product surface.
    expect(dirSrc.includes("nothing stays connected")).toBe(true);
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