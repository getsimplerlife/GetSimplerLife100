/**
 * test-env.ts — isolated environment for the canonical suite (owner-approved I6).
 *
 * PROBLEM: the canonical suite used to default TEST_BASE_URL to the LIVE
 * port-3000 prod server and TEST_DATA_DIR to the LIVE data dir, so a plain
 * `bun test` run wrote *.test users / purchases / oauth states into live Neon.
 *
 * FIX: the suite defaults to a SELF-HOSTED, file-backed prod server on a
 * dedicated test port with a dedicated test data dir. The spawned server runs
 * with DATABASE_URL="" so the Neon durable store is DISABLED — it writes only
 * to the tmp mirror. The live server keeps DATA_DIR=/var/lib/simplerlife100/.data
 * untouched.
 *
 * SLICE 172 — ONE SERVER PER WORKER, NEVER ONE SERVER PER RUN.
 *
 * The single shared :3999 server corrupted three consecutive gates
 * (`cfaac98`, `9f1bc01`, `46b2c03`): `page-views-http-159` (and sometimes
 * `audit-d-fail-closed-guard`) went red inside the full `--maxWorkers=2` suite
 * and green solo at the same head, every time. Two mechanisms, both structural:
 *
 *  1. PORT-KILL. `ensureTestServer`'s spawn path called `freeTestPort()`, which
 *     SIGKILLs *whatever listens* on the port — with no ownership test at all
 *     (see freeTestPort). Two workers racing for one port therefore killed each
 *     other's live server: the loser's next `fetch` got ECONNREFUSED and its
 *     assertions read NaN, while the winner's boot tore the port down and back
 *     up underneath it.
 *  2. DIR-WIPE. `wipeIsolatedDataDir()` wiped `/tmp/simplerlife100-test-data`
 *     for a fresh boot — the SAME directory the other worker's server was
 *     serving from. Files one worker had just seeded (users.json,
 *     sessions.json, page_views.json) vanished mid-test, so "this was counted"
 *     and "the owner gets 200" assertions failed on data that did exist.
 *
 * Neither can happen when a worker only ever touches its own port and its own
 * data dir, so that is the rule now:
 *  - PORT: `testPort()` = an atomically CLAIMED port from a private pool
 *    (TEST_PORT_BASE..TEST_PORT_BASE+TEST_PORT_SPAN-1). The claim is an atomic
 *    `mkdirSync` of `/tmp/sl100-test-ports/<port>` holding the claiming pid;
 *    a claim whose owner is dead is reclaimed, a claim whose owner is alive is
 *    never stolen — the allocator moves on and records the conflict. A second
 *    process can therefore never be handed a port a live process holds.
 *  - DATA DIR: `testDataDir()` is derived from that port, so two workers can
 *    never share (or wipe) one directory.
 *  - LOCK + BOOT MARKER: keyed by port as well, so "who is spawning" and
 *    "is this server still ours" are per-worker questions, not global ones.
 *  - TEARDOWN: only ever kills the process group of a watchdog THIS process
 *    spawned (see killTestServerGroup + the owned-pid registry). Kill-by-port
 *    is gone from every path: `freeOwnedTestPort()` refuses to touch any port
 *    that is not this process's claim.
 *
 * FLAKE HARDENING (task 21f80636), all still in force:
 *  - Fresh state every run: the spawn-lock winner FREES its own port, WIPES the
 *    default isolated data dir, then boots the server. A previous run's
 *    purchases / users / oauth states can never pollute the next run (the
 *    NO-FREE-STUFF audit used to read a prior run's tenant_purchases.json and
 *    fail fast). Explicit TEST_DATA_DIR (live-dir verification mode) is NEVER
 *    wiped — that is a hard fail-closed guard.
 *  - Reuse is freshness-gated: the spawner writes a BOOT MARKER into the data
 *    dir once the server is healthy. The fast reuse path only reuses a server
 *    whose marker is (a) recent (bootTime within REUSE_GRACE_MS) AND (b) whose
 *    SPAWNER PROCESS IS STILL ALIVE. A leftover server from a crashed run can
 *    be healthy yet serve STALE data; its spawner is dead, so it is never
 *    reused — the port is freed, the dir wiped, and a fresh server booted.
 *    (Within one worker this is the normal path: the second and later test
 *    files reuse the server the first file booted, because the spawner — this
 *    worker process — is alive.)
 *  - The spawn lock is stale-aware: a lock dir left behind by a crashed run
 *    older than 60s is reclaimed instead of making every later run wait for a
 *    server that will never boot.
 *  - Server spawn is retried (bounded loop) when a boot fails to become
 *    healthy or the lock-winner died mid-boot (slow cold start).
 *  - TEARDOWN IS SIGKILL, NEVER SIGTERM (task 120b7f03): prod-server.ts
 *    installs its own SIGTERM/SIGINT handlers (process.once("SIGTERM",
 *    () => release())), so SIGTERM is HANDLED, not fatal — the process keeps
 *    serving and, once its spawner exits, lingers as an orphan (ppid=1,
 *    cwd=deleted worktree) — the proven spawn-lock flake source.
 *    stopTestServer, the runner's exit handler, AND signal handlers
 *    (SIGTERM/SIGINT/SIGHUP — vitest terminates workers by signal, so exit
 *    handlers alone never fire) all SIGKILL the spawned server's PROCESS
 *    GROUP, so a clean or interrupted run can never leave an orphan behind.
 *  - PARENT WATCHDOG (task 252 review): the spawned server runs as a grandchild
 *    under a tiny detached watchdog wrapper (own session = own process group).
 *    The watchdog SIGKILLs the server when its SUPERVISOR (the spawning
 *    worker) dies by ANY means — including SIGKILL to the worker, which no
 *    handler in the worker can ever catch (reproduced live: `bun test`, the
 *    bun-native runner, SIGKILLs workers on teardown and left a ppid=1 orphan
 *    holding the port). Teardown and watchdog are belt AND braces: the worker's
 *    exit/signal handlers SIGKILL the watchdog's process group, and the
 *    detached watchdog additionally reaps the server within ~1s of worker
 *    death. (Leftovers from truly unrecoverable kills — e.g. SIGKILL to both
 *    the worker and its watchdog simultaneously — are reclaimed at spawn time
 *    by freeOwnedTestPort before every fresh boot.)
 *
 * HOW TO RUN THE SUITE (canonical, no live contact, zero Neon pollution):
 *   SLACK_BOT_TOKEN= bun run test        # vitest (testTimeout 30s, hookTimeout 60s)
 *
 * To point the suite at a REAL branch instance instead (e.g. when verifying
 * a deployed server): TEST_BASE_URL=http://host:port TEST_DATA_DIR=<real dir>.
 * To keep the old live-server behavior explicitly:
 *   TEST_BASE_URL=http://localhost:3000 TEST_DATA_DIR=/var/lib/simplerlife100/.data
 */
