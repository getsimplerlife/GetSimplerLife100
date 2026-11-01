/**
 * page-views.ts — SLICE 159. A first-party page counter, so the next site
 * decision is measured instead of argued.
 *
 * WHY THIS EXISTS: we have published 158 times, taken $0.00, and every site
 * decision so far has been opinion — we cannot tell whether one human being has
 * looked at the product-led homepage that went live today. All six analytics
 * capabilities in the catalog are D-rated (no usage data anywhere), so this is
 * built natively: no Google, no Plausible, no third-party script, no cookie,
 * no localStorage, nothing that phones home.
 *
 * WHAT IT COUNTS: one increment per successful HTML page render (GET → 200 →
 * `text/html`). Not `/api/*`, not assets, not 404s (a miss is not a page view,
 * and scanner junk like `/wp-admin` must not be able to crowd out real pages in
 * the top-25 list), not redirects, not bot traffic.
 *
 * WHAT IT STORES: aggregate counts only — `path × UTC day → count`. No IP
 * address, no user agent string, no email, no user id, no session, no referrer.
 * Bot filtering happens AT THE DOOR (the request is dropped before anything is
 * written), so a bot's headers are never stored either. That is privacy by
 * construction: the file cannot leak what it never contains.
 *
 * WHERE IT LIVES: `<DATA_DIR>/page_views.json` — the runtime data directory
 * that `data-dir-policy.ts` keeps OUTSIDE the publish tree, written through the
 * repo's atomic-write helper (`atomic-write.ts`: temp → fsync → rename → dir
 * fsync). A publish therefore cannot discard the history, and a crash mid-write
 * cannot truncate it into a silently empty store.
 *
 * HONESTY RULE (the point of the slice): counting must NEVER break a page. If
 * the write fails, the page still renders, the count stays in memory, and the
 * failure is reported to the owner (`writeHealth` in the summary: "counting has
 * been failing since …", with the error and the number of views held in
 * memory). The admin view says "nothing recorded yet" when there is nothing —
 * it never invents a number, and never shows a cheerful zero while writes are
 * failing.
 *
 * SINGLE WRITER: this deployment runs ONE Bun server (slice 151's instance
 * lock), so the in-memory aggregate is the single source of truth and the file
 * is its durable mirror. Flushes are coalesced (at most one write per second,
 * or one every 50 views) so a burst of traffic cannot turn into a burst of
 * fsyncs; the first view after boot is written immediately.
 */
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteJSONSync } from "./atomic-write";
import { isInsidePublishTree } from "./data-dir-policy";

/** File name inside DATA_DIR. Never inside the publish tree. */
export const PAGE_VIEW_FILE_NAME = "page_views.json";
/** Days kept on disk. The admin view reads the last 30; the rest is headroom. */
export const RETENTION_DAYS = 90;
/** The window the owner's view reports. */
export const SUMMARY_WINDOW_DAYS = 30;
/** How many paths the owner's view ranks. */
export const TOP_PATH_LIMIT = 25;
/** A path longer than this is truncated before it is stored (bounded key). */
export const MAX_PATH_LENGTH = 200;
/**
 * Distinct paths tracked per day. Beyond this, further distinct paths fold into
 * `(other)` — an unbounded key space (a scanner inventing URLs) is exactly the
 * memory leak the rate limiter had to be rewritten to fix (slice 151).
 */
export const MAX_PATHS_PER_DAY = 1000;
/** The bucket distinct-path overflow lands in. */
export const OTHER_PATHS_KEY = "(other)";
/** Coalescing: write at most once per this interval… */
const FLUSH_MIN_INTERVAL_MS = 1000;
/** …or immediately once this many views are pending. */
const FLUSH_PENDING_THRESHOLD = 50;
/**
 * …and at least this often while anything is pending. Without this, the LAST
 * views before traffic stops would sit in memory until the next visitor — which
 * is exactly the "it looked like nobody came" failure this slice exists to end.
 * The timer is unref'd, so it never holds the process open.
 */
const FLUSH_INTERVAL_MS = 1500;

/** The persisted document. `days[YYYY-MM-DD][path] = count`. */
export interface PageViewStore {
  version: 1;
  days: Record<string, Record<string, number>>;
  meta: {
    firstViewAt: string | null;
    lastFlushAt: string | null;
  };
}

