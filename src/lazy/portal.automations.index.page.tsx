/**
 * portal.automations.index.page.tsx — Phase 3.7 native automations/workflow
 * builder portal surface (lazy route). Lists rules + runs, creates rules with
 * event/schedule triggers, conditions and actions, and drives the gated
 * lifecycle (activate/pause/archive/delete ride the Approval Queue).
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface RuleSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  trigger: { kind: string; eventType?: string; cadence?: string; timeUtc?: string };
  conditionCount: number;
  actionCount: number;
  autonomyAllowList: string[];
  version: number;
  updatedAt: string;
}
interface RunSummary {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerKind: string;
  matched: boolean;
  triggeredAt: string;
  actionCount: number;
  error?: string;
}
interface PendingWrite {
  id: string;
  op: string;
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/native/automation${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  // SLICE 142 — the CONTROL PLANE (autonomy allow-lists, kill switch, error
  // budget) is Growth+. Resolved from the SAME helper the server gate uses, so
  // this page can never offer a control the gate would refuse.
  const [ent, setEnt] = useState<{ tier: string; label: string; controlPlane: boolean } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // SLICE 190 — `load()` threw into `setError`, so the failure WAS stated; the
  // page then printed "No rules yet.", "None pending." and "No runs recorded."
  // underneath it. A stated error and an affirmative empty state contradict
  // each other, and the empty state is the one a reader believes.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<"event" | "schedule">("event");
  const [eventType, setEventType] = useState("native.sales.lead.created");
  const [cadence, setCadence] = useState("daily");
  const [timeUtc, setTimeUtc] = useState("09:00");
  const [amount, setAmount] = useState("100");
  const [recipient, setRecipient] = useState("");
  const [actionKind, setActionKind] = useState<"notify" | "webhook" | "tableWrite" | "runTransform">("notify");
  const [autonomy, setAutonomy] = useState<string[]>([]);
  // SLICE 173 (W1): a table write needs a table and a row, a transform run needs
  // a transform. Without them the old code quietly created a WEBHOOK action —
  // the UI said one thing and the record said another.
  const [tables, setTables] = useState<{ id: string; name: string }[]>([]);
  const [transforms, setTransforms] = useState<{ id: string; name: string; status: string }[]>([]);
  const [tableId, setTableId] = useState("");
  const [transformId, setTransformId] = useState("");
  const [rowJson, setRowJson] = useState("");
  const [transformSource, setTransformSource] = useState("");
  // SLICE 173 (W2): a field-level validation error, shown on the field it is about.
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, rn, w] = await Promise.all([
        api<{ data: { rules: RuleSummary[] } }>("/rules"),
        api<{ data: { runs: RunSummary[] } }>("/runs"),
        api<{ data: { writes: PendingWrite[] } }>("/writes"),
      ]);
      setRules(r.data.rules);
      setRuns(rn.data.runs);
      setWrites(w.data.writes);
      setError("");
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoaded(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // The action picker offers what this tenant actually owns — never a list we
    // invented. A failed read leaves the list empty and the composer says so.
    Promise.all([
      fetch("/api/native/tables", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/native/transform", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([tablesRes, transformsRes]) => {
        const tableList = Array.isArray(tablesRes?.data?.tables) ? tablesRes.data.tables : [];
        setTables(tableList.map((t: { id: string; name?: string }) => ({ id: String(t.id), name: String(t.name ?? t.id) })));
        const transformList = Array.isArray(transformsRes?.data?.transforms) ? transformsRes.data.transforms : [];
        setTransforms(
          transformList.map((t: { id: string; name?: string; status?: string }) => ({
            id: String(t.id),
            name: String(t.name ?? t.id),
            status: String(t.status ?? ""),
          })),
        );
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    fetch("/api/native/entitlements", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const e = d?.entitlement;
        if (!e) return;
        setEnt({
          tier: String(e.tier ?? "none"),
          label: String(e.label ?? "your plan"),
          // No plan on file = nothing to enforce (the server gate agrees).
          controlPlane: e.tier === "none" ? true : e.features?.controlPlane === true,
        });
      })
      .catch(() => setEnt(null));
  }, []);
  const controlPlane = ent?.controlPlane !== false;

  async function submit(path: string, body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/native/automation${path}`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setNotice(json.data?.status === "pending" ? "Queued for approval (check Approvals)." : "Applied.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * SLICE 173 (W1 + W2): build exactly the action the user chose, and refuse
   * with a field-level error when the inputs for that action are missing. There
   * is no default recipient, no substitute kind and no invented value anywhere
   * in this function.
   */
  function createRule() {
    setFieldError(null);
    setError("");
    const ruleName = name.trim();
    if (!ruleName) {
      setFieldError({ field: "name", message: "Rule name is required." });
      return;
    }
    let action: Record<string, unknown>;
    if (actionKind === "notify") {
      const to = recipient.trim();
      if (!to) {
        setFieldError({ field: "recipient", message: "Notify recipient email is required — enter the address this rule should email." });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        setFieldError({ field: "recipient", message: `Notify recipient email "${to}" is not a valid email address.` });
        return;
      }
      action = {
        kind: "notify",
        recipients: [to],
        subject: "Automation fired",
        body: `Rule ${ruleName} matched${amount ? ` with amount > ${amount}` : ""}.`,
      };
    } else if (actionKind === "webhook") {
      action = { kind: "webhook", eventType, payload: { source: "automation" } };
    } else if (actionKind === "tableWrite") {
      if (!tableId) {
        setFieldError({ field: "tableId", message: "Table write needs a table — choose one (none exist yet? create one in Tables first)." });
        return;
      }
      let row: unknown;
      try {
        row = JSON.parse(rowJson);
      } catch {
        setFieldError({ field: "row", message: "Row to insert must be valid JSON, for example {\"name\":\"Acme\"}." });
        return;
      }
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        setFieldError({ field: "row", message: "Row to insert must be a JSON object." });
        return;
      }
      action = { kind: "tableWrite", tableId, row };
    } else {
      if (!transformId) {
        setFieldError({ field: "transformId", message: "Run transform needs a transform — choose one (none exist yet? create one in Transforms first)." });
        return;
      }
      action = { kind: "runTransform", transformId, ...(transformSource.trim() ? { source: transformSource } : {}) };
    }
    void submit("/rules", {
      name: ruleName, description: "Built in the automations workspace",
      trigger: triggerKind === "event" ? { kind: "event", eventType } : { kind: "schedule", cadence, timeUtc },
      conditions: amount ? [{ field: "amount", op: "gt", value: Number(amount) }] : [],
      actions: [action], autonomyAllowList: controlPlane ? autonomy : [],
    });
  }
  function lifecycle(ruleId: string, op: string) {
    void submit(`/rules/${ruleId}/${op}`, {});
  }
  async function decide(writeId: string, decision: "apply" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/native/automation/writes/${writeId}/${decision === "apply" ? "apply" : "reject"}`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setNotice(decision === "apply" ? "Applied." : "Rejected.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const toggleAutonomy = (k: string) => {
    setAutonomy((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automations</h1>
        <p className="text-sm text-stone-500">Rules: event or schedule trigger → conditions → actions. Every write rides your Approval Queue; only allow-listed kinds auto-run.</p>
      </div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {fieldError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {fieldError.message}
        </div>
      )}
      {notice && <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      {/* SLICE 142 — control-plane state. Growth+ owns the controls; Starter
          sees exactly what it has (approvals, live) and what Growth adds.
          Nothing here pretends a control exists that has not shipped. */}
      {ent && (
        <Card><CardBody>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold">Automation control plane</h2>
            <Badge>{ent.label}</Badge>
          </div>
          {controlPlane ? (
            <ul className="mt-3 space-y-1 text-sm text-stone-400">
              <li>✓ Autonomy allow-lists — live: allow-listed actions auto-run, everything else waits for you.</li>
              <li>✓ Kill switch and error budget — included in your plan; the dedicated controls are still being built, and until they ship every rule stays approval-gated unless you allow-list it.</li>
              <li>✓ The approval queue — live on every plan.</li>
            </ul>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-stone-400">
              <li>✓ The approval queue — live on every plan, including yours.</li>
              <li className="text-stone-500">◦ Autonomy allow-lists — included from Growth.</li>
              <li className="text-stone-500">◦ Kill switch and error budget — included from Growth.</li>
            </ul>
          )}
        </CardBody></Card>
      )}

      <Card><CardBody>
        <h2 className="font-semibold mb-3">New rule</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input w-full" placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input w-full" aria-label="Action" value={actionKind} onChange={(e) => setActionKind(e.target.value as typeof actionKind)}>
            <option value="notify">Notify (email)</option>
            <option value="webhook">Webhook (publish event)</option>
            <option value="tableWrite">Table write</option>
            <option value="runTransform">Run transform</option>
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <select className="input w-full" value={triggerKind} onChange={(e) => setTriggerKind(e.target.value as typeof triggerKind)}>
            <option value="event">Event trigger</option>
            <option value="schedule">Schedule</option>
          </select>
          {triggerKind === "event"
            ? <input className="input w-full" placeholder="native.sales.lead.created" value={eventType} onChange={(e) => setEventType(e.target.value)} />
            : (<>
              <select className="input w-full" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
              <input className="input w-full" value={timeUtc} onChange={(e) => setTimeUtc(e.target.value)} aria-label="timeUtc" />
            </>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2 mt-3">
          <input className="input w-full" placeholder="amount > ? (leave empty to always match)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input w-full" aria-label="Notify recipient email" placeholder="notify recipient email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </div>
        {actionKind === "tableWrite" && (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <select className="input w-full" aria-label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Choose a table…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input
              className="input w-full"
              aria-label="Row to insert (JSON)"
              placeholder='Row to insert, JSON: {"name":"Acme"}'
              value={rowJson}
              onChange={(e) => setRowJson(e.target.value)}
            />
            {tables.length === 0 && (
              <p className="md:col-span-2 text-xs text-stone-400">
                You have no tables yet. Create one in Tables first — this rule will write a row into it.
              </p>
            )}
          </div>
        )}
        {actionKind === "runTransform" && (
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <select className="input w-full" aria-label="Transform" value={transformId} onChange={(e) => setTransformId(e.target.value)}>
              <option value="">Choose a transform…</option>
              {transforms.map((t) => (
                <option key={t.id} value={t.id}>{t.status === "active" ? t.name : `${t.name} (${t.status || "not active"})`}</option>
              ))}
            </select>
            <input
              className="input w-full"
              aria-label="Transform source (optional)"
              placeholder="Source text to run the transform on (optional)"
              value={transformSource}
              onChange={(e) => setTransformSource(e.target.value)}
            />
            {transforms.length === 0 && (
              <p className="md:col-span-2 text-xs text-stone-400">
                You have no transforms yet. Create one in Transforms first — this rule will run it.
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-stone-500">Auto-run (allow-list):</span>
          {["notify", "webhook", "tableWrite", "runTransform"].map((k) => (
            <button key={k} type="button" disabled={!controlPlane} onClick={() => toggleAutonomy(k)}
              className={`px-2 py-1 rounded-lg text-xs font-medium border ${
                !controlPlane
                  ? "bg-stone-900 text-stone-600 border-stone-800 cursor-not-allowed"
                  : autonomy.includes(k) ? "bg-emerald-500 text-black border-emerald-400" : "bg-stone-800 text-stone-300 border-stone-700"
              }`}>
              {k}
            </button>
          ))}
        </div>
        {!controlPlane && (
          <p className="mt-2 text-xs text-stone-400">
            Auto-run allow-lists are part of the automation control plane, <span className="font-semibold text-stone-200">included from Growth</span>.
            On your {ent?.label ?? "current"} plan every rule stays approval-gated — nothing is blocked, you approve each write yourself.
          </p>
        )}
        <div className="mt-4">
          <Button disabled={busy || !name.trim()} onClick={createRule}>Create rule (approval-gated)</Button>
        </div>
      </CardBody></Card>

      <Card><CardBody>
        <h2 className="font-semibold mb-2">Rules</h2>
        {!loaded ? (
          <p className="text-sm text-stone-400">The rule list could not be read — see the message above.</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-stone-400">No rules yet.</p>
        ) : null}
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-800 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge>{r.status}</Badge>
                </div>
                <p className="text-xs text-stone-500">
                  {r.trigger.kind === "event" ? `on ${r.trigger.eventType}` : `${r.trigger.cadence} ${r.trigger.timeUtc} UTC`} · {r.conditionCount} condition(s) · {r.actionCount} action(s)
                  {r.autonomyAllowList.length ? ` · auto: ${r.autonomyAllowList.join(",")}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {r.status === "draft" && <Button onClick={() => lifecycle(r.id, "activate")}>Activate</Button>}
                {r.status === "paused" && <Button onClick={() => lifecycle(r.id, "activate")}>Activate</Button>}
                {r.status === "active" && <Button onClick={() => lifecycle(r.id, "pause")}>Pause</Button>}
                {(r.status === "active" || r.status === "paused") && <Button onClick={() => lifecycle(r.id, "archive")}>Archive</Button>}
                {(r.status === "draft" || r.status === "paused") && <Button onClick={() => lifecycle(r.id, "delete")}>Delete</Button>}
              </div>
            </div>
          ))}
        </div>
      </CardBody></Card>

      <Card><CardBody>
        <h2 className="font-semibold mb-2">Pending automation approvals</h2>
        {!loaded ? (
          <p className="text-sm text-stone-400">The pending-approval list could not be read — see the message above.</p>
        ) : writes.length === 0 ? (
          <p className="text-sm text-stone-400">None pending.</p>
        ) : null}
        {writes.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-800 px-4 py-2 mb-2">
            <span className="text-sm">{w.op} <span className="text-stone-400">by {w.requestedBy}</span></span>
            <div className="flex gap-2">
              <Button onClick={() => decide(w.id, "apply")}>Apply</Button>
              <Button onClick={() => decide(w.id, "reject")}>Reject</Button>
            </div>
          </div>
        ))}
      </CardBody></Card>

      <Card><CardBody>
        <h2 className="font-semibold mb-2">Run ledger (durable attempts)</h2>
        {!loaded ? (
          <p className="text-sm text-stone-400">The run ledger could not be read — see the message above.</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-stone-400">No runs recorded.</p>
        ) : null}
        <div className="space-y-1">
          {runs.slice(0, 20).map((r) => (
            <div key={r.id} className="text-xs flex items-center gap-2 border-b border-stone-800 py-1">
              <Badge>{r.matched ? "matched" : "unmatched"}</Badge>
              <span>{r.ruleName}</span>
              <span className="text-stone-400">{r.triggerKind} · {r.triggeredAt}</span>
              {r.error && <span className="text-red-600">{r.error}</span>}
            </div>
          ))}
        </div>
      </CardBody></Card>
    </div>
  );
}