import { spawn, execSync, type ChildProcess } from "child_process";
import { readFileSync, mkdirSync, rmSync, statSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * The private port pool. NOT 3000 (the working site), NOT 3017/3021 (platform
 * ports), NOT 3999 (what the old shared server held — a stale listener there
 * must never be mistaken for ours), NOT 4198-4200 (browser smoke) and NOT
 * 4597-4601 (the hardening fixtures). 4700-4999 sits below the Linux ephemeral
 * range (32768+), so no outbound socket can squat in it.
 */
export const TEST_PORT_BASE = 4700;
export const TEST_PORT_SPAN = 300;

/** Root under which every per-worker isolated data dir lives. The real dir is
 *  `${TEST_DATA_DIR_DEFAULT}-w<port>` — one per worker, never shared. */
export const TEST_DATA_DIR_DEFAULT = "/tmp/simplerlife100-test-data";

/** Where atomic port claims live. One directory per claimed port, holding the
 *  claiming pid. `mkdirSync` is atomic, which is the whole point. */
const PORT_CLAIM_ROOT = join(tmpdir(), "sl100-test-ports");

const BOOT_MARKER_FILE = ".sl100-test-boot";
/** A server is only reusable while its marker is this fresh. Bounds any single
 *  suite run (worst case ~7 min) plus margin; also guards against PID reuse
 *  making a long-dead spawner look alive. */
export const REUSE_GRACE_MS = 15 * 60_000;
const LOCK_STALE_MS = 60_000;
const MAX_SPAWN_ATTEMPTS = 3;

/** True when the given PID refers to a live process on this host. */
function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // ESRCH = no such process (dead); EPERM = exists but not ours → alive.
    return e?.code === "EPERM";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port claims — the atomic core of per-worker isolation (slice 172)
// ─────────────────────────────────────────────────────────────────────────────

export interface PortClaimConflict {
  /** The port that was already claimed. */
  port: number;
  /** The LIVE pid that already owns it. */
  heldBy: number;
  /** The pid that was refused. */
  refused: number;
}

const claimConflicts: PortClaimConflict[] = [];

/** Every refusal to hand out an already-claimed port, oldest first. A conflict
 *  is NOT an error (the allocator moves to the next candidate and carries on),
 *  but it is recorded so the regression suite can prove the guard is live. */
export function portClaimConflicts(): PortClaimConflict[] {
  return claimConflicts.map((c) => ({ ...c }));
}

/** Test-only: clear the conflict log so a test can observe its own refusals. */
export function resetPortClaimConflictsForTest(): void {
  claimConflicts.length = 0;
}

function claimDirFor(port: number): string {
  return join(PORT_CLAIM_ROOT, String(port));
}

/** The pid recorded in a claim dir, or null when there is no usable record. */
function claimOwner(port: number): number | null {
  try {
    const raw = readFileSync(join(claimDirFor(port), "owner"), "utf-8").trim();
    const pid = Number(raw.split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writeClaim(port: number, pid: number): void {
  writeFileSync(join(claimDirFor(port), "owner"), `${pid} ${Date.now()}`);
}

/**
 * Atomically claim ONE specific port for `pid`. Returns true only when this
 * call created the claim (or reclaimed a provably dead owner's claim).
 *
 * This is the only place a port becomes "ours", and it is atomic: two
 * processes racing for the same port both call `mkdirSync`, exactly one wins,
 * and the loser reads the winner's pid out of the claim dir. A claim held by a
 * LIVE foreign pid is never stolen — that refusal is recorded in
 * `portClaimConflicts()` so it can never pass silently.
 */
export function claimSpecificPort(port: number, pid: number = process.pid): boolean {
  if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid test port: ${port}`);
  mkdirSync(PORT_CLAIM_ROOT, { recursive: true });
  const dir = claimDirFor(port);
  try {
    mkdirSync(dir);
    writeClaim(port, pid);
    return true;
  } catch {
    const owner = claimOwner(port);
    if (owner !== null && owner === pid) return true; // re-entrant: already ours
    if (owner !== null && pidIsAlive(owner)) {
      // A LIVE peer holds this port. Never take it — record the refusal loudly
      // and let the caller move on. This is the slice-172 guard: the shared-port
      // era had no such test and simply killed the peer instead.
      claimConflicts.push({ port, heldBy: owner, refused: pid });
      return false;
    }
    // Dead (or unreadable) owner — a crashed run's leftover. Reclaim it.
    try {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir);
      writeClaim(port, pid);
      return true;
    } catch {
      const raced = claimOwner(port);
      if (raced !== null && raced === pid) return true;
      if (raced !== null) claimConflicts.push({ port, heldBy: raced, refused: pid });
      return false;
    }
  }
}

/** Release this process's claim on a port (teardown / test cleanup). `force`
 *  removes a claim held by any pid — test-only, for cleaning up fixtures. */
export function releasePortClaim(port: number, opts: { force?: boolean } = {}): void {
  try {
    if (opts.force || claimOwner(port) === process.pid || claimOwner(port) === null) {
      rmSync(claimDirFor(port), { recursive: true, force: true });
    }
  } catch {
    /* already gone */
  }
}

/** The port this pid would prefer: a stable offset into the pool. Two live
 *  pids that map to the same offset are resolved by the atomic claim below. */
function preferredPortFor(pid: number): number {
  return TEST_PORT_BASE + (pid % TEST_PORT_SPAN);
}

let allocatedPort: number | null = null;

/**
 * Claim a port for `pid` and return it. Deterministic for a given pid (so
 * every test file in one worker process agrees on the port, which is what lets
 * `testBaseUrl()` be called at module scope), and never a port a live peer
 * holds.
 */
export function claimPortForPid(pid: number = process.pid): number {
  if (pid === process.pid && allocatedPort !== null) return allocatedPort;
  const start = preferredPortFor(pid);
  for (let i = 0; i < TEST_PORT_SPAN; i++) {
    const candidate = TEST_PORT_BASE + ((start - TEST_PORT_BASE + i) % TEST_PORT_SPAN);
    if (claimSpecificPort(candidate, pid)) {
      if (pid === process.pid) allocatedPort = candidate;
      return candidate;
    }
  }
  throw new Error(
    `no free test port in ${TEST_PORT_BASE}-${TEST_PORT_BASE + TEST_PORT_SPAN - 1} for pid ${pid} ` +
      `(${claimConflicts.length} refusals recorded — another live worker holds the whole pool)`,
  );
}

/** The port this worker's test server runs on. Stable for the process. */
export function testPort(): number {
  return claimPortForPid(process.pid);
}

/** The isolated data dir for a given port — one per worker, never shared. */
export function dataDirForPort(port: number): string {
  return `${TEST_DATA_DIR_DEFAULT}-w${port}`;
}

// The default isolated dir is mutable ONLY for unit tests (hardening test
// swaps it to a scratch dir to prove the wipe guard). Never reassigned in
// production paths.
let defaultIsolatedDataDir: string | null = TEST_DATA_DIR_DEFAULT;

/** Test-only: point the "default isolated dir" at a scratch dir so the wipe
 *  guard can be exercised without touching a real per-worker test dir. */
export function setDefaultIsolatedDataDirForTest(dir: string): void {
  defaultIsolatedDataDir = dir;
}

/** The per-worker isolated data dir for THIS process. */
function perWorkerDataDir(): string {
  return dataDirForPort(testPort());
}

/** True when the dir is a suite-owned isolated test dir (safe to wipe). */
export function isDefaultIsolatedDataDir(dir: string): boolean {
  if (!dir) return false;
  return dir === perWorkerDataDir() || dir === defaultIsolatedDataDir;
}

/** Wipe + recreate an isolated data dir, but ONLY when it is a suite-owned
 *  isolated dir. Explicit TEST_DATA_DIR (live-dir verification mode) and any
 *  other directory are NEVER wiped — this is the fail-closed guard. */
export function wipeIsolatedDataDir(dir: string): void {
  if (isDefaultIsolatedDataDir(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  mkdirSync(dir, { recursive: true });
}

/** Dedicated test data dir (env TEST_DATA_DIR overrides). Never the live dir by
 *  default, and never another worker's dir. */
export function testDataDir(): string {
  return process.env.TEST_DATA_DIR?.trim() || perWorkerDataDir();
}

/** Base URL: this worker's self-hosted test server by default; TEST_BASE_URL
 *  overrides (explicit-instance mode). */
export function testBaseUrl(): string {
  return process.env.TEST_BASE_URL?.trim() || `http://localhost:${testPort()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot marker
// ─────────────────────────────────────────────────────────────────────────────

/** Write the boot marker into the data dir after a server becomes healthy.
 *  Records the SPAWNER pid + boot time; reuse of that server is only allowed
 *  while the marker is recent AND the spawner is still alive. */
export function writeBootMarker(dir: string): void {
  try {
    writeFileSync(join(dir, BOOT_MARKER_FILE), JSON.stringify({ pid: process.pid, bootTime: Date.now() }));
  } catch { /* best effort — a missing marker only disables reuse, never breaks a run */ }
}

/** True when the server booted into `dir` is reusable: marker present, recent,
 *  and its spawner still alive. Missing/corrupt/old/dead-spawner markers fail
 *  closed → the caller must free the port and respawn fresh. */
export function isBootMarkerFresh(dir: string, now = Date.now()): boolean {
  try {
    const p = join(dir, BOOT_MARKER_FILE);
    if (!existsSync(p)) return false;
    const { pid, bootTime } = JSON.parse(readFileSync(p, "utf-8")) as { pid?: number; bootTime?: number };
    if (typeof bootTime !== "number" || !Number.isFinite(bootTime)) return false;
    if (now - bootTime > REUSE_GRACE_MS) return false;
    if (!pidIsAlive(pid as number)) return false;
    return true;
  } catch { return false; }
}

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let childLog: string[] = [];

/**
 * The pids of every watchdog THIS process spawned. Teardown may only ever
 * signal a pid in here — see killTestServerGroup. Slice 172's second guard:
 * "never kill a PID you did not create", enforced rather than promised.
 */
const ownedWatchdogPids = new Set<number>();

/** The watchdog pids this process owns (exposed for the regression suite). */
export function ownedTestServerPids(): number[] {
  return [...ownedWatchdogPids];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parent watchdog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parent-watchdog wrapper for the spawned test server.
 *
 * The server (bun run prod-server.ts) runs as a GRANDCHILD of the spawning
 * worker, under this tiny detached watchdog. The watchdog is spawned with
 * { detached: true } so it leads its OWN session (pgid === its pid), which
 * (a) lets teardown SIGKILL the whole group in one shot AND (b) keeps the
 * watchdog alive after its worker dies, so it can still reap the server.
 *
 * The watchdog SIGKILLs the server when EITHER:
 *  - its supervisor (the spawning worker, passed via env) is dead — covers
 *    SIGKILL to the worker, which no handler in the worker can catch; or
 *  - it receives SIGTERM/SIGINT/SIGHUP or exits — duplexed with the worker's
 *    own exit/signal handlers, which also group-SIGKILL the watchdog.
 *
 * The watchdog is unref'd so the worker's event loop is never held open by
 * it; the worker keeps the process handle and group-kills it on teardown,
 * and the watchdog self-exits ~1s after the worker dies (SIGKILL case) or
 * immediately when its server exits for any reason.
 */
const WATCHDOG_SUPERVISOR_ENV = "SL100_WATCHDOG_SUPERVISOR_PID";
const WATCHDOG_SERVER_ARGV_ENV = "SL100_WATCHDOG_SERVER_ARGV";

// Bun is resolved by NAME, not process.execPath: vitest workers run under
// /usr/bin/node even when vitest was launched via `bun run test`, so execPath
// points at node and a `node -e` server would crash on the very first
// `Bun.serve(...)`. Every pre-existing spawn in this module ("bun run
// prod-server.ts", the hardening fixtures) uses the PATH-resolved `bun`
// binary, and so does the watchdog.
const BUN = "bun";

const WATCHDOG_SCRIPT = /* js */ `
import { spawn } from "node:child_process";
const sup = Number(process.env.${WATCHDOG_SUPERVISOR_ENV});
const args = JSON.parse(process.env.${WATCHDOG_SERVER_ARGV_ENV} || "[]");
const child = spawn("${BUN}", args, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => process.stdout.write(d));
child.stderr.on("data", (d) => process.stderr.write(d));
const killChild = () => { try { process.kill(child.pid, "SIGKILL"); } catch { /* already gone */ } };
child.on("exit", () => process.exit(0));
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => { killChild(); process.exit(0); });
}
process.on("exit", killChild);
const poll = () => {
  let alive = true;
  try { process.kill(sup, 0); } catch (e) { if (e && e.code === "ESRCH") alive = false; }
  if (!alive) { killChild(); process.exit(0); }
};
setInterval(poll, 1000);
`;

/**
 * Spawn the test server under its parent-watchdog wrapper (detached, own
 * session). Returns the WATCHDOG process (also the session/pgid leader). The
 * server command is passed as { file, args } so tests can point the watchdog
 * at a scratch-port fixture instead of the real prod-server. The watchdog pid
 * is registered as OURS, which is what authorises killTestServerGroup later.
 */
export function spawnTestServerWithWatchdog(opts: {
  supervisorPid: number;
  env: Record<string, string>;
  cwd: string;
  serverFile?: string;
  serverArgs?: string[];
}): ChildProcess {
  const args = [opts.serverFile ?? "run", ...(opts.serverArgs ?? ["prod-server.ts"])];
  const w = spawn(BUN, ["-e", WATCHDOG_SCRIPT], {
    cwd: opts.cwd,
    env: {
      ...opts.env,
      [WATCHDOG_SUPERVISOR_ENV]: String(opts.supervisorPid),
      [WATCHDOG_SERVER_ARGV_ENV]: JSON.stringify(args),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own session + process group (pgid === w.pid): group-kill safe
  });
  if (typeof w.pid === "number") ownedWatchdogPids.add(w.pid);
  w.unref(); // never keep the worker's event loop alive waiting for the watchdog
  w.stdout?.on("data", (d) => childLog.push(String(d)));
  w.stderr?.on("data", (d) => childLog.push(String(d)));
  return w;
}

/**
 * SIGKILL the whole process group of a watched test server. `child` is the
 * detached watchdog = session leader = pgid leader, and the server shares its
 * group, so ONE group-SIGKILL reaps both (and any server grandchildren).
 * Safe on null/already-exited watchdogs — when the watchdog already exited,
 * its server is already dead, so there is no group left to signal.
 *
 * SLICE 172 GUARD — OWNERSHIP IS CHECKED, NOT ASSUMED. A pid that this process
 * did not spawn through spawnTestServerWithWatchdog is REFUSED: by default the
 * call throws (a teardown that would kill a stranger is a bug, and it must be
 * loud), and the process-exit / signal paths pass `throwOnForeignPid: false`
 * so a dying worker never throws from an exit handler — they still refuse.
 * Returns true when it signalled a group, false when it refused or had nothing
 * to do.
 */
export function killTestServerGroup(
  childProcess: ChildProcess | null,
  opts: { throwOnForeignPid?: boolean } = {},
): boolean {
  if (!childProcess || typeof childProcess.pid !== "number" || childProcess.exitCode !== null) return false;
  const pid = childProcess.pid;
  if (!ownedWatchdogPids.has(pid)) {
    const msg =
      `[test-env] REFUSED to kill process group ${pid}: this process did not spawn it ` +
      `(owned: ${[...ownedWatchdogPids].join(",") || "none"}). Teardown may only ever signal a ` +
      `server it created — killing by port/pid is how the shared-:3999 gates were corrupted.`;
    console.error(msg);
    if (opts.throwOnForeignPid !== false) throw new Error(msg);
    return false;
  }
  // NOTE: the pid STAYS in the registry — a group-SIGKILL is idempotent and
  // callers legitimately re-kill (belt and braces) after the first reap.
  try { process.kill(-pid, "SIGKILL"); } catch { /* group already gone */ }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Port freeing — listener-scoped, and only ever our own port from the suite
// ─────────────────────────────────────────────────────────────────────────────

/** Free the port from any stale leftover test server holding it (async-safe). */
export async function freeTestPort(port: number = testPort()): Promise<void> {
  // SLICE 156 — `lsof -ti tcp:PORT` matches ESTABLISHED CLIENT sockets as well
  // as the listener, so the old form SIGKILLed every vitest worker that was
  // fetching from this server (and the watchdog then reaped the server, taking
  // every remaining file that needed the port with it). Measured on this host
  // with one listener and one client: `lsof -ti tcp:4599` → 2 pids,
  // `lsof -ti tcp:4599 -sTCP:LISTEN` → 1 pid. Only a LISTENER is ever ours to
  // kill, and never ourselves or our supervisor.
  const neverKill = new Set([process.pid, process.ppid]);
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null || true`, { encoding: "utf-8" });
    for (const raw of out.split("\n")) {
      const pid = Number(raw.trim());
      if (!Number.isInteger(pid) || pid <= 0 || neverKill.has(pid)) continue;
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  } catch { /* no lsof on this host — nothing to free blindly */ }
  // fuser resolves the LOCAL port binding (a client's local port is ephemeral),
  // so it is listener-scoped too; it stays as the fallback for hosts without lsof.
  try { execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* fuser missing */ }
}

/**
 * SLICE 172 — free ONLY this process's claimed port. `ensureTestServer` never
 * frees a port it does not own; passing any other port is a programming error
 * and throws (the shared-:3999 era killed whatever listened, which is exactly
 * how one worker destroyed another's server). The raw `freeTestPort(port)`
 * above stays exported for the hardening suite, which frees a scratch fixture
 * port it created itself.
 */
export async function freeOwnedTestPort(port: number = testPort()): Promise<void> {
  const mine = testPort();
  if (port !== mine) {
    throw new Error(
      `[test-env] REFUSED to free port ${port}: this worker owns ${mine}. ` +
        `Freeing a port we did not claim is how the shared-:3999 gates were corrupted.`,
    );
  }
  await freeTestPort(mine);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawn lock — one per port, so workers never contend
// ─────────────────────────────────────────────────────────────────────────────

// The spawn-lock path is mutable ONLY for unit tests (hardening test swaps it
// to a scratch path to prove release + owner-reclaim without touching a real
// lock). Never reassigned in production paths.
let spawnLockDirOverride: string | null = null;

/** Test-only: point the spawn lock at a scratch dir. */
export function setSpawnLockDirForTest(dir: string): void {
  spawnLockDirOverride = dir;
}

/** The path of the atomic spawn-lock dir (exposed for the hardening test). */
export function spawnLockPath(): string {
  return spawnLockDirOverride ?? join(tmpdir(), `sl100-test-server-${testPort()}.lock`);
}

/**
 * Try to acquire the spawn lock. Returns true when THIS process won and must
 * spawn the server. Reclaims the lock when its recorded owner is gone: either
 * the lock is older than LOCK_STALE_MS (crashed run) or the owner PID is no
 * longer alive (the spawning worker itself died mid-run — its server may
 * still be up but its data dir ownership is untrustworthy, so we respawn).
 *
 * Slice 172: the lock is keyed by the port, so this is now a per-worker lock —
 * only this worker's own test files can ever contend for it.
 */
export function acquireSpawnLock(): boolean {
  const lockDir = spawnLockPath();
  try {
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner"), `${process.pid} ${Date.now()}`);
    return true;
  } catch {
    // Lock dir exists — someone else is (or was) the winner.
    let stale = false;
    try {
      const st = statSync(lockDir);
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) stale = true;
    } catch { /* lock vanished in a race — loser path is fine */ }
    if (!stale) {
      // Owner PID dead ⇒ the spawner worker died mid-run. Reclaim now rather
      // than making later runs wait for a server whose owner is gone.
      try {
        const ownerRaw = readFileSync(join(lockDir, "owner"), "utf-8");
        const ownerPid = Number(String(ownerRaw).trim().split(" ")[0]);
        if (!Number.isFinite(ownerPid) || !pidIsAlive(ownerPid)) stale = true;
      } catch { /* no owner file — treat as live to avoid racing a live spawn */ }
    }
    if (stale) {
      try {
        rmSync(lockDir, { recursive: true, force: true });
        mkdirSync(lockDir);
        writeFileSync(join(lockDir, "owner"), `${process.pid} ${Date.now()}`);
        return true;
      } catch { return false; }
    }
    return false;
  }
}

/**
 * Release the spawn lock. The lock dir contains an owner file, so it MUST be
 * removed recursively — rmdirSync would throw ENOTEMPTY and LEAK the lock,
 * making every later worker a permanent loser.
 */
export function releaseSpawnLock(): void {
  try { rmSync(spawnLockPath(), { recursive: true, force: true }); } catch { /* lock already gone */ }
}

/**
 * Force-remove the spawn lock REGARDLESS of its recorded owner. Unlike
 * acquireSpawnLock (which refuses to reclaim while the owner pid looks alive),
 * this is called by the guarded loser path in ensureTestServer ONLY after
 * verifying the serving server is a stale leftover (port healthy + boot marker
 * not fresh), so the lock's live-owner check can NEVER reclaim it on its own
 * (the owner pid was recycled or the worker died pre-marker). Removing the
 * lock lets the next attempt win and spawn fresh instead of spinning in the
 * loser loop until "test server spawn failed after retries".
 */
export function reclaimStaleSpawnLock(): void {
  try { rmSync(spawnLockPath(), { recursive: true, force: true }); } catch { /* lock already gone */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

async function waitForHealth(timeoutMs = 45_000, baseUrl = testBaseUrl()): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`test server did not become ready on ${baseUrl} (${lastErr})`);
}

/** Deterministic signing secret for the isolated test server's Slack route.
 *  The repo .env ships SLACK_SIGNING_SECRET empty (the real value is wired
 *  only at watchdog launch), so the self-hosted test server falls back to a
 *  fixed test secret; server-level Slack route tests (PR #169) sign requests
 *  with the same value. */
export function testSlackSigningSecret(): string {
  return process.env.SLACK_SIGNING_SECRET || "slack-test-signing-secret";
}

/** Mirrors the Stripe secret the spawned server will enforce (from .env). */
export function resolveWebhookSecretFromEnv(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env in worktree */ }
  return "whsec_test";
}

/** Pids currently LISTENING on a port (empty when lsof is unavailable). */
export function listenerPids(port: number): number[] {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null || true`, { encoding: "utf-8" });
    return out
      .split("\n")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** The process group id of a pid, or null when it cannot be read. */
function processGroupOf(pid: number): number | null {
  try {
    const out = execSync(`ps -o pgid= -p ${pid} 2>/dev/null || true`, { encoding: "utf-8" }).trim();
    const pgid = Number(out);
    return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
  } catch {
    return null;
  }
}

/**
 * SLICE 172 GUARD — prove the listener on OUR port is OUR server, not a
 * peer's. The watchdog is the session/pgid leader and the server inherits its
 * group, so a listener whose pgid is not the watchdog's pid belongs to someone
 * else and this worker must not use (or later free) that port. Returns
 * { ok: true } when the check passes or cannot be performed (no lsof on this
 * host) — a missing tool must not fail a suite, a foreign listener must.
 */
export function verifyListenerOwnership(
  port: number,
  watchdogPid: number,
): { ok: boolean; pids: number[]; reason?: string } {
  const pids = listenerPids(port);
  if (pids.length === 0) return { ok: true, pids }; // lsof missing, or not listening yet
  for (const pid of pids) {
    const pgid = processGroupOf(pid);
    if (pgid === null) return { ok: true, pids }; // ps unavailable — cannot judge
    if (pgid !== watchdogPid) {
      return {
        ok: false,
        pids,
        reason:
          `listener pid ${pid} on port ${port} is in process group ${pgid}, not this worker's ` +
          `watchdog group ${watchdogPid} — the port is NOT ours (per-worker port isolation broken)`,
      };
    }
  }
  return { ok: true, pids };
}

/**
 * Spawn the self-hosted server once. The caller must hold the spawn lock, must
 * have freed its own port and prepared a fresh data dir, and must be able to
 * prove the listener that answers is its own. Throws if the server does not
 * become healthy or if the listener is somebody else's. Writes the boot marker
 * on success.
 */
async function spawnServerOnce(): Promise<void> {
  const port = testPort();
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(port),
    DATA_DIR: testDataDir(),
    // Disable the Neon durable store: file-backed, zero live writes.
    DATABASE_URL: "",
    // Never let the boot-time legacy migration copy the CANONICAL host's live
    // store (incl. real OAuth credentials) into the isolated test dir — the
    // wipe makes the dir empty, and migrateLegacyData would otherwise treat it
    // as a fresh production boot and copy /home/team/shared/site/.data in.
    SKIP_LEGACY_MIGRATION: "1",
    STRIPE_WEBHOOK_SECRET: resolveWebhookSecretFromEnv(),
    // Slack route is fail-closed without a signing secret; the isolated test
    // server gets a deterministic one so server-level route tests (PR #169
    // slack-events alias) can sign requests. Live servers are unaffected.
    SLACK_SIGNING_SECRET: testSlackSigningSecret(),
    SLACK_BOT_TOKEN: "",
    OAUTH_STATE_SWEEP_INTERVAL_MS: String(60 * 60 * 1000),
    BACKUP_SNAPSHOT_INTERVAL_MS: String(60 * 60 * 1000),
    // Slice 144: the same-host archive scheduler must never fire inside a test
    // run — every spawned server would write an archive into /home/team/shared.
    BACKUP_DISABLED: "1",
    TOKEN_SWEEP_INTERVAL_MS: String(60 * 60 * 1000),
  };
  childLog = [];
  child = spawnTestServerWithWatchdog({
    supervisorPid: process.pid,
    env,
    cwd: process.cwd(),
  });
  const watchdogPid = child.pid as number;
  child.on("exit", (code, sig) => { childLog.push(`[test-server] exited code=${code} sig=${sig}`); });
  try {
    await waitForHealth();
  } catch (e: any) {
    const tail = childLog.slice(-12).join("\n");
    throw new Error(`${e?.message}\n--- test server log tail ---\n${tail}`);
  }
  // The listener must be OUR server on OUR port — never a peer's.
  const ownership = verifyListenerOwnership(port, watchdogPid);
  if (!ownership.ok) {
    throw new Error(`test server ownership check failed: ${ownership.reason}`);
  }
  // Server is healthy and serving from a fresh dir — mark it reusable.
  writeBootMarker(testDataDir());
}

/**
 * Ensure THIS worker's self-hosted file-backed test server is running.
 *
 * Slice 172: the server, its port, its data dir, its spawn lock and its boot
 * marker all belong to this worker process. There is no shared server to race
 * for, nothing to kill that we did not start, and nothing to wipe that another
 * worker is serving from. The only reuse that happens is within the worker:
 * the first test file boots it, later files find the marker fresh (the spawner
 * is this very process) and reuse it.
 *
 * Returns the base URL. No-op when TEST_BASE_URL is set.
 */
export async function ensureTestServer(): Promise<string> {
  if (process.env.TEST_BASE_URL?.trim()) return process.env.TEST_BASE_URL.trim();
  if (starting) {
    await starting;
    return testBaseUrl();
  }
  starting = (async () => {
    const baseUrl = testBaseUrl();
    const dir = testDataDir();
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
      // Fast reuse — ONLY when the marker proves this server belongs to a live
      // run (fresh bootTime + live spawner). A healthy leftover from a crashed
      // run serves STALE data: never reuse it.
      if (isBootMarkerFresh(dir)) {
        try {
          const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
          if (res.ok) return;
        } catch { /* not up yet */ }
      }
      if (!acquireSpawnLock()) {
        // Only this process can contend for this port's lock (vitest runs one
        // test file at a time per worker), so a loser means an earlier attempt
        // here is still finishing, or a crashed run left the lock behind. Wait
        // for health, then reclaim a lock whose marker is not fresh.
        try {
          await waitForHealth(attempt < MAX_SPAWN_ATTEMPTS ? 15_000 : 45_000, baseUrl);
        } catch (e) {
          lastErr = e;
          continue;
        }
        if (!isBootMarkerFresh(dir)) {
          reclaimStaleSpawnLock();
        }
        continue;
      }
      let spawnSucceeded = false;
      try {
        // Fresh state every run: free OUR OWN port (a stale leftover from a
        // crashed run on this same claimed port), then wipe + recreate OUR
        // OWN isolated data dir, then boot. NEVER wipe an explicit
        // TEST_DATA_DIR (live-dir mode), and never touch another port.
        await freeOwnedTestPort();
        await new Promise((r) => setTimeout(r, 700));
        wipeIsolatedDataDir(dir);
        await spawnServerOnce();
        spawnSucceeded = true;
        return;
      } catch (e) {
        lastErr = e;
        if (child) { killTestServerGroup(child, { throwOnForeignPid: false }); child = null; }
      } finally {
        // The lock dir contains an owner file, so it must be removed
        // recursively — rmdirSync would throw ENOTEMPTY and LEAK the lock,
        // making every later worker a permanent loser.
        releaseSpawnLock();
      }
      if (!spawnSucceeded) {
        // Slow cold start — harder kill, longer settle, retry.
        await freeOwnedTestPort();
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    throw lastErr ?? new Error("test server spawn failed after retries");
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
  return testBaseUrl();
}

/**
 * Reliable teardown of a spawned test server. Bun processes with their own
 * SIGTERM handler (prod-server.ts installs one) IGNORE SIGTERM and linger as
 * orphans holding the port (ppid=1, cwd=deleted worktree) — the proven
 * spawn-lock flake source. SIGKILL is the only dependable signal for them,
 * matching the deploy rule "Bun ignores SIGTERM — use SIGKILL". Safe on
 * null/already-exited children (throws nothing). Exported so the regression
 * suite can prove it reaps a SIGTERM-resistant bun fixture.
 *
 * Unlike killTestServerGroup this takes a raw handle the CALLER created, so
 * there is no registry to consult — the ownership is the handle itself.
 */
export function hardKillTestServer(childProcess: ChildProcess | null): void {
  if (!childProcess) return;
  try { childProcess.kill("SIGKILL"); } catch { /* already gone */ }
}

/** Stop this worker's self-hosted test server. MUST SIGKILL the whole watchdog
 *  process group: SIGTERM is handled (not fatal) by prod-server.ts, so a
 *  SIGTERM-only stop ORPHANS the server on the port. One group-SIGKILL reaps
 *  the watchdog AND the server. See hardKillTestServer / killTestServerGroup.
 *  Throws if the handle is not a server this process spawned (slice-172 guard). */
export function stopTestServer(): void {
  killTestServerGroup(child, { throwOnForeignPid: true });
  child = null;
}
process.on("exit", () => killTestServerGroup(child, { throwOnForeignPid: false }));

// Workers are often terminated by SIGNAL (vitest pool teardown sends SIGTERM
// after the run; Ctrl+C sends SIGINT). Exit handlers never run on signal
// death, so a spawned server would orphan on the port (ppid=1) — proven live
// after a clean vitest run. On each termination signal: hard-kill the spawned
// server's whole process group (watchdog + server — one SIGKILL), restore the
// default action for that signal, then re-raise it so THIS process still dies
// exactly as the signal dictates. Vitest's own listeners (if any) are
// untouched — only our handler is removed before the re-raise. A worker that
// dies by SIGKILL needs no handler at all: the detached watchdog notices its
// supervisor is dead and reaps the server itself within ~1s.
const TERMINATION_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
for (const sig of TERMINATION_SIGNALS) {
  const handler = () => {
    killTestServerGroup(child, { throwOnForeignPid: false });
    process.removeListener(sig, handler);
    process.kill(process.pid, sig);
  };
  process.on(sig, handler);
}