/** What the owner's view needs to be honest about the counter itself. */
export interface PageViewWriteHealth {
  /** True when the last write attempt succeeded (or none has failed yet). */
  ok: boolean;
  /** ISO timestamp of the first failure in the current streak (null = healthy). */
  failingSince: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** ISO timestamp of the write that ended the last failure streak. */
  lastRecoveredAt: string | null;
  consecutiveFailures: number;
  /** Views counted but not yet persisted (they survive only in memory). */
  pendingInMemory: number;
  /** ISO timestamp of the last SUCCESSFUL write (null = never written). */
  lastFlushAt: string | null;
}

export interface PageViewDaySeries {
  /** UTC day key, `YYYY-MM-DD`. */
  day: string;
  views: number;
}

export interface PageViewSummary {
  windowDays: number;
  /** First day of the window (inclusive), `YYYY-MM-DD`. */
  windowStart: string;
  /** Today (UTC), `YYYY-MM-DD`. */
  windowEnd: string;
  totalViews: number;
  uniquePaths: number;
  /** Every day in the window, ascending, zero-filled — a real series. */
  days: PageViewDaySeries[];
  topPaths: { path: string; views: number }[];
  /** False when nothing has ever been recorded — the view must say so plainly. */
  hasAnyData: boolean;
  retentionDays: number;
  /** Days currently held on disk (all of them, not just the window). */
  storedDays: number;
  /** Set when the store could not be READ (the numbers below are then empty). */
  readError: string | null;
  writeHealth: PageViewWriteHealth;
  /** SLICE 160 — where this server is actually writing, and whether it can. */
  location: PageViewCounterLocation;
}

/** The facts about one request that decide whether it is a page view. */
export interface ViewCandidate {
  method: string;
  pathname: string;
  /** The request's User-Agent, if any. Used at the door only — never stored. */
  userAgent: string | null;
  /** The response's Content-Type, if the handler set one. */
  contentType: string | null;
  /** The response status. */
  status: number;
}

export type ViewDecision =
  | { counted: true; path: string; day: string }
  | { counted: false; reason: "method" | "status" | "content-type" | "api" | "asset" | "path" | "bot" };

/**
 * Bots, crawlers, link previewers and uptime monitors, matched on the
 * User-Agent at the door. Deliberately broad: a page view we wrongly drop costs
 * a little precision, while a crawler we wrongly count turns the top-25 into a
 * list of our own sitemap.
 */
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|googlebot|bingpreview|yandex|baidu|semrush|ahrefs|mj12|dotbot|petalbot|python|curl|wget|httpclient|okhttp|go-http-client|java\/|libwww|headless|phantom|puppeteer|playwright|lighthouse|gtmetrix|pingdom|uptime|monitor|uptime|statuscake|site24x7|preview|scanner|nmap|zgrab|masscan/i;

/** Paths that are never pages, whatever their Content-Type says. */
const ASSET_PREFIXES = ["/assets/", "/_build/", "/product/", "/videos/", "/icons/"];
const ASSET_FILES = new Set(["/manifest.json", "/sw.js", "/robots.txt", "/sitemap.xml", "/favicon.ico"]);

/** True when the User-Agent is a script/crawler rather than a person. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  // No UA at all is a script, not a browser: every real browser sends one.
  if (ua.length === 0) return true;
  return BOT_UA.test(ua);
}

/** True for asset-ish paths (belt and braces on top of the Content-Type check). */
export function isAssetPath(pathname: string): boolean {
  const p = pathname || "";
  if (ASSET_FILES.has(p)) return true;
  if (ASSET_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (/^\/icon-/.test(p)) return true;
  // A last segment that looks like `name.ext` is a file, not a page.
  const last = p.split("/").pop() || "";
  return /\.[A-Za-z0-9]{1,8}$/.test(last);
}

/**
 * Normalise a pathname into a stable counting key.
 *
 * `/pricing/` and `/pricing` are the same page; `//a//b` is `/a/b`; anything
 * with a control character, a `.`/`..` segment or no leading slash is refused
 * rather than stored (a counting key must never become a way to write junk).
 */
export function normalizeViewPath(pathname: string): string | null {
  let p = (pathname ?? "").trim();
  // Defensive: the server passes url.pathname, which has neither, but a future
  // caller must not be able to smuggle a query string into the key.
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  if (p.length === 0) return "/";
  if (!p.startsWith("/")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return null;
  p = p.replace(/\/{2,}/g, "/");
  const segments = p.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "." || s === "..")) return null;
  p = "/" + segments.join("/");
  if (p.length > MAX_PATH_LENGTH) {
    p = p.slice(0, MAX_PATH_LENGTH);
    // Never end a truncated key on a half-cut separator.
    if (p.endsWith("/")) p = p.slice(0, -1);
  }
  return p;
}

