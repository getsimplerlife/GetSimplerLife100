import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { PAGE_VIEW_FILE_NAME } from "../lib/page-views";

/**
 * SLICE 160 — the counter file lands inside the CONFIGURED DATA_DIR of the
 * RUNNING server, proved through the running server's own report.
 *
 * THE FAILURE THIS FILE EXISTS TO CATCH: slice 159 shipped, the lead hit the
 * live site with real page GETs, and no `page_views.json` appeared in the data
 * directory the team was watching. Every unit test was green, because every unit
 * test recomputed the path in the test process. The one thing nobody checked was
 * what the DEPLOYED process actually resolved: it derives DATA_DIR from its own
 * location, so a deployment whose tree is not shaped like this host can write
 * somewhere else entirely — or inside the tree a publish replaces.
 *
 * So this test never recomputes the path. It asks the running server where it is
 * writing (`location` on the owner-only summary, slice 160) and then asserts:
 *   1. the reported file is the counter file inside the configured DATA_DIR,
 *   2. that file really exists on disk after a real HTML page GET,
 *   3. nothing was written to a `<server base>/.data` — the in-tree location a
 *      publish can discard.
 * If a future change makes the server write anywhere other than DATA_DIR, this
 * goes red on the deploy as well as in the suite.
 */
const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-pv160-" + TS;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HUMAN_PATH = "/pricing";

interface CounterLocation {
  dataDir: string;
  counterFile: string;
  insidePublishTree: boolean;
  dirExists: boolean;
  fileExists: boolean;
  bytes: number | null;
  lastWriteAt: string | null;
  writable: boolean;
}

interface Summary {
  totalViews: number;
  topPaths: { path: string; views: number }[];
  hasAnyData: boolean;
  writeHealth: { ok: boolean; failingSince: string | null; lastError: string | null };
  location: CounterLocation;
}

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/** Ensure the owner user exists and seed a session token for it (as 159 does). */
function seedOwnerSession(): string {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const users = readJSONFile(usersFile);
  if (!users[OWNER_EMAIL]) {
    users[OWNER_EMAIL] = { email: OWNER_EMAIL, role: "admin", createdAt: Date.now() };
  }
  writeFileSync(usersFile, JSON.stringify(users, null, 2));
  const sessions = readJSONFile(sessionsFile);
  sessions[OWNER_TOKEN] = { email: OWNER_EMAIL, createdAt: Date.now() };
  writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
  return OWNER_TOKEN;
}

async function ownerSummary(cookie?: string): Promise<{ status: number; body: Summary | null }> {
  const res = await fetch(`${BASE_URL}/api/admin/page-views`, {
    headers: cookie ? { Cookie: `session=${cookie}` } : {},
  });
  let body: Summary | null = null;
  try {
    body = (await res.json()) as Summary;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function pageGet(path: string) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "manual",
  });
}

describe("the running server writes the counter inside its configured DATA_DIR (slice 160)", () => {
  let cookie = "";

  beforeAll(async () => {
    await ensureTestServer();
    cookie = seedOwnerSession();
  }, 90_000);

  it("is still owner-only: 401 unsigned", async () => {
    const { status } = await ownerSummary();
    expect(status).toBe(401);
  });

  it("reports a counter file that is the counter file inside the configured DATA_DIR", async () => {
    const { status, body } = await ownerSummary(cookie);
    expect(status).toBe(200);
    expect(body).toBeTruthy();
    const loc = body!.location;
    expect(loc).toBeTruthy();

    // The exact file: <DATA_DIR>/page_views.json — not a path recomputed here.
    expect(loc.dataDir).toBe(TEST_DATA_DIR);
    expect(loc.counterFile).toBe(join(TEST_DATA_DIR, PAGE_VIEW_FILE_NAME));
    expect(loc.counterFile.startsWith(TEST_DATA_DIR)).toBe(true);

    // And that location is durable: outside the tree a publish replaces.
    expect(loc.insidePublishTree).toBe(false);
    expect(loc.writable).toBe(true);
  });

  it("writes a real file at the reported path after a real page GET", async () => {
    const before = await ownerSummary(cookie);
    expect(before.status).toBe(200);
    const counterFile = before.body!.location.counterFile;

    const res = await pageGet(HUMAN_PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");

    // Coalesced flush: at most one write per second, plus a 1.5s background tick.
    await new Promise((r) => setTimeout(r, 2300));

    // 1. The file the server TOLD us about is the file on disk.
    expect(existsSync(counterFile)).toBe(true);
    const doc = JSON.parse(readFileSync(counterFile, "utf-8"));
    const today = new Date().toISOString().slice(0, 10);
    expect(doc.days?.[today]?.[HUMAN_PATH] ?? 0).toBeGreaterThanOrEqual(1);

    // 2. And the server now reports it present, with bytes on disk.
    const after = await ownerSummary(cookie);
    expect(after.status).toBe(200);
    expect(after.body!.location.counterFile).toBe(counterFile);
    expect(after.body!.location.fileExists).toBe(true);
    expect(after.body!.location.bytes ?? 0).toBeGreaterThan(0);
    expect(after.body!.writeHealth.ok).toBe(true);
  });

  it("writes nothing to an in-tree <server base>/.data (the location a publish discards)", async () => {
    // The server's own code directory is the worktree root it was spawned from.
    const inTree = join(process.cwd(), ".data", PAGE_VIEW_FILE_NAME);
    expect(existsSync(inTree)).toBe(false);

    const { body } = await ownerSummary(cookie);
    expect(body!.location.counterFile).not.toBe(inTree);
  });
});
