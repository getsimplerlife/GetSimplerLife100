/**
 * integration-key-fail-closed-173.test.ts — SLICE 173, defect W6.
 *
 * Before this slice both encrypted-secret stores (native/webhooks/store.ts and
 * native/transport/store.ts) did:
 *
 *     cachedKey = Buffer.from(env.length >= 32 ? env.slice(0, 32)
 *                                              : randomBytes(32).toString("hex").slice(0, 32));
 *
 * So with INTEGRATION_ENCRYPTION_KEY unset — which is the state of the running
 * process on this box (length 0) — every stored secret was encrypted under a
 * per-process THROWAWAY key and became unreadable on the next restart, with no
 * error anywhere. That is silent data loss on live data, not a latent bug.
 *
 * The contract proven here:
 *   1. encrypt REFUSES (throws, naming INTEGRATION_ENCRYPTION_KEY) when the
 *      variable is unset or shorter than 32 characters,
 *   2. decrypt REFUSES for the same reason,
 *   3. no per-process fallback exists: ciphertext written by one module
 *      instance is readable by a fresh one (the restart), and
 *   4. ciphertext that WAS written under a throwaway key says so instead of
 *      pretending it is readable,
 *   5. the API surfaces the refusal as an honest 503 and stores nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptSecret, decryptSecret, listSinksForTenant } from "../native/webhooks/store";
import * as transportStore from "../native/transport/store";
import { listSubscriptions } from "../native/webhooks/store";
import { handleNativeAuthed } from "../native/webhooks/routes";

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";
const VALID_KEY = "slice173-test-key-0123456789abcdef-xyz"; // 39 chars
const SHORT_KEY = "slice173-short-key-0123456789ab"; // 31 chars
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env[KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = savedKey;
  vi.resetModules();
});

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), `slice173-key-${process.pid}-`));
}

describe("W6 — refuse to mint a throwaway encryption key (webhook store)", () => {
  it("refuses to ENCRYPT when INTEGRATION_ENCRYPTION_KEY is unset, naming the variable", () => {
    delete process.env[KEY_ENV];
    expect(() => encryptSecret("a-real-tenant-secret")).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("refuses to ENCRYPT when the key is shorter than 32 characters, naming the variable", () => {
    process.env[KEY_ENV] = SHORT_KEY;
    expect(() => encryptSecret("a-real-tenant-secret")).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("refuses to DECRYPT when INTEGRATION_ENCRYPTION_KEY is unset, naming the variable", () => {
    process.env[KEY_ENV] = VALID_KEY;
    const ciphertext = encryptSecret("a-real-tenant-secret");
    delete process.env[KEY_ENV];
    expect(() => decryptSecret(ciphertext)).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("still round-trips when a real key is configured (the happy path is unchanged)", () => {
    process.env[KEY_ENV] = VALID_KEY;
    expect(decryptSecret(encryptSecret("a-real-tenant-secret"))).toBe("a-real-tenant-secret");
  });

  it("a secret written under the configured key survives a restart (no per-process key)", async () => {
    process.env[KEY_ENV] = VALID_KEY;
    vi.resetModules();
    const beforeRestart = await import("../native/webhooks/store");
    const ciphertext = beforeRestart.encryptSecret("survives-a-restart");
    // A restart = a brand-new module instance (the old code generated its key
    // at first use inside the module, so this is exactly what a restart did).
    vi.resetModules();
    const afterRestart = await import("../native/webhooks/store");
    expect(afterRestart.decryptSecret(ciphertext)).toBe("survives-a-restart");
  });

  it("says ciphertext was written under a throwaway key instead of pretending it is readable", () => {
    process.env[KEY_ENV] = VALID_KEY;
    // Exactly what the pre-173 code wrote when the env var was missing.
    const throwaway = randomBytes(32).toString("hex").slice(0, 32);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(throwaway), iv);
    let enc = cipher.update("lost-forever", "utf8", "hex");
    enc += cipher.final("hex");
    const orphaned = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
    expect(() => decryptSecret(orphaned)).toThrow(/throwaway key/i);
  });
});

describe("W6 — refuse to mint a throwaway encryption key (transport store)", () => {
  it("refuses to ENCRYPT when the key is unset, naming the variable", () => {
    delete process.env[KEY_ENV];
    expect(() => transportStore.encryptSecret("sftp-password")).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("refuses to DECRYPT when the key is unset, naming the variable", () => {
    process.env[KEY_ENV] = VALID_KEY;
    const ciphertext = transportStore.encryptSecret("sftp-password");
    delete process.env[KEY_ENV];
    expect(() => transportStore.decryptSecret(ciphertext)).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("round-trips under a configured key", () => {
    process.env[KEY_ENV] = VALID_KEY;
    expect(transportStore.decryptSecret(transportStore.encryptSecret("sftp-password"))).toBe("sftp-password");
  });
});

describe("W6 — the API refuses honestly and stores nothing", () => {
  const ctx = (dataDir: string) => ({ userEmail: "tenant@example.com", dataDir });

  it("POST /api/native/webhook-sinks → 503 naming the variable, and no sink is stored", async () => {
    delete process.env[KEY_ENV];
    const dataDir = freshDir();
    const res = await handleNativeAuthed(
      new Request("http://x/api/native/webhook-sinks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventTypes: ["native.sales.lead.created"] }),
      }),
      ctx(dataDir),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/INTEGRATION_ENCRYPTION_KEY/);
    expect(listSinksForTenant(dataDir, "tenant@example.com")).toHaveLength(0);
  });

  it("POST /api/native/webhook-subscriptions → 503 naming the variable, and nothing is stored", async () => {
    delete process.env[KEY_ENV];
    const dataDir = freshDir();
    const res = await handleNativeAuthed(
      new Request("http://x/api/native/webhook-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example.com/hook" }),
      }),
      ctx(dataDir),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/INTEGRATION_ENCRYPTION_KEY/);
    expect(listSubscriptions(dataDir, "tenant@example.com")).toHaveLength(0);
  });
});
