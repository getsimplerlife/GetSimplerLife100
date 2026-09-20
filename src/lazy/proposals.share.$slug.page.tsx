import { useEffect, useRef, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface ShareLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}
interface ShareView {
  proposalId: string;
  title: string;
  clientName: string;
  clientCompany: string;
  status: string;
  signable: boolean;
  currency: string;
  lineItems: ShareLineItem[];
  total: string;
  terms: string;
  validityDays: number;
  issuedAt: string;
}

const CANVAS_W = 280;
const CANVAS_H = 90;

export default function ProposalSharePage() {
  const slug = (window.location.pathname.match(/\/proposals\/share\/([^/]+)/) || [])[1] || "";
  const [view, setView] = useState<ShareView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [signerName, setSignerName] = useState("");
  const [initials, setInitials] = useState("");
  const [sigType, setSigType] = useState<"typed" | "drawn">("typed");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    fetch(`/api/native/proposals/share/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Proposal not found"))))
      .then((j) => setView(j.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  // canvas draw pad (mouse + touch)
  useEffect(() => {
    if (sigType !== "drawn" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const paint: CanvasRenderingContext2D = ctx; // stable alias for closures
    function pos(e: MouseEvent | TouchEvent): [number, number] {
      const r = canvas.getBoundingClientRect();
      const c = e instanceof MouseEvent ? [e.clientX, e.clientY] : [e.touches[0].clientX, e.touches[0].clientY];
      return [c[0] - r.left, c[1] - r.top];
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
      drawing.current = false;
      if (canvas) setDrawn(canvas.toDataURL("image/png"));
    }
    void paint;
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

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setFeedback("");
    try {
      const payload: Record<string, unknown> = { decision, signerName: signerName.trim() || undefined };
      if (decision === "approve") {
        if (sigType === "typed") {
          if (!initials.trim()) {
            setError("Enter your typed initials to sign.");
            setBusy(false);
            return;
          }
          payload.signature = { signerName: signerName.trim(), signatureType: "typed", initials: initials.trim() };
        } else {
          if (!drawn) {
            setError("Draw your signature in the box above (or switch to typed initials).");
            setBusy(false);
            return;
          }
          payload.signature = { signerName: signerName.trim(), signatureType: "drawn", drawnDataUrl: drawn };
        }
      }
      const res = await fetch(`/api/native/proposals/share/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 202 || res.status === 200) {
        setFeedback(`Your ${decision}${decision === "approve" ? " and signature" : ""} have been recorded — the proposal owner will confirm them.`);
      } else {
        setError(j.error || "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading proposal…</div>;
  if (error && !view) return <div className="p-8 text-red-600">{error || "Proposal not found"}</div>;
  if (!view) return <div className="p-8 text-red-600">Proposal not found</div>;

  const decided = view.status !== "pending";
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{view.title}</h1>
          <p className="text-sm text-gray-500">Prepared for {view.clientName}{view.clientCompany ? ` — ${view.clientCompany}` : ""}</p>
        </div>
        <Badge>{view.status}</Badge>
      </div>
      {feedback && <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm">{feedback}</div>}
      {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</div>}

      <Card>
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
            {view.lineItems.map((li) => (
              <tr key={li.description} className="border-b">
                <td className="py-2">{li.description}</td>
                <td className="py-2 text-right">{li.qty}</td>
                <td className="py-2 text-right">{li.unitPrice.toFixed(2)}</td>
                <td className="py-2 text-right">{(li.qty * li.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-lg font-semibold">Total: {view.total}</p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-gray-600">Terms</h3>
        <p className="text-sm">{view.terms || "Standard terms apply."}</p>
        <p className="mt-2 text-xs text-gray-500">Valid for {view.validityDays} days · Issued {new Date(view.issuedAt).toLocaleDateString()}</p>
      </Card>

      {decided ? (
        <p className="mt-4 text-sm text-gray-600">This proposal has been {view.status}. The owner will follow up with next steps.</p>
      ) : (
        <Card className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-600">Accept or decline</h3>
          <input className="mb-3 w-full rounded border p-2" placeholder="Your full name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={sigType === "typed"} onChange={() => setSigType("typed")} /> Typed initials
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={sigType === "drawn"} onChange={() => setSigType("drawn")} /> Draw signature
            </label>
          </div>
          {sigType === "typed" ? (
            <input className="mb-3 w-full rounded border p-2" placeholder="Initials (e.g. JD)" maxLength={16} value={initials} onChange={(e) => setInitials(e.target.value)} />
          ) : (
            <div className="mb-2">
              <canvas ref={canvasRef} className="w-full rounded border border-gray-300" style={{ height: 90 }} />
              <button type="button" className="mt-1 text-xs text-sky-600 underline" onClick={() => { setDrawn(null); const c = canvasRef.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); }}>
                Clear and redraw
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={() => decide("approve")} disabled={busy}>
              Accept and sign
            </Button>
            <Button onClick={() => decide("reject")} disabled={busy}>
              Decline
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}