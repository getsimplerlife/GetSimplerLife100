/**
 * portal.assistant.index.page.tsx — Phase 3.8 native ASSISTANT portal surface
 * (lazy route). A chat-style ask surface over the tenant's own native data:
 * transcript + labeled drafts, gated asks (pending card + approve/reject),
 * and the honest "drafts are disabled" note — never a fabricated answer.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface AssistantMessageView {
  id: string;
  role: string;
  content: string;
  draft: boolean;
  status: string;
  createdAt: string;
}
interface PendingWriteView {
  id: string;
  prompt: string;
  draftAnswer: string | null;
  draftNote: string | null;
  status: string;
  createdAt: string;
}
interface AskReply {
  applied?: boolean;
  pending?: boolean;
  approvalActionId?: string;
  draft?: { content?: string; note?: string };
}

export default function PortalAssistantIndexPage() {
  const [messages, setMessages] = useState<AssistantMessageView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mRes, wRes] = await Promise.all([
        fetch("/api/native/assistant/messages", { headers: { accept: "application/json" } }),
        fetch("/api/native/assistant/writes", { headers: { accept: "application/json" } }),
      ]);
      if (mRes.ok) {
        const m = (await mRes.json()) as { messages: AssistantMessageView[] };
        setMessages(m.messages ?? []);
      }
      if (wRes.ok) {
        const w = (await wRes.json()) as { writes: PendingWriteView[] };
        setWrites((w.writes ?? []).filter((x) => x.status === "pending"));
      }
    } catch {
      setNotice("Could not reach the assistant right now.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ask = useCallback(async () => {
    const value = prompt.trim();
    if (!value || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/native/assistant/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      const out = (await res.json()) as AskReply;
      if (!res.ok) {
        setNotice(out.draft?.note ?? "Your ask was not recorded.");
        return;
      }
      if (out.pending) {
        setNotice("Ask recorded — pending approval. The draft below is a preview only and is not stored until approved.");
      } else {
        setNotice(null);
      }
      setPrompt("");
      await load();
    } catch {
      setNotice("Could not submit the ask right now.");
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, load]);

  const decide = useCallback(
    async (id: string, action: "apply" | "reject") => {
      try {
        await fetch(`/api/native/assistant/writes/${encodeURIComponent(id)}/${action}`, { method: "POST" });
        await load();
      } catch {
        setNotice("Could not update the pending ask right now.");
      }
    },
    [load],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Ask questions about your workspace and get a draft answer. Every ask is recorded and held for your approval
          by default — drafts are generated suggestions, never changes to your data.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100" role="status">
          {notice}
        </div>
      )}

      <Card>
        <CardBody>
          <div className="space-y-3">
            <textarea
              aria-label="Ask the assistant a question"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
              }}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Which data tables do I have, and how many rows are in each?"
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Drafts are disabled until LLM intelligence is enabled for the workspace. {prompt.length}/2000
              </p>
              <Button onClick={() => void ask()} disabled={busy || prompt.trim().length === 0}>
                {busy ? "Asking…" : "Ask"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {writes.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pending asks (approval queue)
            </h2>
            <ul className="space-y-2">
              {writes.map((w) => (
                <li key={w.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{w.prompt}</span>
                    <Badge>pending</Badge>
                  </div>
                  {w.draftAnswer && (
                    <p className="mt-2 rounded bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                      <span className="font-semibold">Draft (not stored):</span> {w.draftAnswer}
                    </p>
                  )}
                  {!w.draftAnswer && w.draftNote && (
                    <p className="mt-2 text-xs text-muted-foreground">{w.draftNote}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => void decide(w.id, "apply")}>Approve &amp; store</Button>
                    <Button variant="outline" onClick={() => void decide(w.id, "reject")}>
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Transcript</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No asks yet — your message history appears here once approved.</p>
          ) : (
            <ul className="space-y-2">
              {[...messages]
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border p-3 ${m.role === "user" ? "border-border bg-muted/40" : "border-emerald-500/20 bg-emerald-500/5"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {m.role === "user" ? "You" : "Assistant"}
                      </span>
                      {m.draft && <Badge>draft</Badge>}
                      {m.status === "pending" && <Badge>pending</Badge>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{m.content}</p>
                  </li>
                ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}