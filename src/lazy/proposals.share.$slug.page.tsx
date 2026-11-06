import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { proposalPublicApiPath } from "~/lib/share-links";

/**
 * SLICE 192b-2 — the page a proposal CLIENT opens.
 *
 * THE SHAPE IS THE SURVEY PAGE'S (`surveys.share.$slug.page.tsx:95-127`), the
 * only honest share page we had: four phases — `loading` / `ready` /
 * `not-available` (a real 404 or 410) / `error` + retry (anything else,
 * including a payload this page cannot read). Before this slice every failure
 * collapsed into "Proposal not found", so a 500 told the client their link was
 * dead and an unreadable payload rendered as a quote.
 *
 * THE DECISION PANEL IS TYPED, like the invoice page's `PAY_PANEL` (191):
 * `DECISION_PANEL: Record<DecisionState, …>`, so a new state is a compile error.
 * Six states — `pending` (the server says `signable`), `expired` (the server's
 * own `expired`), `applied` (200: the decision is on the record), `queued` (202:
 * received, waiting for the owner's approval — nothing has changed), `already-
 * decided` (the record's status is no longer `pending`) and `refused` (the
 * server declined the write; its own words are printed).
 *
 * WHAT THIS PAGE REFUSES TO DO:
 *  - It never renders a form after a decision. The old page kept Accept and
 *    Decline live after a recorded decision (`:131-145`, `:194-226`), so a
 *    client could accept and then decline the same quote and the owner got two
 *    contradictory approval cards.
 *  - It never treats 200 and 202 as the same answer. 200 is applied; 202 is a
 *    card in the owner's queue. "The owner will confirm them" was false on the
 *    200 path.
 *  - It never prints an expiry it did not receive. "Valid for {validityDays}
 *    days" was a number the page computed from nothing; the server now sends
 *    `expiresAt` (192b-1) and this page prints that date, or nothing.
 *  - It never invents a contract term. "Standard terms apply." appeared
 *    whenever the record's `terms` was empty — the class 191 removed from the
 *    invoice page.
 *
 * SSR: the slug comes from the router (`useParams`), never `window.location`,
 * for the same reason as slice 166 — a `window` read while rendering throws on
 * the server and demotes the page to client-only rendering.
 */

type ProposalStatus = "draft" | "pending" | "approved" | "rejected" | "sent";

/** Every status the server can send (src/native/proposals/types.ts:16). */
const KNOWN_STATUS: readonly ProposalStatus[] = ["draft", "pending", "approved", "rejected", "sent"];

/**
 * Typed labels — a customer never reads a raw enum (`pending`, `draft`).
 * `Record<ProposalStatus, string>` so a new status is a compile error here.
 */
const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Not yet issued",
  pending: "Awaiting your decision",
  approved: "Accepted",
  rejected: "Declined",
  sent: "Issued",
};

const STATUS_BADGE: Record<ProposalStatus, "warning" | "success" | "danger" | "blue" | "stone"> = {
  draft: "stone",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  sent: "blue",
};

/**
 * What a record in each state means for a reader who can no longer act on it.
 * A `Record<ProposalStatus, string>` — a new status is a compile error here, not
 * a sentence that silently reads "has already been pending".
 */
const DECIDED_SENTENCE: Record<ProposalStatus, string> = {
  draft: "This proposal has not been issued to you.",
  pending: "This proposal is still awaiting a decision.",
  approved: "This proposal has already been accepted.",
  rejected: "This proposal has already been declined.",
  sent: "This proposal has already been issued and filed.",
};

interface ShareLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface ShareView {
  title: string;
  clientName: string;
  clientCompany: string;
  /** The issuing firm's display name (server: resolveIssuerDisplayName). */
  issuerName: string;
  status: ProposalStatus;
  /** The server's own answer to "can this be signed right now". */
  signable: boolean;
  expired: boolean;
  currency: string;
  lineItems: ShareLineItem[];
  total: string;
  terms: string;
  issuedAt: string;
  issuedAtSource: "opened" | "created";
  expiresAt: string | null;
}

type Phase = "loading" | "ready" | "not-available" | "error";

type Decision = "approve" | "reject";

/**
 * The panel's six states. `applied` / `queued` / `refused` are outcomes of THIS
 * client's POST; the other three come from the record the server served.
 */
type DecisionState = "pending" | "expired" | "applied" | "queued" | "already-decided" | "refused";

/** The decision's own word — never the machine verb ("Your approve…"). */
const DECISION_WORD: Record<Decision, { noun: string; done: string }> = {
  approve: { noun: "acceptance", done: "accepted" },
  reject: { noun: "decline", done: "declined" },
};

interface Recorded {
  state: "applied" | "queued" | "refused";
  decision: Decision;
  message: string;
}

