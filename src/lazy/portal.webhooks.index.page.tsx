/**
 * portal.webhooks.index.page.tsx — Phase 1.1 WEBHOOKS, surfaced in the portal.
 *
 * Slice 135: the webhook layer (/api/native/webhook-* /events /flush) has been
 * live and tested since the 1.1 build, but no client file referenced it. This
 * page is UI ONLY and calls exactly the routes that exist:
 *
 *   GET    /api/native/webhook-subscriptions      → my outbound subscriptions
 *   POST   /api/native/webhook-subscriptions      → create (SSRF-guarded; the
 *                                                   signing secret is returned
 *                                                   ONCE and never again)
 *   DELETE /api/native/webhook-subscriptions?id=  → delete one of mine
 *   GET    /api/native/webhook-sinks              → my inbound sinks (no secrets)
 *   POST   /api/native/webhook-sinks              → create an inbound sink
 *   DELETE /api/native/webhook-sinks?id=          → delete an inbound sink
 *   POST   /api/native/events                     → publish an event to my subs
 *   POST   /api/native/flush                      → deliver due webhooks now
 *   GET    /api/native/webhook-events             → receipts + delivery history
 *
 * Honest limits shown on the page (not hidden):
 *   - delivery history IS recorded (status pending/delivered/dead, every
 *     attempt with its status code or error), so it is shown in full;
 *   - the server's registry of built-in event types has NO read endpoint, so
 *     the page lists the types this workspace has actually published (from its
 *     own receipts) and says plainly that the registry itself is not exposed;
 *   - a subscription secret is displayed exactly once at creation.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import { SignedOutNotice, ErrorLine, FeedbackLine } from "~/components/PortalPrimitiveShell";
import { authedJson, authedSend, formatWhen, splitList } from "~/lib/portal-primitives";

interface Subscription {
  id: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  retry?: { maxAttempts?: number; initialBackoffMs?: number };
  createdBy: string;
  createdAt: string;
}
interface Sink {
  sinkId: string;
  eventTypes: string[];
  outboundRelayEnabled: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}
interface Receipt {
  id: string;
  eventId: string;
  sinkId: string;
  eventType: string;
  outcome: string;
  receivedAt: string;
}
interface Attempt {
  attempt: number;
  at: string;
  statusCode?: number;
  error?: string;
  success: boolean;
}
interface Delivery {
  id: string;
  subscriptionId: string;
  subscriptionUrl: string;
  eventId: string;
  eventType: string;
  status: string;
  attempts: Attempt[];
  createdAt: string;
  nextRetryAt?: string;
}

const DELIVERY_BADGE: Record<string, "success" | "warning" | "danger" | "stone"> = {
  delivered: "success",
  pending: "warning",
  dead: "danger",
};

export default function WebhooksPage() {
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [sinks, setSinks] = useState<Sink[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState("");

  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [sinkTypes, setSinkTypes] = useState("");
  const [newSinkSecret, setNewSinkSecret] = useState("");
  const [publishType, setPublishType] = useState("");
  const [publishPayload, setPublishPayload] = useState("{}");

  const load = useCallback(async () => {
    const subsRes = await authedJson<Subscription[]>("/api/native/webhook-subscriptions");
    if (!subsRes.ok) {
      if (subsRes.signedOut) setSignedOut(true);
      else setError(subsRes.error);
      return;
    }
    setSignedOut(false);
    setError("");
    setSubs(Array.isArray(subsRes.data) ? subsRes.data : []);
    const sinksRes = await authedJson<Sink[]>("/api/native/webhook-sinks");
    if (sinksRes.ok) setSinks(Array.isArray(sinksRes.data) ? sinksRes.data : []);
    const eventsRes = await authedJson<{ receipts: Receipt[]; deliveries: Delivery[] }>("/api/native/webhook-events");
    if (eventsRes.ok) {
      setReceipts(Array.isArray(eventsRes.data?.receipts) ? eventsRes.data.receipts : []);
      setDeliveries(Array.isArray(eventsRes.data?.deliveries) ? eventsRes.data.deliveries : []);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function createSubscription() {
    setError("");
    setFeedback("");
    setNewSecret("");
    if (!url.trim()) {
      setError("A subscription needs a URL to deliver to.");
      return;
    }
    setBusy("create-sub");
    const types = splitList(eventTypes);
    const res = await authedSend<{ subscription: Subscription; secret: string }>(
      "/api/native/webhook-subscriptions",
      "POST",
      { url: url.trim(), ...(types.length > 0 ? { eventTypes: types } : {}) },
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setNewSecret(res.data.secret);
    setUrl("");
    setEventTypes("");
    setFeedback("Subscription created. Copy the signing secret now — it is shown once and never again.");
    await load();
  }

  async function deleteSubscription(sub: Subscription) {
    setError("");
    setFeedback("");
    setBusy(`del:${sub.id}`);
    const res = await authedSend<unknown>(
      `/api/native/webhook-subscriptions?id=${encodeURIComponent(sub.id)}`,
      "DELETE",
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(`Subscription to ${sub.url} deleted.`);
    await load();
  }

  async function createSink() {
    setError("");
    setFeedback("");
    setNewSinkSecret("");
    setBusy("create-sink");
    const types = splitList(sinkTypes);
    const res = await authedSend<{ sinkId: string; secret: string }>("/api/native/webhook-sinks", "POST", {
      ...(types.length > 0 ? { eventTypes: types } : {}),
    });
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setNewSinkSecret(res.data.secret);
    setSinkTypes("");
    setFeedback(`Inbound sink created at POST /api/native/webhooks/${res.data.sinkId}. Copy the secret now — shown once.`);
    await load();
  }

  async function deleteSink(sink: Sink) {
    setError("");
    setFeedback("");
    setBusy(`delsink:${sink.sinkId}`);
    const res = await authedSend<unknown>(`/api/native/webhook-sinks?id=${encodeURIComponent(sink.sinkId)}`, "DELETE");
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback("Inbound sink deleted.");
    await load();
  }

  async function publish() {
    setError("");
    setFeedback("");
    if (!publishType.trim()) {
      setError("Enter an event type to publish (e.g. native.form.submission).");
      return;
    }
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(publishPayload || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be a JSON object");
      payload = parsed as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payload must be valid JSON");
      return;
    }
    setBusy("publish");
    const res = await authedSend<{ queued: number }>("/api/native/events", "POST", {
      eventType: publishType.trim(),
      payload,
    });
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(
      res.data?.queued
        ? `Published — ${res.data.queued} deliver${res.data.queued === 1 ? "y" : "ies"} queued for your matching subscriptions.`
        : "Published — no subscription matched this event type, so nothing was queued.",
    );
    await load();
  }

  async function flush() {
    setError("");
    setFeedback("");
    setBusy("flush");
    const res = await authedSend<Record<string, unknown>>("/api/native/flush", "POST");
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    const attempted = Number(res.data?.attempted ?? res.data?.processed ?? 0);
    setFeedback(
      attempted > 0
        ? `Delivery attempted for ${attempted} due webhook${attempted === 1 ? "" : "s"} — see the history below for the outcome.`
        : "Nothing was due for delivery.",
    );
    await load();
  }

  if (signedOut) return <SignedOutNotice surface="Webhooks" />;

  const publishedTypes = Array.from(new Set(receipts.map((r) => r.eventType))).sort();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-sm text-stone-500">
          Outbound event subscriptions with HMAC signing, bounded retries and full delivery history, plus inbound sinks
          for other systems to post typed events into your workspace. Everything here is tenant-scoped: you only ever see
          your own subscriptions, receipts and deliveries.
        </p>
      </div>

      <ErrorLine message={error} />
      <FeedbackLine message={feedback} />

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Event subscriptions ({subs.length})</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : subs.length === 0 ? (
            <PortalEmptyState
              title="No webhook subscriptions yet"
              body="A subscription is a URL we POST your events to, signed with a secret only you hold. Add one below — an empty event-type list subscribes to every type."
              compact
            />
          ) : (
            <div className="space-y-3">
              {subs.map((s) => (
                <div key={s.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="truncate text-sm text-stone-700">{s.url}</code>
                        <Badge variant={s.enabled ? "success" : "stone"}>{s.enabled ? "Active" : "Disabled"}</Badge>
                      </div>
                      <p className="text-xs text-stone-500">
                        {s.eventTypes.length === 0
                          ? "All event types"
                          : s.eventTypes.join(", ")}{" "}
                        · created {formatWhen(s.createdAt)}
                        {s.retry?.maxAttempts ? ` · up to ${s.retry.maxAttempts} attempts` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteSubscription(s)}
                      disabled={busy === `del:${s.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 rounded border p-3">
            <h3 className="mb-2 text-sm font-semibold">Add a subscription</h3>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <input
                className="rounded border p-2 text-sm text-stone-900"
                placeholder="https://example.com/webhooks/receive"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <input
                className="rounded border p-2 text-sm text-stone-900"
                placeholder="event types (blank = all)"
                value={eventTypes}
                onChange={(e) => setEventTypes(e.target.value)}
              />
              <Button onClick={createSubscription} disabled={busy === "create-sub"}>
                {busy === "create-sub" ? "Creating…" : "Create"}
              </Button>
            </div>
            {newSecret && (
              <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">Signing secret — shown once</p>
                <code className="mt-1 block break-all text-xs text-amber-900">{newSecret}</code>
                <p className="mt-1 text-xs text-amber-800">
                  Store it now. The server keeps only an encrypted copy and will never display it again.
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-stone-500">
              URLs are SSRF-guarded server-side (private and loopback addresses are refused). Event types are free text
              here: the server's registry of built-in types has no read endpoint, so this page cannot list it.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold">Event-type registry</h2>
          <p className="mb-3 text-xs text-stone-500">
            The server validates and dispatches registered event types, but it does not expose a read endpoint listing
            them — so this page shows the types <em>this workspace has actually published</em> (from its own receipts)
            instead of inventing a catalogue. Unknown types are acknowledged and never recorded.
          </p>
          {publishedTypes.length === 0 ? (
            <p className="text-sm text-stone-500">
              No events have been published in this workspace yet, so there is nothing to list.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {publishedTypes.map((t) => (
                <li key={t}>
                  <Badge variant="blue">{t}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 rounded border p-3">
            <h3 className="mb-2 text-sm font-semibold">Publish an event now</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                className="rounded border p-2 text-sm text-stone-900"
                placeholder="event type"
                value={publishType}
                onChange={(e) => setPublishType(e.target.value)}
              />
              <input
                className="rounded border p-2 text-sm text-stone-900"
                placeholder='{ "key": "value" }'
                value={publishPayload}
                onChange={(e) => setPublishPayload(e.target.value)}
              />
              <Button onClick={publish} disabled={busy === "publish"}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Publishing enqueues a delivery per matching subscription and attempts the flush immediately.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Delivery history ({deliveries.length})</h2>
            <Button size="sm" variant="outline" onClick={flush} disabled={busy === "flush"}>
              {busy === "flush" ? "Flushing…" : "Flush due deliveries"}
            </Button>
          </div>
          {deliveries.length === 0 ? (
            <PortalEmptyState
              title="No deliveries yet"
              body="Delivery attempts appear here once an event is published to a matching subscription. Every attempt records its status code or error."
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-stone-500">
                    <th className="px-2 py-2">Event</th>
                    <th className="px-2 py-2">Destination</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Attempts</th>
                    <th className="px-2 py-2">Queued</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b align-top">
                      <td className="px-2 py-2">{d.eventType}</td>
                      <td className="px-2 py-2">
                        <code className="break-all text-xs text-stone-600">{d.subscriptionUrl}</code>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={DELIVERY_BADGE[d.status] ?? "stone"}>{d.status}</Badge>
                        {d.nextRetryAt && (
                          <p className="text-xs text-stone-500">next retry {formatWhen(d.nextRetryAt)}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {d.attempts.length === 0 ? (
                          <span className="text-stone-500">not attempted yet</span>
                        ) : (
                          <ul className="space-y-1">
                            {d.attempts.map((a) => (
                              <li key={a.attempt}>
                                #{a.attempt} {formatWhen(a.at)} —{" "}
                                {a.success ? (
                                  <span className="text-emerald-600">delivered{a.statusCode ? ` (${a.statusCode})` : ""}</span>
                                ) : (
                                  <span className="text-rose-600">
                                    failed{a.statusCode ? ` (${a.statusCode})` : ""}
                                    {a.error ? `: ${a.error}` : ""}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-stone-500">{formatWhen(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Inbound sinks ({sinks.length})</h2>
          {sinks.length === 0 ? (
            <PortalEmptyState
              title="No inbound sinks yet"
              body="An inbound sink is a signed URL other systems post events to. Create one below to get its endpoint and secret."
              compact
            />
          ) : (
            <div className="space-y-2">
              {sinks.map((s) => (
                <div key={s.sinkId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <div className="min-w-0">
                    <code className="break-all text-sm text-stone-700">POST /api/native/webhooks/{s.sinkId}</code>
                    <p className="text-xs text-stone-500">
                      {s.eventTypes.length === 0 ? "All event types" : s.eventTypes.join(", ")} · created{" "}
                      {formatWhen(s.createdAt)} · {s.enabled ? "enabled" : "disabled"}
                    </p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => deleteSink(s)} disabled={busy === `delsink:${s.sinkId}`}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <input
              className="min-w-64 rounded border p-2 text-sm text-stone-900"
              placeholder="accepted event types (blank = all)"
              value={sinkTypes}
              onChange={(e) => setSinkTypes(e.target.value)}
            />
            <Button onClick={createSink} disabled={busy === "create-sink"}>
              {busy === "create-sink" ? "Creating…" : "Create sink"}
            </Button>
          </div>
          {newSinkSecret && (
            <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800">Sink secret — shown once</p>
              <code className="mt-1 block break-all text-xs text-amber-900">{newSinkSecret}</code>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Inbound receipts ({receipts.length})</h2>
          {receipts.length === 0 ? (
            <p className="text-sm text-stone-500">
              No inbound events received yet. A receipt is written for every accepted signed post to a sink.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider text-stone-500">
                    <th className="px-2 py-2">Event type</th>
                    <th className="px-2 py-2">Outcome</th>
                    <th className="px-2 py-2">Sink</th>
                    <th className="px-2 py-2">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-2 py-2">{r.eventType}</td>
                      <td className="px-2 py-2">{r.outcome}</td>
                      <td className="px-2 py-2 text-xs text-stone-500">{r.sinkId}</td>
                      <td className="px-2 py-2 text-xs text-stone-500">{formatWhen(r.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
