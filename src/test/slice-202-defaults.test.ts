/**
 * slice-202-defaults.test.ts — the two production defaults that were wrong.
 *
 * Both defects are about what the product does when an environment variable is
 * ABSENT, and in this deployment `SITE_ORIGIN`, `EXTRA_ALLOWED_ORIGINS`,
 * `ADMIN_EMAIL` and `ADMIN_PASSWORD` are all empty — so the code's fallbacks are
 * what actually runs.
 *
 * A. `seedDataFiles` used to be `process.env.ADMIN_PASSWORD || "<literal>"`.
 *    Any deployment that booted without ADMIN_PASSWORD created the owner account
 *    with a password printed in this repository. A boot must never install a
 *    known password. Now a random one is generated, written once to a 0600 file
 *    the operator can read, and a seed with no readable password is REFUSED.
 *
 * B. `ctonew.app` was the default host in customer-facing places: the sitemap
 *    (every <loc>), robots.txt, og:url, SITE_URL, the invoice and proposal share
 *    links EMAILED TO THE TENANT'S OWN CLIENT, the default From address, the lead
 *    email's pricing link. A customer's client must never receive a link to a
 *    host the owner does not control.
 *
 * The guards below match the CALL, not the prose about the call: TypeScript
 * sources are scanned with comments stripped, so a comment that mentions the old
 * host (this file's own subject) can never fail — or satisfy — the guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareSync } from "bcryptjs";

import {
  ADMIN_INITIAL_PASSWORD_FILE,
  generateAdminPassword,
  readJSON,
  resolveInitialAdminPassword,
  seedDataFiles,
} from "../lib/data-store";
import { LEGACY_OWNER_EMAIL, isOwnerRole } from "../lib/user-roles";
import { DEFAULT_ALLOWED_HOSTS, checkSameOrigin } from "../lib/same-origin";
import { SITE_URL } from "../lib/site-meta";
import { invoiceShareUrl } from "../native/invoice/delivery";
import { proposalShareUrl } from "../native/proposals/delivery";

/** The owner's real domain — the ONLY host our customer-facing links may use. */
const OWNER_ORIGIN = "https://www.simplerlife100.com";
/** The platform hostname that used to be the default everywhere. */
const OLD_HOST = "ctonew.app";

const REPO_ROOT = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..");

function readRepo(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}