/** Is this a status this page knows how to label? (remote input — check it) */
function isProposalStatus(v: unknown): v is ProposalStatus {
  return typeof v === "string" && (KNOWN_STATUS as readonly string[]).includes(v);
}

/** A date the record supplied, formatted — or null when it holds no real date. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleDateString();
}

/** Money from the record's own currency; never invent a symbol. */
function amount(value: number, currency: string): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
    } catch {
      // An unknown currency code is not a reason to crash a customer's page.
    }
  }
  return value.toFixed(2);
}

/**
 * The server's public projection, validated. Anything that is not the shape
 * this page renders is `null` — which the caller turns into the error phase,
 * never into a half-drawn quote.
 */
function parseView(raw: unknown): ShareView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || !isProposalStatus(r.status)) return null;
  if (!Array.isArray(r.lineItems)) return null;
  const lineItems: ShareLineItem[] = [];
  for (const item of r.lineItems) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const qty = Number(o.qty);
    const unitPrice = Number(o.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return null;
    lineItems.push({ description: typeof o.description === "string" ? o.description : "", qty, unitPrice });
  }
  return {
    title: r.title,
    clientName: typeof r.clientName === "string" ? r.clientName : "",
    clientCompany: typeof r.clientCompany === "string" ? r.clientCompany : "",
    issuerName: typeof r.issuerName === "string" ? r.issuerName : "",
    status: r.status,
    signable: r.signable === true,
    expired: r.expired === true,
    currency: typeof r.currency === "string" ? r.currency : "",
    lineItems,
    total: typeof r.total === "string" ? r.total : "",
    terms: typeof r.terms === "string" ? r.terms : "",
    issuedAt: typeof r.issuedAt === "string" ? r.issuedAt : "",
    issuedAtSource: r.issuedAtSource === "opened" ? "opened" : "created",
    expiresAt: typeof r.expiresAt === "string" && r.expiresAt.length > 0 ? r.expiresAt : null,
  };
}

/** The state the panel is in. The server's `signable` decides the live form. */
function decisionState(view: ShareView, recorded: Recorded | null): DecisionState {
  if (recorded) return recorded.state;
  if (view.signable) return "pending";
  if (view.expired) return "expired";
  return "already-decided";
}

interface PanelCtx {
  view: ShareView;
  recorded: Recorded | null;
  /** The form to render inside the `pending` state — built by the page. */
  form: ReactNode;
  /** Re-read the proposal (the `refused` state's only action). */
  retry: () => void;
}

const DECISION_PANEL: Record<DecisionState, (ctx: PanelCtx) => ReactNode> = {
  // The only state that may render a form, and only because the server says so.
  pending: ({ form }) => (
    <Card className="mt-4">
      <div className="p-5">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Accept or decline</h3>
        <p className="mb-4 text-xs text-gray-500">
          Accepting records your name and signature against this proposal as it reads above.
        </p>
        {form}
      </div>
    </Card>
  ),
  expired: ({ view }) => (
    <Card className="mt-4">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-gray-700">This offer has expired</h3>
        <p className="mt-2 text-sm text-gray-600">
          {formatDate(view.expiresAt)
            ? `It lapsed on ${formatDate(view.expiresAt)}.`
            : "Its validity period has lapsed."}{" "}
          Nothing can be accepted from this page. Ask {view.issuerName || "the sender"} for a fresh proposal.
        </p>
      </div>
    </Card>
  ),
  applied: ({ view, recorded }) => (
    <Card className="mt-4 border-emerald-200 bg-emerald-50">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-emerald-900">
          Your {DECISION_WORD[recorded?.decision ?? "approve"].noun} was recorded.
        </h3>
        <p className="mt-2 text-sm text-emerald-800">
          The proposal now reads {STATUS_LABEL[recorded?.decision === "reject" ? "rejected" : "approved"].toLowerCase()} on{" "}
          {view.issuerName || "the sender"}&apos;s side. Nothing else is needed from you, and this page cannot change it
          again.
        </p>
      </div>
    </Card>
  ),
  queued: ({ view, recorded }) => (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-amber-900">
          Your {DECISION_WORD[recorded?.decision ?? "approve"].noun} was received.
        </h3>
        <p className="mt-2 text-sm text-amber-800">
          It is waiting for {view.issuerName || "the sender"} to approve it, so the proposal has not changed yet. Nothing
          else is needed from you, and this page cannot change it again.
        </p>
      </div>
    </Card>
  ),
  "already-decided": ({ view }) => (
    <Card className="mt-4">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-gray-700">{DECIDED_SENTENCE[view.status]}</h3>
        <p className="mt-2 text-sm text-gray-600">
          {view.issuerName || "The sender"} holds the decision, so there is nothing to do on this page.
        </p>
      </div>
    </Card>
  ),
  // The server refused the write. Its words are printed verbatim, and there is
  // no form: a second attempt from a page that does not know why it was
  // refused would just queue another card.
  refused: ({ recorded, retry }) => (
    <Card className="mt-4 border-rose-200 bg-rose-50">
      <div className="p-5">
        <h3 className="text-sm font-semibold text-rose-900">Your decision was not recorded</h3>
        <p className="mt-2 text-sm text-rose-800">{recorded?.message || "The server refused the decision."}</p>
        <div className="mt-4">
          <Button variant="outline" onClick={retry}>
            Check this proposal again
          </Button>
        </div>
      </div>
    </Card>
  ),
};

