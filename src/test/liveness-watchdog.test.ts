import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  probeLiveness,
  LivenessMonitor,
  RecoveryAction,
  LivenessOptions,
} from "../../src/server/liveness-watchdog";

type Alert = { subject: string; text: string };

function okFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as unknown as typeof fetch;
}
function badFetch(status: number): typeof fetch {
  return (async () => new Response("err", { status })) as unknown as typeof fetch;
}
function throwFetch(): typeof fetch {
  return (async () => { throw new Error("connection refused"); }) as unknown as typeof fetch;
}

function baseOpts(dir: string, over: Partial<LivenessOptions> & { alerts: Alert[] }): LivenessOptions {
  return {
    port: 3000,
    healthPath: "/api/health",
    statusDir: dir,
    intervalMs: 60_000,
    downAfterFails: 2,
    timeoutMs: 500,
    alertEmail: "owner@example.com",
    fetchImpl: okFetch(),
    sendAlert: async (subject, text) => { over.alerts.push({ subject, text }); },
    recover: () => ({ kind: "signaled-server" as const, detail: "test" }),
    ...over,
  };
}

describe("liveness-watchdog probeLiveness", () => {
  it("reports up on a 2xx health response", async () => {
    const r = await probeLiveness(3000, "/api/health", okFetch(), 500);
    expect(r.up).toBe(true);
    expect(r.httpStatus).toBe(200);
  });
  it("reports down on a 5xx response", async () => {
    const r = await probeLiveness(3000, "/api/health", badFetch(503), 500);
    expect(r.up).toBe(false);
    expect(r.httpStatus).toBe(503);
  });
  it("reports down when the probe throws (hung / refused / aborted)", async () => {
    const r = await probeLiveness(3000, "/api/health", throwFetch(), 500);
    expect(r.up).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("LivenessMonitor anti-flicker + alert policy", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lv-watchdog-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("holds LIVE (no alert, no recovery) below the downAfterFails threshold — a single blip is silent", async () => {
    const alerts: Alert[] = [];
    const recovered: RecoveryAction[] = [];
    const mon = new LivenessMonitor(baseOpts(dir, {
      alerts,
      downAfterFails: 3,
      fetchImpl: badFetch(500),
      recover: () => { recovered.push({ kind: "signaled-server" }); return { kind: "signaled-server" }; },
    }));
    expect(mon.acquire()).toBeNull();
    const r = await mon.tick(); // fail 1/3
    expect(r.up).toBe(true);
    expect(r.declaredDown).toBe(false);
    expect(alerts).toHaveLength(0);
    expect(recovered).toHaveLength(0);
    const r2 = await mon.tick(); // fail 2/3 — still below threshold
    expect(r2.up).toBe(true);
    expect(alerts).toHaveLength(0);
    expect(recovered).toHaveLength(0);
    // The status file shows LIVE the whole time (no flicker).
    const status = JSON.parse(readFileSync(join(dir, "liveness-status.json"), "utf-8"));
    expect(status.up).toBe(true);
    mon.release();
  });

  it("declares DOWN exactly once after the threshold, alerts once, and does NOT re-alert while down", async () => {
    const alerts: Alert[] = [];
    const recovered: RecoveryAction[] = [];
    const mon = new LivenessMonitor(baseOpts(dir, {
      alerts,
      downAfterFails: 2,
      fetchImpl: badFetch(503),
      recover: () => { recovered.push({ kind: "signaled-server" }); return { kind: "signaled-server" }; },
    }));
    await mon.tick(); // fail 1/2 — hold
    const down = await mon.tick(); // fail 2/2 — declare down
    expect(down.up).toBe(false);
    expect(down.declaredDown).toBe(true);
    expect(down.action.kind).toBe("signaled-server");
    // Exactly one DOWN alert fired.
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subject).toContain("DOWN");
    expect(recovered.length).toBeGreaterThanOrEqual(1);
    // More down probes: still no additional alert (no spam), still not recovered.
    for (let i = 0; i < 5; i++) await mon.tick();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subject).toContain("DOWN");
    // Status file reflects DOWN.
    const status = JSON.parse(readFileSync(join(dir, "liveness-status.json"), "utf-8"));
    expect(status.up).toBe(false);
    expect(status.consecutiveFails).toBe(7);
    mon.release();
  });

  it("sends a single RECOVERED alert after the site comes back, and auto-recovers to ok", async () => {
    const alerts: Alert[] = [];
    let up = false;
    const mon = new LivenessMonitor(baseOpts(dir, {
      alerts,
      downAfterFails: 2,
      fetchImpl: (async () => {
        return new Response(up ? "ok" : "err", { status: up ? 200 : 500 });
      }) as unknown as typeof fetch,
    }));
    await mon.tick();
    await mon.tick(); // declare down
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subject).toContain("DOWN");
    up = true;
    const r = await mon.tick(); // recovery
    expect(r.up).toBe(true);
    expect(r.recovered).toBe(true);
    expect(r.alerted).toBe(true);
    expect(alerts).toHaveLength(2);
    expect(alerts[1].subject).toContain("RECOVERED");
    // Subsequent healthy ticks: no further alerts.
    await mon.tick();
    expect(alerts).toHaveLength(2);
    const status = JSON.parse(readFileSync(join(dir, "liveness-status.json"), "utf-8"));
    expect(status.up).toBe(true);
    expect(status.consecutiveFails).toBe(0);
    mon.release();
  });

  it("refuses to acquire while another LIVE watchdog process holds the lock", async () => {
    const alerts: Alert[] = [];
    // A second watchdog would be a SEPARATE process with a DIFFERENT, still-alive pid.
    const { spawn } = await import("node:child_process");
    const child = spawn("sleep", ["30"], { stdio: "ignore" });
    const otherPid = child.pid;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      const fs = await import("node:fs");
      fs.writeFileSync(join(dir, "liveness-watchdog.lock"), JSON.stringify({ pid: otherPid, startedAt: new Date().toISOString() }));
      const reason = new LivenessMonitor(baseOpts(dir, { alerts })).acquire();
      expect(reason).toBeTruthy();
      expect(reason).toMatch(/another liveness-watchdog|holds lock/);
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  });

  it("reclaims a stale lock (dead owner) and can then acquire", async () => {
    const alerts: Alert[] = [];
    // A `true` process exits immediately; its pid is then a guaranteed-dead owner.
    const { spawn } = await import("node:child_process");
    const child = spawn("true", [], { stdio: "ignore" });
    const deadPid: number = child.pid!;
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const fs = await import("node:fs");
    fs.writeFileSync(join(dir, "liveness-watchdog.lock"), JSON.stringify({ pid: deadPid, startedAt: new Date().toISOString() }));
    // Dead owner → stale lock is reclaimed, so acquire succeeds (returns null).
    expect(new LivenessMonitor(baseOpts(dir, { alerts })).acquire()).toBeNull();
  });
});

