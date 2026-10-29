/**
 * portal.tables.index.page.tsx — Phase 1.4 DATA TABLES, surfaced in the portal.
 *
 * Slice 135: the tables router (/api/native/tables*) has been live and tested
 * since the 1.4 build, but no client file referenced it. This page is UI ONLY
 * and calls exactly the routes that exist:
 *
 *   GET    /api/native/tables                 → list (+ row/pending counts)
 *   POST   /api/native/tables                 → create (schema validated)
 *   GET    /api/native/tables/:id             → definition
 *   GET    /api/native/tables/:id/rows?limit= → rows (limit 1..1000, NO offset)
 *   POST   /api/native/tables/:id/rows        → GATED insert (202 pending)
 *   POST   /api/native/tables/:id/rows/:rowId → GATED update (202 pending)
 *   DELETE /api/native/tables/:id/rows/:rowId → GATED delete (202 pending)
 *   GET    /api/native/tables/:id/export      → CSV/JSON download
 *   GET    /api/native/tables/writes          → pending + applied writes
 *   POST   /api/native/tables/writes/:aid/apply → approve-path executor
 *
 * Honest limits shown on the page (not hidden):
 *   - every row write rides the Approval Queue: the response is 202 "pending"
 *     and nothing is stored until the write is applied. This page never
 *     auto-applies and never claims a row exists before it does.
 *   - the rows route accepts `limit` only — there is no offset/cursor — so the
 *     page reads up to the 1000-row cap and pages IN THE BROWSER.
 *   - a table can only be deleted while it is empty (server-enforced; the UI
 *     does not offer the button for non-empty tables).
 */
import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { SignedOutNotice, ErrorLine, FeedbackLine } from "~/components/PortalPrimitiveShell";
import {
  authedJson,
  authedSend,
  buildRowData,
  cellText,
  formatWhen,
  pageSlice,
  TABLE_FIELD_TYPES,
  type RowFieldSpec,
} from "~/lib/portal-primitives";

