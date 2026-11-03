/**
 * corrupt-store-193.test.ts — SLICE 193: a corrupt file must never become a
 * smaller valid file.
 *
 * THE CLASS. `readJSON` answers `{}` for a file that exists and does not parse,
 * so to every caller a corrupt store and an empty one were the same value. Nearly
 * every store is read-whole → mutate → write-whole, which means the first save
 * after a corrupt read replaced recoverable bytes with a small, valid, WRONG
 * document. Two boot seeders did it with no user action at all:
 * `integrations.json` became `[]`, and `users.json` became a single seeded admin
 * (the owner's own account gone). And in the money lane the same `{}` made a real
 * payment answer "no invoice exists" with a 200 — Stripe never retries.
 *
 * Every test here fails on the pre-193 code, and every one carries a positive
 * control so a guard that simply refuses ALL writes cannot pass it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  StoreUnreadableError,
  isStoreUnreadable,
  readJSON,
  seedDataFiles,
  writeJSON,
} from "../lib/data-store";
import { insertInvoice, invoiceStoreUnreadable } from "../native/invoice/store";
import { handleNativeInvoicesAuthed } from "../native/invoice/router";
import { handleTenantInvoiceStripeWebhook } from "../native/invoice/stripe-webhook";
import { NATIVE_INVOICES_KEY, type InvoiceRecord } from "../native/invoice/types";
import { isOwnerRole } from "../lib/user-roles";

/** Bytes that are NOT JSON — a truncated document, the shape a torn write leaves. */
const CORRUPT = '{"owner@acme.test": {"email": "owner@acme.test", "role": "own';

let dir: string;
const savedEnv: Record<string, string | undefined> = {};

function file(name: string): string {
  return join(dir, name);
}
/** The exact bytes on disk, as a string — the thing a "save" must not change. */
function bytes(name: string): string {
  return readFileSync(file(name), "utf-8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "corrupt-store-193-"));
  savedEnv.INTEGRATION_ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;
  savedEnv.ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  savedEnv.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  process.env.ADMIN_EMAIL = "owner@acme.test";
  process.env.ADMIN_PASSWORD = "seed-password-for-test";
});

