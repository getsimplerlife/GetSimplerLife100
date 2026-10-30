/**
 * FileImportPanel.tsx — slice 137: the UNIVERSAL FILE IMPORT panel.
 *
 * Rendered inside /portal/import (it extends that page; it does not duplicate
 * it). Runs the whole credential-free flow against /api/native/import/file*:
 *
 *   choose target → upload CSV/JSON → map columns → preview (per-row errors)
 *   → commit (approval-gated) → see the result
 *
 * HONESTY RULES THIS PANEL FOLLOWS:
 *   - every number shown comes from the server's own validation response; the
 *     panel never estimates, animates or invents progress;
 *   - it imports FILES. It does not connect to any provider, syncs nothing in
 *     the background and writes nothing back;
 *   - the de-dupe policy (skip, never update) and the caps are stated on
 *     screen before the user commits;
 *   - .xlsx is refused with the reason and the fix (save as CSV), because this
 *     build has no spreadsheet parser.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface TargetField {
  key: string;
  label: string;
  type: string;
  required: boolean;
}
export interface FileImportTargetView {
  kind: "table" | "kb-article";
  tableId?: string;
  name: string;
  rows: number;
  fields: TargetField[];
}
export interface FileImportJobView {
  id: string;
  name: string;
  target: { kind: "table" | "kb-article"; tableId?: string };
  format: string | null;
  status: string;
  columns: string[];
  mapping: Array<{ sourceField: string; targetField: string }>;
  rowCount: number;
  committedCount: number | null;
  skippedCount: number | null;
}
export interface FileImportRowErrorView {
  rowNumber: number;
  reasons: string[];
}
export interface FileImportDetailView {
  import: FileImportJobView;
  rows: Array<{ rowNumber: number; values: Record<string, unknown> }>;
  rowCount: number;
  validation: {
    total: number;
    valid: number;
    skipped: number;
    invalid: number;
    errors: FileImportRowErrorView[];
    skippedRowNumbers: number[];
    records: Array<Record<string, unknown>>;
  };
  pending: { fiwId: string; rowCount: number } | null;
}

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const res = await fetch(path, { credentials: "include", headers: { accept: "application/json", "content-type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: body?.data, error: body?.error ?? (res.ok ? undefined : `HTTP ${res.status}`) };
}

/** Same message the server gives — shown BEFORE uploading so nobody wastes a
 *  round-trip, and the server stays the authority on the actual rejection. */
export const XLSX_MESSAGE =
  "Excel workbooks (.xlsx/.xls) are not supported in this build — no spreadsheet parser is bundled. Save the sheet as CSV (File → Save as → CSV) and upload that.";

/** Suggest a target field for a source column (exact, then case-insensitive). */
export function suggestTarget(source: string, fields: TargetField[]): string {
  const exact = fields.find((f) => f.key === source);
  if (exact) return exact.key;
  const lower = source.trim().toLowerCase();
  const ci = fields.find((f) => f.key.toLowerCase() === lower || f.label.toLowerCase() === lower);
  return ci ? ci.key : "";
}

/** Format guess from a filename — never trusted by the server, only by the UI. */
export function formatFromName(name: string): "csv" | "json" | "xlsx" | "" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".xlsm")) return "xlsx";
  return "";
}

export function targetLabel(t: FileImportTargetView): string {
  return t.kind === "table" ? `${t.name} (table · ${t.rows} record${t.rows === 1 ? "" : "s"})` : `${t.name} (${t.rows} article${t.rows === 1 ? "" : "s"})`;
}

