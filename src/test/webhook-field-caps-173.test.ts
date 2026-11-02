/**
 * webhook-field-caps-173.test.ts — SLICE 173, defect W5.
 *
 * The rest of the product caps every text field (proposals, checklists, deal
 * rooms, tables, forms). The webhook surface capped neither the subscriber
 * `url` nor `eventTypes`: a tenant could store a 100 KB url or a 10,000-entry
 * event-type allow-list, and every delivery/publish path then carries that
 * weight. This proves the server rejects over-length input with a 400 that
 * names the field, and that ordinary input still works.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeAuthed } from "../native/webhooks/routes";
import { listSubscriptions, listSinksForTenant } from "../native/webhooks/store";
import { MAX_WEBHOOK_URL_LENGTH, MAX_EVENT_TYPES_PER_WEBHOOK, MAX_EVENT_TYPE_LENGTH } from "../native/webhooks/types";

const ctx = (dataDir: string) => ({ userEmail: "caps@example.com", dataDir });
const freshDir = () => mkdtempSync(join(tmpdir(), `slice173-caps-${process.pid}-`));

function post(dataDir: string, path: string, body: unknown): Promise<Response> {
  return handleNativeAuthed(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(dataDir),
  );
}

describe("W5 — webhook url is capped server-side", () => {
  it("rejects a url longer than the cap with a 400 naming `url`", async () => {
    const dataDir = freshDir();
    const longUrl = `https://hooks.example.com/${"a".repeat(MAX_WEBHOOK_URL_LENGTH + 50)}`;
    const res = await post(dataDir, "/api/native/webhook-subscriptions", { url: longUrl });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/url/);
    expect(listSubscriptions(dataDir, "caps@example.com")).toHaveLength(0);
  });

  it("accepts a normal url (the cap does not over-restrict)", async () => {
    const dataDir = freshDir();
    const res = await post(dataDir, "/api/native/webhook-subscriptions", { url: "https://hooks.example.com/hook" });
    expect(res.status).toBe(200);
    expect(listSubscriptions(dataDir, "caps@example.com")).toHaveLength(1);
  });
});

describe("W5 — eventTypes is capped server-side", () => {
  it("rejects more than the allowed number of event types with a 400 naming `eventTypes`", async () => {
    const dataDir = freshDir();
    const tooMany = Array.from({ length: MAX_EVENT_TYPES_PER_WEBHOOK + 1 }, (_, i) => `native.sales.event${i}`);
    const res = await post(dataDir, "/api/native/webhook-subscriptions", {
      url: "https://hooks.example.com/hook",
      eventTypes: tooMany,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/eventTypes/);
    expect(listSubscriptions(dataDir, "caps@example.com")).toHaveLength(0);
  });

  it("rejects an over-long single event type with a 400 naming `eventTypes`", async () => {
    const dataDir = freshDir();
    const res = await post(dataDir, "/api/native/webhook-subscriptions", {
      url: "https://hooks.example.com/hook",
      eventTypes: ["native.sales." + "x".repeat(MAX_EVENT_TYPE_LENGTH)],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/eventTypes/);
  });

  it("caps eventTypes on the inbound SINK lane too", async () => {
    const dataDir = freshDir();
    const tooMany = Array.from({ length: MAX_EVENT_TYPES_PER_WEBHOOK + 1 }, (_, i) => `native.sales.event${i}`);
    const res = await post(dataDir, "/api/native/webhook-sinks", { eventTypes: tooMany });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toMatch(/eventTypes/);
    expect(listSinksForTenant(dataDir, "caps@example.com")).toHaveLength(0);
  });

  it("accepts a handful of short event types", async () => {
    const dataDir = freshDir();
    const res = await post(dataDir, "/api/native/webhook-subscriptions", {
      url: "https://hooks.example.com/hook",
      eventTypes: ["native.sales.lead.created", "native.invoice.paid"],
    });
    expect(res.status).toBe(200);
  });
});
