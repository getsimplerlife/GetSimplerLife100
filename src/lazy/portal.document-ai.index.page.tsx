import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

// ── Types (Phase 3.3 native AI document understanding) ──────────────────────
interface DocSummary {
  id: string;
  name: string;
  ext: string | null;
  size: number;
  status: string;
}
interface ExtractionSummary {
  id: string;
  docId: string;
  fileName: string;
  category: string;
  categoryConfidence: number;
  qualityFlags: string[];
  requiresReview: boolean;
  status: string;
  createdAt: string;
}
interface FieldView {
  key: string;
  label: string;
  value: string;
  numberValue?: number | null;
  dateValue?: string | null;
  confidence: number;
}
interface ExtractionFull {
  id: string;
  category: string;
  categoryConfidence: number;
  fields: FieldView[];
  quality: { flags: { code: string }[]; requiresReview: boolean };
  status: string;
  provider: string;
  model: string;
}
interface TableSummary {
  id: string;
  name: string;
  fields: { key: string; label: string; type: string; required?: boolean }[];
}
interface PendingWrite {
  id: string;
  documentId: string | null;
  op: string;
  status: string;
  approvalActionId: string;
  requestedAt: string;
}
interface RowDataResp {
  data: { tableId: string; tableName: string; rowData: Record<string, unknown> };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const CATEGORY_LABEL: Record<string, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  contract: "Contract",
  id: "ID",
  letter: "Letter",
  report: "Report",
  photo: "Photo",
  other: "Other",
};

export default function DocumentAiPage() {
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [extractions, setExtractions] = useState<ExtractionSummary[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [full, setFull] = useState<Record<string, ExtractionFull>>({});
  const [rowData, setRowData] = useState<{ resultId: string; tableId: string; tableName: string; rowData: Record<string, unknown> } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ data: { documents: DocSummary[]; extractions: ExtractionSummary[]; tables: TableSummary[] } }>("GET", "/api/native/extract");
      setDocuments(d.data.documents);
      setExtractions(d.data.extractions);
      setTables(d.data.tables);
      const w = await api<{ data: { writes: PendingWrite[] } }>("GET", "/api/native/extract/writes");
      setWrites(w.data.writes.filter((x) => x.status === "pending"));
      setError("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runExtraction = async (docId: string) => {
    setNotice("");
    try {
      const r = await api<{ data: { status: string } }>("POST", `/api/native/extract/documents/${docId}/extract`);
      setNotice(r.data.status === "pending" ? "Extraction queued for approval — approve it below." : "Extraction complete.");
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const applyWrite = async (w: PendingWrite) => {
    setNotice("");
    try {
      await api("POST", `/api/native/extract/writes/${w.id}/apply`);
      setNotice("Extraction approved and running.");
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const rejectWrite = async (w: PendingWrite) => {
    setNotice("");
    try {
      await api("POST", `/api/native/extract/writes/${w.id}/reject`);
      setNotice("Extraction request rejected.");
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const rejectDraft = async (resultId: string) => {
    setNotice("");
    try {
      await api("POST", `/api/native/extract/results/${resultId}/reject`);
      setNotice("Draft rejected.");
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const showFull = async (resultId: string) => {
    try {
      const r = await api<{ data: { extraction: ExtractionFull } }>("GET", `/api/native/extract/results/${resultId}`);
      setFull((prev) => ({ ...prev, [resultId]: r.data.extraction }));
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const chooseTable = async (resultId: string, tableId: string) => {
    if (!tableId) {
      setRowData(null);
      return;
    }
    try {
      const r = await api<RowDataResp>("GET", `/api/native/extract/results/${resultId}/row-data?tableId=${encodeURIComponent(tableId)}`);
      setRowData({ resultId, tableId: r.data.tableId, tableName: r.data.tableName, rowData: r.data.rowData });
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const confirmWriteToTable = async () => {
    if (!rowData) return;
    setNotice("");
    try {
      // Approval-gated record write rides the 1.4 tables slice (createTableRow).
      const r = await api<{ data: { status: string } }>("POST", `/api/native/tables/${rowData.tableId}/rows`, { data: rowData.rowData });
      setNotice(r.data.status === "pending" ? "Record write queued for approval." : "Record written.");
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Document understanding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Run AI extraction on uploaded documents. Every run and every record write is approval-gated; low-confidence
          drafts go to the human-review lane.
        </p>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {/* Pending extraction runs */}
      {writes.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Pending extraction runs</h2>
            <Badge variant="warning">{writes.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {writes.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-slate-800">Run extraction on document {w.documentId ?? "–"}</p>
                  <p className="text-xs text-slate-400">Requested {new Date(w.requestedAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => void applyWrite(w)}>
                    Approve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void rejectWrite(w)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Documents */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
          <Badge variant="stone">{documents.length}</Badge>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">Upload a document to the vault first, then run extraction on it.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-400">
                    {d.ext?.toUpperCase()} · {Math.round((d.size ?? 0) / 1024)} KB · {d.status}
                  </p>
                </div>
                <Button size="sm" onClick={() => void runExtraction(d.id)}>
                  Extract
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Extraction drafts */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Extraction drafts</h2>
          <Badge variant="stone">{extractions.length}</Badge>
        </div>
        {extractions.length === 0 ? (
          <p className="text-sm text-slate-400">No extraction runs yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {extractions.map((x) => {
              const f = full[x.id];
              return (
                <li key={x.id} className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{x.fileName}</p>
                        <Badge variant="stone">{CATEGORY_LABEL[x.category] ?? x.category}</Badge>
                        {x.requiresReview && <Badge variant="warning">Needs review</Badge>}
                        <Badge variant={x.status === "pending_review" ? "warning" : x.status === "applied" ? "success" : "stone"}>
                          {x.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Confidence {Math.round((x.categoryConfidence ?? 0) * 100)}%
                        {x.qualityFlags.length > 0 && ` · flags: ${x.qualityFlags.join(", ")}`} · created{" "}
                        {new Date(x.createdAt).toLocaleString()}
                      </p>
                      {x.requiresReview && (
                        <p className="mt-1 text-xs text-amber-700">Low confidence or quality flags — review before writing.</p>
                      )}
                      {f && f.fields.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 gap-1 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
                          {f.fields.map((fv) => (
                            <div key={fv.key} className="text-xs">
                              <span className="text-slate-400">{fv.label}: </span>
                              <span className="text-slate-800">{fv.value}</span>
                              {fv.confidence < 0.55 && <span className="ml-1 text-amber-600">low confidence</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void showFull(x.id)}>
                        {f && f.fields.length > 0 ? "Hide fields" : "Show fields"}
                      </Button>
                      {x.status === "pending_review" && (
                        <Button variant="ghost" size="sm" onClick={() => void rejectDraft(x.id)}>
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Write to table:</span>
                    <select
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                      value={rowData?.resultId === x.id ? rowData.tableId : ""}
                      onChange={(e) => void chooseTable(x.id, e.target.value)}
                    >
                      <option value="">Select a table…</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {rowData?.resultId === x.id && (
                      <Button variant="primary" size="sm" onClick={() => void confirmWriteToTable()}>
                        Confirm write to {rowData.tableName}
                      </Button>
                    )}
                  </div>
                  {rowData?.resultId === x.id && (
                    <div className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-3 text-xs">
                      <pre className="text-slate-700">{JSON.stringify(rowData.rowData, null, 2)}</pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}