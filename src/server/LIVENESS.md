# Liveness Watchdog for the Live Site

`src/server/liveness-watchdog.ts` is a **separate, lightweight process** that monitors
whether the live site (port 3000) is actually responding, independent of the
prod-server process itself. It is the "24/7 monitoring" piece of the owner mandate:
*"whatever it takes to reach the 24/7 monitoring and automation."*

## Why it exists

The in-app self-healing watchdog (`run-live-server.sh`) only restarts the prod-server
**child process when that child EXITS**. It cannot detect:

- the whole host going dark;
- a prod-server that is *still alive* and owns `:3000` but has **hung** and never
  responds to HTTP;
- a crash that leaves a process alive but non-functional.

On 2026-08-20 a ~10h host-level outage went unnoticed until a human checked. The
liveness watchdog closes that gap: it probes `http://127.0.0.1:3000/api/health` every
few minutes from **outside** prod-server, and on sustained failure it restarts the
canonical server and **emails the owner** (real SendGrid path).

## How it survives

- It is a **different process** from prod-server, so prod-server crashes and watchdog
  restarts do not stop it.
- It keeps its **own single-instance lock** (`liveness-watchdog.lock`) + `liveness-status.json`
  in `DATA_DIR`, so two watchdogs can't double-alert, and its state is externally checkable.
- It is itself supervised to survive its own death — see the systemd unit below.

> **Honest limit.** On a single host, nothing survives the whole machine going dark.
> TRUE off-host liveness (a monitor that reports even when this entire host is down)
> requires external infrastructure: a second host, an external uptime service, or a
> platform scheduled task. This watchdog does **not** claim to provide off-host
> resilience — it is the best in-host detection layer, reducing an overlooked 10h
> outage to a ~9-minute detection + alert. Off-host is a separate, gated piece of work.

## How to run it

```bash
# from the repo (dev checkout) — NOT on the live host as the live monitor
bun run src/server/liveness-watchdog.ts

# or via the package script
bun run liveness
```

Environment overrides (all optional):

| Env var | Default | Meaning |
|---|---|---|
| `LV_PORT` | `3000` | Live port to probe |
| `LV_HEALTH_PATH` | `/api/health` | Health path (must return 2xx) |
| `LV_INTERVAL_MS` | `180000` (3 min) | Probe interval |
| `LV_DOWN_AFTER_FAILS` | `3` | Consecutive failures before declaring DOWN (anti-flicker) |
| `LV_TIMEOUT_MS` | `8000` | Per-probe HTTP timeout |
| `LV_STATUS_DIR` | `DATA_DIR` or `/var/lib/simplerlife100/.data` | Where lock + `liveness-status.json` live |
| `LV_ALERT_EMAIL` | `OWNER_ALERT_EMAIL` or `electric.vortexz@gmail.com` | Alert recipient |
| `LV_RELAUNCH_SCRIPT` | `/home/agent-lead/run-live-server.sh` | Relaunch script used when no server PID found |
| `LV_DETACH` | unset (daemon keeps running) | Set to `1`/`true` to detach the probe interval so the process can exit (auto-run/embed context). **Do NOT set in production** — the watchdog must stay alive to accumulate consecutive failures and alert. |

## What it does on failure

1. Probes fail for `LV_DOWN_AFTER_FAILS` consecutive checks (default 3) → it no longer
   flips during a brief boot/restart (anti-flicker).
2. It emails **one** "LIVE SITE DOWN" alert.
3. It **signals the canonical prod-server PID** (`DATA_DIR/prod-server.lock`) so the
   existing `run-live-server.sh` watchdog relaunches the child in ~3s. If no live PID is
   found, it launches `LV_RELAUNCH_SCRIPT` detached. It **never** binds `:3000` and never
   starts a competing prod-server — it only probes + supervises, honoring the
   single-instance guard (#188).
4. When the site responds again it sends **one** "RECOVERED" alert (no spam).

## Checking it's alive

```bash
cat /var/lib/simplerlife100/.data/liveness-status.json
# { "up": true, "consecutiveFails": 0, "pid": 12345, ... }
```

The `pid` field is the watchdog's own PID; `up` reflects the last declared state
(anti-flicker: `up` stays true until `LV_DOWN_AFTER_FAILS` consecutive failures).

## Optional: systemd unit (survive the watchdog's own death)

A unit file is provided at `scripts/liveness-watchdog.service`. Install it so the
watchdog is restarted by systemd if it ever dies:

```bash
sudo cp scripts/liveness-watchdog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now liveness-watchdog
```

(Adjust paths/WorkingDirectory in the unit to the live checkout.)

## Testing

`src/test/liveness-watchdog.test.ts` covers the probe + state machine with injected
fetch/email/recovery — no real port, no real email, no real processes beyond a spawned
stand-in for the lock test. Run it with:

```bash
bunx vitest run src/test/liveness-watchdog.test.ts
```
