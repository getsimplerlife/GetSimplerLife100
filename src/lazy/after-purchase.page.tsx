import { useEffect, useState } from "react";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import {
  afterPurchaseView,
  type AfterPurchaseStatus,
  type AfterPurchaseViewModel,
} from "~/lib/after-purchase";

const businessName = "Simpler Life 100";

/**
 * The presentational doorway. Kept as a plain component (and exported) so the
 * page test can render BOTH the purchased and not-purchased states without
 * standing up a router.
 *
 * Actions are real anchors on purpose: a buyer's landing page after checkout
 * must work even if client hydration is slow or fails, and a hard navigation to
 * /login or /set-password is exactly what we want here anyway.
 */
export function AfterPurchaseView({ view }: { view: AfterPurchaseViewModel }) {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <div className="text-center space-y-5">
        <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
          {view.badge}
        </span>
        <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">{view.heading}</h1>
        <p className="text-lg text-stone-400 max-w-2xl mx-auto leading-relaxed">{view.lead}</p>
      </div>

      {view.receipt.length > 0 && (
        <section
          aria-label="Your purchase"
          className="rounded-3xl border border-stone-800 bg-stone-900/40 divide-y divide-stone-800"
        >
          {view.receipt.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 px-6 py-4">
              <span className="text-xs font-mono uppercase tracking-widest text-stone-500">{row.label}</span>
              <span className="text-base font-bold text-white">{row.value}</span>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-900/25 to-stone-900 p-8 space-y-5 text-center">
        <h2 className="text-xl font-black text-white">{view.actionTitle}</h2>
        <p className="text-sm text-stone-400 leading-relaxed max-w-xl mx-auto">
          We send it to the address you used at checkout. The link opens our set-password page, which emails a
          one-time code so you can choose your password — then you sign in here.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {view.actions.map((action) => (
            <a
              key={action.href + action.label}
              href={action.href}
              className={
                action.primary
                  ? "inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition-all"
                  : "inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-stone-700 px-6 py-3 text-sm font-bold text-stone-200 hover:border-emerald-500/40 transition-colors"
              }
            >
              {action.label}
            </a>
          ))}
        </div>
      </section>

      {view.notes.length > 0 && (
        <ul className="space-y-2 text-sm text-stone-500 leading-relaxed">
          {view.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span className="text-emerald-500/70">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * /after-purchase — where Stripe sends a buyer the moment checkout completes
 * (all three live payment links carry this return URL), and the footer's
 * "After You Buy" link. Slice 138 turned it from a static timeline into the
 * doorway: read the session id, ask the server whether we really have that
 * purchase, and render the honest state. No session id → no payment claim.
 */
export default function AfterPurchasePage() {
  const [probe, setProbe] = useState<{ ready: boolean; sessionId: string }>({ ready: false, sessionId: "" });
  const [status, setStatus] = useState<AfterPurchaseStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get("session_id") || "").trim();
    if (!id) {
      setProbe({ ready: true, sessionId: "" });
      return;
    }
    setProbe({ ready: true, sessionId: id });
    setChecking(true);
    let cancelled = false;
    fetch(`/api/purchase/status?session_id=${encodeURIComponent(id)}`)
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        setStatus(data && typeof data === "object" ? (data as AfterPurchaseStatus) : { found: false });
      })
      .catch(() => {
        if (!cancelled) setStatus({ found: false });
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const view = afterPurchaseView({
    // Before the effect runs we are genuinely still checking — never render the
    // "you bought nothing" state for one frame on a real buyer's page.
    sessionId: probe.ready ? probe.sessionId : "pending",
    status,
    checking: !probe.ready || checking,
  });

  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1 px-6 py-16 lg:py-24">
        <AfterPurchaseView view={view} />
      </main>
      <Footer />
    </div>
  );
}
