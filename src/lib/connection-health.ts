/**
 * connection-health.ts — #230 "never lose a connection again" DETECTED layer.
 *
 * A periodic heartbeat that exercises a REAL, non-mutating read against each
 * stored provider credential so a dead connection is detected within minutes
 * (not at the next hourly sweep). Every probe URL below is sourced from the
 * repo's own provider clients (audited — never guessed):
 *   - google-*       → src/integrations/providers/google-<id>/client.ts (DRIVE_BASE)
 *   - microsoft-*    → src/integrations/providers/microsoft-<id>/client.ts (GRAPH_BASE)
 *   - slack          → src/integrations/providers/slack/client.ts
 *   - xero           → src/integrations/providers/xero/client.ts
 *   - hubspot        → src/integrations/providers/hubspot/client.ts
 *   - docusign       → account baseUrl + accountId stored on the credential
 *                     (persisted at connect time, #173); fallback = live userinfo.
 *
 * Status semantics:
 *   ok                 — last probe succeeded (or no probe yet and refresh is healthy)
 *   degraded           — probe failed but a refresh may heal it (e.g. 401/expired)
 *   reconnect_required — refresh already failed with a fatal grant error; only a
 *                        human reauthorization can fix it (loud log + alert)
 *   unknown            — no stored credential
 */
import { join } from "path";
import { readJSON, readJSONLive, writeJSON } from "./data-store";
import { isRefreshProvider, REFRESH_REGISTRY } from "./token-refresher";

export interface ProbeResult {
  ok: boolean;
  httpStatus?: number;
  error?: string;
  attemptedAt: number;
}

export interface ProviderProbeDef {
  /** Build the request for a stored credential entry. */
  buildRequest: (entry: Record<string, any>) => { url: string; method: string; headers?: Record<string, string>; body?: string };
  /** True when the provider's response means the connection is alive. */
  isOk: (res: { status: number }, bodyText: string) => boolean;
}

