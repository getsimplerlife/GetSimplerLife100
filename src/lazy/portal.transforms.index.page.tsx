import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
// ── Types (Phase 3.5 native data transforms — JSON/XML/CSV mapping, XPath-
//    subset, EDI X12/EDIFACT parse + generate; deterministic, NO LLM) ───────
interface FieldDraft {
  source: string;
  target: string;
  coerce?: string | null;
  required?: boolean;
}
interface TransformSummary {
  id: string;
  name: string;
  sourceKind: string;
  outputMode: string;
  artifactKind: string | null;
  status: string;
  version: number;
  fieldCount: number;
  runCount: number;
}
interface RunSummary {
  id: string;
  status: string;
  rowCount: number;
  artifactKind: string | null;
  appliedAt?: string;
  error?: string;
}
interface RunFull {
  id: string;
  status: string;
  rowCount: number;
  rows?: Array<{ values: Record<string, string | number | boolean | null> }>;
  artifact?: { mime: string; text: string } | null;
  error?: string;
}
interface PendingWrite {
  id: string;
  transformId: string | null;
  op: string;
  status: string;
  requestedAt: string;
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
const KIND_LABEL: Record<string, string> = { json: "JSON", xml: "XML", csv: "CSV", edi_x12: "EDI X12", edifact: "EDIFACT" };
const EMPTY_FORM = {
  name: "",
  sourceKind: "csv",
  outputMode: "records",
  artifactKind: "csv",
  recordPath: "rows",
  fields: [{ source: "", target: "", coerce: "string", required: false }],
  envelope: "none",
  delimiter: ",",
  senderId: "SENDER",
  receiverId: "RECVR",
  segments: "",
};
export default function TransformsPage() {
  const [transforms, setTransforms] = useState<TransformSummary[]>([]);
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunFull | null>(null);
  const [runSource, setRunSource] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [t, w] = await Promise.all([
        api<{ transforms: TransformSummary[] }>("GET", "/api/native/transform"),
        api<{ writes: PendingWrite[] }>("GET", "/api/native/transform/writes"),
      ]);
      setTransforms(t.transforms);
      setPending(w.writes.filter((x) => x.status === "pending"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      await api<{ data: unknown }>("POST", path, body);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const loadRuns = async (id: string) => {
    try {
      const r = await api<{ runs: RunSummary[] }>("GET", `/api/native/transform/${id}/runs`);
      setRuns(r.runs);
      setOpenId(id);
      setSelectedRun(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const fields = form.fields
        .filter((f) => f.source.trim() && f.target.trim())
        .map((f) => ({ source: f.source.trim(), target: f.target.trim(), coerce: f.coerce || null, required: !!f.required }));
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        sourceKind: form.sourceKind,
        outputMode: form.outputMode,
        recordPath: form.recordPath.trim() || (form.sourceKind === "csv" ? "rows" : form.sourceKind === "xml" ? "/root" : "."),
        fields,
      };
      if (form.outputMode === "artifact") {
        body.artifactKind = form.artifactKind;
        const gen: Record<string, unknown> = { envelope: form.envelope };
        if (form.artifactKind === "csv") gen.delimiter = form.delimiter || ",";
        if (form.artifactKind === "edi_x12" || form.artifactKind === "edifact") {
          gen.senderId = form.senderId.trim() || undefined;
          gen.receiverId = form.receiverId.trim() || undefined;
          gen.segments = form.segments
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        body.generation = gen;
      }
      await api<{ data: unknown }>("POST", "/api/native/transform", body);
      setForm({ ...EMPTY_FORM });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const run = async (id: string) => {
    if (!runSource.trim()) {
      setError("Paste source text above and click Run again");
      return;
    }
    await act(`/api/native/transform/${id}/run`, { source: runSource });
  };
  const decide = async (ptwId: string, apply: boolean) => {
    await act(`/api/native/transform/writes/${ptwId}/${apply ? "apply" : "reject"}`);
  };
  const pickRun = async (runId: string) => {
    try {
      const r = await api<{ run: RunFull }>("GET", `/api/native/transform/runs/${runId}`);
      setSelectedRun(r.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const setField = (i: number, key: keyof FieldDraft, value: unknown) => {
    setForm((f) => ({ ...f, fields: f.fields.map((x, idx) => (idx === i ? { ...x, [key]: value } : x)) }));
  };
  const badgeFor = (status: string) =>
    status === "active" ? "success" : status === "draft" ? "warning" : "stone";
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Data transforms & EDI</h1>
        <p className="text-sm text-slate-500">
          Parse JSON / XML / CSV / EDI X12 / EDIFACT, map fields onto records or generated artifacts — deterministic, approval-gated, fully audited. Mapped rows write
          into a table through that table's own approval card.
        </p>
      </div>
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {pending.length > 0 ? (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold">
              Pending approvals <Badge variant="warning">{pending.length}</Badge>
            </h2>
            <div className="space-y-2">
              {pending.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>
                    <Badge variant="warning">{w.op}</Badge> <span className="font-mono">{w.transformId ?? "—"}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button variant="success" size="sm" onClick={() => decide(w.id, true)} disabled={busy}>
                      Approve
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => decide(w.id, false)} disabled={busy}>
                      Reject
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold">New transform</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="input" value={form.sourceKind} onChange={(e) => setForm((f) => ({ ...f, sourceKind: e.target.value }))}>
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select className="input" value={form.outputMode} onChange={(e) => setForm((f) => ({ ...f, outputMode: e.target.value }))}>
              <option value="records">→ records (1.4 table)</option>
              <option value="artifact">→ generated artifact</option>
            </select>
            {form.outputMode === "artifact" ? (
              <select className="input" value={form.artifactKind} onChange={(e) => setForm((f) => ({ ...f, artifactKind: e.target.value }))}>
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label} artifact
                  </option>
                ))}
              </select>
            ) : null}
            <input className="input md:col-span-2" placeholder="recordPath (json: orders.* · xml: /orders/order · csv: rows · edi: transactions.*)" value={form.recordPath} onChange={(e) => setForm((f) => ({ ...f, recordPath: e.target.value }))} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Field mappings (source → target)</div>
            {form.fields.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className="input flex-1" placeholder="source (kind-specific)" value={f.source} onChange={(e) => setField(i, "source", e.target.value)} />
                <input className="input w-40" placeholder="target field" value={f.target} onChange={(e) => setField(i, "target", e.target.value)} />
                <select className="input w-32" value={f.coerce ?? ""} onChange={(e) => setField(i, "coerce", e.target.value || null)}>
                  <option value="">raw</option>
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="int">int</option>
                  <option value="bool">bool</option>
                  <option value="trim">trim</option>
                  <option value="upper">upper</option>
                  <option value="lower">lower</option>
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, "required", e.target.checked)} /> required
                </label>
                <Button variant="outline" size="sm" onClick={() => setForm((s) => ({ ...s, fields: s.fields.filter((_, idx) => idx !== i) }))}>
                  ✕
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((s) => ({ ...s, fields: [...s.fields, { source: "", target: "", coerce: "string", required: false }] }))}>
              + field
            </Button>
          </div>
          {form.outputMode === "artifact" && (form.artifactKind === "edi_x12" || form.artifactKind === "edifact") ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <input className="input" placeholder="senderId" value={form.senderId} onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value }))} />
              <input className="input" placeholder="receiverId" value={form.receiverId} onChange={(e) => setForm((f) => ({ ...f, receiverId: e.target.value }))} />
              <textarea className="input col-span-2 font-mono text-xs" rows={3} placeholder={"segment templates, one per line:\nBEG*00*SA*{poNumber}*{date}\nPO1*1*{qty}*{unitPrice}*{sku}"} value={form.segments} onChange={(e) => setForm((f) => ({ ...f, segments: e.target.value }))} />
            </div>
          ) : null}
          <div className="mt-3">
            <Button variant="primary" size="md" onClick={create} disabled={busy || !form.name.trim()}>
              Create transform (gated)
            </Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold">
            Your transforms <Badge variant="stone">{transforms.length}</Badge>
          </h2>
          <div className="space-y-2">
            {transforms.length === 0 ? <p className="text-sm text-slate-400">No transforms yet — create one above.</p> : null}
            {transforms.map((t) => (
              <div key={t.id} className="rounded border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.name}</span>
                    <Badge variant={badgeFor(t.status)}>{t.status}</Badge>
                    <span className="text-xs text-slate-500">
                      {KIND_LABEL[t.sourceKind]} → {t.outputMode === "records" ? "records" : t.artifactKind} · {t.fieldCount} fields · {t.runCount} runs
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {t.status === "draft" ? (
                      <Button variant="success" size="sm" onClick={() => act(`/api/native/transform/${t.id}/activate`)} disabled={busy}>
                        Activate
                      </Button>
                    ) : null}
                    {t.status === "active" ? (
                      <Button variant="outline" size="sm" onClick={() => act(`/api/native/transform/${t.id}/archive`)} disabled={busy}>
                        Archive
                      </Button>
                    ) : null}
                    {t.status === "draft" ? (
                      <Button variant="danger" size="sm" onClick={() => act(`/api/native/transform/${t.id}/delete`)} disabled={busy}>
                        Delete
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => loadRuns(t.id)} disabled={busy}>
                      {openId === t.id ? "Hide runs" : "Runs"}
                    </Button>
                  </div>
                </div>
                {openId === t.id ? (
                  <div className="mt-3 space-y-3">
                    <textarea
                      className="input w-full font-mono text-xs"
                      rows={4}
                      placeholder="Paste source text here (JSON/XML/CSV/X12/EDIFACT) then click Run"
                      value={runSource}
                      onChange={(e) => setRunSource(e.target.value)}
                    />
                    <Button variant="primary" size="sm" onClick={() => run(t.id)} disabled={busy}>
                      Run (gated)
                    </Button>
                    <div className="space-y-1">
                      {runs.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1 text-xs">
                          <span className="font-mono">{r.id}</span>
                          <span>
                            <Badge variant={r.status === "applied" ? "success" : "danger"}>{r.status}</Badge> {r.rowCount} rows {r.artifactKind ? `· ${r.artifactKind}` : ""}
                          </span>
                          <span className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => pickRun(r.id)}>
                              View
                            </Button>
                            {r.artifactKind ? (
                              <a className="text-blue-600 underline" href={`/api/native/transform/runs/${r.id}/artifact`}>
                                download
                              </a>
                            ) : null}
                          </span>
                        </div>
                      ))}
                      {runs.length === 0 ? <p className="text-xs text-slate-400">No runs yet.</p> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
      {selectedRun ? (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold">
              Run <span className="font-mono">{selectedRun.id}</span>
            </h2>
            {selectedRun.error ? <p className="text-sm text-rose-600">{selectedRun.error}</p> : null}
            {selectedRun.artifact ? (
              <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs">{selectedRun.artifact.text}</pre>
            ) : null}
            {selectedRun.rows && selectedRun.rows.length > 0 ? (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    {Object.keys(selectedRun.rows[0]!.values).map((k) => (
                      <th key={k} className="border-b border-slate-200 px-2 py-1">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRun.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {Object.entries(row.values).map(([k, v]) => (
                        <td key={k} className="px-2 py-1">
                          {String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}