/**
 * liveness-watchdog.ts — EXTERNAL liveness monitor for the live site ("24/7" piece).
 *
 * WHY THIS EXISTS
 * The in-app self-healing watchdog (run-live-server.sh) only restarts the
 * prod-server CHILD when that child process EXITS. It cannot detect:
 *   - the whole host going dark;
 *   - a prod-server that is STILL alive & owns :3000 but has hung and never
 *     responds to HTTP;
 *   - a crash that leaves the process alive but non-functional.
 * On 2026-08-20 a ~10h host-level outage went unnoticed until a human checked.
 * This lightweight, SEPARATE process probes the live site from OUTSIDE the
 * prod-server process, so a dead/hung server is detected and acted on within
 * minutes, and the owner is alerted by email over the real SendGrid path.
 *
 * HOW IT SURVIVES
 *   - It is a distinct process from prod-server, so prod-server crashes and
 *     watchdog restarts do not stop it.
 *   - It holds its own single-instance lock + status/pid file (in DATA_DIR) and
 *     is itself supervised to survive its own death (systemd Restart=always, or
 *     a cron job that respawns it from its pid/status file) — see LIVENESS.md.
 *   - HONEST LIMIT: on a single host nothing survives the whole machine going
 *     dark. TRUE off-host liveness needs external infrastructure (a second
 *     host, an external uptime service, or a platform scheduled task) — see
 *     LIVENESS.md. This process does not claim to provide that.
 *
 * SAFETY vs the single-instance guard (#188) / non-destruction mandate:
 *   - It NEVER binds :3000 and never tries to take the prod-server ownership
 *     lock. It only issues read-only HTTP GET probes.
 *   - On failure it does NOT spawn a competing prod-server. It signals the
 *     canonical prod-server PID (so the existing run-live-server.sh watchdog
 *     relaunches the child in ~3s), or launches a configured relaunch script
 *     (default: /home/agent-lead/run-live-server.sh) if no PID is found.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { sendEmail } from "../integrations/email";

export interface ProbeOutcome {
  up: boolean;
  httpStatus?: number;
  error?: string;
}

export interface RecoveryAction {
  kind: "signaled-server" | "launched-relaunch" | "none";
  detail?: string;
}

export interface WatchdogStatus {
  up: boolean;
  consecutiveFails: number;
  probeCount: number;
  pid: number;
  startedAt: number;
  lastProbeAt?: number;
  lastOkAt?: number;
  lastError?: string;
  downSince?: number;
  recoveredAt?: number;
}

export interface TickResult {
  up: boolean;
  declaredDown: boolean;
  recovered: boolean;
  alerted: boolean;
  action: RecoveryAction;
}

export interface LivenessOptions {
  /** TCP port the live site listens on (canonical 3000). */
  port: number;
  /** Health path to probe; must return 2xx. Default "/api/health". */
  healthPath: string;
  /** Directory for this watchdog's lock + status/pid files (e.g. DATA_DIR). */
  statusDir: string;
  /** Probe interval in ms. */
  intervalMs: number;
  /** Minimum consecutive failed probes before we declare DOWN (anti-flicker). */
  downAfterFails: number;
  /** HTTP timeout per probe (ms). */
  timeoutMs: number;
  /** Recipient for down/recovered alerts. */
  alertEmail: string;
  /** fetch implementation (injectable for tests). */
  fetchImpl?: typeof fetch;
  /** Email sender (injectable; defaults to the real SendGrid path). */
  sendAlert?: (subject: string, text: string) => Promise<unknown>;
  /** Recovery action (injectable; defaults to signal/relaunch logic). */
  recover?: () => RecoveryAction;
  /** Optional shell script to launch (detached) when no live server PID is found. */
  relaunchScript?: string;
  /** Return the PID of the canonical prod-server to signal on recovery. */
  findServerPid?: () => number | undefined;
  now?: () => number;
  log?: (...args: unknown[]) => void;
  /** If true, do not keep the event loop alive with the probe interval (detached
   *  mode, LV_DETACH=1). The default false keeps the daemon running. */
  detach?: boolean;
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_HEALTH_PATH = "/api/health";
export const DEFAULT_INTERVAL_MS = 3 * 60 * 1000; // 3 min
export const DEFAULT_DOWN_AFTER_FAILS = 3;
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_ALERT_EMAIL = "electric.vortexz@gmail.com";
export const DEFAULT_STATUS_DIR = "/var/lib/simplerlife100/.data";
export const DEFAULT_RELAUNCH_SCRIPT = "/home/agent-lead/run-live-server.sh";

