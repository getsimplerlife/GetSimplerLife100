/**
 * portal.import.index.page.tsx — Phase 5.1 (6.6) native IMPORT & MIGRATION
 * portal surface (lazy route). THIS IS THE LAST PHASE 5 SLICE.
 *
 * Client-side, client-initiated import/migration lanes (owner 10-20
 * direction): a signed-in tenant sees the lanes catalog with honest trust
 * badges and per-lane copy, creates an import targeting one of their OWN
 * native tables, then runs the gated flow
 *     pull → read-only preview → save mapping → approve → commit
 * with the run ledger visible ("0 fabricated", "nothing imported until you
 * approve") and pending approvals surfaced. Every mutation rides the
 * Approval Queue (verb-first, verdict-first); preview never writes and never
 * gates; NO public share; tenant-keyed stores only; fail-closed auth.
 *
 * P2-2 upgrade (portal-only — ZERO server/native/auth changes):
 *   - run-status TIMELINE per import: pull → map → commit stage states drawn
 *     ONLY from the honest run ledger (`GET /api/native/import/:id/runs` →
 *     `at` timestamps + counts), with a chronological ledger list; no stage
 *     is ever shown as done unless the ledger has a matching run. Preview is
 *     read-only and is NOT recorded in the run ledger — the UI says so
 *     instead of inventing a "previewed" state.
 *   - BULK mapping: one row per source field with the target field selected
 *     from the tenant's OWN table schema (`GET /api/native/tables` →
 *     `fields[].key`) and sample values from the read-only preview; "Map all"
 *     POSTs the full mapping ARRAY in ONE gated call
 *     (`POST /api/native/import/:id/map` with `{mapping:[...]}` — same
 *     endpoint, same payload the lane was built to accept). Deterministic
 *     field mapping only — NO LLM anywhere.
 *   - MAPPING REVIEW TABLE before Approve/Commit: saved mappings (from the
 *     job's `mapping` array on `GET /api/native/import`) and any un-saved
 *     draft, each row with source field → target field → sample value.
 *
 * Copy truthfulness (per lane — enforced by
 * src/test/native-import-copy-sweep.test.ts):
 *   - WIRED lanes say "connect your own account to bring your data
 *     in" and state exactly what they read (bounded page-1 snapshots) and
 *     what they do NOT read ("file contents are NOT downloaded by this
 *     lane" / "message content is NOT downloaded" / "event attachments are
 *     NOT downloaded").
 *   - CONFIG-METADATA lanes (SFTP, SendGrid) say exactly what they read
 *     (their own stored config metadata) and that no live vendor API call is
 *     made ("no live SendGrid API call").
 *   - Not-wired providers are shown honestly as "Not wired yet".
 *   - The page NEVER claims we run through the tenant's tools, never
 *     "syncs", never "writes back", and never resumes the retired
 *     external-connection program — one-shot/client-initiated only.
 * The static framing sentences below ("Connect your existing tools to bring
 * your data in", "We never run through your tools", "nothing syncs in the
 * background", "nothing writes back", "nothing is imported until you
 * approve", "approval-gated") are pinned by the copy-sweep SSR test — keep
 * them verbatim when editing.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import FileImportPanel from "~/components/FileImportPanel";

/** Per-lane HONEST trust copy — the single source of truth for what each
 *  lane reads and does NOT read. Keyed by canonical provider id (the ids the
 *  lanes catalog reports via /api/native/import/lanes). */
export const IMPORT_LANE_COPY: Record<
  string,
  { name: string; family: "live" | "live-file" | "live-event" | "live-channel" | "config" | "soon"; copy: string }
