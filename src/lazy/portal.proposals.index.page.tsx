import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { FieldErrorLine } from "~/components/FieldError";
import { fieldErrorFrom, fieldErrorProps, type FieldError } from "~/lib/form-field-error";

interface ProposalSummary {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string;
  status: string;
  currency: string;
  total: string;
  validityDays: number;
  version: number;
  hasPdf: boolean;
  shareUrl: string | null;
  updatedAt: string;
}
interface PendingWrite {
  id: string;
  op: string;
  proposalId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

/** The inputs this composer owns — only these can carry a field-level error. */
const PROPOSAL_FIELDS = ["title", "clientName", "clientEmail", "clientCompany", "terms", "validityDays", "lineItems"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending client review",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
};

/** The server's own sentence about a refused write. `router.ts:56` maps every
 *  gate failure onto `{ error }` with a 400/404/500, and `gate.ts:242` throws the
 *  full send-refusal sentence, so the page never has to invent a reason. */
function serverError(body: Record<string, any> | null): string {
  const e = body?.error;
  return typeof e === "string" ? e.trim() : "";
}

/** SLICE 178 — a refused lifecycle verb used to print NOTHING (there was no
 *  `else`), so a 400/401/404/500 left the row unchanged and the button looked
 *  dead. The status is always named; the server's sentence is printed as sent. */
function failureSentence(verb: string, status: number, body: Record<string, any> | null): string {
  const msg = serverError(body);
  if (!msg) return `${verb} failed (${status}) — the server sent no reason.`;
  // gate.ts already opens with "send failed — …": don't print the verb twice.
  if (msg.toLowerCase().startsWith(`${verb.toLowerCase()} failed`)) return msg;
  return `${verb} failed (${status}) — ${msg}`;
}

/** SLICE 178 — what the mail lane actually said about a Send.
 *
 *  `POST /api/native/proposals/:id/send` answers 200 with
 *  `{ data: { status, proposalId, proposalStatus, delivery } }`, where `delivery`
 *  is the stored `ProposalDeliveryAttempt`
 *  `{ at, by, channel, outcome: "sent"|"failed"|"unconfigured", messageId?, error? }`
 *  (native/proposals/router.ts:234-243 ← gate.ts:222-249). A REFUSED send is NOT
 *  a 200: gate.ts:242 throws the refusal sentence, the router maps it through
 *  `gateErrorStatus` (`/failed/` → 400), and that sentence reaches the user via
 *  `failureSentence` above. So this function only ever describes an accepted
 *  send — and it says "the mail lane acknowledged", never "the client received",
 *  because an SMTP 250 is all the lane can honestly observe. */
function sendVerdict(body: Record<string, any> | null): string {
  const data = body?.data ?? {};
  const d = data?.delivery ?? null;
  const status = typeof data?.proposalStatus === "string" ? data.proposalStatus : "unchanged";
  const outcome = typeof d?.outcome === "string" ? d.outcome : null;
  const channel = typeof d?.channel === "string" ? d.channel : "the mail lane";
  const error = typeof d?.error === "string" ? d.error : "";
  if (!outcome) {
    return `Send applied, but the server returned no delivery verdict — proposal status ${status}. Treat the email as unconfirmed.`;
  }
  if (outcome === "sent") {
    const id = typeof d?.messageId === "string" ? `, id ${d.messageId}` : "";
    return `Send applied — the mail lane acknowledged the message (outcome "sent" via ${channel}${id}). Proposal status ${status}.`;
  }
  return `Send applied — the mail lane did NOT deliver it (outcome "${outcome}" via ${channel}${error ? `: ${error}` : ""}). Proposal status ${status}.`;
}

export default function ProposalsPage() {
  const [items, setItems] = useState<ProposalSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  // SLICE read-failure batch B — `items` stays [] when the read throws, so the
  // card printed "No proposals yet" over a failed read. `loaded` is the only
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
  const [clip, setClip] = useState("");
  // SLICE 174 — the server names the field it rejected; show it THERE.
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  // create form
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [terms, setTerms] = useState("Net 30");
  const [validityDays, setValidityDays] = useState(30);
  const [lineItemsText, setLineItemsText] = useState("Discovery workshop | 2 | 49.99\nIntegration setup | 1 | 500.00");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/proposals", { credentials: "include" });
    // SLICE batch B — the failure is the SERVER's own sentence when it sent one.
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(e.error || "Failed to load proposals");
    }
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/proposals/writes", { credentials: "include" });
    if (!wr.ok) throw new Error(`Failed to load the pending-writes queue (${wr.status})`);
    const wjson = await wr.json();
    setWrites(wjson.data || []);
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

