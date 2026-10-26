/**
 * CLEANUP (e) guard — the admin workflow-builder has no deployment or
 * registry backend, so its old "Deploy Live" button and its "stored into
 * system registry database" save prompt were alert()-only theater. Slice (e)
 * removed both: the deploy button is gone (there is nothing to deploy) and
 * the save prompt became an honest client-side JSON export whose copy points
 * at the real registry save surface (Workflows → Builder, which POSTs to
 * /api/data/workflows).
 *
 * Guards:
 *  (a) static — zero Deploy-Live / fake-save literals across product src
 *      (lazy/routes/api/native), prod-server.ts, server libs and .data; zero
 *      alert( calls left on the admin builder page; the page's honest export
 *      flow is pinned (Blob download + "Workflows → Builder" registry
 *      guidance); the built dist chunk carries no Deploy-Live literal.
 *  (b) behavioral — the admin builder route stays fail-closed for anonymous
 *      visitors (302 → /login) and the real workflows store keeps its
 *      auth-gated 401 on the live self-hosted server.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl } from "./test-env";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

function collectFiles(dir: string, out: Array<[string, string]> = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry))
      out.push([full.replace(REPO + "/", ""), readFileSync(full, "utf8")]);
  }
  return out;
}

const productFiles = collectFiles(join(REPO, "src/lazy"))
  .concat(collectFiles(join(REPO, "src/routes")))
  .concat(collectFiles(join(REPO, "src/api")))
  .concat(collectFiles(join(REPO, "src/native")));
const libFiles = collectFiles(join(REPO, "src/lib"));
const serverSrc = read("prod-server.ts");
const page = read("src/lazy/portal.admin.workflow-builder.page.tsx");
const ALL_SCOPES = [
  ...productFiles,
  ["prod-server.ts", serverSrc],
  ...libFiles,
] as Array<[string, string]>;

/** Deploy-Live button + fake-save prompt literals retired by slice (e). */
const THEATER = /Deploy Live|deployLive|Pipeline deployed and compiled live|stored into system registry|system registry database|Save Blueprint|Confirm Save/i;

describe("CLEANUP (e): zero Deploy-Live / fake-save theater in product source, server, libs and .data", () => {
  it.each(ALL_SCOPES)("%s carries no Deploy-Live or fake-save literals", (_file, src) => {
    expect(src).not.toMatch(THEATER);
  });

  it("the .data store has no Deploy-Live residue (when it exists)", () => {
    const dataDir = join(REPO, ".data");
    if (!existsSync(dataDir)) return;
    for (const entry of readdirSync(dataDir)) {
      if (entry.endsWith(".json")) {
        expect(readFileSync(join(dataDir, entry), "utf8")).not.toMatch(/Deploy Live/i);
      }
    }
  });

  it("the admin builder page has zero alert( calls left (both theaters removed)", () => {
    expect(page).not.toMatch(/alert\(/);
  });
});

describe("CLEANUP (e): the admin canvas honest export flow is pinned", () => {
  it("the toolbar offers the honest export action, not a deploy", () => {
    expect(page).toContain("Export Blueprint (JSON)");
    expect(page).toContain("Download JSON");
  });

  it("export really downloads the blueprint JSON to the device", () => {
    expect(page).toMatch(/new Blob\(\[serializedWorkflow\], \{ type: "application\/json" \}\)/);
    expect(page).toMatch(/a\.download = /);
    expect(page).toContain("URL.createObjectURL(blob)");
    expect(page).toContain("URL.revokeObjectURL(url)");
    expect(page).toContain("handleExport");
  });

  it("the copy says where registry saves actually happen (Workflows → Builder)", () => {
    expect(page).toContain("Workflows → Builder");
  });

  it("the real workflows registry surface still exists and saves (sibling page + route)", () => {
    const sibling = read("src/lazy/portal.workflows.builder.page.tsx");
    expect(read("src/routes/portal.workflows.builder.tsx")).toContain(
      'createFileRoute("/portal/workflows/builder")'
    );
    expect(sibling).toContain('fetch("/api/data/workflows"');
    expect(sibling).toContain("to your workflow registry");
  });

  it("the built dist chunk carries no Deploy-Live literal", () => {
    const distAssets = join(REPO, "dist/assets");
    // dist is produced by the canonical build that precedes vitest; when it
    // is absent the scan is a no-op rather than a spurious failure.
    if (!existsSync(distAssets)) return;
    const offenders: string[] = [];
    for (const entry of readdirSync(distAssets)) {
      if (!/\.js$/.test(entry)) continue;
      const body = readFileSync(join(distAssets, entry), "utf8");
      if (/Deploy Live|deployLive/i.test(body)) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });
});

describe("CLEANUP (e): admin builder route and real workflows store stay fail-closed (live self-hosted server)", () => {
  const BASE_URL = testBaseUrl();
  beforeAll(async () => {
    await ensureTestServer();
  });

  it("anonymous /portal/admin/workflow-builder → 302 → /login (route still auth-gated)", async () => {
    const res = await fetch(`${BASE_URL}/portal/admin/workflow-builder`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("anonymous POST /api/data/workflows → 401 JSON (real store intact, never HTML)", async () => {
    const res = await fetch(`${BASE_URL}/api/data/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "probe", description: "probe", steps: [] }),
    });
    expect(res.status).toBe(401);
    const ct = res.headers.get("content-type") || "";
    expect(ct).toContain("application/json");
    expect(await res.text()).not.toMatch(/<html/i);
  });

  it("anonymous GET / → 200 HTML with no Deploy-Live copy", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/Deploy Live/i);
  });
});