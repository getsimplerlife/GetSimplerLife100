import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectionHealthTracker } from "../../src/lib/connection-health";

describe("connection-health stale fixture pruning (#246 item 3)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ch-prune-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("drops health rows whose credential key no longer exists in the store", () => {
    // Seed an existing health file with a stale fixture row AND a real row.
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "connection_health.json"), JSON.stringify({
      "tenant@example.com:xero": { provider: "xero", email: "tenant@example.com", status: "reconnect_required", consecutiveFailures: 3 },
      "owner@real.com:hubspot": { provider: "hubspot", email: "owner@real.com", status: "ok", consecutiveFailures: 0 },
    }));
    const tracker = new ConnectionHealthTracker(dir);
    const removed = tracker.prune(new Set(["owner@real.com:hubspot"]));
    expect(removed).toBe(1);
    const all = tracker.all();
    expect(all).toHaveLength(1);
    expect(all[0].provider).toBe("hubspot");
    // Durable file rewritten without the stale row.
    const file = JSON.parse(existsSync(join(dir, "connection_health.json")) ? "{}" : "{}") as Record<string, unknown>;
    const raw = JSON.parse(require("node:fs").readFileSync(join(dir, "connection_health.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual(["owner@real.com:hubspot"]);
  });

  it("no-op when every record key still exists in the store", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "connection_health.json"), JSON.stringify({
      "owner@example.com:google-docs": { status: "ok", consecutiveFailures: 0 },
    }));
    const tracker = new ConnectionHealthTracker(dir);
    expect(tracker.prune(new Set(["owner@example.com:google-docs"]))).toBe(0);
    expect(tracker.all()).toHaveLength(1);
  });
});