/**
 * Decide, at the door, whether this request is a page view. Nothing is written
 * for a rejected request — a bot's headers are not stored, not even as a flag.
 */
export function classifyPageView(candidate: ViewCandidate): ViewDecision {
  if (candidate.method !== "GET") return { counted: false, reason: "method" };
  if (candidate.status !== 200) return { counted: false, reason: "status" };
  if (!(candidate.contentType ?? "").toLowerCase().includes("text/html")) {
    return { counted: false, reason: "content-type" };
  }
  const pathname = candidate.pathname ?? "";
  if (pathname === "/api" || pathname.startsWith("/api/")) return { counted: false, reason: "api" };
  if (isAssetPath(pathname)) return { counted: false, reason: "asset" };
  const path = normalizeViewPath(pathname);
  if (path === null) return { counted: false, reason: "path" };
  if (isBotUserAgent(candidate.userAgent)) return { counted: false, reason: "bot" };
  return { counted: true, path, day: "" };
}

/** The UTC day key for an instant: `YYYY-MM-DD`. UTC on purpose — a counter
 *  whose "day" depends on where the server sits is not comparable across a
 *  publish, a restart or a relocation. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `dayKey` shifted by `delta` days (negative = earlier). Pure date maths, no
 *  local-time involvement. */
export function shiftDayKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => Number.parseInt(n, 10));
  const t = Date.UTC(y, (m || 1) - 1, d || 1) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** An empty store document. */
export function emptyStore(): PageViewStore {
  return { version: 1, days: {}, meta: { firstViewAt: null, lastFlushAt: null } };
}

/**
 * Drop days older than the retention window. Bounded storage is the whole
 * reason this can run forever without a maintenance job.
 */
export function trimStore(store: PageViewStore, todayKey: string, retentionDays = RETENTION_DAYS): string[] {
  const oldestKept = shiftDayKey(todayKey, -(retentionDays - 1));
  const dropped: string[] = [];
  for (const day of Object.keys(store.days)) {
    if (day < oldestKept) {
      delete store.days[day];
      dropped.push(day);
    }
  }
  return dropped;
}

/**
 * Add one view to a store. Returns the key it was stored under (which may be
 * `(other)` once a day has hit the distinct-path cap).
 */
export function addView(store: PageViewStore, dayKey: string, path: string): string {
  const day = store.days[dayKey] ?? (store.days[dayKey] = {});
  let key = path;
  if (day[path] === undefined && Object.keys(day).length >= MAX_PATHS_PER_DAY) {
    key = OTHER_PATHS_KEY;
  }
  day[key] = (day[key] ?? 0) + 1;
  return key;
}

/** Sum a store into the honest shape the owner's view renders. */
export function summarizeStore(
  store: PageViewStore,
  opts: { todayKey: string; windowDays?: number; topPaths?: number },
): Omit<PageViewSummary, "readError" | "writeHealth" | "location"> {
  const windowDays = Math.max(1, opts.windowDays ?? SUMMARY_WINDOW_DAYS);
  const topPaths = Math.max(1, opts.topPaths ?? TOP_PATH_LIMIT);
  const windowStart = shiftDayKey(opts.todayKey, -(windowDays - 1));
  const totals = new Map<string, number>();
  const days: PageViewDaySeries[] = [];
  let totalViews = 0;
  for (let i = 0; i < windowDays; i++) {
    const day = shiftDayKey(windowStart, i);
    let views = 0;
    for (const [path, count] of Object.entries(store.days[day] ?? {})) {
      const n = Number(count);
      if (!Number.isFinite(n) || n <= 0) continue;
      views += n;
      totals.set(path, (totals.get(path) ?? 0) + n);
    }
    totalViews += views;
    days.push({ day, views });
  }
  const ranked = [...totals.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, topPaths);
  const storedDays = Object.keys(store.days).length;
  return {
    windowDays,
    windowStart,
    windowEnd: opts.todayKey,
    totalViews,
    uniquePaths: totals.size,
    days,
    topPaths: ranked,
    // "Never recorded anything" is not the same as "recorded, and nobody came".
    hasAnyData: storedDays > 0,
    retentionDays: RETENTION_DAYS,
    storedDays,
  };
}