> = {
  xero: {
    name: "Xero",
    family: "live",
    copy: "Connect your own Xero account to bring your accounting data in — bounded snapshot, page 1. One-shot, approval-gated. Nothing writes back.",
  },
  hubspot: {
    name: "HubSpot",
    family: "live",
    copy: "Connect your own HubSpot account to bring your CRM data in — bounded snapshot, page 1. One-shot, approval-gated. Nothing writes back.",
  },
  onedrive: {
    name: "OneDrive",
    family: "live-file",
    copy: "Connect your own OneDrive account — lists file METADATA (root, page 1). File contents are NOT downloaded by this lane.",
  },
  "google-drive": {
    name: "Google Drive",
    family: "live-file",
    copy: "Connect your own Google Drive account — lists file METADATA (root, page 1). File contents are NOT downloaded by this lane.",
  },
  dropbox: {
    name: "Dropbox",
    family: "live-file",
    copy: "Connect your own Dropbox account — lists file METADATA (root, page 1). File contents are NOT downloaded by this lane.",
  },
  box: {
    name: "Box",
    family: "live-file",
    copy: "Connect your own Box account — lists file METADATA (root, page 1). File contents are NOT downloaded by this lane.",
  },
  sharepoint: {
    name: "SharePoint",
    family: "live-file",
    copy: "Connect your own SharePoint account — lists file METADATA from your document library (root, page 1). File contents are NOT downloaded by this lane.",
  },
  sftp: {
    name: "SFTP (Secure Transport)",
    family: "config",
    copy: "Config-metadata lane — reads your own Secure Transport SFTP connection configuration (connections + rules). No live SFTP connection is made and file content transfer is not part of this lane.",
  },
  "google-calendar": {
    name: "Google Calendar",
    family: "live-event",
    copy: "Connect your own Google Calendar account — lists calendar EVENT metadata (primary calendar, last 30 days, page 1). Event attachments are NOT downloaded by this lane.",
  },
  slack: {
    name: "Slack",
    family: "live-channel",
    copy: "Connect your own Slack account — lists workspace CHANNEL metadata (page 1). Message content is NOT downloaded by this lane.",
  },
  sendgrid: {
    name: "SendGrid",
    family: "config",
    copy: "Config-metadata lane — records your SendGrid connection config metadata only. No live SendGrid API call is made and email content is never transferred by this lane.",
  },
  quickbooks: { name: "QuickBooks", family: "soon", copy: "Not wired yet — available in a future slice." },
  microsoft: { name: "Microsoft 365", family: "soon", copy: "Not wired yet — available in a future slice." },
  "google-workspace": { name: "Google Workspace", family: "soon", copy: "Not wired yet — available in a future slice." },
  docusign: { name: "DocuSign", family: "soon", copy: "Not wired yet — available in a future slice." },
  priority: { name: "Priority", family: "soon", copy: "Not wired yet — available in a future slice." },
};

/** Trust badge text per lane family. */
export const LANE_BADGE: Record<string, string> = {
  live: "Connected lane",
  "live-file": "Connected lane · file metadata",
  "live-event": "Connected lane · event metadata",
  "live-channel": "Connected lane · channel metadata",
  config: "Config-metadata lane",
  soon: "Not wired yet",
};

// ── P2-2 pure helpers (exported for unit tests) ─────────────────────────────

/** Ledger op → human stage label (only ever used to label a run the ledger
 *  actually recorded — never to claim a stage ran). */
export const HUMAN_OP: Record<string, string> = {
  createImport: "Create",
  pullImportData: "Pull",
  mapImportFields: "Map",
  commitImport: "Commit",
  updateImport: "Update",
  deleteImport: "Delete",
  reject: "Rejected",
};

/** Map a ledger op to its timeline stage family (pull|map|commit|other). */
export function stageOf(op: string | undefined): "pull" | "map" | "commit" | "other" {
  switch (op) {
    case "pullImportData":
      return "pull";
    case "mapImportFields":
      return "map";
    case "commitImport":
      return "commit";
    default:
      return "other";
  }
}

/** One-line outcome summary built ONLY from real ledger counts. */
export function runOutcomeLine(r: { pulled?: number; mapped?: number; skipped?: number; committed?: number; failed?: number }): string {
  const parts: string[] = [];
  if ((r.pulled ?? 0) > 0) parts.push(`${r.pulled} pulled`);
  if ((r.mapped ?? 0) > 0) parts.push(`${r.mapped} mapped`);
  if ((r.skipped ?? 0) > 0) parts.push(`${r.skipped} skipped`);
  if ((r.committed ?? 0) > 0) parts.push(`${r.committed} committed`);
  if ((r.failed ?? 0) > 0) parts.push(`${r.failed} failed`);
  return parts.length ? parts.join(" · ") : "recorded with no row counts";
}

/** First non-empty scalar sample for a source field across the staged preview
 *  rows — an honest sample, never fabricated. */
export function firstSample(rows: Array<Record<string, unknown>>, field: string): string | null {
  for (const row of rows) {
    const v = row[field];
    if (v === undefined || v === null) continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (s.trim().length > 0) return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  }
  return null;
}