/** Height of the drawing pad in CSS pixels (the backing store scales by dpr). */
const CANVAS_H = 90;
const CANVAS_FALLBACK_W = 280;

export default function ProposalSharePage() {
  const { slug } = useParams({ from: "/proposals/share/$slug" });

  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<ShareView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [signerName, setSignerName] = useState("");
  const [initials, setInitials] = useState("");
  const [sigType, setSigType] = useState<"typed" | "drawn">("typed");
  const [drawn, setDrawn] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setLoadError("");
    setRecorded(null);
    setFormError("");
    fetch(proposalPublicApiPath(slug), { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        // 404 is "no such link"; 410 is the server's "this was never published".
        // Both are a plain "not available" — and neither is a retryable failure.
        if (res.status === 404 || res.status === 410) {
          setPhase("not-available");
          return;
        }
        const body = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
        if (!res.ok) {
          setLoadError(body?.error || `The server answered with HTTP ${res.status}.`);
          setPhase("error");
          return;
        }
        const parsed = parseView(body?.data);
        if (!parsed) {
          setLoadError("The proposal arrived in a form this page cannot read.");
          setPhase("error");
          return;
        }
        setView(parsed);
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We could not reach the server. Check your connection and try again.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  /**
   * The drawing pad. The backing store is sized to the box the browser actually
   * lays out (× devicePixelRatio) and the context is scaled to match, so a
   * stroke lands under the finger instead of at a 280×90 offset. `drawn` is
   * cleared whenever the pad is (re)initialised — a signature captured from a
   * previous canvas must never be the one submitted.
   */
  useEffect(() => {
    if (sigType !== "drawn") {
      setDrawn(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas as HTMLCanvasElement; // narrowed once; the closures below lose it
    const rect = el.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || canvas.clientWidth || CANVAS_FALLBACK_W));
    const cssH = Math.max(1, Math.round(rect.height || CANVAS_H));
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    setDrawn(null);
    const paint: CanvasRenderingContext2D = ctx; // stable alias for closures
    function pos(e: MouseEvent | TouchEvent): [number, number] {
      const r = canvas.getBoundingClientRect();
      const point = e instanceof MouseEvent ? e : e.touches[0];
      // Draw in CSS pixels (the context is already scaled by dpr); if the box
      // changed size since init, map proportionally so the stroke still lands
      // under the pointer.
      const sx = r.width ? cssW / r.width : 1;
      const sy = r.height ? cssH / r.height : 1;
      return [((point?.clientX ?? 0) - r.left) * sx, ((point?.clientY ?? 0) - r.top) * sy];
    }
    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawing.current = true;
      const [x, y] = pos(e);
      paint.beginPath();
      paint.moveTo(x, y);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const [x, y] = pos(e);
      paint.lineTo(x, y);
      paint.stroke();
    }
    function stop() {
      if (!drawing.current) return;
      drawing.current = false;
      setDrawn(el.toDataURL("image/png"));
    }
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("mouseleave", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", stop);
    };
  }, [sigType]);

  function clearPad() {
    setDrawn(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async function decide(decision: Decision) {
    if (!view) return;
    setFormError("");
    const name = signerName.trim();
    const payload: Record<string, unknown> = { decision };
    if (name) payload.signerName = name;
    if (decision === "approve") {
      if (!name) {
        setFormError("Enter your full name — it is part of the signature.");
        return;
      }
      if (sigType === "typed") {
        if (!initials.trim()) {
          setFormError("Enter your typed initials to sign.");
          return;
        }
        payload.signature = { signerName: name, signatureType: "typed", initials: initials.trim() };
      } else {
        if (!drawn) {
          setFormError("Draw your signature in the box above (or switch to typed initials).");
          return;
        }
        payload.signature = { signerName: name, signatureType: "drawn", drawnDataUrl: drawn };
      }
    }
    setBusy(true);
    try {
      const res = await fetch(proposalPublicApiPath(slug), {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { status?: string }; error?: string }
        | null;
      const status = body?.data?.status;
      // 200 / applied — the decision is on the record.
      if (res.ok && status === "applied") {
        setRecorded({ state: "applied", decision, message: "" });
        return;
      }
      // 202 / pending — received, waiting for the owner. Nothing has changed.
      if (res.status === 202 || (res.ok && status === "pending")) {
        setRecorded({ state: "queued", decision, message: "" });
        return;
      }
      if (res.ok) {
        // Accepted with an answer this page does not understand — do not invent one.
        setRecorded({
          state: "refused",
          decision,
          message: `The server accepted the request but did not say what happened (HTTP ${res.status}).`,
        });
        return;
      }
      // The server is the authority on why it refused (400, 409 expired/decided,
      // 429): print its own words.
      setRecorded({
        state: "refused",
        decision,
        message: body?.error || `The server refused the decision (HTTP ${res.status}).`,
      });
    } catch {
      setRecorded({
        state: "refused",
        decision,
        message: "We could not reach the server, so nothing was sent. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return <div className="p-8 text-gray-500">Loading proposal…</div>;
  }

  if (phase === "not-available") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">This proposal isn&apos;t available</h1>
          <p className="mt-2 text-sm text-gray-600">
            The link may be out of date, or the sender has withdrawn it. Ask them to send you a fresh link.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "error" || !view) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">We couldn&apos;t load this proposal</h1>
          <p className="mt-2 text-sm text-gray-600">{loadError || "The proposal could not be loaded."}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const state = decisionState(view, recorded);
  const issuedLabel = formatDate(view.issuedAt);
  const expiresLabel = formatDate(view.expiresAt);
  const panelCtx: PanelCtx = {
    view,
    recorded,
    retry: () => setAttempt((n) => n + 1),
    form: (
      <div className="space-y-3">
        <div>
          <label htmlFor="proposal-signer" className="mb-1 block text-sm font-medium text-gray-700">
            Your full name
          </label>
          <input
            id="proposal-signer"
            className="w-full rounded border border-gray-300 p-2 text-sm"
            placeholder="Your full name"
            autoComplete="name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
          />
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="sig-type"
              checked={sigType === "typed"}
              onChange={() => setSigType("typed")}
            />{" "}
            Typed initials
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="sig-type"
              checked={sigType === "drawn"}
              onChange={() => setSigType("drawn")}
            />{" "}
            Draw signature
          </label>
        </div>
        {sigType === "typed" ? (
          <div>
            <label htmlFor="proposal-initials" className="mb-1 block text-sm font-medium text-gray-700">
              Your initials
            </label>
            <input
              id="proposal-initials"
              className="w-full rounded border border-gray-300 p-2 text-sm"
              placeholder="Initials (e.g. JD)"
              maxLength={16}
              value={initials}
              onChange={(e) => setInitials(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <canvas
              ref={canvasRef}
              className="w-full rounded border border-gray-300"
              style={{ height: CANVAS_H }}
              aria-label="Signature pad"
            />
            <button type="button" className="mt-1 text-xs text-sky-600 underline" onClick={clearPad}>
              Clear and redraw
            </button>
          </div>
        )}
        {formError ? (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button onClick={() => void decide("approve")} disabled={busy} loading={busy}>
            Accept and sign
          </Button>
          <Button variant="outline" onClick={() => void decide("reject")} disabled={busy}>
            Decline
          </Button>
        </div>
      </div>
    ),
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{view.title}</h1>
          <p className="text-sm text-gray-500">
            Prepared for {view.clientName}
            {view.clientCompany ? ` — ${view.clientCompany}` : ""}
          </p>
          {view.issuerName ? <p className="text-sm text-gray-500">Prepared by {view.issuerName}</p> : null}
        </div>
        <Badge variant={STATUS_BADGE[view.status]}>{STATUS_LABEL[view.status]}</Badge>
      </div>

      <Card>
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {view.lineItems.map((li, idx) => (
                // Keyed by position: two identical descriptions are legitimate
                // lines, and `key={li.description}` collapsed them into one row.
                <tr key={`${li.description}-${idx}`} className="border-b">
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{li.qty}</td>
                  <td className="py-2 text-right">{amount(li.unitPrice, view.currency)}</td>
                  <td className="py-2 text-right">{amount(li.qty * li.unitPrice, view.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-right text-lg font-semibold">{view.total ? `Total: ${view.total}` : ""}</p>
          <p className="mt-2 text-xs text-gray-500">
            {issuedLabel ? `${view.issuedAtSource === "opened" ? "Issued" : "Created"} ${issuedLabel}` : ""}
            {issuedLabel && expiresLabel ? " · " : ""}
            {expiresLabel ? `Expires ${expiresLabel}` : ""}
          </p>
        </div>
      </Card>

      {view.terms ? (
        <Card className="mt-4">
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-600">Terms</h3>
            <p className="whitespace-pre-wrap text-sm">{view.terms}</p>
          </div>
        </Card>
      ) : null}

      {DECISION_PANEL[state](panelCtx)}
    </div>
  );
}