/**
 * Probe the live site's health endpoint. Only a 2xx counts as up. Uses an
 * AbortController timeout so a hung server cannot stall the loop.
 */
export async function probeLiveness(
  port: number,
  healthPath: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}${healthPath}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    const status = res.status;
    if (status >= 200 && status < 300) return { up: true, httpStatus: status };
    return { up: false, httpStatus: status };
  } catch (e: any) {
    clearTimeout(timer);
    return { up: false, error: e?.message || String(e) };
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

/** Read the canonical prod-server PID from its single-instance ownership lock. */
export function readServerPidFromLock(statusDir: string): number | undefined {
  const lockFile = join(statusDir, "prod-server.lock");
  if (!existsSync(lockFile)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(lockFile, "utf-8")) as { pid?: number };
    return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Default recovery: signal the non-responsive canonical prod-server so the
 * existing run-live-server.sh watchdog relaunches it, falling back to launching
 * a configured relaunch script. Never seizes :3000 and never starts a competing
 * prod-server directly.
 */
export function defaultRecovery(opts: {
  statusDir: string;
  findServerPid?: () => number | undefined;
  relaunchScript?: string;
  log?: (...a: unknown[]) => void;
}): RecoveryAction {
  const log = opts.log ?? console.log;
  const pid = opts.findServerPid ? opts.findServerPid() : readServerPidFromLock(opts.statusDir);
  if (pid && pidAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
      log(`[liveness-watchdog] signaled non-responsive prod-server pid=${pid} (SIGTERM); watchdog will relaunch`);
      return { kind: "signaled-server", detail: `pid=${pid}` };
    } catch (e: any) {
      log(`[liveness-watchdog] could not signal pid=${pid}: ${e?.message || String(e)}`);
    }
  }
  if (opts.relaunchScript) {
    try {
      spawn("bash", [opts.relaunchScript], { detached: true, stdio: "ignore" }).unref();
      log(`[liveness-watchdog] launched relaunch script ${opts.relaunchScript}`);
      return { kind: "launched-relaunch", detail: opts.relaunchScript };
    } catch (e: any) {
      log(`[liveness-watchdog] could not launch relaunch ${opts.relaunchScript}: ${e?.message || String(e)}`);
    }
  }
  log("[liveness-watchdog] no recovery available (no live server pid, no relaunch script)");
  return { kind: "none" };
}

/**
 * State machine for the liveness watchdog. Kept dependency-light and
 * fully testable (fetchImpl / sendAlert / recover / statusDir are injectable).
 */
export class LivenessMonitor {
  private lockFile: string;
  private statusFile: string;
  private fails = 0;
  private probes = 0;
  private up = true;
  private lastRecoveryAt = 0;
  private startedAt: number;

  constructor(private opts: LivenessOptions) {
    this.lockFile = join(opts.statusDir, "liveness-watchdog.lock");
    this.statusFile = join(opts.statusDir, "liveness-status.json");
    this.startedAt = (opts.now ?? Date.now)();
  }

  private log(...a: unknown[]): void {
    (this.opts.log ?? console.log)(...a);
  }
  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /**
   * Acquire a single-instance lock if this is the only watchdog. Returns null
   * on success, else a human-readable reason. A second watchdog on the same
   * statusDir refuses to run (prevents duplicate alerts/recovery).
   */
  acquire(): string | null {
    try {
      mkdirSync(this.opts.statusDir, { recursive: true });
    } catch { /* best effort */ }
    if (existsSync(this.lockFile)) {
      let p = 0;
      try {
        p = Number(JSON.parse(readFileSync(this.lockFile, "utf-8"))?.pid) || 0;
      } catch { p = 0; }
      if (p && p !== process.pid && pidAlive(p)) {
        return `another liveness-watchdog holds lock (pid=${p})`;
      }
      try { unlinkSync(this.lockFile); } catch { /* stale lock, best effort */ }
    }
    let fd: number;
    try {
      fd = openSync(this.lockFile, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date(this.now()).toISOString() }), "utf-8");
    } catch (e: any) {
      if (e?.code === "EEXIST") return "liveness-watchdog lock raced (EEXIST); another instance won";
      return `could not acquire liveness-watchdog lock: ${e?.message || String(e)}`;
    }
    if (fd > 2) { try { closeSync(fd); } catch { /* ignore */ } }
    return null;
  }

  /** Release the lock (call on graceful shutdown). Best-effort. */
  release(): void {
    try {
      if (existsSync(this.lockFile)) {
        const cur = JSON.parse(readFileSync(this.lockFile, "utf-8"));
        if (cur?.pid === process.pid) unlinkSync(this.lockFile);
      }
    } catch { /* best effort */ }
  }

  /** Current pushed status file content (useful for external health checks). */
  private persist(): void {
    try {
      mkdirSync(this.opts.statusDir, { recursive: true });
      const status: WatchdogStatus = {
        up: this.up,
        consecutiveFails: this.fails,
        probeCount: this.probes,
        pid: process.pid,
        startedAt: this.startedAt,
        lastProbeAt: this.now(),
        lastError: this.lastErrorText,
      };
      writeFileSync(this.statusFile, JSON.stringify(status, null, 2), "utf-8");
    } catch (e: any) {
      this.log(`[liveness-watchdog] could not persist status: ${e?.message || String(e)}`);
    }
  }
  private lastErrorText: string | undefined;

  async tick(): Promise<TickResult> {
    const probe = await probeLiveness(this.opts.port, this.opts.healthPath, this.opts.fetchImpl ?? fetch, this.opts.timeoutMs);
    this.probes++;
    const now = this.now();
    if (probe.up) {
      const wasDown = this.up === false;
      this.fails = 0;
      this.lastErrorText = undefined;
      this.up = true;
      if (wasDown) {
        this.persist();
        await this.alert("recovered");
        this.log(`[liveness-watchdog] ✅ RECOVERED port=${this.opts.port}`);
        return { up: true, declaredDown: false, recovered: true, alerted: true, action: { kind: "none" } };
      }
      this.persist();
      return { up: true, declaredDown: false, recovered: false, alerted: false, action: { kind: "none" } };
    }
    // Probe failed.
    this.fails++;
    this.lastErrorText = probe.error || (probe.httpStatus != null ? `HTTP ${probe.httpStatus}` : "probe failed");
    if (this.up) {
      if (this.fails < this.opts.downAfterFails) {
        // Below the anti-flicker threshold — keep showing LIVE; refresher may heal it.
        this.persist();
        this.log(`[liveness-watchdog] probe failed (${this.fails}/${this.opts.downAfterFails}) port=${this.opts.port} — holding LIVE`);
        return { up: true, declaredDown: false, recovered: false, alerted: false, action: { kind: "none" } };
      }
      // Crossed the threshold → declare DOWN once, alert, and request recovery.
      this.up = false;
      this.persist();
      this.log(`[liveness-watchdog] 🔴 LIVE DOWN port=${this.opts.port} after ${this.fails} consecutive failures`);
      await this.alert("down");
      const action = this.requestRecovery();
      return { up: false, declaredDown: true, recovered: false, alerted: true, action };
    }
    // Already down: re-request recovery (rate-limited), but NEVER re-alert (no spam).
    const action = this.requestRecovery();
    this.persist();
    return { up: false, declaredDown: false, recovered: false, alerted: false, action };
  }

  private requestRecovery(): RecoveryAction {
    const now = this.now();
    if (now - this.lastRecoveryAt < this.opts.intervalMs) return { kind: "none", detail: "rate-limited" };
    this.lastRecoveryAt = now;
    const recover = this.opts.recover ??
      (() => defaultRecovery({
        statusDir: this.opts.statusDir,
        findServerPid: this.opts.findServerPid,
        relaunchScript: this.opts.relaunchScript,
        log: this.log,
      }));
    return recover();
  }

  private async alert(kind: "down" | "recovered"): Promise<void> {
    const subject = kind === "down"
      ? `⚠️ LIVE SITE DOWN — port ${this.opts.port} unresponsive`
      : `✅ LIVE SITE RECOVERED — port ${this.opts.port} is responding`;
    const text = [
      kind === "down"
        ? `The liveness watchdog detected that the live site (port ${this.opts.port}, path ${this.opts.healthPath}) is NOT responding.`
        : `The liveness watchdog confirms the live site (port ${this.opts.port}, path ${this.opts.healthPath}) is responding again.`,
      "",
      `Time (UTC): ${new Date(this.now()).toISOString()}`,
      `Consecutive failed probes at the moment of the transition: ${this.fails}`,
      kind === "down" ? `Last error: ${this.lastErrorText ?? "unknown"}` : "",
      "",
      "This is an automated alert from the Simpler Life 100 liveness watchdog.",
    ].filter(Boolean).join("\n");
    if (this.opts.sendAlert) {
      try { await this.opts.sendAlert(subject, text); } catch (e: any) { this.log(`[liveness-watchdog] alert hook error: ${e?.message || String(e)}`); }
      return;
    }
    try {
      const result = await sendEmail({ to: this.opts.alertEmail, subject, text });
      if (!result.success) this.log(`[liveness-watchdog] alert email failed: ${result.error}`);
    } catch (e: any) {
      this.log(`[liveness-watchdog] alert email error: ${e?.message || String(e)}`);
    }
  }
}

