// @vitest-environment node
/**
 * static-asset-serving.test.ts — an asset the page shows must actually be
 * served by the real server.
 *
 * THE DEFECT (found while finishing slice 157, before it was published): the
 * new homepage hero shows a real screenshot of our own portal, stored at
 * `public/product/portal-quote-to-cash.png`. The file was committed, it built
 * into `dist/product/`, and every unit assertion about it passed — correct PNG
 * magic, 96 KB, real pixel dimensions matching the `<img>` attributes.
 *
 * And the live page still showed the alt text in a broken box, because
 * `prod-server.ts` keeps an allowlist of static path prefixes and `/product/`
 * was not on it. The server answered 404 for the picture the whole design hangs
 * on.
 *
 * The lesson this file encodes: "the file exists in the repo" and "the page
 * shows it" are different claims, and only the second one is what a customer
 * sees. So this test does not read the file from disk — it asks the running
 * server for the URL, exactly as a browser would, and checks the bytes that come
 * back.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();
const REPO = process.cwd(); // vitest runs from the repo root

/** Every static asset a page actually references, with the file it must match. */
const SERVED_ASSETS = [
  { url: "/product/portal-quote-to-cash.png", file: "public/product/portal-quote-to-cash.png", type: "image/png" },
  { url: "/manifest.json", file: "public/manifest.json", type: "application/json" },
  { url: "/robots.txt", file: "public/robots.txt", type: "text/plain" },
] as const;

beforeAll(async () => {
  await ensureTestServer();
}, 180_000);

describe("157 — a static asset the page references is served by the real server", () => {
  for (const asset of SERVED_ASSETS) {
    it(`GET ${asset.url} → 200 with the bytes that are in ${asset.file}`, async () => {
      const res = await fetch(`${BASE_URL}${asset.url}`, { redirect: "manual" });
      // 200, not 404 and not the SPA shell — the page's image is not a page.
      expect(res.status, `${asset.url} must be served, not 404'd`).toBe(200);
      const ct = res.headers.get("content-type") || "";
      expect(ct).toContain(asset.type);
      const body = new Uint8Array(await res.arrayBuffer());
      const onDisk = readFileSync(join(REPO, asset.file));
      // Byte-for-byte: a stale or truncated copy is still a broken picture.
      expect(body.length, `${asset.url} served ${body.length} bytes`).toBe(onDisk.length);
      expect(Buffer.from(body).equals(onDisk)).toBe(true);
    });
  }

  it("the homepage hero image is one of them, and the extension is what the server type-checks", async () => {
    const res = await fetch(`${BASE_URL}/product/portal-quote-to-cash.png`, { redirect: "manual" });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Real PNG magic — proves this is the screenshot, not an HTML error page
    // that happens to answer 200 somewhere upstream.
    expect(Buffer.from(bytes.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.length).toBeGreaterThan(20_000);
  });

  it("a file that does not exist under an allowed prefix is still a 404, never a fake 200", async () => {
    const res = await fetch(`${BASE_URL}/product/definitely-not-a-shot-157.png`, { redirect: "manual" });
    expect(res.status).toBe(404);
  });
});