/** The store file for a data dir. */
export function pageViewFilePath(dataDir: string): string {
  return join(dataDir, PAGE_VIEW_FILE_NAME);
}

/**
 * SLICE 160 — WHERE THE COUNTS GO, AS A FACT THE RUNNING SERVER REPORTS.
 *
 * Slice 159 shipped a counter that was correct in every unit test and still
 * looked empty on the live site, because "it writes into DATA_DIR" was an
 * assumption nobody could check without reading the source and knowing which
 * directory the deployed process resolved. This describes the actual location —
 * path, whether that path is inside the publish tree a deploy replaces, whether
 * the file is really there, how big it is, when it was last written, and
 * whether the directory is writable — so the answer comes from the deployment
 * instead of from a guess. Never throws: a missing file is data, not an error.
 */
export interface PageViewCounterLocation {
  /** The resolved runtime data directory. */
  dataDir: string;
  /** `<dataDir>/page_views.json` — the one file the counter writes. */
  counterFile: string;
  /** True when that path sits inside the tree a publish replaces (not durable). */
  insidePublishTree: boolean;
  dirExists: boolean;
  fileExists: boolean;
  bytes: number | null;
  /** File mtime (ISO), i.e. when a flush last actually landed. */
  lastWriteAt: string | null;
  /** Can this process create/write the data dir? */
  writable: boolean;
}