/** Build the deterministic bulk-mapping payload: one entry per source field
 *  with a non-empty target, de-duplicated by source field. */
export function bulkMappingPayload(draft: Record<string, string>): Array<{ sourceField: string; targetField: string }> {
  const out: Array<{ sourceField: string; targetField: string }> = [];
  for (const [sourceField, targetField] of Object.entries(draft)) {
    const tf = targetField?.trim() ?? "";
    if (!sourceField || !tf) continue;
    if (out.some((m) => m.sourceField === sourceField)) continue;
    out.push({ sourceField, targetField: tf });
  }
  return out;
}

// ── API view types (mirror the public projections the endpoints return) ─────

interface LaneView {
  provider: string;
  wired: boolean;
}
interface TableFieldView {
  key: string;
  label?: string;
  type?: string;
}
interface TableView {
  id: string;
  name: string;
  fields?: TableFieldView[];
}
interface MappingView {
  sourceField: string;
  targetField: string;
  coerce?: string;
}
interface ImportView {
  id: string;
  provider: string;
  sourceLabel: string;
  status: string;
  createdAt: string;
  tableId?: string;
  mapping?: MappingView[];
}
/** Ledger entry exactly as publicRun exposes it (op, at, counts, note). */
interface RunLedger {
  id: string;
  op: string;
  at: string;
  by?: string;
  pulled?: number;
  mapped?: number;
  skipped?: number;
  committed?: number;
  failed?: number;
  note?: string;
  httpStatus?: number;
}
interface PreviewView {
  rows: Array<Record<string, unknown>>;
  staged?: number;
  note?: string;
}
interface PendingWriteView {
  id: string;
  op: string;
  action: string;
  status: string;
  requestedAt: string;
}
const json = async (r: Response) => {
  const t = await r.text().catch(() => "{}");
  try {
    return JSON.parse(t);
  } catch {
    return { error: t };
  }
};
async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: any; error?: string }> {
  const res = await fetch(path, { credentials: "include", headers: { accept: "application/json", "content-type": "application/json" }, ...init });
  const body = await json(res);
  return { ok: res.ok, data: body?.data, error: body?.error ?? (res.ok ? undefined : `HTTP ${res.status}`) };
}

