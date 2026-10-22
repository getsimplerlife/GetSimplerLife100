/**
 * portal.dedupe.index.page.tsx — Phase 4.2 native DEDUPE/MDM portal surface
 * (lazy route). Match rules, data-quality rules, deterministic scan runs,
 * merge suggestions and record identities over the tenant's OWN 1.4 tables.
 * All mutations ride the Approval Queue (pending cards + approve/reject);
 * the copy stays HONEST: scans produce candidate suggestions only, merges
 * record a NON-DESTRUCTIVE identity pointer (the underlying rows are never
 * deleted or modified), and LLM-assisted matching is noted as not enabled.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface RuleView {
  id: string;
  name: string;
  tableId: string;
  fields: string[];
  matchMode: string;
  active: boolean;
  llmAssist: boolean;
  updatedAt: string;
}
interface QualityView {
  id: string;
  name: string;
  tableId: string;
  field: string;
  ruleType: string;
  params: { min?: number; max?: number };
  active: boolean;
}
interface SuggestionView {
  id: string;
  tableId: string;
  ruleId: string;
  runId: string;
  rowIds: string[];
  matchedFields: { field: string; value: string }[];
  confidence: number;
  status: string;
  createdAt: string;
}
interface RunView {
  id: string;
  rowsScanned: number;
  pairComparisons: number;
  suggestionsProduced: number;
  qualityIssuesFound: number;
  bounded: boolean;
  outcome: string;
  note: string;
  createdAt: string;
}
interface IdentityView {
  id: string;
  tableId: string;
  survivorRowId: string;
  supersededRowIds: string[];
  mergedAt: string;
  note: string;
}
interface TableView {
  id: string;
  name: string;
  fields?: { key: string; label: string; type: string }[];
  rows?: number;
}
interface PendingWriteView {
  id: string;
  op: string;
  action: string;
  status: string;
  requestedAt: string;
}

export default function PortalDedupeIndexPage() {
  const [rules, setRules] = useState<RuleView[]>([]);
  const [quality, setQuality] = useState<QualityView[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionView[]>([]);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [identities, setIdentities] = useState<IdentityView[]>([]);
  const [tables, setTables] = useState<TableView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [r, q, s, n, i, t, w] = await Promise.all([
        fetch("/api/native/dedupe/rules", { headers: { accept: "application/json" } }),
        fetch("/api/native/dedupe/quality-rules", { headers: { accept: "application/json" } }),
        fetch("/api/native/dedupe/suggestions", { headers: { accept: "application/json" } }),
        fetch("/api/native/dedupe/runs", { headers: { accept: "application/json" } }),
        fetch("/api/native/dedupe/identities", { headers: { accept: "application/json" } }),
        fetch("/api/native/tables", { headers: { accept: "application/json" } }),
        fetch("/api/native/dedupe/writes", { headers: { accept: "application/json" } }),
      ]);
      if (r.ok) setRules(((await r.json()) as { data: { rules: RuleView[] } }).data.rules ?? []);
      if (q.ok) setQuality(((await q.json()) as { data: { rules: QualityView[] } }).data.rules ?? []);
      if (s.ok) setSuggestions(((await s.json()) as { data: { suggestions: SuggestionView[] } }).data.suggestions ?? []);
      if (n.ok) setRuns(((await n.json()) as { data: { runs: RunView[] } }).data.runs ?? []);
      if (i.ok) setIdentities(((await i.json()) as { data: { identities: IdentityView[] } }).data.identities ?? []);
      if (t.ok) setTables(((await t.json()) as { data: { tables: TableView[] } }).data.tables ?? []);
      if (w.ok) setWrites(((await w.json()) as { data: { writes: PendingWriteView[] } }).data.writes ?? []);
    } catch {
      setNotice("Could not reach the dedupe & MDM service right now.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(path: string, body: unknown): Promise<void> {
    setNotice(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
    if (res.ok || res.status === 202) {
      setNotice(json.data?.status === "pending" ? "Queued for approval — approve it from the pending list below." : "Saved.");
      void load();
    } else {
      setNotice(json.error ?? "Request failed.");
    }
  }
  async function decide(dpwId: string, action: "apply" | "reject"): Promise<void> {
    setNotice(null);
    const res = await fetch(`/api/native/dedupe/writes/${dpwId}/${action}`, { method: "POST", headers: { accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setNotice(json.error ?? "Decision failed.");
    void load();
  }
  function matchForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fields = String(f.get("fields") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    void submit("/api/native/dedupe/rules", {
      name: f.get("name"),
      description: f.get("description") ?? "",
      tableId: f.get("tableId"),
      fields,
      matchMode: f.get("matchMode") ?? "normalized",
      active: true,
      llmAssist: false,
    });
    e.currentTarget.reset();
  }
  function qualityForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ruleType = String(f.get("ruleType") ?? "required");
    const params: Record<string, number> = {};
    if (ruleType === "number-range") {
      if (f.get("min")) params.min = Number(f.get("min"));
      if (f.get("max")) params.max = Number(f.get("max"));
    }
    void submit("/api/native/dedupe/quality-rules", {
      name: f.get("name"),
      description: f.get("description") ?? "",
      tableId: f.get("tableId"),
      field: f.get("field"),
      ruleType,
      params,
      active: true,
    });
    e.currentTarget.reset();
  }
  function scanForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    void submit("/api/native/dedupe/runs", {});
    e.currentTarget.reset();
  }
  function tableName(id: string): string {
    return tables.find((t) => t.id === id)?.name ?? id;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Dedupe &amp; Master Data</h1>
        <p className="mt-1 text-sm text-slate-600">
          Deterministic duplicate detection and data-quality checks over your own record tables, with non-destructive
          merge — a merge records a golden-record pointer; your underlying rows are never deleted or modified. Every
          mutation is approval-gated and fully audited. LLM-assisted matching is not enabled in this slice.
        </p>
      </div>
      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-stone-100">Create match rule</h2>
            <p className="mt-1 text-xs text-slate-500">
              Pairs of rows in the same table that agree on every field below are suggested as duplicates (exact or
              normalized comparison).
            </p>
            <form className="mt-3 space-y-3" onSubmit={matchForm}>
              <input name="name" required placeholder="Rule name (e.g. same email + name)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="description" placeholder="Description (optional)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="tableId" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input name="fields" required placeholder="Field keys, comma-separated (e.g. email, name)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="matchMode" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="normalized">normalized (trim · case-insensitive · collapse spaces)</option>
                <option value="exact">exact (character-for-character)</option>
              </select>
              <Button type="submit" variant="primary">Create match rule</Button>
            </form>
            {rules.length > 0 && (
              <ul className="mt-4 divide-y divide-stone-800">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-stone-100">{r.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {tableName(r.tableId)} · {r.fields.join(", ")} · {r.matchMode}
                      </span>
                    </div>
                    <Badge>{r.active ? "active" : "inactive"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-stone-100">Create quality rule</h2>
            <p className="mt-1 text-xs text-slate-500">
              Deterministic validators checked on scan: required, email, phone, number-range, date-format. Scans report
              violation counts — records are never edited.
            </p>
            <form className="mt-3 space-y-3" onSubmit={qualityForm}>
              <input name="name" required placeholder="Rule name (e.g. valid email)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="description" placeholder="Description (optional)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="tableId" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input name="field" required placeholder="Field key (e.g. email)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="ruleType" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="required">required (non-empty)</option>
                <option value="email">email format</option>
                <option value="phone">phone (≥7 digits)</option>
                <option value="number-range">number range</option>
                <option value="date-format">date format (YYYY-MM-DD)</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input name="min" placeholder="min (number-range)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                <input name="max" placeholder="max (number-range)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <Button type="submit" variant="primary">Create quality rule</Button>
            </form>
            {quality.length > 0 && (
              <ul className="mt-4 divide-y divide-stone-800">
                {quality.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-stone-100">{r.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {tableName(r.tableId)}.{r.field} · {r.ruleType}
                      </span>
                    </div>
                    <Badge>{r.active ? "active" : "inactive"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-stone-100">Run scan</h2>
              <p className="mt-1 text-xs text-slate-500">
                Compares rows with all active match rules and evaluates all active quality rules. Produces candidate
                suggestions only — nothing is merged by a scan, and no record is modified.
              </p>
            </div>
            <form onSubmit={scanForm}>
              <Button type="submit" variant="primary">Run scan (all active rules)</Button>
            </form>
          </div>
          {runs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Run</th>
                    <th className="py-2 pr-4">Rows</th>
                    <th className="py-2 pr-4">Suggestions</th>
                    <th className="py-2 pr-4">Quality issues</th>
                    <th className="py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800">
                  {runs.slice(0, 8).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 font-mono text-xs">{r.id}</td>
                      <td className="py-2 pr-4">{r.rowsScanned}</td>
                      <td className="py-2 pr-4">{r.suggestionsProduced}</td>
                      <td className="py-2 pr-4">
                        {r.qualityIssuesFound} {r.bounded && <Badge>bounded</Badge>}
                      </td>
                      <td className="py-2 text-xs text-slate-500">{r.note.slice(0, 120)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold text-stone-100">Merge suggestions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Deterministic duplicates (confidence 1.0). Merging records an identity pointer — the richer row becomes the
            survivor, duplicates are marked superseded, and no underlying record is deleted or modified.
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No open suggestions. Run a scan to find candidate duplicates.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-800">
              {suggestions.slice(0, 20).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-mono text-xs text-slate-600">{s.rowIds[0]}</span>
                    <span className="mx-1 text-slate-400">+</span>
                    <span className="font-mono text-xs text-slate-600">{s.rowIds[1]}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      match {s.matchedFields.length} field(s) · table {tableName(s.tableId)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void submit("/api/native/dedupe/merge", { suggestionId: s.id })}>
                      Merge
                    </Button>
                    <Button variant="ghost" onClick={() => void submit(`/api/native/dedupe/suggestions/${s.id}/delete`, {})}>
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-stone-100">Record identities</h2>
            <p className="mt-1 text-xs text-slate-500">Golden-record pointers from approved merges.</p>
            {identities.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No merges yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-800">
                {identities.slice(0, 8).map((i) => (
                  <li key={i.id} className="py-2 text-sm">
                    <div className="font-mono text-xs text-stone-400">
                      survivor {i.survivorRowId} ← {i.supersededRowIds.length} superseded
                    </div>
                    <div className="text-xs text-slate-500">{i.note.slice(0, 100)}…</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold text-stone-100">Pending approvals</h2>
            <p className="mt-1 text-xs text-slate-500">Every dedupe mutation waits here until you approve or reject it.</p>
            {writes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nothing waiting for approval.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-800">
                {writes.map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-stone-100">{w.action}</span>
                      <span className="ml-2 text-xs text-slate-500">{w.requestedAt}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => void decide(w.id, "apply")}>Approve</Button>
                      <Button variant="ghost" onClick={() => void decide(w.id, "reject")}>Reject</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}