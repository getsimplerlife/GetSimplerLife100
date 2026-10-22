import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOwnerRole, isOwnerUser, LEGACY_OWNER_EMAIL } from "../lib/user-roles";
import { seedDataFiles } from "../lib/data-store";

/**
 * P1-5 role-based admin/owner gating.
 *
 * 1. The role claim helpers are the single decision point for every owner
 *    gate: "admin" (the seeded owner role) and "owner" (alias) → owner;
 *    anything else (registered customers = "user", no role) → NOT owner.
 * 2. seedDataFiles (the migration entrypoint) must promote the owner account
 *    to admin WITHOUT resetting a live password — removing the hardcoded
 *    email from gates must never silently lock the owner out or change their
 *    credentials (upgrade-in-place, create-if-missing, hash only for broken
 *    rows).
 */
const PRESERVED_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const PRESERVED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
afterEach(() => {
  if (PRESERVED_ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = PRESERVED_ADMIN_EMAIL;
  if (PRESERVED_ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = PRESERVED_ADMIN_PASSWORD;
});

function readUsers(dir: string): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, "users.json"), "utf8"));
}

describe("isOwnerRole / isOwnerUser (the single owner-gate decision)", () => {
  it("admin and owner are owner roles; user/undefined/empty are not", () => {
    expect(isOwnerRole("admin")).toBe(true);
    expect(isOwnerRole("owner")).toBe(true);
    expect(isOwnerRole("user")).toBe(false);
    expect(isOwnerRole(undefined)).toBe(false);
    expect(isOwnerRole(null)).toBe(false);
    expect(isOwnerRole("")).toBe(false);
    expect(isOwnerRole("Administrator")).toBe(false);
  });

  it("isOwnerUser mirrors the role decision on a user object", () => {
    expect(isOwnerUser({ email: "a@b.test", role: "admin" })).toBe(true);
    expect(isOwnerUser({ email: "a@b.test", role: "owner" })).toBe(true);
    expect(isOwnerUser({ email: "a@b.test", role: "user" })).toBe(false);
    expect(isOwnerUser({ email: "a@b.test" })).toBe(false); // pre-role row → NOT owner
    expect(isOwnerUser(null)).toBe(false);
    expect(isOwnerUser(undefined)).toBe(false);
  });

  it("LEGACY_OWNER_EMAIL is only a seed default — never a gate", () => {
    // The literal may exist ONLY as the migration seed default (ADMIN_EMAIL
    // fallback); every access decision must go through isOwnerUser.
    expect(LEGACY_OWNER_EMAIL).toMatch(/@/);
    expect(isOwnerUser({ email: LEGACY_OWNER_EMAIL })).toBe(false);
    expect(isOwnerUser({ email: LEGACY_OWNER_EMAIL, role: "admin" })).toBe(true);
  });
});

describe("seedDataFiles owner migration (upgrade-in-place, never locks owner out)", () => {
  const dirs: string[] = [];
  function freshDir(): string {
    const d = mkdtempSync(join(tmpdir(), "p15-roles-"));
    dirs.push(d);
    return d;
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("creates the admin owner when no admin exists", () => {
    const dir = freshDir();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    seedDataFiles(dir);
    const users = readUsers(dir);
    const owner = users[LEGACY_OWNER_EMAIL];
    expect(owner).toBeTruthy();
    expect(owner.role).toBe("admin");
    expect(typeof owner.password).toBe("string");
    expect(owner.password.length).toBeGreaterThan(10); // hashed, not plaintext
  });

  it("promotes an EXISTING owner account (pre-roles row) to admin WITHOUT resetting its password", () => {
    const dir = freshDir();
    delete process.env.ADMIN_EMAIL;
    // The owner registered before roles existed: row exists, no role, live hash.
    const existingHash = "$2b$10$fakelonghashstringthatshouldneverbetouched";
    const users: Record<string, any> = {
      [LEGACY_OWNER_EMAIL]: { email: LEGACY_OWNER_EMAIL, password: existingHash, createdAt: 111 },
      "customer@example.test": { email: "customer@example.test", password: "hash", role: "user", createdAt: 222 },
    };
    writeFileSync(join(dir, "users.json"), JSON.stringify(users));
    seedDataFiles(dir);
    const migrated = readUsers(dir);
    // Promoted in place; the live password hash is UNTOUCHED.
    expect(migrated[LEGACY_OWNER_EMAIL].role).toBe("admin");
    expect(migrated[LEGACY_OWNER_EMAIL].password).toBe(existingHash);
    expect(migrated[LEGACY_OWNER_EMAIL].createdAt).toBe(111);
    // The customer with an explicit "user" role is left alone (no admin).
    expect(migrated["customer@example.test"].role).toBe("user");
  });

  it("keeps isOwnerUser true after migration for the promoted owner", () => {
    const dir = freshDir();
    delete process.env.ADMIN_EMAIL;
    writeFileSync(join(dir, "users.json"), JSON.stringify({ [LEGACY_OWNER_EMAIL]: { email: LEGACY_OWNER_EMAIL, password: "x", createdAt: 1 } }));
    seedDataFiles(dir);
    const row = readUsers(dir)[LEGACY_OWNER_EMAIL];
    expect(isOwnerUser(row)).toBe(true);
  });
});