afterEach(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = savedEnv.INTEGRATION_ENCRYPTION_KEY;
  if (savedEnv.ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = savedEnv.ADMIN_EMAIL;
  if (savedEnv.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedEnv.ADMIN_PASSWORD;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── the write guard ─────────────────────────────────────────────────────────

describe("193 — a write to an unreadable store is refused and the bytes survive", () => {
  // The money stores the brief names first, plus one ordinary store: the guard
  // lives in the ONE write helper, so its coverage is by path, not by caller.
  for (const name of ["native_invoices.json", "tenant_purchases.json", "users.json"]) {
    it(`${name}: refused, byte-for-byte unchanged`, () => {
      writeFileSync(file(name), CORRUPT, "utf-8");
      expect(isStoreUnreadable(file(name))).toBe(true);

      expect(() => writeJSON(file(name), { repaired: true })).toThrow(StoreUnreadableError);
      expect(bytes(name)).toBe(CORRUPT);
      // ...and the read still answers the lenient {} — the corruption is visible
      // to nobody but the guard, which is exactly why the guard has to exist.
      expect(readJSON(file(name))).toEqual({});
    });
  }

  it("positive control: a MISSING store is created, a VALID store is updated", () => {
    writeJSON(file("native_invoices.json"), { t: { invoices: [] } });
    expect(JSON.parse(bytes("native_invoices.json"))).toEqual({ t: { invoices: [] } });
    writeJSON(file("native_invoices.json"), { t: { invoices: [], invoiceSeq: 1 } });
    expect(JSON.parse(bytes("native_invoices.json")).t.invoiceSeq).toBe(1);
  });

  it("an explicit repair is still allowed to overwrite the corrupt bytes", () => {
    writeFileSync(file("tenant_purchases.json"), CORRUPT, "utf-8");
    writeJSON(file("tenant_purchases.json"), { repaired: true }, { repair: true });
    expect(JSON.parse(bytes("tenant_purchases.json"))).toEqual({ repaired: true });
  });

  it("invoiceStoreUnreadable reports the invoice store, not a missing one", () => {
    expect(invoiceStoreUnreadable(dir)).toBe(false); // missing is not unreadable
    writeFileSync(file(NATIVE_INVOICES_KEY), CORRUPT, "utf-8");
    expect(invoiceStoreUnreadable(dir)).toBe(true);
  });
});

// ── the boot traps ──────────────────────────────────────────────────────────

describe("193 — boot seeding may only CREATE a missing file", () => {
  it("a corrupt users.json survives boot byte-for-byte and no admin is seeded over it", () => {
    writeFileSync(file("users.json"), CORRUPT, "utf-8");
    seedDataFiles(dir);
    expect(bytes("users.json")).toBe(CORRUPT);
    expect(() => JSON.parse(bytes("users.json"))).toThrow();
  });

  it("positive control: a MISSING users.json still seeds an admin", () => {
    seedDataFiles(dir);
    expect(existsSync(file("users.json"))).toBe(true);
    const users = JSON.parse(bytes("users.json"));
    const admin = users["owner@acme.test"];
    expect(admin).toBeTruthy();
    expect(isOwnerRole(admin.role)).toBe(true);
  });

  it("a corrupt integrations.json survives boot byte-for-byte", () => {
    writeFileSync(file("integrations.json"), CORRUPT, "utf-8");
    seedDataFiles(dir);
    expect(bytes("integrations.json")).toBe(CORRUPT);
  });

  it("positive control: a MISSING integrations.json still becomes []", () => {
    seedDataFiles(dir);
    expect(JSON.parse(bytes("integrations.json"))).toEqual([]);
  });
});

// ── the money lane ──────────────────────────────────────────────────────────

const T1 = "tenant-a@acme.test";
const KEY_A = "sk_test_tenantA0000000000000000001";
const WHSEC_A = "whsec_testTenantA0000000000000000001";

function req(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function authed(method: string, pathname: string, body?: unknown) {
  return handleNativeInvoicesAuthed(req(method, pathname, body), { userEmail: T1, dataDir: dir });
}
function sign(rawBody: string, secret: string, tsSeconds = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${tsSeconds}.${rawBody}`).digest("hex");
  return `t=${tsSeconds},v1=${sig}`;
}
function postWebhook(pathname: string, rawBody: string, signatureHeader: string) {
  return handleTenantInvoiceStripeWebhook(
    new Request(`http://native.test${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signatureHeader },
      body: rawBody,
    }),
    { dataDir: dir },
  );
}

/** A checkout-session event shaped like the real thing (every id is fake). */
function checkoutEvent(): string {
  return JSON.stringify({
    id: "evt_test_1930001",
    object: "event",
    type: "checkout.session.completed",
    api_version: "2024-06-20",
    data: {
      object: {
        id: "cs_test_paid1930001",
        object: "checkout.session",
        client_reference_id: "INV-0001",
        metadata: { invoice_number: "INV-0001" },
        amount_total: 250000,
        currency: "usd",
        payment_status: "paid",
        mode: "payment",
      },
    },
  });
}

function seedSentInvoice(): InvoiceRecord {
  const now = new Date().toISOString();
  const record: InvoiceRecord = {
    id: "inv_w1930001",
    tenantId: T1,
    invoiceNumber: "INV-0001",
    linkedDealRoomId: "dea_seedroom0001",
    currency: "USD",
    lineItems: [{ id: "li_1", description: "Onboarding retainer", qty: 1, unitPriceCents: 250000 }],
    amountDueCents: 250000,
    status: "sent",
    docId: null,
    customerEmail: "client@acme.test",
    dueDate: "2026-11-28",
    shareSlug: "si_w1930001slug",
    lastAttempt: null,
    version: 2,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
    sentAt: now,
    sentBy: T1,
  };
  insertInvoice(dir, record);
  return record;
}

describe("193 — a real payment is never answered \"no invoice exists\"", () => {
  it("answers 5xx (so the provider retries) when the invoice store is unreadable", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A, webhookSecret: WHSEC_A });
    const address = new URL((await (await authed("GET", "/api/native/invoice/stripe")).json()).data.webhookUrl)
      .pathname;
    seedSentInvoice();

    // The store is now corrupt — the exact state a torn write leaves behind.
    writeFileSync(file(NATIVE_INVOICES_KEY), CORRUPT, "utf-8");

    const raw = checkoutEvent();
    const res = await postWebhook(address, raw, sign(raw, WHSEC_A));

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(600);
    const body = JSON.stringify(await res.json());
    // The answer must be about OUR store, never about the customer's reference.
    expect(body).not.toMatch(/no invoice/i);
    expect(body).toMatch(/could not read/i);
    // And nothing was written over the recoverable bytes.
    expect(bytes(NATIVE_INVOICES_KEY)).toBe(CORRUPT);
  });

  it("positive control: a readable store with no such invoice still answers 200 mismatch", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A, webhookSecret: WHSEC_A });
    const address = new URL((await (await authed("GET", "/api/native/invoice/stripe")).json()).data.webhookUrl)
      .pathname;
    seedSentInvoice(); // INV-0001 exists, but the event will name INV-9999

    const raw = checkoutEvent().replace(/INV-0001/g, "INV-9999");
    const res = await postWebhook(address, raw, sign(raw, WHSEC_A));

    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("mismatch");
  });
});