interface TableField extends RowFieldSpec {
  label?: string;
  options?: string[];
}
interface TableSummary {
  id: string;
  name: string;
  description: string;
  fields: TableField[];
  version: number;
  rows: number;
  pending: number;
  createdAt: string;
  updatedAt: string;
}
interface DataRow {
  id: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
interface PendingWrite {
  id: string;
  op: string;
  tableId?: string;
  status: string;
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  resultError?: string;
}
interface FieldDraft {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
}

const EMPTY_FIELD: FieldDraft = { key: "", label: "", type: "text", required: false, options: "" };
const PAGE_SIZE = 25;
const ROW_FETCH_LIMIT = 1000;

export default function TablesPage() {
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTable, setOpenTable] = useState<TableSummary | null>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [rowValues, setRowValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<FieldDraft[]>([{ ...EMPTY_FIELD, key: "name", label: "Name" }]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await authedJson<{ tables: TableSummary[] }>("/api/native/tables");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setSignedOut(false);
    setError("");
    setTables(Array.isArray(res.data?.tables) ? res.data.tables : []);
    const wr = await authedJson<{ writes: PendingWrite[] }>("/api/native/tables/writes");
    if (wr.ok) setWrites(Array.isArray(wr.data?.writes) ? wr.data.writes : []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const loadRows = useCallback(async (tableId: string) => {
    setRowsLoading(true);
    const res = await authedJson<{ rows: DataRow[]; total: number }>(
      `/api/native/tables/${tableId}/rows?limit=${ROW_FETCH_LIMIT}`,
    );
    setRowsLoading(false);
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
    setPage(1);
  }, []);

  async function open(tableId: string) {
    setError("");
    setFeedback("");
    setBusy(`open:${tableId}`);
    const res = await authedJson<TableSummary>(`/api/native/tables/${tableId}`);
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setOpenId(tableId);
    setOpenTable(res.data);
    setRowValues({});
    setEditingId(null);
    await loadRows(tableId);
  }

  async function createTable() {
    setError("");
    setFeedback("");
    if (!name.trim()) {
      setError("Give the table a name first.");
      return;
    }
    const fields = drafts
      .map((d) => ({
        key: d.key.trim(),
        label: d.label.trim(),
        type: d.type,
        ...(d.required ? { required: true } : {}),
        ...(d.type === "select"
          ? { options: d.options.split(",").map((o) => o.trim()).filter(Boolean) }
          : {}),
      }))
      .filter((f) => f.key && f.label);
    if (fields.length === 0) {
      setError("Add at least one field (key + label).");
      return;
    }
    setCreating(true);
    const res = await authedSend<{ id: string; name: string }>("/api/native/tables", "POST", {
      name: name.trim(),
      description: description.trim(),
      fields,
    });
    setCreating(false);
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(`Table "${res.data.name}" created.`);
    setName("");
    setDescription("");
    setDrafts([{ ...EMPTY_FIELD, key: "name", label: "Name" }]);
    await load();
    await open(res.data.id);
  }

  async function submitRow(kind: "insert" | "update", rowId?: string) {
    if (!openTable) return;
    setError("");
    setFeedback("");
    const values = kind === "insert" ? rowValues : editValues;
    const built = buildRowData(openTable.fields, values);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy(`${kind}:${rowId ?? "new"}`);
    const res = await authedSend<{ status: string; approvalActionId?: string }>(
      kind === "insert"
        ? `/api/native/tables/${openTable.id}/rows`
        : `/api/native/tables/${openTable.id}/rows/${rowId}`,
      "POST",
      { data: built.data },
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    if (res.data?.status === "pending") {
      setFeedback(
        `Write queued for approval — nothing was stored yet. Approve it in the pending writes below to apply it.`,
      );
    } else {
      setFeedback("Write applied.");
    }
    setRowValues({});
    setEditingId(null);
    await loadRows(openTable.id);
    await load();
  }

  async function deleteRow(rowId: string) {
    if (!openTable) return;
    setError("");
    setFeedback("");
    setBusy(`delete:${rowId}`);
    const res = await authedSend<{ status: string }>(`/api/native/tables/${openTable.id}/rows/${rowId}`, "DELETE");
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(
      res.data?.status === "pending"
        ? "Delete queued for approval — the row is still there until it is applied."
        : "Delete applied.",
    );
    await loadRows(openTable.id);
    await load();
  }

  async function applyWrite(write: PendingWrite) {
    setError("");
    setFeedback("");
    setBusy(`apply:${write.id}`);
    const res = await authedSend<{ applied: boolean; op: string }>(
      // The route parameter is the PENDING WRITE id (ptw_…), not the approval
      // action id: POST /api/native/tables/writes/:id/apply resolves it with
      // getPendingWrite(...) — see src/native/tables/router.ts.
      `/api/native/tables/writes/${write.id}/apply`,
      "POST",
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(`Approved write applied (${res.data.op}).`);
    if (openTable) await loadRows(openTable.id);
    await load();
  }

  function startEdit(row: DataRow) {
    if (!openTable) return;
    const values: Record<string, string> = {};
    for (const field of openTable.fields) {
      const raw = row.data[field.key];
      values[field.key] =
        field.type === "json" && raw !== undefined && raw !== null
          ? JSON.stringify(raw)
          : cellText(raw);
    }
    setEditingId(row.id);
    setEditValues(values);
  }

  if (signedOut) return <SignedOutNotice surface="Tables" />;

  const paged = pageSlice(rows, page, PAGE_SIZE);
  const pendingWrites = writes.filter((w) => w.status === "pending");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Tables</h1>
        <p className="text-sm text-stone-500">
          Native data tables with a gated write path. Every insert, update and delete rides the Approval Queue — nothing
          is stored until the write is applied, and every mutation is written to the immutable audit trail.
        </p>
      </div>

      <ErrorLine message={error} />
      <FeedbackLine message={feedback} />

      <Card id="table-composer">
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Create a table</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Name
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Clients"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Description
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this table holds (optional)"
              />
            </label>
          </div>
          <div className="mt-4 space-y-2">
            {drafts.map((draft, i) => (
              <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                <input
                  className="rounded border p-2 text-sm text-stone-900"
                  placeholder="field_key"
                  value={draft.key}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, key: e.target.value } : d)))
                  }
                />
                <input
                  className="rounded border p-2 text-sm text-stone-900"
                  placeholder="Label"
                  value={draft.label}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, label: e.target.value } : d)))
                  }
                />
                <select
                  className="rounded border p-2 text-sm text-stone-900"
                  value={draft.type}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, type: e.target.value } : d)))
                  }
                >
                  {TABLE_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) =>
                      setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, required: e.target.checked } : d)))
                    }
                  />
                  required
                </label>
                <button
                  type="button"
                  className="text-xs text-rose-500 underline"
                  onClick={() => setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                >
                  Remove
                </button>
                {draft.type === "select" && (
                  <input
                    className="rounded border p-2 text-sm text-stone-900 sm:col-span-5"
                    placeholder="Options, comma separated"
                    value={draft.options}
                    onChange={(e) =>
                      setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, options: e.target.value } : d)))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setDrafts((prev) => [...prev, { ...EMPTY_FIELD }])}>
              Add field
            </Button>
            <Button onClick={createTable} disabled={creating}>
              {creating ? "Creating…" : "Create table"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Your tables ({tables.length})</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : tables.length === 0 ? (
            <PortalEmptyState
              title="No tables yet"
              body="Create your first table above. Rows can be added as soon as the schema exists, and every row write goes through the approval queue."
              action={{ label: "Open the table builder", onClick: () => scrollToId("table-composer") }}
            />
          ) : (
            <div className="space-y-3">
              {tables.map((t) => (
                <div key={t.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        <Badge variant="stone">v{t.version}</Badge>
                        {t.pending > 0 && <Badge variant="warning">{t.pending} pending</Badge>}
                      </div>
                      <p className="text-sm text-stone-500">
                        {t.rows} row{t.rows === 1 ? "" : "s"} · {t.fields.length} field
                        {t.fields.length === 1 ? "" : "s"} · updated {formatWhen(t.updatedAt)}
                      </p>
                      {t.description && <p className="text-xs text-stone-400">{t.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => open(t.id)} disabled={busy === `open:${t.id}`}>
                        {busy === `open:${t.id}` ? "Opening…" : openId === t.id ? "Reload rows" : "Open"}
                      </Button>
                      <a
                        className="text-xs text-sky-600 underline"
                        href={`/api/native/tables/${t.id}/export?format=csv`}
                      >
                        Export CSV
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {openTable && (
        <Card>
          <div className="p-6">
            <h2 className="mb-1 text-lg font-semibold">{openTable.name}</h2>
            <p className="mb-3 text-xs text-stone-500">
              {openTable.fields.length} field{openTable.fields.length === 1 ? "" : "s"} · rows are read up to the
              server's {ROW_FETCH_LIMIT}-row cap and paged in the browser (the rows route has no offset).
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-stone-500">
                    {openTable.fields.map((f) => (
                      <th key={f.key} className="px-2 py-2">
                        {f.label || f.key}
                        {f.required ? " *" : ""}
                      </th>
                    ))}
                    <th className="px-2 py-2">Updated</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsLoading ? (
                    <tr>
                      <td className="px-2 py-3 text-stone-500" colSpan={openTable.fields.length + 2}>
                        Loading rows…
                      </td>
                    </tr>
                  ) : paged.rows.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-stone-500" colSpan={openTable.fields.length + 2}>
                        No rows yet — add the first one below. It is queued for approval before it is stored.
                      </td>
                    </tr>
                  ) : (
                    paged.rows.map((row) =>
                      editingId === row.id ? (
                        <tr key={row.id} className="border-b">
                          {openTable.fields.map((f) => (
                            <td key={f.key} className="px-2 py-1">
                              <input
                                className="w-full rounded border p-1 text-xs text-stone-900"
                                value={editValues[f.key] ?? ""}
                                onChange={(e) =>
                                  setEditValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                                }
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-xs text-stone-400">—</td>
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              className="text-xs text-emerald-600 underline"
                              onClick={() => submitRow("update", row.id)}
                              disabled={busy === `update:${row.id}`}
                            >
                              Queue update
                            </button>
                            <button
                              type="button"
                              className="ml-2 text-xs text-stone-500 underline"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id} className="border-b">
                          {openTable.fields.map((f) => (
                            <td key={f.key} className="px-2 py-2">
                              {cellText(row.data?.[f.key])}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-xs text-stone-400">{formatWhen(row.updatedAt)}</td>
                          <td className="px-2 py-2">
                            <button type="button" className="text-xs text-sky-600 underline" onClick={() => startEdit(row)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ml-2 text-xs text-rose-500 underline"
                              onClick={() => deleteRow(row.id)}
                              disabled={busy === `delete:${row.id}`}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>

            {rows.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                <span>
                  Rows {paged.from}–{paged.to} of {paged.total}
                </span>
                <button
                  type="button"
                  className="underline disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={paged.page <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {paged.page} / {paged.pageCount}
                </span>
                <button
                  type="button"
                  className="underline disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(paged.pageCount, p + 1))}
                  disabled={paged.page >= paged.pageCount}
                >
                  Next
                </button>
              </div>
            )}

            <div className="mt-4 rounded border p-3">
              <h3 className="mb-2 text-sm font-semibold">Add a row</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {openTable.fields.map((f) => (
                  <label key={f.key} className="text-xs text-stone-500">
                    {f.label || f.key}
                    {f.required ? " *" : ""}
                    <input
                      className="mt-1 w-full rounded border p-2 text-sm text-stone-900"
                      value={rowValues[f.key] ?? ""}
                      placeholder={f.type === "json" ? '{ "key": "value" }' : f.type}
                      onChange={(e) => setRowValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <Button className="mt-3" size="sm" onClick={() => submitRow("insert")} disabled={busy === "insert:new"}>
                {busy === "insert:new" ? "Queueing…" : "Queue row for approval"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Pending writes ({pendingWrites.length})</h2>
          {pendingWrites.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing waiting for approval.</p>
          ) : (
            <div className="space-y-2">
              {pendingWrites.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span className="text-stone-500">
                    <code>{w.op}</code> · {w.requestedBy} · {formatWhen(w.requestedAt)}
                  </span>
                  <Button size="sm" onClick={() => applyWrite(w)} disabled={busy === `apply:${w.id}`}>
                    {busy === `apply:${w.id}` ? "Applying…" : "Apply"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Applying a write is the approval decision. Invalid rows are rejected before they are ever queued, so a
            pending write is already schema-valid.
          </p>
        </div>
      </Card>
    </div>
  );
}