/** Resolve options from the environment (used by the CLI entrypoint). */
export function resolveOptionsFromEnv(): LivenessOptions {
  const int = (v: string | undefined, dflt: number): number => {
    const n = parseInt(v || "", 10);
    return Number.isFinite(n) ? n : dflt;
  };
  return {
    port: int(process.env.LV_PORT, DEFAULT_PORT),
    healthPath: process.env.LV_HEALTH_PATH || DEFAULT_HEALTH_PATH,
    statusDir: process.env.LV_STATUS_DIR || process.env.DATA_DIR || DEFAULT_STATUS_DIR,
    intervalMs: int(process.env.LV_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    downAfterFails: int(process.env.LV_DOWN_AFTER_FAILS, DEFAULT_DOWN_AFTER_FAILS),
    timeoutMs: int(process.env.LV_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    alertEmail: process.env.LV_ALERT_EMAIL || process.env.OWNER_ALERT_EMAIL || DEFAULT_ALERT_EMAIL,
    fetchImpl: fetch,
    relaunchScript: process.env.LV_RELAUNCH_SCRIPT || DEFAULT_RELAUNCH_SCRIPT,
    detach: ["1", "true", "yes"].includes((process.env.LV_DETACH || "").toLowerCase()),
  };
}

/**
 * CLI entrypoint. Run with:
 *   bun run src/server/liveness-watchdog.ts
 * (configure via LV_* env vars — see LIVENESS.md).
 */
export async function main(): Promise<void> {
  const opts = resolveOptionsFromEnv();
  const monitor = new LivenessMonitor(opts);
  const lockErr = monitor.acquire();
  if (lockErr) {
    console.error(`[liveness-watchdog] ${lockErr}`);
    process.exit(1);
  }
  const stop = () => { monitor.release(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  monitor.log(`[liveness-watchdog] started pid=${process.pid} monitoring http://127.0.0.1:${opts.port}${opts.healthPath} every ${opts.intervalMs}ms (DOWN after ${opts.downAfterFails} fails) -> ${opts.alertEmail}`);

  await monitor.tick().catch((e: any) => monitor.log(`[liveness-watchdog] initial tick error: ${e?.message || String(e)}`));
  const timer = setInterval(() => {
    void monitor.tick().catch((e: any) => monitor.log(`[liveness-watchdog] tick error: ${e?.message || String(e)}`));
  }, opts.intervalMs);
  // CRITICAL: DO NOT unref this interval by default. The watchdog is a dedicated
  // long-running process — the interval is what keeps the event loop alive so it
  // probes continuously and the consecutive-failure counter can accumulate across
  // ticks. An unref'd timer lets the process exit (code 0) right after the first
  // tick, which would reset the counter on every restart and make DOWN-after-N
  // failures (and alerting) unreachable. Opt out (e.g. an embed context that
  // wants the loop detached) only via LV_DETACH=1.
  if (opts.detach && typeof (timer as any)?.unref === "function") (timer as any).unref();
}

if (import.meta.main) {
  void main();
}
