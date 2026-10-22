import { useState, useEffect, useCallback } from "react";

interface CommMsg {
  id: string;
  from: string;
  subject: string;
  body: string;
  preview: string;
  channel: string;
  direction: "inbound" | "reply";
  replyTo?: string;
  time: string;
  sentiment: string;
  read: boolean;
}

interface PendingWrite {
  id: string;
  action: string;
  status: string;
  requestedAt: string;
  replyTo: string | null;
  subject: string | null;
}

function CommsInbox() {
  const [comms, setComms] = useState<CommMsg[]>([]);
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [threadRes, writesRes] = await Promise.all([
        fetch("/api/native/communications", { credentials: "include" }),
        fetch("/api/native/communications/writes", { credentials: "include" }),
      ]);
      const thread = await threadRes.json();
      setComms(Array.isArray(thread?.data?.messages) ? thread.data.messages : []);
      const writes = await writesRes.json();
      setPending(Array.isArray(writes?.data?.writes) ? writes.data.writes : []);
    } catch (e) {
      console.error(e);
      setError("Couldn't load your communications log. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string, kind: "ok" | "err" = "ok") => {
    setFeedback(msg);
    setError(kind === "err" ? msg : "");
    if (kind === "ok") setTimeout(() => setFeedback(""), 5000);
  };

  const openCompose = (messageId: string) => {
    setComposeFor(messageId);
    setDraft("");
    setError("");
  };

  const submitReply = async (messageId: string) => {
    if (!draft.trim()) {
      setError("Write a reply before saving it to your communications log.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/native/communications/messages/${encodeURIComponent(messageId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: draft.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 201) {
        flash("Reply saved to your communications log. No email was sent from this workspace.");
        setComposeFor(null);
        setDraft("");
      } else if (res.status === 202) {
        flash("Reply queued for approval — pending review. It will appear in the thread once approved.");
        setComposeFor(null);
        setDraft("");
      } else {
        setError(json?.error || "Your reply wasn't saved. Please try again.");
      }
      await load();
    } catch (e) {
      console.error(e);
      setError("Your reply wasn't saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (writeId: string, decision: "apply" | "reject") => {
    setError("");
    try {
      const res = await fetch(`/api/native/communications/writes/${writeId}/${decision}`, { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Couldn't update the pending reply.");
        return;
      }
      flash(decision === "apply" ? "Reply approved and saved to your communications log (no email sent)." : "Pending reply discarded — nothing was saved.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Couldn't update the pending reply.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const thread = comms.filter((c) => c.direction === "inbound" || !c.replyTo);
  const repliesByParent = new Map<string, CommMsg[]>();
  for (const c of comms) {
    if (c.direction === "reply" && c.replyTo) {
      const arr = repliesByParent.get(c.replyTo) ?? [];
      arr.push(c);
      repliesByParent.set(c.replyTo, arr);
    }
  }

  const renderReply = (r: CommMsg) => (
    <div key={r.id} className="ml-6 mt-3 bg-stone-950/60 p-4 rounded-2xl border border-emerald-900/40">
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">Your reply</span>
        <span className="text-stone-500 font-bold">{r.time}</span>
      </div>
      <p className="text-stone-300 text-xs leading-relaxed whitespace-pre-wrap">{r.body}</p>
      <p className="text-[10px] text-stone-500 mt-2 font-semibold">
        Saved to your communications log — no email was sent from this workspace.
      </p>
    </div>
  );

  const renderCard = (c: CommMsg) => {
    const replies = repliesByParent.get(c.id) ?? [];
    return (
      <div key={c.id} className="bg-stone-900 p-6 rounded-3xl border border-stone-800 shadow-sm flex flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">{c.channel}</span>
            <span className="text-stone-400 font-bold">{c.time}</span>
          </div>
          <h3 className="font-black text-stone-100 text-sm leading-tight">{c.subject}</h3>
          <p className="text-stone-400 text-xs">{c.preview || c.body}</p>
          <div className="text-[10px] font-bold text-stone-400">From: {c.from}</div>
        </div>
        {replies.map(renderReply)}
        <div className="border-t border-stone-800 pt-3 flex justify-between items-center">
          <span className="text-xs font-semibold text-stone-400">Sentiment: <span className="text-stone-300 font-bold">{c.sentiment}</span></span>
          {composeFor === c.id ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setComposeFor(null); setError(""); }}
                disabled={submitting}
                className="bg-stone-700 hover:bg-stone-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitReply(c.id)}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save reply to log"}
              </button>
            </div>
          ) : (
            <button onClick={() => openCompose(c.id)} className="bg-stone-700 hover:bg-stone-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl">
              Reply
            </button>
          )}
        </div>
        {composeFor === c.id && (
          <div className="border-t border-stone-800 pt-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Write your reply…"
              className="w-full bg-stone-950 text-stone-200 text-xs rounded-2xl border border-stone-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
            />
            <p className="text-[10px] text-stone-500 mt-1.5 font-semibold">
              Your reply is saved to this workspace's communications log. No email is sent from here.
            </p>
          </div>
        )}
      </div>
    );
  };

  const empty =
    comms.length === 0 && pending.length === 0 ? (
      <div className="bg-stone-900 p-10 rounded-3xl border border-dashed border-stone-700 shadow-sm text-center">
        <div className="text-3xl mb-3">💬</div>
        <h3 className="font-black text-stone-100 text-lg">Nothing to reply to yet</h3>
        <p className="text-stone-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Messages logged for this workspace appear here as a thread. When there's a message that needs a reply, open it
          and use <span className="font-bold text-stone-300">Reply</span> — your reply is saved to your communications
          log (no email is sent from this workspace).
        </p>
      </div>
    ) : null;

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-800 pb-6">
        <h1 className="text-3xl font-black text-stone-100 tracking-tight">💬 Communication Center</h1>
        <p className="text-stone-400 mt-1">
          Messages and replies logged for your workspace. Replies are saved to your communications log — nothing is sent as email from this page.
        </p>
      </div>

      {empty}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {thread.map(renderCard)}
      </div>

      {pending.length > 0 && (
        <div className="bg-stone-900 p-6 rounded-3xl border border-stone-800 shadow-sm">
          <h2 className="font-black text-stone-100 text-sm mb-4">⏳ Pending replies (awaiting your review)</h2>
          <div className="space-y-3">
            {pending.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-4 bg-stone-950/60 p-4 rounded-2xl border border-stone-800">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-stone-200">Reply {w.subject ? `→ ${w.subject}` : `to message ${w.replyTo ?? "—"}`}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">Queued {w.requestedAt ? new Date(w.requestedAt).toLocaleString() : "—"} · {w.action}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void decide(w.id, "apply")}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void decide(w.id, "reject")}
                    className="bg-stone-700 hover:bg-stone-600 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}
      {error && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-red-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-red-500">✕</span>
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}
    </div>
  );
}

export default CommsInbox;