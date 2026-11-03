/**
 * slice-189-client-project-spine.test.ts — the client + project spine, over the
 * wire.
 *
 * WHY THIS FILE EXISTS. Before slice 189 the product had no client record and
 * no project record: `/portal/clients/123` was a bare 404 and 37 of the 67
 * partial capabilities had nothing to hang off. This slice adds the two
 * entities, so these tests are deliberately WIRE-LEVEL — they import nothing
 * from the pages and nothing from the route files, and every assertion is
 * derived from the system of record (the HTTP response, the read path, or the
 * JSON file the server wrote). Run against the previous commit, every one of
 * them fails on a 404 from the generic `/api/data/:table` fallback.
 *
 * WHAT IS PINNED, AND WHY EACH ONE MATTERS:
 *   1. auth first — an unauthenticated read AND write are refused (401), so a
 *      customer list is never anonymous;
 *   2. a created client is readable back through the read path AND present in
 *      the store on disk, keyed by the tenant — a write that answers 201 and
 *      stores nothing is the slice-184 defect class;
 *   3. tenant isolation — one tenant's client is invisible to another;
 *   4. a project cannot be created against a client id that does not exist,
 *      and nothing is written when it is refused (an orphan project is exactly
 *      what this spine exists to prevent);
 *   5. a read that FAILS answers `{ error }` with a non-2xx status, never
 *      `{ data: [] }` — a page cannot tell an empty workspace from a broken
 *      store, so the server must not blur them (slice 183's rule);
 *   6. a corrupt store is neither read as empty nor overwritten by a write
 *      (writers never delete rows they did not write).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const DATA_DIR = testDataDir();
const CLIENTS_FILE = join(DATA_DIR, "tenant_clients.json");
const PROJECTS_FILE = join(DATA_DIR, "tenant_projects.json");

const TS = Date.now();
const PASSWORD = "slice-189-pass";
const OWNER_EMAIL = `slice189-owner@${TS}.test`;
const OTHER_EMAIL = `slice189-other@${TS}.test`;

function readStore(path: string): any {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return "UNPARSEABLE";
  }
}

async function register(email: string): Promise<string> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  if (!m) throw new Error(`could not obtain a session for ${email} (register ${reg.status})`);
  return m[1] as string;
}

async function call(
  method: "GET" | "POST",
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: `session=${cookie}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

let owner = "";
let other = "";

describe("slice 189 — the client + project spine over the wire", () => {
  beforeAll(async () => {
    await ensureTestServer();
    owner = await register(OWNER_EMAIL);
    other = await register(OTHER_EMAIL);
  }, 60_000);

  afterAll(() => {
    /* the test-env watchdog tears the server down */
  });

  it("refuses an anonymous read and an anonymous write (401, not an empty list)", async () => {
    const read = await call("GET", "/api/data/clients");
    expect(read.status).toBe(401);
    expect(read.json?.data).toBeUndefined();

    const write = await call("POST", "/api/data/clients", undefined, { name: "Anonymous Ltd" });
    expect(write.status).toBe(401);
    expect(write.json?.data).toBeUndefined();
  });

  it("creates a client, reads it back, and finds it in the store under this tenant", async () => {
    const created = await call("POST", "/api/data/clients", owner, {
      name: "Acme Testing Ltd",
      contactName: "Dana Reed",
      email: "dana@acme.test",
      phone: "+1 555 0100",
      status: "active",
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const client = created.json?.data;
    expect(client?.id, "a created client must carry a stable id").toBeTruthy();
    expect(client?.name).toBe("Acme Testing Ltd");
    expect(client?.status).toBe("active");
    expect(client?.createdAt).toBeTruthy();

    // The READ PATH is the proof, not the write's echo.
    const list = await call("GET", "/api/data/clients", owner);
    expect(list.status).toBe(200);
    const ids = (list.json?.data || []).map((c: any) => c.id);
    expect(ids).toContain(client.id);

    // …and the store on disk really holds it, keyed by the tenant.
    const store = readStore(CLIENTS_FILE);
    expect(store, "the clients store must be a tenant map, not a bare array").not.toBe("UNPARSEABLE");
    expect(Array.isArray(store)).toBe(false);
    const rows = store?.[OWNER_EMAIL] || [];
    expect(rows.map((r: any) => r.id)).toContain(client.id);

    // The single-row read is the route /portal/clients/$clientId uses.
    const one = await call("GET", `/api/data/clients/${client.id}`, owner);
    expect(one.status).toBe(200);
    expect(one.json?.data?.name).toBe("Acme Testing Ltd");

    // A client id that does not exist is a 404 with a sentence, not an empty object.
    const missing = await call("GET", `/api/data/clients/does-not-exist-${TS}`, owner);
    expect(missing.status).toBe(404);
    expect(missing.json?.error).toBeTruthy();
  });

  it("does not leak one tenant's client to another tenant", async () => {
    const mine = await call("GET", "/api/data/clients", owner);
    const theirs = await call("GET", "/api/data/clients", other);
    expect(theirs.status).toBe(200);
    const myIds = new Set((mine.json?.data || []).map((c: any) => c.id));
    expect(myIds.size).toBeGreaterThan(0);
    for (const row of theirs.json?.data || []) {
      expect(myIds.has(row.id), "a client id crossed tenants").toBe(false);
    }
    // And the single-row read is scoped too.
    const firstId = [...myIds][0] as string;
    const crossRead = await call("GET", `/api/data/clients/${firstId}`, other);
    expect(crossRead.status).toBe(404);
    expect(crossRead.json?.data).toBeUndefined();
  });

  it("refuses a project against a client id that does not exist, and writes nothing", async () => {
    const before = JSON.stringify(readStore(PROJECTS_FILE));
    const refused = await call("POST", "/api/data/projects", owner, {
      name: "Orphan project",
      clientId: `no-such-client-${TS}`,
      status: "planned",
    });
    expect(refused.status).toBe(400);
    expect(refused.json?.error).toBeTruthy();
    expect(refused.json?.data).toBeUndefined();
    expect(JSON.stringify(readStore(PROJECTS_FILE)), "a refused write must not touch the store").toBe(before);
  });

  it("refuses a project against ANOTHER tenant's client id", async () => {
    const mine = await call("GET", "/api/data/clients", owner);
    const foreignId = (mine.json?.data || [])[0]?.id as string;
    expect(foreignId).toBeTruthy();
    const refused = await call("POST", "/api/data/projects", other, {
      name: "Borrowed client",
      clientId: foreignId,
    });
    expect(refused.status).toBe(400);
    expect(refused.json?.error).toBeTruthy();
  });

  it("creates a project for a client it owns, readable by id and filterable by clientId", async () => {
    const clients = await call("GET", "/api/data/clients", owner);
    const clientId = (clients.json?.data || [])[0]?.id as string;
    expect(clientId).toBeTruthy();

    const created = await call("POST", "/api/data/projects", owner, {
      name: "Q4 onboarding rollout",
      clientId,
      status: "active",
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const project = created.json?.data;
    expect(project?.id).toBeTruthy();
    expect(project?.clientId).toBe(clientId);
    expect(project?.status).toBe("active");

    const one = await call("GET", `/api/data/projects/${project.id}`, owner);
    expect(one.status).toBe(200);
    expect(one.json?.data?.name).toBe("Q4 onboarding rollout");

    const filtered = await call("GET", `/api/data/projects?clientId=${encodeURIComponent(clientId)}`, owner);
    expect(filtered.status).toBe(200);
    expect((filtered.json?.data || []).map((p: any) => p.id)).toContain(project.id);

    const store = readStore(PROJECTS_FILE);
    expect(Array.isArray(store)).toBe(false);
    expect((store?.[OWNER_EMAIL] || []).map((p: any) => p.id)).toContain(project.id);
  });

  it("validates input instead of storing a lie", async () => {
    const noName = await call("POST", "/api/data/clients", owner, { name: "   " });
    expect(noName.status).toBe(400);
    expect(noName.json?.error).toBeTruthy();

    const badStatus = await call("POST", "/api/data/clients", owner, { name: "Status Co", status: "not-a-status" });
    expect(badStatus.status).toBe(400);
    expect(badStatus.json?.error).toBeTruthy();

    const badEmail = await call("POST", "/api/data/clients", owner, { name: "Email Co", email: "not-an-address" });
    expect(badEmail.status).toBe(400);

    const projectNoClient = await call("POST", "/api/data/projects", owner, { name: "No client" });
    expect(projectNoClient.status).toBe(400);
    expect(projectNoClient.json?.error).toBeTruthy();
  });

  // LAST, because it damages the store on purpose. The original bytes are
  // restored in a finally block so the rest of the suite sees a clean tree.
  it("a store that does not parse answers an error, and a write never overwrites it", async () => {
    const original = existsSync(CLIENTS_FILE) ? readFileSync(CLIENTS_FILE) : null;
    const CORRUPT = '{ "someone@else.test": [ { "id": "row-we-must-not-lose" } '; // truncated JSON
    try {
      writeFileSync(CLIENTS_FILE, CORRUPT);

      const read = await call("GET", "/api/data/clients", owner);
      expect(read.status, "a corrupt store is not an empty workspace").toBe(500);
      expect(read.json?.error).toBeTruthy();
      expect(read.json?.data, "a failed read must not answer an empty array").toBeUndefined();

      const write = await call("POST", "/api/data/clients", owner, { name: "Written over corruption" });
      expect(write.status).toBe(500);
      expect(write.json?.error).toBeTruthy();
      expect(readFileSync(CLIENTS_FILE, "utf-8"), "a write must never overwrite a store it could not read").toBe(
        CORRUPT,
      );
    } finally {
      if (original) writeFileSync(CLIENTS_FILE, original);
    }
  });
});
