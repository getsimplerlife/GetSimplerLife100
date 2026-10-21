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
 * Copy truthfulness (per lane — enforced by
 * src/test/native-import-copy-sweep.test.ts):
 *   - LIVE provider lanes say "connect your own account to bring your data
 *     in" and state exactly what they read (bounded page-1 snapshots) and
 *     what they do NOT read ("file contents are NOT downloaded by this
 *     lane" / "message content is NOT downloaded" / "event attachments are
 *     NOT downloaded").
 *   - CONFIG-METADATA lanes (SFTP, SendGrid) say exactly what they read
 *     (their own stored config metadata) and that no live provider call is
 *     made ("no live SendGrid API call").
 *   - Not-wired providers are shown honestly as "Not wired yet".
 *   - The page NEVER claims we run through the tenant's tools, never
 *     "syncs", never "writes back", and never resumes the retired reconnect
 *     program — one-shot/client-initiated only.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

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
    copy: "Live provider lane — connect your own Xero account to bring your accounting data in (bounded snapshot, page 1). One-shot, approval-gated. Nothing writes back.",
  },
  hubspot: {
    name: "HubSpot",
    family: "live",
    copy: "Live provider lane — connect your own HubSpot account to bring your CRM data in (bounded snapshot, page 1). One-shot, approval-gated. Nothing writes back.",
  },
  onedrive: {
    name: "OneDrive",
    family: "live-file",
    copy: "Live provider lane — lists file METADATA from your own OneDrive (root, page 1). File contents are NOT downloaded by this lane.",
  },
  "google-drive": {
    name: "Google Drive",
    family: "live-file",
    copy: "Live provider lane — lists file METADATA from your own Google Drive (root, page 1). File contents are NOT downloaded by this lane.",
  },
  dropbox: {
    name: "Dropbox",
    family: "live-file",
    copy: "Live provider lane — lists file METADATA from your own Dropbox (root, page 1). File contents are NOT downloaded by this lane.",
  },
  box: {
    name: "Box",
    family: "live-file",
    copy: "Live provider lane — lists file METADATA from your own Box (root, page 1). File contents are NOT downloaded by this lane.",
  },
  sharepoint: {
    name: "SharePoint",
    family: "live-file",
    copy: "Live provider lane — lists file METADATA from your own SharePoint document library (root, page 1). File contents are NOT downloaded by this lane.",
  },
  sftp: {
    name: "SFTP (Secure Transport)",
    family: "config",
    copy: "Config-metadata lane — reads your own Secure Transport SFTP connection configuration (connections + rules). No live SFTP connection is made and file content transfer is not part of this lane.",
  },
  "google-calendar": {
    name: "Google Calendar",
    family: "live-event",
    copy: "Live provider lane — lists calendar EVENT metadata from your own Google Calendar (primary calendar, last 30 days, page 1). Event attachments are NOT downloaded by this lane.",
  },
  slack: {
    name: "Slack",
    family: "live-channel",
    copy: "Live provider lane — lists workspace CHANNEL metadata from your own Slack (page 1). Message content is NOT downloaded by this lane.",
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
  live: "LIVE provider lane",
  "live-file": "LIVE provider lane · file metadata",
  "live-event": "LIVE provider lane · event metadata",
  "live-channel": "LIVE provider lane · channel metadata",
  config: "Config-metadata lane",
  soon: "Not wired yet",
};

