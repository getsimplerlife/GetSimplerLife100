/**
 * SLICE 183 — the read-failure class, server side.
 *
 * THE DEFECT THIS PINS. The generic `/api/data/*` read (prod-server.ts) ended
 * its store read with:
 *
 *     } catch (e: any) { console.log("[SSR] FAILED url=" + url + …);
 *       return Response.json({ data: [] });        // ← 200, empty
 *     }
 *
 * A caller cannot tell `200 { data: [] }` apart from "you have no rows", so a
 * THROWN read was rendered by every downstream page as an empty workspace. The
 * catch now answers a non-2xx with the same `{ error }` shape every other
 * server failure uses.
 *
 * HOW THE THROW IS PRODUCED — deterministically, through the real route:
 * `readJSON` answers a missing file with `{}` and swallows a parse error, but a
 * file holding JSON `null` PARSES and is then dereferenced as `data[email]`.
 * That is a genuine throw on the read path, not a mocked one: this test seeds
 * `null` into a real file in the running server's data dir and calls the real
 * endpoint.
 *
 * BOTH HALVES ARE ASSERTED, because the fix must not turn "empty" into "broken":
 *   A. a read that throws is a non-2xx with an error body (never `{ data: [] }`);
 *   B. a store that is genuinely absent still answers 200 with an empty list;
 *   C. a readable store still answers its rows.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const DATA_DIR = testDataDir();
const PASSWORD = "slice-183-read-failure-pass";
const EMAIL = `slice183-${Date.now()}@example.test`;

/** A subPath no literal handler claims, so the GENERIC `/api/data/*` read serves
 *  it — `${DATA_DIR}/${PROBE}.json`. */
const PROBE = "slice183-probe";
const PROBE_FILE = join(DATA_DIR, `${PROBE}.json`);
const EMPTY_PROBE = "slice183-absent";

let cookie = "";

async function register(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/session=([^;]+)/);
  return m ? m[1] : "";
}

beforeAll(async () => {
  await ensureTestServer();
  cookie = await register();
  expect(cookie, "the probe tenant needs a real session — the route is authed").not.toBe("");
});

afterAll(() => {
  rmSync(PROBE_FILE, { force: true });
  rmSync(join(DATA_DIR, `${EMPTY_PROBE}.json`), { force: true });
});

describe("slice 183 — /api/data/* answers an honest non-2xx when the read throws", () => {
  it("A. a throwing store read is NOT `200 { data: [] }`", async () => {
    // JSON `null`: parses cleanly, then `data[user.email]` throws inside the
    // handler's try — the exact path the catch exists for.
    writeFileSync(PROBE_FILE, "null");

    const res = await fetch(`${BASE_URL}/api/data/${PROBE}`, {
      headers: { Cookie: `session=${cookie}` },
    });
    const body: any = await res.json().catch(() => null);

    expect(res.ok, "a failed read must not answer 2xx").toBe(false);
    expect(res.status, "a failed store read is a server-side failure").toBeGreaterThanOrEqual(500);
    expect(typeof body?.error, "the body carries the server's own sentence").toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // The lie this slice removes: an empty list standing in for a broken store.
    expect(Array.isArray(body?.data), "no `data` array may accompany a failed read").toBe(false);
  });

  it("B. a store that is genuinely absent still answers 200 with an empty list", async () => {
    rmSync(join(DATA_DIR, `${EMPTY_PROBE}.json`), { force: true });
    const res = await fetch(`${BASE_URL}/api/data/${EMPTY_PROBE}`, {
      headers: { Cookie: `session=${cookie}` },
    });
    const body: any = await res.json().catch(() => null);
    expect(res.status).toBe(200);
    expect(body?.data).toEqual([]);
    expect(body?.error).toBeUndefined();
  });

  it("C. a readable store still answers its rows", async () => {
    writeFileSync(PROBE_FILE, JSON.stringify({ [EMAIL]: [{ id: "row-183" }] }));
    const res = await fetch(`${BASE_URL}/api/data/${PROBE}`, {
      headers: { Cookie: `session=${cookie}` },
    });
    const body: any = await res.json().catch(() => null);
    expect(res.status).toBe(200);
    expect(body?.data).toEqual([{ id: "row-183" }]);
  });

  it("D. the route stays authed — an anonymous caller never reaches the store", async () => {
    writeFileSync(PROBE_FILE, "null");
    const res = await fetch(`${BASE_URL}/api/data/${PROBE}`, { redirect: "manual" });
    expect(res.status).toBe(401);
  });
});