  // SLICE 178 — the body used to be discarded, which is why a Send could only
  // ever say "applied": the delivery verdict slice 176 returns was unreadable
  // from the one page where Send is pressed.
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

  async function createProposal() {
    setCreating(true);
    setFeedback("");
    setError("");
    setFieldError(null);
    try {
      const itemsRows = lineItemsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [description, qty, unitPrice] = l.split("|").map((x) => x.trim());
          return { description, qty: Number(qty), unitPrice: Number(unitPrice) };
        });
      const res = await fetch("/api/native/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          clientName,
          clientEmail,
          clientCompany,
          terms,
          validityDays,
          lineItems: itemsRows,
          currency: "USD",
        }),
      });
      if (res.status === 202) {
        say("Draft queued — approve it below to create the proposal.");
      } else if (res.ok) {
        say("Proposal created.");
      } else {
        const j = await res.json().catch(() => ({}));
        const msg = j.error || "Failed to create proposal";
        setError(msg);
        // SLICE 174 — put the sentence on the field the server named, and DO NOT
        // clear the form: everything the user typed survives a rejected submit.
        setFieldError(fieldErrorFrom(msg, PROPOSAL_FIELDS));
        await load();
        return;
      }
      setTitle(""); setClientName(""); setClientEmail(""); setClientCompany("");
      setFieldError(null);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: string) {
    setFeedback("");
    const res = await api("POST", `/api/native/proposals/${id}/${verb}`);
    if (res.status === 202) {
      say(`${verb} queued — approve it in the queue below.`);
    } else if (!res.ok) {
      // SLICE 178 — this branch did not exist: every failed verb was silent.
      say(failureSentence(verb, res.status, res.body), "error");
    } else if (verb === "send") {
      say(sendVerdict(res.body));
    } else {
      say(`${verb} applied.`);
    }
    await load();
  }
  async function applyWrite(id: string) {
    // SLICE 167 (D-15) — report what the SERVER says, not what we hoped.
    // A replay of an already-applied write answers 200 with alreadyApplied:
    // true; saying "Write applied." there is a small lie that made the queue
    // look like it had just changed something it had not.
    const res = await fetch(`/api/native/proposals/writes/${id}/apply`, { method: "POST", credentials: "include" });
    const j = (await res.json().catch(() => ({}))) as { error?: string; data?: { alreadyApplied?: boolean } };
    if (!res.ok) say(j.error || `Write apply failed (${res.status}).`, "error");
    else if (j.data?.alreadyApplied) say("That write was already applied — nothing changed.");
    else say("Write applied.");
    await load();
  }
  async function deleteProposal(id: string) {
    const res = await api("DELETE", `/api/native/proposals/${id}`);
    if (res.status === 202) say("Delete queued.");
    else if (res.ok) say("Deleted.");
    else say(failureSentence("delete", res.status, res.body), "error");
    await load();
  }

  async function copyShare(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setClip("Copied — share this link with the client.");
    } catch {
      setClip(url);
    }
  }

  const pendingWrites = writes.filter((w) => w.status === "pending");
  const appliedWrites = writes.filter((w) => w.status !== "pending").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposals</h1>
          <p className="text-sm text-stone-500">Draft, share, and track proposals. Every write is approval-gated.</p>
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
      {clip && <div className="rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 break-all">{clip}</div>}

      <Card id="proposal-composer">
        <h2 className="mb-3 text-lg font-semibold">New proposal</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Title" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} {...fieldErrorProps(fieldError, "title", "proposal-title-error")} />
            <FieldErrorLine error={fieldError} field="title" id="proposal-title-error" />
          </div>
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Client name" aria-label="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} {...fieldErrorProps(fieldError, "clientName", "proposal-clientName-error")} />
            <FieldErrorLine error={fieldError} field="clientName" id="proposal-clientName-error" />
          </div>
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Client email" aria-label="Client email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} {...fieldErrorProps(fieldError, "clientEmail", "proposal-clientEmail-error")} />
            <FieldErrorLine error={fieldError} field="clientEmail" id="proposal-clientEmail-error" />
          </div>
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Client company" aria-label="Client company" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} {...fieldErrorProps(fieldError, "clientCompany", "proposal-clientCompany-error")} />
            <FieldErrorLine error={fieldError} field="clientCompany" id="proposal-clientCompany-error" />
          </div>
          <div className="flex flex-col">
            <input className="rounded border p-2" placeholder="Terms (e.g. Net 30)" aria-label="Terms" value={terms} onChange={(e) => setTerms(e.target.value)} {...fieldErrorProps(fieldError, "terms", "proposal-terms-error")} />
            <FieldErrorLine error={fieldError} field="terms" id="proposal-terms-error" />
          </div>
          <div className="flex flex-col">
            <input
              className="rounded border p-2"
              placeholder="Valid for (days)"
              aria-label="Valid for (days)"
              type="number"
              value={String(validityDays)}
              onChange={(e) => setValidityDays(Number(e.target.value))}
              {...fieldErrorProps(fieldError, "validityDays", "proposal-validityDays-error")}
            />
            <FieldErrorLine error={fieldError} field="validityDays" id="proposal-validityDays-error" />
          </div>
        </div>
        <label className="mt-3 block text-sm text-stone-400">Line items — one per line: description | qty | unit price</label>
        <textarea className="mt-1 w-full rounded border p-2 font-mono text-sm" rows={3} value={lineItemsText} onChange={(e) => setLineItemsText(e.target.value)} />
        <Button className="mt-3" onClick={createProposal} disabled={creating || !title || !clientName}>
          {creating ? "Creating…" : "Create draft"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Open proposals ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : !loaded ? (
          /* SLICE batch B — a failed read is not "No proposals yet". */
          <div role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            The proposal list could not be read, so this is not an empty workspace — it is an unread one. Nothing was
            changed.{" "}
            <button type="button" className="font-bold underline" onClick={() => void load()}>Try again</button>
          </div>
        ) : items.length === 0 ? (
          <PortalEmptyState
            title="No proposals yet"
            body="Draft your first proposal in the composer above — every write is approval-gated and audited."
            action={{ label: "Open the composer", onClick: () => scrollToId("proposal-composer") }}
          />
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge>{STATUS_LABEL[p.status] || p.status}</Badge>
                  </div>
                  <p className="text-sm text-stone-500">
                    {p.clientName}{p.clientCompany ? ` — ${p.clientCompany}` : ""} · {p.total} · v{p.version}
                  </p>
                  {p.shareUrl && (
                    <button className="mt-1 text-left text-xs text-sky-600 underline break-all" onClick={() => copyShare(p.shareUrl!)}>
                      Share link
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* SLICE 167 (D-16) — "Open" OPENS the proposal. It used to
                      queue an `open` write and leave the page where it was, so
                      the quote could not be read anywhere, and once the status
                      flipped to PENDING the row offered no way in at all. The
                      lifecycle write now lives on the detail page. */}
                  <Link
                    to="/portal/proposals/$proposalId"
                    params={{ proposalId: p.id }}
                    className="inline-flex items-center rounded border p-2 text-sm"
                  >
                    Open
                  </Link>
                  {p.status === "pending" && (
                    <>
                      <Button onClick={() => action(p.id, "approve")}>Approve</Button>
                      <Button onClick={() => action(p.id, "reject")}>Reject</Button>
                    </>
                  )}
                  {p.status === "approved" && <Button onClick={() => action(p.id, "send")}>Send</Button>}
                  {p.hasPdf && (
                    <a className="inline-flex items-center rounded border p-2 text-sm" href={`/api/native/proposals/${p.id}/pdf`}>
                      PDF
                    </a>
                  )}
                  {(p.status === "draft" || p.status === "pending") && <Button onClick={() => deleteProposal(p.id)}>Delete</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        {/* SLICE 167 (D-15) — THE QUEUE MUST SHOW WHAT THE SERVER HOLDS AS
            PENDING. It used to count `status === "pending"` in the heading but
            render the WHOLE array, so a write that had already been applied
            reappeared as if it were still waiting (and offered its own Apply
            button). The server returns the full history — applied writes
            included — which is the right thing for a durable record; the page
            was the liar. Both the heading and the list now come from the same
            filtered array, so they cannot disagree. */}
        <h2 className="mb-3 text-lg font-semibold">Pending writes ({pendingWrites.length})</h2>
        {pendingWrites.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {pendingWrites.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="text-stone-400">
                  <code>{w.op}</code> · {w.via} · {new Date(w.requestedAt).toLocaleString()}
                </span>
                <Button onClick={() => applyWrite(w.id)}>Apply</Button>
              </div>
            ))}
          </div>
        )}
        {appliedWrites > 0 && (
          <p className="mt-2 text-xs text-stone-500">
            {appliedWrites} write{appliedWrites === 1 ? "" : "s"} already applied — not listed here.
          </p>
        )}
      </Card>
    </div>
  );
}