/**
 * Remove `//` line comments and `/* … *\/` block comments. Guards must pin the
 * CODE; a comment mentioning the old hostname must neither fail nor satisfy them.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");
}

// ── A. the seeded admin password is never a published literal ────────────────

describe("A — a boot never installs a known admin password", () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slice-202-"));
    savedEnv.ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    savedEnv.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  afterEach(() => {
    if (savedEnv.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = savedEnv.ADMIN_EMAIL;
    if (savedEnv.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = savedEnv.ADMIN_PASSWORD;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function usersFile(): Record<string, any> {
    return JSON.parse(readFileSync(join(dir, "users.json"), "utf-8"));
  }
  /** The last non-comment line of the operator file — the password that is live. */
  function recordedPassword(): string {
    const lines = readFileSync(join(dir, ADMIN_INITIAL_PASSWORD_FILE), "utf-8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));
    return lines[lines.length - 1];
  }

  it("seeds the owner with a RANDOM password and records it in a 0600 file", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDataFiles(dir);

    const owner = usersFile()[LEGACY_OWNER_EMAIL];
    expect(owner).toBeTruthy();
    expect(isOwnerRole(owner.role)).toBe(true);

    const password = recordedPassword();
    expect(password).toBeTruthy();
    // Not a repository literal: 32 base64url chars from 24 random bytes.
    expect(password).not.toBe("Mdsl1234");
    expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // The file's value IS the password the seeded hash verifies.
    expect(compareSync(password, owner.password)).toBe(true);
    // Operator-readable by its owner only.
    expect(statSync(join(dir, ADMIN_INITIAL_PASSWORD_FILE)).mode & 0o777).toBe(0o600);
    // Loud, and it names the file — never the value.
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("admin_password_generated");
    expect(logged).toContain(ADMIN_INITIAL_PASSWORD_FILE);
    expect(logged).not.toContain(password);
  });

  it("never returns the plaintext password through the store (only a bcrypt hash)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDataFiles(dir);
    const password = recordedPassword();
    const bytes = readFileSync(join(dir, "users.json"), "utf-8");
    expect(bytes).not.toContain(password);
    expect(JSON.stringify(readJSON(join(dir, "users.json")))).not.toContain(password);
    expect(usersFile()[LEGACY_OWNER_EMAIL].password.startsWith("$2")).toBe(true);
  });

  it("APPENDS on a re-seed — the only live copy is never overwritten", () => {
    const first = resolveInitialAdminPassword(dir, LEGACY_OWNER_EMAIL);
    const second = resolveInitialAdminPassword(dir, LEGACY_OWNER_EMAIL);
    expect(first.ok && second.ok).toBe(true);
    const body = readFileSync(join(dir, ADMIN_INITIAL_PASSWORD_FILE), "utf-8");
    expect(body).toContain(first.ok ? first.password : "x");
    expect(body).toContain(second.ok ? second.password : "y");
  });

  it("FAILS CLOSED when the password file cannot be written — no admin is seeded", () => {
    // A directory where the file must go: appendFileSync throws EISDIR, which
    // holds even when the suite runs as root (a chmod would not).
    mkdirSync(join(dir, ADMIN_INITIAL_PASSWORD_FILE));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    seedDataFiles(dir);

    const users = existsSync(join(dir, "users.json")) ? usersFile() : {};
    const admins = Object.values(users).filter((u: any) => u && isOwnerRole(u.role));
    expect(admins).toEqual([]);
    const logged = error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("admin_seed_refused");
  });

  it("still honours ADMIN_PASSWORD when the operator sets one (no file, no generation)", () => {
    process.env.ADMIN_PASSWORD = "operator-chosen-pass-123";
    seedDataFiles(dir);
    expect(compareSync("operator-chosen-pass-123", usersFile()[LEGACY_OWNER_EMAIL].password)).toBe(true);
    expect(existsSync(join(dir, ADMIN_INITIAL_PASSWORD_FILE))).toBe(false);
  });

  it("a generated password is not a value a reader of the repo could know", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateAdminPassword());
    expect(seen.size).toBe(200);
    // The old literal, and any other published password, is not what we produce.
    expect(seen.has("Mdsl1234")).toBe(false);
    for (const p of seen) expect(p.length).toBeGreaterThanOrEqual(32);
  });

  it("the seed source carries no literal fallback for ADMIN_PASSWORD", () => {
    const src = stripComments(readRepo("src/lib/data-store.ts"));
    // The call itself: `process.env.ADMIN_PASSWORD || "<something>"`. An empty
    // string fallback is fine (the code then GENERATES one) — a fallback with
    // any content is a published password.
    expect(src).not.toMatch(/process\.env\.ADMIN_PASSWORD\s*\|\|\s*["'`][^"'`]+["'`]/);
    expect(src).not.toContain("Mdsl1234");
    // Positive control: the same file really does read the variable.
    expect(src).toMatch(/process\.env\.ADMIN_PASSWORD/);
  });
});

// ── B. no customer-facing default points at a host the owner does not own ────

describe("B — the default host is the owner's domain", () => {
  /**
   * Every file whose default or emitted link a customer, a client or a search
   * engine can see. `src/lib/same-origin.ts` is NOT here: it deliberately keeps
   * the platform host as an ALLOWED origin (our own pages have been served from
   * it) and is asserted positively below.
   */
  const CUSTOMER_FACING = [
    "public/sitemap.xml",
    "public/robots.txt",
    "src/routes/__root.tsx",
    "src/lib/site-meta.ts",
    "src/native/invoice/delivery.ts",
    "src/native/proposals/delivery.ts",
    "src/integrations/email.ts",
    "src/lib/lead-email.ts",
    "src/lib/purchase-sales-events.ts",
  ];

  for (const rel of CUSTOMER_FACING) {
    it(`${rel} does not name ${OLD_HOST}`, () => {
      const raw = readRepo(rel);
      const scanned = rel.endsWith(".ts") || rel.endsWith(".tsx") ? stripComments(raw) : raw;
      expect(scanned).not.toContain(OLD_HOST);
      // Positive control: the guard is looking at a file that has content.
      expect(scanned.length).toBeGreaterThan(20);
    });
  }

  it("the sitemap advertises only the owner's domain", () => {
    const xml = readRepo("public/sitemap.xml");
    expect(xml).not.toContain(OLD_HOST);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(20);
    for (const loc of locs) {
      // Absolute, https, on the owner's domain, and a path of its own.
      expect(loc).toMatch(/^https:\/\/www\.simplerlife100\.com\//);
      expect(loc.startsWith(OWNER_ORIGIN)).toBe(true);
    }
  });

  it("robots.txt points at the sitemap on the owner's domain", () => {
    const txt = readRepo("public/robots.txt");
    expect(txt).not.toContain(OLD_HOST);
    expect(txt).toContain(`Sitemap: ${OWNER_ORIGIN}/sitemap.xml`);
  });

  it("SITE_URL — the og:url / canonical base — is the owner's domain", () => {
    expect(SITE_URL).toBe(OWNER_ORIGIN);
  });

  it("the invoice share link emailed to the tenant's client is on the owner's domain", () => {
    const saved = process.env.SITE_ORIGIN;
    delete process.env.SITE_ORIGIN;
    try {
      const url = invoiceShareUrl("abc123");
      expect(url).toBe(`${OWNER_ORIGIN}/invoices/share/abc123`);
      expect(url).not.toContain(OLD_HOST);
    } finally {
      if (saved !== undefined) process.env.SITE_ORIGIN = saved;
    }
  });

  it("the proposal share link emailed to the tenant's client is on the owner's domain", () => {
    const saved = process.env.SITE_ORIGIN;
    delete process.env.SITE_ORIGIN;
    try {
      const url = proposalShareUrl("abc123");
      expect(url).toBe(`${OWNER_ORIGIN}/proposals/share/abc123`);
      expect(url).not.toContain(OLD_HOST);
    } finally {
      if (saved !== undefined) process.env.SITE_ORIGIN = saved;
    }
  });

  it("SITE_ORIGIN still wins when a deployment sets it", () => {
    const saved = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = "https://preview.example.test/";
    try {
      expect(invoiceShareUrl("x")).toBe("https://preview.example.test/invoices/share/x");
      expect(proposalShareUrl("x")).toBe("https://preview.example.test/proposals/share/x");
    } finally {
      if (saved === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = saved;
    }
  });

  it("the same-origin allow-list knows the owner's domain", () => {
    expect(DEFAULT_ALLOWED_HOSTS).toContain("simplerlife100.com");
    expect(DEFAULT_ALLOWED_HOSTS).toContain("www.simplerlife100.com");
    // The real refusal this fixes: a browser on the owner's site, behind an edge
    // that rewrote Host, used to be refused by our own check.
    const result = checkSameOrigin({
      origin: OWNER_ORIGIN,
      host: "ip-10-110-111-6.us-west-2.prod.aws.beamlit.net",
    });
    expect(result.ok).toBe(true);
  });
});