// Audited probe registry — keyed by canonical provider id. A provider with no
// entry here FAILS CLOSED (skipped, never probed with a guessed URL).
export const PROBE_REGISTRY: Record<string, ProviderProbeDef> = {
  "google-drive": {
    buildRequest: (e) => ({ url: "https://www.googleapis.com/drive/v3/files?pageSize=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "google-docs": {
    buildRequest: (e) => ({ url: "https://www.googleapis.com/drive/v3/files?pageSize=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "google-sheets": {
    buildRequest: (e) => ({ url: "https://www.googleapis.com/drive/v3/files?pageSize=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "google-slides": {
    buildRequest: (e) => ({ url: "https://www.googleapis.com/drive/v3/files?pageSize=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "google-calendar": {
    buildRequest: (e) => ({ url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  // #231: probe URL MUST sit inside the granted scope. These providers request
  // only Files.ReadWrite (+ offline_access) — Graph endpoint /v1.0/me requires
  // the User.Read scope and returns 401 UnknownError for a perfectly valid
  // Files token (this is exactly what the live heartbeat reported after the
  // 19th publish, falsely marking connections degraded). /me/drive/root needs
  // only Files.Read — it matches the audited clients (onedrive/client.ts etc.)
  // and returns 200 with the SAME token (verified read-only 2026-08-18).
  "microsoft-word": {
    buildRequest: (e) => ({ url: "https://graph.microsoft.com/v1.0/me/drive/root", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "microsoft-excel": {
    buildRequest: (e) => ({ url: "https://graph.microsoft.com/v1.0/me/drive/root", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  "microsoft-powerpoint": {
    buildRequest: (e) => ({ url: "https://graph.microsoft.com/v1.0/me/drive/root", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  onedrive: {
    buildRequest: (e) => ({ url: "https://graph.microsoft.com/v1.0/me/drive/root", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  slack: {
    buildRequest: (e) => ({ url: "https://slack.com/api/auth.test", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `token=${encodeURIComponent(e.accessToken || "")}` }),
    isOk: (r, bodyText) => { try { const j = JSON.parse(bodyText); return r.status === 200 && j.ok === true; } catch { return false; } },
  },
  xero: {
    buildRequest: (e) => {
      const tenant = e.tenantId || e.orgId || e.organizationId || "";
      return { url: "https://api.xero.com/api.xro/2.0/Organisation", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}`, ...(tenant ? { "Xero-tenant-id": tenant } : {}) } };
    },
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  hubspot: {
    buildRequest: (e) => ({ url: "https://api.hubapi.com/crm/v3/objects/contacts?limit=1", method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } }),
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
  docusign: {
    buildRequest: (e) => {
      const base = e.baseUrl || "https://account-d.docusign.com";
      const acct = e.accountId || e.account_id || "";
      const url = acct ? `${base}/restapi/v2.1/accounts/${acct}/envelopes?from_date=2020-01-01T00:00:00Z&count=1` : `${base}/restapi/v2.1/accounts`;
      return { url, method: "GET", headers: { Authorization: `Bearer ${e.accessToken}` } };
    },
    isOk: (r) => r.status >= 200 && r.status < 300,
  },
};

/** Xero connections endpoint — lists tenant(s) for an access token (no tenant header needed). */
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

/**
 * Resolve the Xero tenantId for a credential entry. Prefers the stored value
 * (tenantId/orgId/organizationId); when absent, calls GET /connections with the
 * access token (audited — verification/adapters/xero.ts resolveTenantId; the
 * connections endpoint lists the connected organisation and does NOT require a
 * Xero-tenant-id header). Returns undefined when it cannot be resolved.
 */
export async function resolveXeroTenantId(
  entry: Record<string, any>,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const stored = entry.tenantId || entry.orgId || entry.organizationId;
  if (stored) return String(stored);
  if (!entry.accessToken) return undefined;
  try {
    const res = await fetchImpl(XERO_CONNECTIONS_URL, { headers: { Authorization: `Bearer ${entry.accessToken}`, Accept: "application/json" } });
    if (!res.ok) return undefined;
    const data = await res.json().catch(() => null);
    if (Array.isArray(data) && data.length > 0 && data[0]?.tenantId) return String(data[0].tenantId);
    return undefined;
  } catch {
    return undefined;
  }
}

export async function probeProvider(
  provider: string,
  entry: Record<string, any>,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const def = PROBE_REGISTRY[provider];
  if (!def) return Promise.resolve({ ok: false, error: "no audited probe for provider", attemptedAt: Date.now() });
  // P0 hotfix: Xero's /Organisation REQUIRES the Xero-tenant-id header. The
  // credential row may not have tenantId stored, but the access token can resolve
  // it via GET /connections. NEVER send a header-less Xero probe (it 403s on a
  // perfectly valid token and would wrongly reject a freshly-rotated token).
  let resolvedEntry = entry;
  if (provider === "xero") {
    const tid = await resolveXeroTenantId(entry, fetchImpl);
    if (tid) resolvedEntry = { ...entry, tenantId: tid } as Record<string, any>;
    else {
      // Fail closed: without a tenant id we cannot perform a valid Xero read.
      return { ok: false, error: `xero probe not sent: could not resolve Xero tenantId (no stored tenant and /connections returned none)`, attemptedAt: Date.now() };
    }
  }
  const req = def.buildRequest(resolvedEntry);
  return fetchImpl(req.url, { method: req.method, headers: { Accept: "application/json", ...(req.headers || {}) }, body: req.body })
    .then(async (res) => {
      const text = await res.text().catch(() => "");
      const ok = def.isOk(res, text);
      if (!ok) {
        // 401/403 with a refresh path → degraded (the refresher may heal it).
        const kind = res.status === 401 || res.status === 403 ? "degraded" : "fail";
        return { ok, httpStatus: res.status, error: `${kind} probe ${provider}: HTTP ${res.status} ${text.slice(0, 120)}`, attemptedAt: Date.now() };
      }
      return { ok, httpStatus: res.status, attemptedAt: Date.now() };
    })
    .catch((e: any) => ({ ok: false, error: `probe ${provider} network error: ${e?.message || String(e)}`, attemptedAt: Date.now() }));
}

export type ConnectionStatus = "ok" | "degraded" | "reconnect_required" | "unknown";

export interface ConnectionHealthRecord {
  provider: string;
  email: string;
  status: ConnectionStatus;
  lastProbeAt?: number;
  lastOkAt?: number;
  lastError?: string;
  consecutiveFailures: number;
}

const HEALTH_FILE = "connection_health.json";

/** In-memory + durable (Neon-backed) connection health tracker. */
export class ConnectionHealthTracker {
  private records = new Map<string, ConnectionHealthRecord>();
  constructor(private dataDir: string) {
    const stored = (readJSON(join(dataDir, HEALTH_FILE)) as Record<string, ConnectionHealthRecord> | undefined) || {};
    for (const [k, v] of Object.entries(stored)) this.records.set(k, { ...v, consecutiveFailures: v.consecutiveFailures || 0 });
  }
  key(provider: string, email: string): string {
    return email ? `${email}:${provider}` : provider;
  }
  get(provider: string, email: string): ConnectionHealthRecord | undefined {
    return this.records.get(this.key(provider, email));
  }
  all(): ConnectionHealthRecord[] {
    return [...this.records.values()];
  }
  record(provider: string, email: string, result: ProbeResult, refreshFatal: boolean): ConnectionHealthRecord {
    const k = this.key(provider, email);
    const prev = this.records.get(k);
    const failures = result.ok ? 0 : (prev?.consecutiveFailures || 0) + 1;
    const rec: ConnectionHealthRecord = {
      provider, email,
      status: refreshFatal ? "reconnect_required" : result.ok ? "ok" : "degraded",
      lastProbeAt: result.attemptedAt,
      lastOkAt: result.ok ? result.attemptedAt : prev?.lastOkAt,
      lastError: result.ok ? undefined : result.error,
      consecutiveFailures: failures,
    };
    // Loud per-provider transition logs (owner: "loud per-provider failure logs").
    const prevStatus = prev?.status;
    if (rec.status !== prevStatus) {
      if (rec.status === "degraded") {
        console.error(`[connection-health] ⚠️ DEGRADED provider=${provider} tenant=${email || "?"} failures=${failures} reason="${rec.lastError}" — refresher will attempt to heal; probe next cycle in ≤15 min`);
      } else if (rec.status === "reconnect_required") {
        console.error(`[connection-health] 🔴 DEAD provider=${provider} tenant=${email || "?"} — RECONNECT REQUIRED (refresh failed fatally); automations paused`);
      } else if (rec.status === "ok" && prevStatus !== undefined && prevStatus !== "ok") {
        console.log(`[connection-health] ✅ RECOVERED provider=${provider} tenant=${email || "?"}`);
      }
    }
    this.records.set(k, rec);
    writeJSON(join(this.dataDir, HEALTH_FILE), Object.fromEntries(this.records));
    return rec;
  }
  /**
   * Prune records whose credential key no longer exists in the credential store
   * (stale fixture rows like `tenant@example.com:xero` must not keep being probed/emailed).
   * Non-destructive: only removes rows for keys absent from `validKeys`.
   */
  prune(validKeys: ReadonlySet<string>): number {
    let removed = 0;
    for (const k of [...this.records.keys()]) {
      if (!validKeys.has(k)) { this.records.delete(k); removed++; }
    }
    if (removed > 0) writeJSON(join(this.dataDir, HEALTH_FILE), Object.fromEntries(this.records));
    return removed;
  }
  /** Mark reconnect_required from the refresher path (shared failure state). */
  markReconnectRequired(provider: string, email: string, reason: string): void {
    this.record(provider, email, { ok: false, error: reason, attemptedAt: Date.now() }, true);
  }
}

export interface HeartbeatHandle { stop: () => void; runCycle: () => Promise<{ probed: number; ok: number; degraded: number; dead: number }>; }

/**
 * Periodic heartbeat: every `intervalMs` (default 15 min) probe every stored
 * credential with a real read. Sequential (never overlaps). Fail-closed for
 * providers without an audited probe (skipped, counted nowhere).
 */
export function startHealthHeartbeat(
  dataDir: string,
  opts: { intervalMs?: number; fetchImpl?: typeof fetch; now?: () => number; onCycle?: () => void } = {},
): HeartbeatHandle {
  const intervalMs = opts.intervalMs ?? 15 * 60 * 1000;
  const tracker = new ConnectionHealthTracker(dataDir);
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function runCycle(): Promise<{ probed: number; ok: number; degraded: number; dead: number }> {
    // #234 durable-first: a connection persisted on another instance (OAuth
    // callback) must be probed even when this instance's boot-hydrated cache
    // and local file predate it. readJSONLive queries the durable store
    // directly with file/cache fallback (plain readJSON when store disabled).
    const tokenData = ((await readJSONLive(join(dataDir, "tenant_oauth_credentials.json"))) as Record<string, any> | undefined) || {};
    // Prune health rows whose credential key no longer exists in the store
    // (stale fixture rows like tenant@example.com:* must not keep being probed/emailed).
    tracker.prune(new Set(Object.keys(tokenData)));
    let probed = 0, ok = 0, degraded = 0, dead = 0;
    for (const [key, entry] of Object.entries<any>(tokenData)) {
      if (stopped || !entry || typeof entry !== "object") continue;
      const provider = String(entry.provider || (key.includes(":") ? key.split(":")[1] : key)).toLowerCase();
      if (!isRefreshProvider(provider) || !PROBE_REGISTRY[provider]) continue; // fail-closed: no audited probe URL
      const email = key.includes(":") ? key.split(":")[0] : "";
      const refreshFatal = String(entry.status || "").toLowerCase() === "reconnect_required" ||
        (entry.lastRefreshError ? /invalid_grant|consumed|revoked/.test(String(entry.lastRefreshError).toLowerCase()) : false);
      const result = await probeProvider(provider, entry, opts.fetchImpl);
      const rec = tracker.record(provider, email, result, refreshFatal);
      probed++;
      if (rec.status === "ok") ok++;
      else if (rec.status === "degraded") degraded++;
      else dead++;
    }
    if (opts.onCycle) opts.onCycle();
    return { probed, ok, degraded, dead };
  }

  void runCycle().then((r) => {
    if (r.degraded > 0 || r.dead > 0) {
      console.error(`[connection-health] first cycle: probed=${r.probed} ok=${r.ok} degraded=${r.degraded} dead=${r.dead}`);
    } else if (r.probed > 0) {
      console.log(`[connection-health] first cycle: probed=${r.probed} all ok`);
    }
  }).catch((e: any) => console.error("[connection-health] cycle error: " + String(e?.message || e)));

  timer = setInterval(() => {
    if (stopped) return;
    runCycle().catch((e: any) => console.error("[connection-health] cycle error: " + String(e?.message || e)));
  }, intervalMs);
  if (typeof (timer as any)?.unref === "function") (timer as any).unref();

  return { stop: () => { stopped = true; if (timer) clearInterval(timer); }, runCycle };
}

/** Snapshot for portal/admin endpoints (no secrets). */
export function connectionHealthSnapshot(dataDir: string): ConnectionHealthRecord[] {
  return new ConnectionHealthTracker(dataDir).all();
}

/**
 * Overlay live health status onto tenant_integrations rows (#232 item 3).
 * A stored row may say "Connected" while the credential is actually dead
 * (degraded / reconnect_required in connection_health.json) — the owner UI
 * must show the HEALTH truth, never the stale row. Returns new objects;
 * the stored rows are never mutated.
 *
 * - A health record with status "ok" keeps the stored status (display "Connected").
 * - "degraded" / "reconnect_required" OVERRIDE the stored status with the
 *   health wording (so the UI badge reads "Degraded" / "Reconnect Required").
 * - Providers with no health record (non-refresh, never probed) pass through.
 */
export function applyHealthToConnections(
  conns: any[],
  health: ConnectionHealthRecord[],
  email: string,
): any[] {
  const byKey = new Map<string, ConnectionHealthRecord>();
  for (const h of health) {
    byKey.set(h.email ? `${h.email}:${h.provider}` : h.provider, h);
    byKey.set(`${email}:${h.provider}`, h); // match tenant rows even without email field
  }
  return (conns || []).map((c: any) => {
    const provider = String(c.providerId || c.provider || "").toLowerCase();
    const rec = byKey.get(`${email}:${provider}`);
    if (!rec || rec.status === "ok") return c;
    const status = rec.status === "reconnect_required" ? "Reconnect Required" : "Degraded";
    return { ...c, status, healthStatus: rec.status, lastHealthError: rec.lastError ?? null };
  });
}