export default function PortalImportIndexPage() {
  const [lanes, setLanes] = useState<LaneView[]>([]);
  const [tables, setTables] = useState<TableView[]>([]);
  const [imports, setImports] = useState<ImportView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [runsByJob, setRunsByJob] = useState<Record<string, RunLedger[]>>({});
  const [previewByJob, setPreviewByJob] = useState<Record<string, PreviewView>>({});
  const [mapDrafts, setMapDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [l, t, i, w] = await Promise.all([
      api("/api/native/import/lanes"),
      api("/api/native/tables"),
      api("/api/native/import"),
      api("/api/native/import/writes"),
    ]);
    if (l.data) setLanes((l.data.lanes as LaneView[]) ?? []);
    if (t.data) setTables((t.data.tables as TableView[]) ?? []);
    if (i.data) setImports((i.data.imports as ImportView[]) ?? []);
    if (w.data) setWrites((w.data.writes as PendingWriteView[]) ?? []);
    // Auto-load each import's run ledger (honest timeline source).
    const ids: string[] = Array.isArray(i.data?.imports)
      ? (i.data.imports as ImportView[]).map((im) => im.id)
      : [];
    const results = await Promise.all(
      ids.map(async (id) => {
        const r = await api(`/api/native/import/${id}/runs`);
        return [id, (r.data?.runs as RunLedger[]) ?? []] as const;
      })
    );
    setRunsByJob(Object.fromEntries(results));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function createForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const provider = String(f.get("provider") ?? "");
    const sourceLabel = String(f.get("sourceLabel") ?? "").trim();
    const tableId = String(f.get("tableId") ?? "");
    if (!provider || !sourceLabel || !tableId) {
      setNote("Choose a provider, a label, and a target table.");
      return;
    }
    setCreating(true);
    void api("/api/native/import", {
      method: "POST",
      body: JSON.stringify({ provider, sourceLabel, target: { kind: "table", tableId } }),
    }).then(async (r) => {
      setCreating(false);
      if (r.ok) {
        if (r.data?.status === "applied") setNote(`Import ${r.data.id} created — ready to pull.`);
        else if (r.data?.status === "pending") setNote("Import creation queued for approval — approve it below, then pull.");
        else setNote("Import created.");
      } else {
        setNote(`Create failed: ${r.error ?? "unknown error"}`);
      }
      await load();
      (e.currentTarget as HTMLFormElement).reset();
    });
  }
  function act(importId: string, verb: "pull" | "commit" | "delete", payload?: Record<string, unknown>): void {
    setBusy((b) => ({ ...b, [`${importId}:${verb}`]: true }));
    void api(`/api/native/import/${importId}/${verb}`, { method: "POST", body: JSON.stringify(payload ?? {}) }).then(async (r) => {
      setBusy((b) => ({ ...b, [`${importId}:${verb}`]: false }));
      if (r.ok) {
        if (r.data?.status === "pending") setNote(`${verb} queued for approval — approve it below.`);
        else if (r.data?.status === "applied") setNote(`${verb} applied.`);
        else setNote(`${verb} complete.`);
      } else {
        setNote(`${verb} failed: ${r.error ?? "unknown error"}`);
      }
      await load();
    });
  }
  function preview(importId: string): void {
    setBusy((b) => ({ ...b, [`${importId}:preview`]: true }));
    void api(`/api/native/import/${importId}/preview`, { method: "POST", body: JSON.stringify({}) }).then(async (r) => {
      setBusy((b) => ({ ...b, [`${importId}:preview`]: false }));
      if (r.ok) {
        const rows = (r.data?.previewRows as Array<Record<string, unknown>>) ?? [];
        setPreviewByJob((p) => ({ ...p, [importId]: { rows, staged: r.data?.staged ?? rows.length, note: r.data?.note } }));
        setNote(r.data?.note ?? "read-only preview — nothing was written or queued");
      } else {
        setNote(`preview failed: ${r.error ?? "unknown error"}`);
      }
      await load();
    });
  }
  function setDraft(importId: string, sourceField: string, targetField: string): void {
    setMapDrafts((d) => ({ ...d, [importId]: { ...(d[importId] ?? {}), [sourceField]: targetField } }));
  }
  function bulkMap(importId: string): void {
    const mapping = bulkMappingPayload(mapDrafts[importId] ?? {});
    if (mapping.length === 0) {
      setNote("Map at least one source field to a target field first.");
      return;
    }
    setBusy((b) => ({ ...b, [`${importId}:map`]: true }));
    void api(`/api/native/import/${importId}/map`, { method: "POST", body: JSON.stringify({ mapping }) }).then(async (r) => {
      setBusy((b) => ({ ...b, [`${importId}:map`]: false }));
      if (r.ok) {
        const saved = r.data?.status === "pending" ? `${mapping.length} mapping(s) queued for approval — approve it below.` : `${mapping.length} mapping(s) saved.`;
        setNote(r.data?.status === "pending" ? saved : `${mapping.length} mapping(s) saved.`);
      } else {
        setNote(`map failed: ${r.error ?? "unknown error"}`);
      }
      await load();
    });
  }
  function decide(imwId: string, verdict: "apply" | "reject"): void {
    void api(`/api/native/import/writes/${imwId}/${verdict}`, { method: "POST", body: JSON.stringify({}) }).then(async (r) => {
      setNote(r.ok ? (verdict === "apply" ? "Approved." : "Rejected.") : `decision failed: ${r.error ?? "unknown error"}`);
      await load();
    });
  }

  const wiredLanes = lanes.filter((l) => l.wired);
  const wiredCount = wiredLanes.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import &amp; migration</h1>
        <p className="text-sm text-slate-400">
          Connect your existing tools to bring your data in — one-time, client-initiated transfers into your own
          tables. You connect your own accounts (credentials stay encrypted and yours), choose what to import,
          preview before anything changes, and approve every step. We never run through your tools, nothing syncs in
          the background, nothing writes back, and nothing is imported until you approve.
        </p>
      </div>
      {/* Slice 137 — the credential-free lane: import a FILE into a real store. */}
      <FileImportPanel />

      {note && <div className="rounded-md bg-amber-950/50 border border-amber-700/40 px-3 py-2 text-sm">{note}</div>}

      {/* Pending approvals — verdict-first Approval Queue mirror */}
      {writes.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="font-medium mb-2">Pending approvals</h2>
            <ul className="space-y-1 text-sm">
              {writes.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Badge>{w.action}</Badge> <span className="ml-1 text-slate-300">{w.op}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => void decide(w.id, "apply")}>Approve</Button>
                    <Button variant="secondary" size="sm" onClick={() => void decide(w.id, "reject")}>Reject</Button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-2">Every import action is approval-gated and audited. Nothing is imported until you approve.</p>
          </CardBody>
        </Card>
      )}

      {/* Lanes catalog — honest per-lane trust badges */}
      <Card>
        <CardBody>
          <h2 className="font-medium mb-1">Import lanes ({wiredCount} wired)</h2>
          <p className="text-xs text-slate-400 mb-3">
            Each lane connects YOUR OWN account and pulls a bounded, page-1 snapshot to stage for review. Copy is
            per-lane: live lanes say exactly what they read and what they don't; config-metadata lanes say no live
            provider call is made.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lanes.map((l) => {
              const meta = IMPORT_LANE_COPY[l.provider] ?? { name: l.provider, family: "soon" as const, copy: "Not wired yet — available in a future slice." };
              return (
                <div key={l.provider} className="rounded border border-slate-700/60 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{meta.name}</span>
                    <Badge>{l.wired ? LANE_BADGE[meta.family] ?? "Connected lane" : LANE_BADGE.soon}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{meta.copy}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* New import — client-managed, targets the tenant's own table */}
      <Card id="import-composer">
        <CardBody>
          <h2 className="font-medium mb-1">Start an import</h2>
          <p className="text-xs text-slate-400 mb-3">Pick a wired lane, label the import, and choose one of your own tables as the target. Creation is approval-gated.</p>
          <form onSubmit={createForm} className="grid gap-2 text-sm sm:grid-cols-3">
            <select name="provider" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
              <option value="">Lane…</option>
              {wiredLanes.map((l) => (
                <option key={l.provider} value={l.provider}>{IMPORT_LANE_COPY[l.provider]?.name ?? l.provider}</option>
              ))}
            </select>
            <input name="sourceLabel" placeholder="Source label (e.g. Acme Books)" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
            <select name="tableId" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
              <option value="">Target table…</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.fields?.length != null ? ` (${t.fields.length} fields)` : ""}</option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={creating} className="sm:col-span-3">
              {creating ? "Creating…" : "Create import (approval-gated)"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Import jobs — pull → preview → map → commit with run-ledger timeline */}
      <Card>
        <CardBody>
          <h2 className="font-medium mb-2">Your imports</h2>
          {imports.length === 0 ? (
            <PortalEmptyState
              title="No imports yet"
              body="Set up your first import with the form above: pick a lane, name it, and choose one of your own tables as the target. Preview and approve every step — nothing is imported until you approve."
              action={{ label: "New import", onClick: () => scrollToId("import-composer") }}
            />
          ) : (
            <div className="space-y-3">
              {imports.map((im) => {
                const jobRuns = runsByJob[im.id] ?? [];
                const previewState = previewByJob[im.id];
                const previewRows = previewState?.rows ?? [];
                const sourceKeys = previewRows.length > 0 ? Object.keys(previewRows[0] ?? {}) : [];
                const table = tables.find((t) => t.id === im.tableId);
                const tableFields = table?.fields ?? [];
                const savedMappings = im.mapping ?? [];
                const draft = mapDrafts[im.id] ?? {};
                const stageRun = (stage: "pull" | "map" | "commit") => {
                  const matched = jobRuns.filter((r) => stageOf(r.op) === stage);
                  if (matched.length === 0) return null;
                  return matched[matched.length - 1]; // ascending by at → last = newest
                };
                const draftEdits = Object.entries(draft)
                  .filter(([sourceField, targetField]) => targetField?.trim() && !savedMappings.some((m) => m.sourceField === sourceField && m.targetField === targetField?.trim()));
                return (
                  <div key={im.id} className="rounded border border-slate-700/60 bg-slate-900/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium">{IMPORT_LANE_COPY[im.provider]?.name ?? im.provider}</span>
                        <span className="ml-2 text-xs text-slate-400">{im.sourceLabel}</span>
                        <span className="ml-2 text-xs text-slate-400">→ {table?.name ?? im.tableId ?? "table"}</span>
                      </div>
                      <span className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span>{im.id}</span>
                        <Badge>{im.status}</Badge>
                      </span>
                    </div>

                    {/* Run-status timeline — stage states come ONLY from the honest ledger */}
                    <div className="mt-3 rounded border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Run status</h3>
                        {jobRuns.length > 0 && (
                          <span className="text-[10px] text-slate-500">
                            {jobRuns.length} run(s) recorded — from your import's run ledger
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {(["pull", "map", "commit"] as const).map((stage) => {
                          const r = stageRun(stage);
                          const lastRun = jobRuns.filter((x) => stageOf(x.op) === stage);
                          return (
                            <div key={stage} className={`rounded border px-3 py-2 ${r ? "border-emerald-700/40 bg-emerald-950/20" : "border-slate-800 bg-slate-900/60"}`}>
                              <div className="flex items-center gap-2">
                                <span className={`inline-block h-2.5 w-2.5 rounded-full ${r ? "bg-emerald-400" : "bg-slate-700"}`} />
                                <span className="text-xs font-semibold capitalize">{stage}</span>
                                {lastRun.length > 0 && <span className="text-[10px] text-slate-500">{lastRun.length}×</span>}
                              </div>
                              {r ? (
                                <>
                                  <p className="mt-1 text-xs text-emerald-300">{runOutcomeLine(r)}</p>
                                  <p className="text-[10px] text-slate-400">{new Date(r.at).toLocaleString()}</p>
                                  {r.httpStatus != null && <p className="text-[10px] text-slate-500 font-mono">HTTP {r.httpStatus}</p>}
                                </>
                              ) : (
                                <p className="mt-1 text-[10px] text-slate-500">not yet run — the ledger has no {stage} entry</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        Stage states are drawn only from your run ledger — no state is invented here. Preview is
                        read-only and is not recorded in the run ledger (it never writes).
                      </p>
                      {jobRuns.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs border-t border-slate-800 pt-2">
                          {[...jobRuns].reverse().map((r) => (
                            <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-slate-400">
                              <span className={`inline-block h-1.5 w-1.5 self-center rounded-full ${(r.failed ?? 0) > 0 ? "bg-rose-400" : stageOf(r.op) === "pull" ? "bg-sky-400" : stageOf(r.op) === "map" ? "bg-violet-400" : stageOf(r.op) === "commit" ? "bg-emerald-400" : "bg-slate-500"}`} />
                              <span className="font-mono text-slate-300">{HUMAN_OP[r.op] ?? r.op}</span>
                              <span className="text-[10px] text-slate-500">{new Date(r.at).toLocaleString()}</span>
                              <span>{runOutcomeLine(r)}</span>
                              {r.httpStatus != null && <span className="font-mono text-[10px] text-slate-500">HTTP {r.httpStatus}</span>}
                              {r.note && <span className="text-[10px] text-slate-500">{r.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {jobRuns.length === 0 && (
                        <p className="mt-2 text-xs text-slate-500">No runs recorded yet — nothing has been pulled, mapped, or imported.</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" disabled={busy[`${im.id}:pull`]} onClick={() => act(im.id, "pull")}>Pull</Button>
                      <Button variant="secondary" size="sm" disabled={busy[`${im.id}:preview`]} onClick={() => preview(im.id)}>Preview</Button>
                      <Button variant="secondary" size="sm" disabled={busy[`${im.id}:commit`]} onClick={() => act(im.id, "commit")}>Commit</Button>
                      <Button variant="secondary" size="sm" onClick={() => act(im.id, "delete")}>Delete</Button>
                      {previewState?.staged != null && (
                        <span className="text-xs text-slate-400">{`${previewState.staged} row(s) staged — nothing imported until you approve`}</span>
                      )}
                    </div>

                    {/* Mapping review table + bulk mapping (from read-only preview) */}
                    {previewRows.length > 0 && (
                      <div className="mt-3">
                        {/* Saved mappings — review grid: source → target → sample */}
                        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mapping review</h3>
                          {savedMappings.length === 0 ? (
                            <p className="mt-1 text-xs text-slate-500">No mappings saved yet — set them below and save as one bulk mapping.</p>
                          ) : (
                            <table className="mt-2 w-full text-left text-xs">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="py-1 pr-2 font-medium">Source field</th>
                                  <th className="py-1 pr-2 font-medium">→</th>
                                  <th className="py-1 pr-2 font-medium">Target field</th>
                                  <th className="py-1 font-medium">Sample value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {savedMappings.map((m) => (
                                  <tr key={`${m.sourceField}:${m.targetField}`} className="border-t border-slate-800">
                                    <td className="py-1 pr-2 font-mono text-slate-300">{m.sourceField}</td>
                                    <td className="py-1 pr-2 text-slate-500">→</td>
                                    <td className="py-1 pr-2 font-mono text-emerald-300">{m.targetField}{m.coerce ? <span className="ml-1 text-[10px] text-slate-500">coerce:{m.coerce}</span> : null}</td>
                                    <td className="py-1 text-slate-400">{firstSample(previewRows, m.sourceField) ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {draftEdits.length > 0 && (
                            <div className="mt-2 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Un-saved draft (not yet submitted)</p>
                              <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                                {draftEdits.map(([s, t]) => (
                                  <li key={s} className="font-mono">{s} → {t}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="mt-2 text-[10px] text-slate-500">
                            Review the mapping before you commit — Commit is approval-gated and nothing is imported
                            until you approve. Sample values come from the staged preview.
                          </p>
                        </div>

                        {/* Bulk mapping — every source field in one pass */}
                        {tableFields.length > 0 ? (
                          <div className="mt-2 rounded border border-slate-800 bg-slate-950/40 p-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Map source fields (bulk)</h3>
                            <p className="mt-1 text-[10px] text-slate-500">
                              Assign each source field a field in your target table. “Map all” saves every assignment
                              in ONE approval-gated mapping request.
                            </p>
                            <table className="mt-2 w-full text-left text-xs">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="py-1 pr-2 font-medium">Source field</th>
                                  <th className="py-1 pr-2 font-medium">Sample</th>
                                  <th className="py-1 font-medium">Target field in {table?.name ?? "table"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sourceKeys.map((k) => {
                                  const saved = savedMappings.find((m) => m.sourceField === k)?.targetField ?? "";
                                  const value = draft[k] ?? saved;
                                  return (
                                    <tr key={k} className="border-t border-slate-800">
                                      <td className="py-1 pr-2 font-mono text-slate-300">{k}</td>
                                      <td className="py-1 pr-2 text-slate-400 max-w-[16rem] truncate">{firstSample(previewRows, k) ?? "—"}</td>
                                      <td className="py-1">
                                        <select
                                          value={value}
                                          onChange={(e) => setDraft(im.id, k, e.target.value)}
                                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                                        >
                                          <option value="">Not mapped</option>
                                          {tableFields.map((f) => (
                                            <option key={f.key} value={f.key}>{f.key}{f.label && f.label !== f.key ? ` (${f.label})` : ""}</option>
                                          ))}
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button variant="primary" size="sm" disabled={busy[`${im.id}:map`]} onClick={() => bulkMap(im.id)}>
                                {busy[`${im.id}:map`] ? "Saving…" : `Map all ${sourceKeys.length} field(s)`}
                              </Button>
                              <span className="text-[10px] text-slate-500">Rows left as “Not mapped” are skipped.</span>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">
                            The target table has no fields yet — add fields in the Tables area, then map source fields
                            here.
                          </p>
                        )}
                      </div>
                    )}

                    {previewRows.length > 0 && (
                      <div className="mt-2 max-h-64 overflow-auto rounded border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 sticky top-0">
                            <tr>{sourceKeys.map((k) => <th key={k} className="px-2 py-1 text-slate-400">{k}</th>)}</tr>
                          </thead>
                          <tbody>
                            {previewRows.slice(0, 10).map((r, idx) => (
                              <tr key={idx} className="border-t border-slate-800">
                                {sourceKeys.map((k) => (
                                  <td key={k} className="px-2 py-1 text-slate-300">{typeof r[k] === "object" ? JSON.stringify(r[k]) : String(r[k] ?? "")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-slate-500 px-2 py-1">Read-only preview — nothing was written or queued.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </CardBody>
        </Card>

      <p className="text-xs text-slate-500">
        One-shot, client-initiated imports only — no background sync, no write-back, no connection we maintain on
        your behalf. Every step is approval-gated, audited, and bounded (page-1 snapshots, capped rows, 512 KiB).
        Nothing is imported until you approve.
      </p>
    </div>
  );
}