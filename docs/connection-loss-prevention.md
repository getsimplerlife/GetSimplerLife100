# Connection-Loss Prevention (#230) — design

**Owner directive (2026-08-18):** "make sure no connection is ever lost again for any customer."

## Why (root cause of the Xero incident)
- The live refresher was **hourly-blind**: it only looked at tokens once per hour, and nothing
  monitored real health between sweeps.
- **Single-use refresh tokens** (Xero, and every OAuth2 provider that rotates) were the killer:
  once consumed, they are dead forever. A rotation written to the cache could sit **up to ~10
  minutes** before the background durable flush reached Neon — any second refresher (e.g. the
  verify CLI) that read the stale copy within that window consumed the same token, and the
  loser's write persisted a dead refresh token (`invalid_grant "Refresh token has been
  consumed"`, 20 Xero contracts dead 08-17).
- Failures surfaced only as an aggregate `failed=1` counter line — no per-provider loud log,
  no alert, no portal visibility.

## Design — four layers

### 1. PROACTIVE — due-based refresher (`src/lib/token-refresher.ts`)
- New `startScheduledTokenRefresher(dataDir, {tickMs})`: every **60s** (default), refresh exactly
  the credentials whose refresh window has arrived (`nextRefreshDueMs` — same 70%-of-lifetime
  lead math as the old sweep, made explicit and per-credential). A **boot catch-up** refreshes
  anything already due on startup. No more waiting for the hourly sweep.
- **Single-writer rule:** per-key `inFlight` set + sequential refreshes — a credential is never
  refreshed twice concurrently (in-process). The old hour-blind `sweepExpiredTokens` is retained
  for tests/compat; the live server now uses the scheduler exclusively.
- **Immediate durable flush:** `refreshOneCredential` fires `drainPendingWrites()` after every
  rotation, and `persistRefreshedCredential` (all adapters/CLI paths) now does the same — a new
  refresh token is written to **Neon within seconds, not ≤10 min**. Across-process races are
  bounded to the single-writer rule + atomic storage key.

### 2. DETECTED — health heartbeat (`src/lib/connection-health.ts`, NEW)
- `startHealthHeartbeat(dataDir, {intervalMs})`: every **15 min**, probe each stored credential
  with a **real, non-mutating read** from an **audited probe registry** (URLs sourced from the
  repo's own provider clients — no guessed URLs; unknown providers fail closed and are skipped):
  google-* → Drive `files?pageSize=1` (calendar → calendarList), microsoft-* → Graph `/me`,
  slack → `auth.test`, xero → `/Organisation` (tenant-id header), hubspot → contacts `limit=1`,
  docusign → envelopes (baseUrl+accountId from the credential).
- Tracks `ok | degraded | reconnect_required`, consecutive failures, lastOk/lastError, persisted
  to `connection_health.json` (durable). **Loud per-provider logs** on every transition
  (DEGRADED / DEAD / RECOVERED) plus a first-cycle summary.

### 3. SELF-HEALING — classification, alert, portal
- Refresh failures are classified: `invalid_grant / consumed / revoked` →
  **`reconnect_required`** (only a human can fix) — connection record flips to that status with
  `lastRefreshError`/`refreshFailedAt`; every other error stays `auth_failed`/transient (retry
  next tick).
- **Owner email alert** on reconnect_required (throttled 6h per provider+tenant; new root cause
  after 1 min) via the repo's `sendEmail` path. Fail-closed: no email creds → loud log only.
- **Portal:** new session-gated `GET /api/portal/connections` — per-tenant list of
  {provider, connected, hasRefreshToken, expiresAt, status, lastProbeAt, lastOkAt, lastError,
  consecutiveFailures, reconnectPath:`/portal/integrations`} for one-click reauthorization.

### 4. DURABLE — rotate-on-every-refresh for ALL providers
- Every refresh path now persists the rotated refresh token: scheduler (`refreshOneCredential`),
  sweep (unchanged), and `persistRefreshedCredential` (used by verification adapters/CLI) all
  write through `writeJSON` → durable store and fire `drainPendingWrites()` immediately.
- Remaining Xero-style losses require a genuinely revoked/consumed token (user revoked access)
  — which is now DETECTED within minutes + alerted + visible in the portal, instead of silently
  failing once an hour.

## Wiring
- `prod-server.ts`: `startConnectionLifecycle()` replaces the hourly-blind sweep timer
  (scheduler 60s + heartbeat 15m; `CONNECTION_TICK_MS` / `CONNECTION_HEALTH_INTERVAL_MS` env
  overrides). Admin diagnostics stats switched to `scheduledRefresherStats` (ticks, refreshed,
  reconnectRequired, alertsSent, lastError) with API field names preserved.
- `credential-source.ts`: `persistRefreshedCredential` fires an immediate durable flush.

## Tests (10 new)
Proactive due math (before-expiry, no-churn), scheduler refreshes only due creds + persists
rotation + never churns, failure classification, reconnect_required marking, alert throttle
(6h / new-cause), probe registry audited-URL-only, ok→degraded→reconnect_required transitions,
heartbeat fail-closed skipping unknown providers, durable health records.

## Explicitly NOT in this change
- No publish/deploy (per lead — reviewed by lead before merge).
- No reconnect button mutation (portal connect flow already exists; endpoint exposes status +
  link only).
- Admin endpoint for cross-tenant health snapshot (follow-up; session-gated portal endpoint
  covers tenant view).