/** Describe where the counter writes. Never throws. */
export function describePageViewCounterLocation(
  dataDir: string,
  opts: { serverBase?: string } = {},
): PageViewCounterLocation {
  const counterFile = pageViewFilePath(dataDir);
  let dirExists = false;
  let fileExists = false;
  let bytes: number | null = null;
  let lastWriteAt: string | null = null;
  let writable = false;
  try {
    dirExists = existsSync(dataDir);
  } catch {
    dirExists = false;
  }
  try {
    fileExists = existsSync(counterFile);
    if (fileExists) {
      const st = statSync(counterFile);
      bytes = st.size;
      lastWriteAt = new Date(st.mtimeMs).toISOString();
    }
  } catch {
    /* an unreadable stat is reported as "not there" rather than thrown */
  }
  try {
    // Check the directory that has to hold the file (or its parent, if the dir
    // does not exist yet — the counter creates it on first flush).
    accessSync(dirExists ? dataDir : dirname(dataDir), constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return {
    dataDir,
    counterFile,
    insidePublishTree: isInsidePublishTree(dataDir, opts.serverBase),
    dirExists,
    fileExists,
    bytes,
    lastWriteAt,
    writable,
  };
}

/**
 * Say where counts go at boot, in one line, the way the data-dir policy already
 * announces `dataDir=… relocated=… insidePublishTree=…`. A future reader — or a
 * log from a deployment nobody can log into — answers "where did the counts go?"
 * without opening the source.
 */
export function logPageViewCounterLocation(dataDir: string, serverBase?: string): PageViewCounterLocation {
  const loc = describePageViewCounterLocation(dataDir, { serverBase });
  console.log(
    `[page-views] counter file=${loc.counterFile} dataDir=${loc.dataDir} ` +
      `insidePublishTree=${loc.insidePublishTree} dirExists=${loc.dirExists} ` +
      `fileExists=${loc.fileExists} writable=${loc.writable} bytes=${loc.bytes ?? 0}`,
  );
  if (loc.insidePublishTree) {
    console.warn(
      `[page-views] WARNING: the counter file is inside the publish tree (${loc.counterFile}) — ` +
        `a publish can discard the history. Set DATA_DIR to a path outside the tree.`,
    );
  }
  if (!loc.writable) {
    console.warn(
      `[page-views] WARNING: ${loc.dataDir} is not writable by this process — ` +
        `page views will be counted in memory only and the owner's view will report the failure.`,
    );
  }
  return loc;
}

/** Validate a parsed document; anything malformed degrades to an empty store
 *  (never throws, never returns a half-trusted shape). */
export function parseStore(raw: unknown): PageViewStore {
  const store = emptyStore();
  if (!raw || typeof raw !== "object") return store;
  const doc = raw as any;
  if (doc.days && typeof doc.days === "object" && !Array.isArray(doc.days)) {
    for (const [day, paths] of Object.entries(doc.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (!paths || typeof paths !== "object" || Array.isArray(paths)) continue;
      const clean: Record<string, number> = {};
      for (const [path, count] of Object.entries(paths as Record<string, unknown>)) {
        const n = Number(count);
        if (!Number.isFinite(n) || n <= 0) continue;
        clean[path] = Math.floor(n);
      }
      store.days[day] = clean;
    }
  }
  if (doc.meta && typeof doc.meta === "object") {
    store.meta.firstViewAt = typeof doc.meta.firstViewAt === "string" ? doc.meta.firstViewAt : null;
    store.meta.lastFlushAt = typeof doc.meta.lastFlushAt === "string" ? doc.meta.lastFlushAt : null;
  }
  return store;
}

// ── runtime state ────────────────────────────────────────────────────────────
// ONE process, ONE data dir: the aggregate is authoritative in memory and the
// file is its durable mirror. A test may swap data dirs; state is then rebuilt
// (after a best-effort flush of what the previous dir was holding).
interface CounterState {
  dataDir: string;
  store: PageViewStore;
  pending: number;
  lastFlushAttemptAt: number;
  readError: string | null;
  health: PageViewWriteHealth;
}

let state: CounterState | null = null;
let warnCount = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * A background flush so the LAST view before traffic stops is still written.
 * Unref'd: it never keeps the process alive and never runs after shutdown.
 */
function ensureFlushTimer(): void {
  if (flushTimer) return;
  try {
    flushTimer = setInterval(() => {
      try {
        if (state && state.pending > 0) flushState(state, Date.now());
      } catch {
        /* a background flush must never crash the server */
      }
    }, FLUSH_INTERVAL_MS);
    (flushTimer as any)?.unref?.();
  } catch {
    flushTimer = null; // no timer available: the per-view flush still runs
  }
}

function freshHealth(): PageViewWriteHealth {
  return {
    ok: true,
    failingSince: null,
    lastError: null,
    lastErrorAt: null,
    lastRecoveredAt: null,
    consecutiveFailures: 0,
    pendingInMemory: 0,
    lastFlushAt: null,
  };
}

function loadStore(dataDir: string): { store: PageViewStore; readError: string | null } {
  const file = pageViewFilePath(dataDir);
  if (!existsSync(file)) return { store: emptyStore(), readError: null };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    return { store: parseStore(parsed), readError: null };
  } catch (e: any) {
    // A file that exists but does not parse is data loss in progress: report it
    // instead of quietly starting from zero and looking healthy.
    return { store: emptyStore(), readError: e?.message || String(e) };
  }
}

function stateFor(dataDir: string): CounterState {
  if (state && state.dataDir === dataDir) return state;
  if (state) flushState(state, Date.now()); // never drop the previous dir's counts silently
  const loaded = loadStore(dataDir);
  state = {
    dataDir,
    store: loaded.store,
    pending: 0,
    lastFlushAttemptAt: 0,
    readError: loaded.readError,
    health: freshHealth(),
  };
  state.health.lastFlushAt = loaded.store.meta.lastFlushAt;
  return state;
}

/** Write the in-memory aggregate to disk. NEVER throws: a failed write must not
 *  take a page down, and the failure is recorded for the owner instead. */
function flushState(s: CounterState, nowMs: number): boolean {
  // Nothing new since the last successful write: writing anyway would only
  // create an empty file (and a fake "healthy" timestamp) where nothing has
  // ever been counted.
  if (s.pending === 0) return true;
  s.lastFlushAttemptAt = nowMs;
  const iso = new Date(nowMs).toISOString();
  try {
    mkdirSync(dirname(pageViewFilePath(s.dataDir)), { recursive: true });
    const snapshot: PageViewStore = {
      version: 1,
      days: s.store.days,
      meta: { firstViewAt: s.store.meta.firstViewAt, lastFlushAt: iso },
    };
    atomicWriteJSONSync(pageViewFilePath(s.dataDir), snapshot);
    s.store.meta.lastFlushAt = iso;
    s.pending = 0;
    s.health.pendingInMemory = 0;
    if (s.health.failingSince) s.health.lastRecoveredAt = iso;
    s.health.ok = true;
    s.health.failingSince = null;
    s.health.consecutiveFailures = 0;
    s.health.lastFlushAt = iso;
    return true;
  } catch (e: any) {
    s.health.ok = false;
    s.health.consecutiveFailures += 1;
    s.health.failingSince = s.health.failingSince ?? iso;
    s.health.lastError = e?.message || String(e);
    s.health.lastErrorAt = iso;
    s.health.pendingInMemory = s.pending;
    // Loud, but not once per request: the first failure and then every 100th.
    warnCount += 1;
    if (warnCount === 1 || warnCount % 100 === 0) {
      console.warn(
        `[page-views] WARNING: could not write ${pageViewFilePath(s.dataDir)} (${s.health.lastError}) — ` +
          `${s.pending} view(s) held in memory, pages still served.`,
      );
    }
    return false;
  }
}

/**
 * Count one request if it is a page view. NEVER throws and never delays a
 * response beyond the coalesced write.
 */
export function notePageView(
  dataDir: string,
  candidate: ViewCandidate,
  opts: { now?: Date } = {},
): ViewDecision {
  const decision = classifyPageView(candidate);
  if (!decision.counted) return decision;
  const now = opts.now ?? new Date();
  const day = utcDayKey(now);
  try {
    const s = stateFor(dataDir);
    ensureFlushTimer();
    const stored = addView(s.store, day, decision.path);
    trimStore(s.store, day, RETENTION_DAYS);
    if (!s.store.meta.firstViewAt) s.store.meta.firstViewAt = now.toISOString();
    s.pending += 1;
    s.health.pendingInMemory = s.pending;
    const nowMs = now.getTime();
    if (s.pending >= FLUSH_PENDING_THRESHOLD || nowMs - s.lastFlushAttemptAt >= FLUSH_MIN_INTERVAL_MS) {
      flushState(s, nowMs);
    }
    return { counted: true, path: stored, day };
  } catch (e: any) {
    // Even an in-memory failure (a corrupt state object) must not break a page.
    console.warn("[page-views] WARNING: could not record a view:", e?.message || String(e));
    return { counted: true, path: decision.path, day };
  }
}

/**
 * The owner's view of the counter. Reads the in-memory aggregate (which was
 * loaded from DATA_DIR at first use and includes views not yet flushed), so it
 * is correct immediately after a page view rather than up to a second later.
 * Never throws.
 */
export function readPageViewSummary(
  dataDir: string,
  opts: { now?: Date; windowDays?: number; topPaths?: number; serverBase?: string } = {},
): PageViewSummary {
  const now = opts.now ?? new Date();
  const todayKey = utcDayKey(now);
  let s: CounterState | null = null;
  let readError: string | null = null;
  try {
    s = stateFor(dataDir);
    readError = s.readError;
  } catch (e: any) {
    readError = e?.message || String(e);
  }
  const base = summarizeStore(s?.store ?? emptyStore(), {
    todayKey,
    windowDays: opts.windowDays ?? SUMMARY_WINDOW_DAYS,
    topPaths: opts.topPaths ?? TOP_PATH_LIMIT,
  });
  const health: PageViewWriteHealth = { ...(s?.health ?? freshHealth()) };
  health.pendingInMemory = s?.pending ?? 0;
  health.lastFlushAt = s?.store.meta.lastFlushAt ?? null;
  return {
    ...base,
    readError,
    writeHealth: health,
    location: describePageViewCounterLocation(dataDir, { serverBase: opts.serverBase }),
  };
}

/** Force a flush (used by tests and by the admin view's "flush now" path). */
export function flushPageViews(dataDir: string, now: Date = new Date()): boolean {
  try {
    return flushState(stateFor(dataDir), now.getTime());
  } catch {
    return false;
  }
}

/** Test seam: forget the in-memory aggregate (a restart, in-process). */
export function resetPageViewStateForTest(): void {
  state = null;
  warnCount = 0;
}
