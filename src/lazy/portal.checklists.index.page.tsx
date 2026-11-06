import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { FieldErrorLine } from "~/components/FieldError";
import { fieldErrorFrom, fieldErrorProps, type FieldError } from "~/lib/form-field-error";

/** The inputs this composer owns — only these can carry a field-level error. */
const CHECKLIST_FIELDS = ["name", "description", "linkedProposalId", "items"] as const;

interface ChecklistSummary {
  id: string;
  name: string;
  kind: string;
  status: string;
  progress: { done: number; total: number };
  linkedProposalId: string | null;
  description: string;
  items: { id: string; title: string; status: string; assignee?: string; completedAt?: string }[];
  version: number;
  updatedAt: string;
}
interface PendingWrite {
  id: string;
  op: string;
  checklistId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  closed: "Closed",
};
const ITEM_STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

/** The server's own sentence about a refused write — `native/checklists/router.ts`
 *  answers a gate failure with `{ error }`, so the page never invents a reason. */
function serverError(body: Record<string, any> | null): string {
  const e = body?.error;
  return typeof e === "string" ? e.trim() : "";
}

/** SLICE 178 — a refused verb used to print NOTHING (there was no `else`), so a
 *  400/401/404/500 left the row unchanged and the control looked dead. */
function failureSentence(verb: string, status: number, body: Record<string, any> | null): string {
  const msg = serverError(body);
  if (!msg) return `${verb} failed (${status}) — the server sent no reason.`;
  if (msg.toLowerCase().startsWith(`${verb.toLowerCase()} failed`)) return msg;
  return `${verb} failed (${status}) — ${msg}`;
}