describe("liveness-watchdog standalone daemon stays alive", () => {
  let dir: string;
  let server: import("node:http").Server;
  let port = 0;
  const intervalMs = 400; // short interval so the test runs fast
  const statusFile = () => join(dir, "liveness-status.json");

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "lv-daemon-"));
    const http = await import("node:http");
    server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{\"status\":\"ok\"}"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr && typeof addr === "object") port = addr.port;
  });
  afterEach(() => {
    if (server) server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function readStatus() {
    try {
      return JSON.parse(readFileSync(statusFile(), "utf-8"));
    } catch {
      return null;
    }
  }
  function childAlive(child: import("node:child_process").ChildProcess): boolean {
    try { process.kill(child.pid!, 0); return true; } catch { return false; }
  }

  it(
    "runs continuously (multiple probes, probeCount increments), not exiting after the first tick; cleans up on SIGTERM",
    async () => {
      const { spawn } = await import("node:child_process");
      const child = spawn("bun", ["run", "src/server/liveness-watchdog.ts"], {
        cwd: join(__dirname, "..", ".."),
        env: {
          ...process.env,
          LV_PORT: String(port),
          LV_HEALTH_PATH: "/",
          LV_STATUS_DIR: dir,
          LV_INTERVAL_MS: String(intervalMs),
          LV_DOWN_AFTER_FAILS: "3",
          LV_TIMEOUT_MS: "500",
          LV_ALERT_EMAIL: "owner@example.com",
          DATABASE_URL: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        // Wait for the daemon to start and complete its initial tick (probeCount 1).
        let status: any = null;
        for (let i = 0; i < 50 && !status; i++) {
          await new Promise((r) => setTimeout(r, 50));
          status = await readStatus();
        }
        expect(status).not.toBeNull();
        expect(status.probeCount).toBeGreaterThanOrEqual(1);

        // Wait > 2x the interval so a healthy daemon must have ticked again.
        await new Promise((r) => setTimeout(r, intervalMs * 2.2));

        status = await readStatus();
        // THE BUG: the daemon would have exited (unref'd interval) after the first
        // tick and probeCount would stay 1. The fix keeps it alive and ticking.
        expect(childAlive(child)).toBe(true);
        expect(status).not.toBeNull();
        expect(status.probeCount).toBeGreaterThanOrEqual(2);
        expect(status.pid).toBe(child.pid);
      } finally {
        // Graceful cleanup: SIGTERM should release the lock and exit 0.
        child.kill("SIGTERM");
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          setTimeout(() => resolve(), 1500); // don't hang if already dead
        });
        expect(childAlive(child)).toBe(false);
      }
    },
    20_000,
  );
});

