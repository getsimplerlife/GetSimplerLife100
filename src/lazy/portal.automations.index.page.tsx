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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  function createRule() {
    const actions = actionKind === "notify"
      ? [{ kind: "notify", recipients: [recipient || "ops@example.com"], subject: "Automation fired", body: `Rule ${name} matched with amount > ${amount}.` }]
      : [{ kind: "webhook", eventType, payload: { source: "automation" } }];
    void submit("/rules", {
      name, description: "Built in the automations workspace",
      trigger: triggerKind === "event" ? { kind: "event", eventType } : { kind: "schedule", cadence, timeUtc },
      conditions: amount ? [{ field: "amount", op: "gt", value: Number(amount) }] : [],
      actions, autonomyAllowList: autonomy,
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
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <Card><CardBody>
        <h2 className="font-semibold mb-3">New rule</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input w-full" placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input w-full" value={actionKind} onChange={(e) => setActionKind(e.target.value as typeof actionKind)}>
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
          <input className="input w-full" placeholder="notify recipient email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-stone-500">Auto-run (allow-list):</span>
          {["notify", "webhook", "tableWrite", "runTransform"].map((k) => (
            <button key={k} type="button" onClick={() => toggleAutonomy(k)}
              className={`px-2 py-1 rounded-lg text-xs font-medium border ${autonomy.includes(k) ? "bg-emerald-500 text-black border-emerald-400" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Button disabled={busy || !name.trim()} onClick={createRule}>Create rule (approval-gated)</Button>
        </div>
      </CardBody></Card>

      <Card><CardBody>
        <h2 className="font-semibold mb-2">Rules</h2>
        {rules.length === 0 && <p className="text-sm text-stone-400">No rules yet.</p>}
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3">
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
        {writes.length === 0 && <p className="text-sm text-stone-400">None pending.</p>}
        {writes.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-2 mb-2">
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
        {runs.length === 0 && <p className="text-sm text-stone-400">No runs recorded.</p>}
        <div className="space-y-1">
          {runs.slice(0, 20).map((r) => (
            <div key={r.id} className="text-xs flex items-center gap-2 border-b border-stone-100 py-1">
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