export default function FileImportPanel() {
  const [targets, setTargets] = useState<FileImportTargetView[]>([]);
  const [dedupeText, setDedupeText] = useState<string>("");
  const [caps, setCaps] = useState<{ rows: number; bytes: number; mapping: number } | null>(null);
  const [jobs, setJobs] = useState<FileImportJobView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileImportDetailView | null>(null);
  const [targetIdx, setTargetIdx] = useState<number>(-1);
  const [name, setName] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeId) ?? null, [jobs, activeId]);
  const activeTarget = useMemo<FileImportTargetView | null>(() => {
    if (!activeJob) return null;
    return (
      targets.find((t) => t.kind === activeJob.target.kind && (t.tableId ?? undefined) === (activeJob.target.tableId ?? undefined)) ?? null
    );
  }, [targets, activeJob]);

  const loadJobs = useCallback(async () => {
    const r = await api("/api/native/import/file");
    if (r.ok) setJobs((r.data?.imports as FileImportJobView[]) ?? []);
    else setError(r.error ?? "could not load imports");
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const r = await api(`/api/native/import/file/${id}`);
    if (r.ok) setDetail(r.data as FileImportDetailView);
  }, []);

  useEffect(() => {
    void (async () => {
      const t = await api("/api/native/import/file/targets");
      if (t.ok) {
        setTargets((t.data?.targets as FileImportTargetView[]) ?? []);
        setDedupeText(t.data?.dedupe?.text ?? "");
        const c = t.data?.caps;
        if (c) setCaps({ rows: c.rows, bytes: c.bytes, mapping: c.mapping });
      }
      await loadJobs();
    })();
  }, [loadJobs]);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
    else setDetail(null);
  }, [activeId, loadDetail]);

  // Re-suggest a mapping whenever the active job's columns or target change.
  useEffect(() => {
    if (!activeJob || !activeTarget) return;
    const saved = new Map(activeJob.mapping.map((m) => [m.sourceField, m.targetField]));
    const next: Record<string, string> = {};
    for (const col of activeJob.columns) next[col] = saved.get(col) ?? suggestTarget(col, activeTarget.fields);
    setDraftMap(next);
  }, [activeJob, activeTarget]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  }

  async function createJob() {
    const target = targets[targetIdx];
    if (!target) {
      setError("Choose where the records should go first.");
      return;
    }
    await run("create", async () => {
      const r = await api("/api/native/import/file", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "File import", target: target.kind === "table" ? { kind: "table", tableId: target.tableId } : { kind: "kb-article" } }),
      });
      if (!r.ok) {
        setError(r.error ?? "could not create the import");
        return;
      }
      const job = r.data?.import as FileImportJobView | null;
      setName("");
      setTargetIdx(-1);
      await loadJobs();
      if (job) setActiveId(job.id);
      setNote("Import created. Upload a CSV or JSON file to continue.");
    });
  }

  function pickFile(file: File | null) {
    if (!file) return;
    const guess = formatFromName(file.name);
    if (guess === "xlsx") {
      setFileName(file.name);
      setFileText("");
      setError(XLSX_MESSAGE);
      return;
    }
    setError(null);
    setFileName(file.name);
    if (guess === "csv" || guess === "json") setFormat(guess);
    const reader = new FileReader();
    reader.onload = () => setFileText(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => setError("could not read that file in the browser");
    reader.readAsText(file);
  }

  async function upload() {
    if (!activeJob) return;
    if (!fileText.trim()) {
      setError("Choose a CSV or JSON file first.");
      return;
    }
    await run("upload", async () => {
      const r = await api(`/api/native/import/file/${activeJob.id}/upload`, { method: "POST", body: JSON.stringify({ format, content: fileText }) });
      if (!r.ok) {
        setError(r.error ?? "upload failed");
        return;
      }
      setNote(`Staged ${r.data?.result?.rowCount ?? 0} row(s) from ${fileName || "the file"}. Nothing has been written yet.`);
      await loadJobs();
      await loadDetail(activeJob.id);
    });
  }

  async function saveMapping() {
    if (!activeJob) return;
    const mapping = Object.entries(draftMap)
      .filter(([, targetField]) => targetField.trim() !== "")
      .map(([sourceField, targetField]) => ({ sourceField, targetField: targetField.trim() }));
    if (mapping.length === 0) {
      setError("Map at least one column to a field.");
      return;
    }
    await run("map", async () => {
      const r = await api(`/api/native/import/file/${activeJob.id}/map`, { method: "POST", body: JSON.stringify({ mapping }) });
      if (!r.ok) {
        setError(r.error ?? "could not save the mapping");
        return;
      }
      setNote(`${mapping.length} column mapping(s) saved.`);
      await loadJobs();
      await loadDetail(activeJob.id);
    });
  }

  async function preview() {
    if (!activeJob) return;
    await run("preview", async () => {
      const r = await api(`/api/native/import/file/${activeJob.id}/preview`, { method: "POST", body: JSON.stringify({}) });
      if (!r.ok) {
        setError(r.error ?? "preview failed");
        return;
      }
      setDetail(r.data as FileImportDetailView);
      const v = r.data?.validation;
      setNote(`Read-only check: ${v?.valid ?? 0} row(s) ready, ${v?.skipped ?? 0} duplicate(s) skipped, ${v?.invalid ?? 0} row(s) with errors. Nothing was written.`);
    });
  }

  async function commit() {
    if (!activeJob) return;
    await run("commit", async () => {
      const r = await api(`/api/native/import/file/${activeJob.id}/commit`, { method: "POST", body: JSON.stringify({}) });
      if (r.status === 202) {
        setNote("Commit queued for approval — nothing has been written yet. Approve it below to write the records.");
      } else if (!r.ok) {
        setError(r.error ?? "commit failed");
      } else {
        const res = r.data?.result ?? {};
        setNote(`Done — ${res.committed ?? 0} record(s) written, ${res.skipped ?? 0} duplicate(s) skipped.`);
      }
      await loadJobs();
      await loadDetail(activeJob.id);
    });
  }

  async function decide(verdict: "apply" | "reject") {
    if (!activeJob) return;
    await run(verdict, async () => {
      const r = await api(`/api/native/import/file/${activeJob.id}/${verdict}`, { method: "POST", body: JSON.stringify({}) });
      if (!r.ok) {
        setError(r.error ?? `${verdict} failed`);
      } else if (verdict === "apply") {
        setNote(`Approved — ${r.data?.committed ?? 0} record(s) written, ${r.data?.skipped ?? 0} duplicate(s) skipped.`);
      } else {
        setNote("Rejected — nothing was written.");
      }
      await loadJobs();
      await loadDetail(activeJob.id);
    });
  }

  const fieldOptions = activeTarget?.fields ?? [];

  return (
    <Card id="file-import">
      <CardBody>
        <h2 className="font-medium mb-1">Import a file (CSV or JSON)</h2>
        <p className="text-xs text-slate-400 mb-3">
          This lane needs no third-party account and no credentials: you upload a file, map its columns to fields you
          already have, check every row, then write the records. Nothing is written until you commit, and every
          commit is approval-gated and audited. Excel workbooks are not supported — save the sheet as CSV first.
        </p>
        {dedupeText && (
          <p className="text-xs text-slate-400 mb-3">
            <strong className="text-slate-300">Duplicates:</strong> {dedupeText}
          </p>
        )}
        {caps && (
          <p className="text-xs text-slate-500 mb-3">
            Limits: {caps.rows} rows, {Math.round(caps.bytes / 1024)} KiB per file, {caps.mapping} mapped columns.
          </p>
        )}

        {note && <div className="rounded-md bg-emerald-950/40 border border-emerald-700/40 px-3 py-2 text-sm mb-3">{note}</div>}
        {error && <div className="rounded-md bg-rose-950/40 border border-rose-700/40 px-3 py-2 text-sm mb-3">{error}</div>}

        {/* 1. Choose target + create */}
        <div className="rounded border border-slate-700/60 bg-slate-900/60 p-3 mb-3">
          <h3 className="text-sm font-medium mb-2">1 · Choose where the records go</h3>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            <select value={targetIdx} onChange={(e) => setTargetIdx(Number(e.target.value))} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
              <option value={-1}>Target…</option>
              {targets.map((t, i) => (
                <option key={`${t.kind}:${t.tableId ?? "kb"}`} value={i}>
                  {targetLabel(t)}
                </option>
              ))}
            </select>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (e.g. Clients 2026)" className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
            <Button variant="primary" size="sm" onClick={() => void createJob()} disabled={busy === "create"}>
              {busy === "create" ? "Creating…" : "Create import"}
            </Button>
          </div>
          {targets.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">
              No targets yet. Create a table in Data tables (or add a knowledge-base article) and it appears here as an
              import target.
            </p>
          )}
        </div>

        {/* Existing imports */}
        {jobs.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-medium mb-2">Your file imports</h3>
            <ul className="space-y-1 text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setActiveId(j.id)} className={`text-left ${activeId === j.id ? "text-white underline" : "text-slate-300"}`}>
                    {j.name} <span className="text-xs text-slate-500">· {j.status} · {j.rowCount} row(s)</span>
                  </button>
                  <Badge>{j.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeJob && (
          <div className="space-y-3">
            {/* 2. Upload */}
            <div className="rounded border border-slate-700/60 bg-slate-900/60 p-3">
              <h3 className="text-sm font-medium mb-2">2 · Upload the file</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="text-xs" />
                <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "json")} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <Button variant="primary" size="sm" onClick={() => void upload()} disabled={busy === "upload" || !fileText}>
                  {busy === "upload" ? "Uploading…" : "Upload & stage"}
                </Button>
                {fileName && <span className="text-xs text-slate-400">{fileName}{fileText ? ` · ${fileText.length} bytes read` : ""}</span>}
              </div>
              {activeJob.columns.length > 0 && (
                <p className="text-xs text-slate-400 mt-2">Columns found: {activeJob.columns.join(", ")}</p>
              )}
            </div>

            {/* 3. Map */}
            {activeJob.columns.length > 0 && (
              <div className="rounded border border-slate-700/60 bg-slate-900/60 p-3">
                <h3 className="text-sm font-medium mb-2">3 · Map columns</h3>
                <div className="space-y-1 text-sm">
                  {activeJob.columns.map((col) => (
                    <div key={col} className="grid grid-cols-2 gap-2 items-center">
                      <span className="text-slate-300 truncate">{col}</span>
                      <select
                        value={draftMap[col] ?? ""}
                        onChange={(e) => setDraftMap((m) => ({ ...m, [col]: e.target.value }))}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
                      >
                        <option value="">— not imported —</option>
                        {fieldOptions.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.required ? " (required)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button variant="primary" size="sm" onClick={() => void saveMapping()} disabled={busy === "map"}>
                    {busy === "map" ? "Saving…" : "Save mapping"}
                  </Button>
                </div>
              </div>
            )}

            {/* 4. Preview + 5. Commit */}
            <div className="rounded border border-slate-700/60 bg-slate-900/60 p-3">
              <h3 className="text-sm font-medium mb-2">4 · Check every row, then commit</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                <Button variant="secondary" size="sm" onClick={() => void preview()} disabled={busy === "preview"}>
                  {busy === "preview" ? "Checking…" : "Check rows (read-only)"}
                </Button>
                <Button variant="primary" size="sm" onClick={() => void commit()} disabled={busy === "commit" || activeJob.status === "committed"}>
                  {busy === "commit" ? "Committing…" : "Commit records"}
                </Button>
              </div>

              {detail && detail.validation && (
                <div className="text-xs text-slate-300 space-y-1">
                  <p>
                    {detail.validation.total} row(s) checked · {detail.validation.valid} ready · {detail.validation.skipped} duplicate(s)
                    skipped · {detail.validation.invalid} with errors
                  </p>
                  {detail.validation.invalid > 0 && (
                    <div className="rounded border border-rose-800/50 bg-rose-950/30 p-2">
                      <p className="font-medium text-rose-200 mb-1">
                        Nothing will be written while any row has an error — fix these rows and re-upload:
                      </p>
                      <ul className="space-y-0.5">
                        {detail.validation.errors.map((e) => (
                          <li key={e.rowNumber}>
                            <span className="text-rose-300">Row {e.rowNumber}:</span> {e.reasons.join("; ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.validation.skippedRowNumbers.length > 0 && (
                    <p className="text-slate-400">Skipped duplicates: rows {detail.validation.skippedRowNumbers.join(", ")}</p>
                  )}
                </div>
              )}

              {detail?.pending && (
                <div className="mt-2 rounded border border-amber-800/50 bg-amber-950/30 p-2 text-xs">
                  <p className="mb-1">
                    Commit queued for approval ({detail.pending.rowCount} record(s)) — nothing has been written yet.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => void decide("apply")} disabled={busy === "apply"}>
                      {busy === "apply" ? "Writing…" : "Approve & write"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void decide("reject")} disabled={busy === "reject"}>
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {activeJob.status === "committed" && (
                <p className="text-xs text-emerald-300 mt-2">
                  Committed{activeJob.committedCount !== null ? `: ${activeJob.committedCount} record(s) written` : ""}
                  {activeJob.skippedCount !== null ? `, ${activeJob.skippedCount} duplicate(s) skipped` : ""}.
                </p>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