export default function ChecklistsPage() {
  const [items, setItems] = useState<ChecklistSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  // SLICE read-failure batch B — `items` stays [] when the read throws, so the
  // card printed "No checklists yet" over a failed read. `loaded` is the only
  // thing that may unlock the affirmative empty state.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  // SLICE 178 — a failure must not be printed in the success box.
  const [feedbackTone, setFeedbackTone] = useState<"ok" | "error">("ok");
  const say = (message: string, tone: "ok" | "error" = "ok") => {
    setFeedback(message);
    setFeedbackTone(tone);
  };
  const [creating, setCreating] = useState(false);
  // SLICE 174 — the server names the field it rejected; show it THERE.
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  // create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"delivery" | "custom">("delivery");
  const [linkedProposalId, setLinkedProposalId] = useState("");
  const [itemsText, setItemsText] = useState("Scope confirmed\nDeliverables drafted\nClient review\nCommissioning");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/checklists", { credentials: "include" });
    // SLICE batch B — the failure is the SERVER's own sentence when it sent one,
    // so the page cannot invent a reason the server never gave.
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error || "Failed to load checklists");
    }
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/checklists/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data || []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load()
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(false);
      })
      .finally(() => setLoading(false));
  }, [load]);

  // SLICE 178 — the parsed body travels with the status so a refusal can be
  // reported in the server's own words instead of vanishing.
  async function api(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; body: Record<string, any> | null }> {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const parsed = (await res.json().catch(() => null)) as Record<string, any> | null;
    return { ok: res.ok, status: res.status, body: parsed };
  }

  async function createChecklist() {
    setCreating(true);
    setFeedback("");
    setError("");
    setFieldError(null);
    try {
      const itemsRows = itemsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((title) => ({ title, status: "todo" }));
      const body: Record<string, unknown> = { name, description, kind, items: itemsRows };
      if (linkedProposalId.trim()) body.linkedProposalId = linkedProposalId.trim();
      const res = await fetch("/api/native/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 202) {
        say("Checklist queued — approve it below to create it.");
      } else if (res.ok) {
        say("Checklist created.");
      } else {
        const j = await res.json().catch(() => ({}));
        const msg = j.error || "Failed to create checklist";
        setError(msg);
        // SLICE 174 — blame the field the server named, and keep every value the
        // user typed. A rejected submit must never wipe the form.
        setFieldError(fieldErrorFrom(msg, CHECKLIST_FIELDS));
        await load();
        return;
      }
      setName(""); setDescription(""); setLinkedProposalId("");
      setFieldError(null);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: string) {
    setFeedback("");
    const res = await api("POST", `/api/native/checklists/${id}/${verb}`);
    if (res.status === 202) {
      say(`${verb} queued — approve it in the queue below.`);
    } else if (!res.ok) {
      // SLICE 178 — this branch did not exist: every failed verb was silent.
      say(failureSentence(verb, res.status, res.body), "error");
    } else {
      say(`${verb} applied.`);
    }
    await load();
  }
  async function applyWrite(id: string) {
    const res = await api("POST", `/api/native/checklists/writes/${id}/apply`);
    if (res.ok) say("Write applied.");
    else say(serverError(res.body) || `Write apply failed (${res.status}).`, "error");
    await load();
  }
  async function deleteChecklist(id: string) {
    const res = await api("DELETE", `/api/native/checklists/${id}`);
    if (res.status === 202) say("Delete queued.");
    else if (res.ok) say("Deleted.");
    else say(failureSentence("delete", res.status, res.body), "error");
    await load();
  }
  async function updateItem(id: string, itemId: string, status: string) {
    setFeedback("");
    const c = items.find((x) => x.id === id);
    if (!c) return;
    const nextItems = c.items.map((it) =>
      it.id === itemId ? { ...it, status } : { ...it, id: it.id, title: it.title, status: it.status, ...(it.assignee ? { assignee: it.assignee } : {}) },
    );
    const res = await api("POST", `/api/native/checklists/${id}`, { items: nextItems });
    if (res.status === 202) say("Item update queued — approve it in the queue below.");
    else if (res.ok) say("Item updated.");
    // SLICE 178 — same missing branch: a refused item update said nothing.
    else say(failureSentence("item update", res.status, res.body), "error");
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checklists</h1>
          <p className="text-sm text-stone-500">Delivery checklists with approval-gated item tracking.</p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && (
        <div
          className={
            feedbackTone === "error"
              ? "rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700"
              : "rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
          }
        >
          {feedback}
        </div>
      )}

      <Card id="checklist-composer">
        <h2 className="mb-3 text-lg font-semibold">New checklist</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} {...fieldErrorProps(fieldError, "name", "checklist-name-error")} />
            <FieldErrorLine error={fieldError} field="name" id="checklist-name-error" />
          </div>
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Linked proposal id (optional, prop_…)" aria-label="Linked proposal id (optional)" value={linkedProposalId} onChange={(e) => setLinkedProposalId(e.target.value)} {...fieldErrorProps(fieldError, "linkedProposalId", "checklist-linkedProposalId-error")} />
            <FieldErrorLine error={fieldError} field="linkedProposalId" id="checklist-linkedProposalId-error" />
          </div>
          <select className="rounded border p-2" value={kind} onChange={(e) => setKind(e.target.value as "delivery" | "custom")}>
            <option value="delivery">Delivery</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <input className="mt-3 w-full rounded border p-2" placeholder="Description (optional)" aria-label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} {...fieldErrorProps(fieldError, "description", "checklist-description-error")} />
        <FieldErrorLine error={fieldError} field="description" id="checklist-description-error" />
        <label className="mt-3 block text-sm text-stone-400">Items — one per line (start each with "in_progress:" or "done:" to set status)</label>
        <textarea className="mt-1 w-full rounded border p-2 font-mono text-sm" rows={3} aria-label="Items" value={itemsText} onChange={(e) => setItemsText(e.target.value)} {...fieldErrorProps(fieldError, "items", "checklist-items-error")} />
        <FieldErrorLine error={fieldError} field="items" id="checklist-items-error" />
        <Button className="mt-3" onClick={createChecklist} disabled={creating || !name}>
          {creating ? "Creating…" : "Create checklist"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Checklists ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : !loaded ? (
          // SLICE batch B — a failed read is not "No checklists yet".
          <div role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            The checklist list could not be read, so this is not an empty workspace — it is an unread one. Nothing was
            changed.{" "}
            <button type="button" className="font-bold underline" onClick={() => void load()}>Try again</button>
          </div>
        ) : items.length === 0 ? (
          <PortalEmptyState
            title="No checklists yet"
            body="Create your first checklist in the composer above — every write is approval-gated and audited."
            action={{ label: "Open the composer", onClick: () => scrollToId("checklist-composer") }}
          />
        ) : (
          <div className="space-y-3">
            {items.map((c) => (
              <div key={c.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge>{STATUS_LABEL[c.status] || c.status}</Badge>
                      <Badge>{c.kind}</Badge>
                    </div>
                    <p className="text-sm text-stone-500">
                      {c.progress.done}/{c.progress.total} done · v{c.version}
                      {c.linkedProposalId ? ` · linked ${c.linkedProposalId}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "open" && <Button onClick={() => action(c.id, "close")}>Close</Button>}
                    {c.status === "open" && <Button onClick={() => deleteChecklist(c.id)}>Delete</Button>}
                  </div>
                </div>
                {c.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-800 bg-stone-900 p-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{it.title}</span>
                          {it.assignee ? <span className="ml-2 text-stone-500">{it.assignee}</span> : null}
                          {it.completedAt ? <span className="ml-2 text-xs text-stone-400">done {new Date(it.completedAt).toLocaleDateString()}</span> : null}
                        </span>
                        <span className="flex items-center gap-1">
                          <Badge>{ITEM_STATUS_LABEL[it.status] || it.status}</Badge>
                          {c.status === "open" && it.status !== "done" && (
                            <Button onClick={() => updateItem(c.id, it.id, "done")}>Mark done</Button>
                          )}
                          {c.status === "open" && it.status === "done" && (
                            <Button onClick={() => updateItem(c.id, it.id, "todo")}>Reopen</Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Pending writes ({writes.filter((w) => w.status === "pending").length})</h2>
        {writes.filter((w) => w.status === "pending").length === 0 ? (
          <p className="text-sm text-stone-500">Nothing waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="text-stone-400">
                  <code>{w.op}</code> · {w.via} · {new Date(w.requestedAt).toLocaleString()}
                </span>
                <Button onClick={() => applyWrite(w.id)}>Apply</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}