interface LaneView {
  provider: string;
  wired: boolean;
}
interface TableView {
  id: string;
  name: string;
  fieldCount?: number;
}
interface ImportView {
  id: string;
  provider: string;
  sourceLabel: string;
  status: string;
  createdAt: string;
  tableId?: string;
  stagedRows?: number;
}
interface RunView {
  id: string;
  op: string;
  status: string;
  note: string;
  pulled?: number;
  failed?: number;
  httpStatus?: number;
  createdAt: string;
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
  const [runsByJob, setRunsByJob] = useState<Record<string, RunView[]>>({});
  const [previewByJob, setPreviewByJob] = useState<Record<string, Array<Record<string, unknown>>>>({});
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
  function act(importId: string, verb: "pull" | "map" | "commit" | "delete", payload?: Record<string, unknown>): void {
    void api(`/api/native/import/${importId}/${verb}`, { method: "POST", body: JSON.stringify(payload ?? {}) }).then(async (r) => {
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
    void api(`/api/native/import/${importId}/preview`, { method: "POST", body: JSON.stringify({}) }).then((r) => {
      if (r.ok) {
        const rows = (r.data?.previewRows as Array<Record<string, unknown>>) ?? [];
        setPreviewByJob((p) => ({ ...p, [importId]: rows }));
        setNote(r.data?.note ?? "read-only preview — nothing was written or queued");
      } else {
        setNote(`preview failed: ${r.error ?? "unknown error"}`);
      }
      void load();
    });
  }
  function runs(importId: string): void {
    void api(`/api/native/import/${importId}/runs`).then((r) => {
      if (r.ok) setRunsByJob((m) => ({ ...m, [importId]: (r.data?.runs as RunView[]) ?? [] }));
    });
  }
  function mappingForm(importId: string, e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sourceField = String(f.get("sourceField") ?? "");
    const targetField = String(f.get("targetField") ?? "");
    if (!sourceField || !targetField) return;
    void api(`/api/native/import/${importId}/map`, { method: "POST", body: JSON.stringify({ mapping: [{ sourceField, targetField }] }) }).then(async (r) => {
      setNote(r.ok ? "Mapping saved (approve below if queued)." : `map failed: ${r.error ?? "unknown error"}`);
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
                    <Badge>{l.wired ? LANE_BADGE[meta.family] ?? "LIVE provider lane" : LANE_BADGE.soon}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{meta.copy}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* New import — client-managed, targets the tenant's own table */}
      <Card>
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
                <option key={t.id} value={t.id}>{t.name}{t.fieldCount != null ? ` (${t.fieldCount} fields)` : ""}</option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={creating} className="sm:col-span-3">
              {creating ? "Creating…" : "Create import (approval-gated)"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Import jobs — pull → preview → map → commit with honest run ledger */}
      {imports.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="font-medium mb-2">Your imports</h2>
            <div className="space-y-3">
              {imports.map((im) => {
                const jobRuns = runsByJob[im.id] ?? [];
                const previewRows = previewByJob[im.id] ?? [];
                const sourceKeys = previewRows.length > 0 ? Object.keys(previewRows[0] ?? {}) : [];
                const table = tables.find((t) => t.id === im.tableId);
                return (
                  <div key={im.id} className="rounded border border-slate-700/60 bg-slate-900/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium">{IMPORT_LANE_COPY[im.provider]?.name ?? im.provider}</span>
                        <span className="ml-2 text-xs text-slate-400">{im.sourceLabel}</span>
                        <span className="ml-2 text-xs text-slate-400">→ {table?.name ?? im.tableId ?? "table"}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{im.id} · {im.status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button variant="primary" size="sm" onClick={() => act(im.id, "pull")}>Pull</Button>
                      <Button variant="secondary" size="sm" onClick={() => preview(im.id)}>Preview</Button>
                      <Button variant="secondary" size="sm" onClick={() => act(im.id, "commit")}>Commit</Button>
                      <Button variant="secondary" size="sm" onClick={() => act(im.id, "delete")}>Delete</Button>
                      <Button variant="secondary" size="sm" onClick={() => runs(im.id)}>{jobRuns.length ? `Ledger (${jobRuns.length})` : "Ledger"}</Button>
                      {(im as ImportView & { stagedRows?: number }).stagedRows != null && (
                        <span className="text-xs text-slate-400">{`${(im as ImportView & { stagedRows?: number }).stagedRows} row(s) staged — nothing imported until you approve`}</span>
                      )}
                    </div>
                    {sourceKeys.length > 0 && (
                      <form onSubmit={(e) => mappingForm(im.id, e)} className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                        <select name="sourceField" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                          <option value="">Source field…</option>
                          {sourceKeys.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <input name="targetField" placeholder="Target table field" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                        <Button type="submit" variant="secondary" size="sm">Save mapping</Button>
                      </form>
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
                    {jobRuns.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {jobRuns.map((r) => (
                          <li key={r.id} className="text-slate-400">
                            <span className="font-mono text-slate-500">{r.op}</span>
                            <span className="ml-2">{r.status}</span>
                            {r.httpStatus != null && <span className="ml-2 font-mono">HTTP {r.httpStatus}</span>}
                            {r.note && <span className="ml-2">{r.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        One-shot, client-initiated imports only — no background sync, no write-back, no connection we maintain on
        your behalf. Every step is approval-gated, audited, and bounded (page-1 snapshots, capped rows, 512 KiB).
        Nothing is imported until you approve.
      </p>
    </div>
  );
}