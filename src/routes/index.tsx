import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/")({
  head: () => pageHead("/"),
  component: Home,
});

/* ── tiny scroll-reveal helper (IntersectionObserver, prefers-reduced-motion safe) ── */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Animated quote-to-cash flow ── */
const QUOTE_FLOW = [
  { icon: "📝", t: "Proposal", d: "Prepared and sent for e-signature." },
  { icon: "✍️", t: "DocuSign", d: "Signed — we're notified the moment it lands." },
  { icon: "🤝", t: "HubSpot", d: "Deal + contact created automatically." },
  { icon: "🧾", t: "Xero", d: "Invoice drafted, ready for your review." },
  { icon: "💬", t: "Slack", d: "Team notified — nothing siloed." },
  { icon: "📁", t: "Google / Microsoft", d: "Docs filed where they belong." },
];

function QuoteToCashFlow() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);

  // Sequentially light up steps while the flow is in view.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setActive(0);
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            setActive((a) => (a >= QUOTE_FLOW.length - 1 ? 0 : a + 1));
          }, 1100);
        } else if (timer) {
          clearInterval(timer);
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="hero-glowline h-px w-full mb-8" aria-hidden="true" />
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUOTE_FLOW.map((s, i) => {
          const cls =
            active === i ? "flow-node active border-emerald-500/80" : active > i ? "flow-node done" : "flow-node";
          return (
            <li key={s.t} className={`reveal in rounded-3xl border border-stone-800 bg-stone-900/60 p-6 ${cls}`} style={{ transitionDelay: `${i * 60}ms` }}>
              <div className="flex items-start gap-4">
                <div className="text-3xl leading-none">{s.icon}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-400">{String(i + 1).padStart(2, "0")}</span>
                    <h4 className="font-black text-white text-lg">{s.t}</h4>
                  </div>
                  <p className="text-sm text-stone-400 mt-1.5 leading-relaxed">{s.d}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── Prompt compiler (hero micro-interaction) ── */
const EXAMPLES = [
  { label: "Signed deal → HubSpot", prompt: "Every signed proposal: create the HubSpot deal and contact and notify Slack" },
  { label: "Invoice draft → Xero", prompt: "When a proposal is signed, draft the Xero invoice and post to Slack" },
  { label: "Monitor Xero → Slack", prompt: "Watch Xero for new invoices and overdue balances and alert the team in Slack" },
  { label: "Docs → Drive", prompt: "File each signed proposal's docs into the right Google Drive folder" },
];

function Home() {
  const businessName = "Simpler Life 100";
  const [promptText, setPromptText] = useState(EXAMPLES[1].prompt);
  const [compiling, setCompiling] = useState("done");

  // Notify-me (QuickBooks) capture — reuses the SendGrid capture-lead endpoint.
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notified, setNotified] = useState(false);

  const handleCompile = () => {
    if (compiling !== "done") return;
    setCompiling("analyzing");
    setTimeout(() => setCompiling("mapping"), 900);
    setTimeout(() => setCompiling("done"), 1800);
  };

  const submitNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.includes("@") || notifyBusy) return;
    setNotifyBusy(true);
    try {
      await fetch("/api/tools/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: notifyEmail,
          email: notifyEmail,
          toolName: "integration-notify-quickbooks",
          action: "notify-when-live",
          tier: "roadmap",
        }),
      });
      setNotified(true);
    } catch {
      setNotified(false);
    } finally {
      setNotifyBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1">
        {/* ── 1 · HERO ── */}
        <section className="hero-glow relative overflow-hidden border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="space-y-8">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300">
                    Automate + monitor your operations — across your stack and industry
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <h1 className="max-w-2xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    Your operations shouldn't run on manual work.
                    <span className="text-emerald-400"> We automate and monitor them — end to end.</span>
                  </h1>
                </Reveal>
                <Reveal delay={140}>
                  <p className="max-w-xl text-lg leading-relaxed text-stone-400">
                    Simpler Life 100 is an AI operations team that automates the repetitive work and keeps watch over
                    your authorized systems — for your firm and for your customers, across your stack and industry.
                    For professional-services firms, quote-to-cash is the natural first anchor: a signed proposal moves
                    itself through HubSpot, Xero (or QuickBooks), Slack, and your document filing.
                  </p>
                </Reveal>
                <Reveal delay={200} className="flex flex-wrap items-center gap-4">
                  <Link
                    to="/contact"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500"
                  >
                    Start the 30-Second Assessment ➜
                  </Link>
                  <Link
                    to="/build"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl border border-stone-700 px-8 py-4 text-lg font-bold text-stone-200 transition-all hover:border-emerald-500/50 hover:text-white"
                  >
                    Explore the Builder
                  </Link>
                </Reveal>
              </div>

              {/* Hero micro-interaction: describe a step, watch it map */}
              <Reveal delay={160}>
                <div className="rounded-[2rem] border border-stone-800 bg-stone-900/70 p-6 shadow-2xl shadow-black/40">
                  <div className="mb-4 text-xs font-black uppercase tracking-widest text-emerald-400">
                    See a workflow map in seconds
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => setPromptText(ex.prompt)}
                        className="rounded-full border border-stone-700 bg-stone-950 px-3 py-1.5 text-xs font-bold text-stone-300 transition-colors hover:border-emerald-500/60 hover:text-white"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={3}
                    aria-label="Describe the workflow you want to automate"
                    className="w-full resize-none rounded-2xl border border-stone-800 bg-stone-950 p-4 text-sm text-stone-200 outline-none focus:border-emerald-500/60"
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={handleCompile}
                      disabled={compiling !== "done"}
                      className="min-h-[48px] flex-1 rounded-2xl bg-emerald-600 px-5 py-3 font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {compiling === "analyzing"
                        ? "Analyzing step…"
                        : compiling === "mapping"
                          ? "Mapping to your tools…"
                          : "Map my workflow ➜"}
                    </button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950 p-4 text-xs text-stone-400">
                    {compiling === "done" ? (
                      <span className="font-semibold text-emerald-400">✓ Ready</span>
                    ) : (
                      <span className="font-semibold">Mapping it to your tools…</span>
                    )}{" "}
                    — automate and monitor, end to end.
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 2 · THAT'S MY DAY (quote-to-cash flow) ── */}
        <section className="border-b border-stone-800 bg-stone-900 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl space-y-4">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">A concrete example</div>
              </Reveal>
              <Reveal delay={60}>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                  A proposal gets signed. Here's what happens next.
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-lg leading-relaxed text-stone-400">
                  Quote-to-cash is one example of what an AI operations team does. Today a human spends hours
                  copy-pasting and re-keying; with Simpler Life 100, one signed proposal moves itself through each step
                  below — every one a real, verified connection. The same pattern automates and monitors the rest of
                  your operations.
                </p>
              </Reveal>
            </div>
            <QuoteToCashFlow />
            <Reveal delay={80}>
              <p className="mt-8 text-sm text-stone-500">
                QuickBooks is in development and will slot in the same way for firms that run on it.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── 3 · TRUST + PRODUCT STRIP ── */}
        <section className="border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-start gap-10 lg:grid-cols-3">
              <Reveal className="lg:col-span-1">
                <h2 className="text-2xl font-black text-white sm:text-3xl">
                  Real integrations. Verified, not promised.
                </h2>
                <p className="mt-3 text-base leading-relaxed text-stone-400">
                  Nothing on this page is claimed working until it's live-tested. Every action an AI employee takes
                  passes a human approval queue before it runs. No silent failures — if something disconnects, you're
                  told immediately and reconnected in one click.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Xero", "HubSpot", "DocuSign", "Slack", "Google", "Microsoft 365"].map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-sm font-bold text-emerald-300"
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                      {p}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-sm font-bold text-amber-300">
                    QuickBooks · in development
                  </span>
                </div>
              </Reveal>

              <Reveal delay={80} className="lg:col-span-1">
                <div className="flex h-full flex-col rounded-[2rem] border border-stone-800 bg-stone-900/60 p-8">
                  <div className="mb-4 text-xs font-black uppercase tracking-widest text-emerald-400">Human approval queue</div>
                  <p className="text-base leading-relaxed text-stone-400">
                    An AI employee won't send an invoice, move a dollar, or post to your channel on its own. Every
                    write waits in a queue your team approves — fail-closed by default.
                  </p>
                  <div className="mt-6 space-y-3 text-sm text-stone-300">
                    <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-4 py-3">
                      <span>Draft Xero invoice — $4,800</span>
                      <span className="font-bold text-amber-400">Awaiting review</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950 px-4 py-3">
                      <span>Create HubSpot deal — Acme Co.</span>
                      <span className="font-bold text-emerald-400">Approved</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={160} className="lg:col-span-1">
                <div className="flex h-full flex-col rounded-[2rem] border border-stone-800 bg-stone-900/60 p-8">
                  <div className="mb-4 text-xs font-black uppercase tracking-widest text-emerald-400">Your portal</div>
                  <p className="text-base leading-relaxed text-stone-400">
                    One place to see every AI employee, every workflow, and every integration's live health — plus the
                    approval queue and an audit trail of every action taken.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-2 text-center">
                    {[
                      ["🧑‍💼", "AI employees"],
                      ["⚙️", "Workflows"],
                      ["🔌", "Connections"],
                      ["📜", "Audit log"],
                    ].map(([i, l]) => (
                      <div key={l} className="rounded-xl border border-stone-800 bg-stone-950 px-3 py-4 text-sm font-bold text-stone-200">
                        <div className="mb-1 text-2xl">{i}</div>
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 4 · PRICING (preserved exactly) ── */}
        <section id="pricing" className="border-t border-stone-900 bg-stone-950 px-6 py-16 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mb-20 space-y-6 text-center">
              <Reveal>
                <h2 className="text-4xl font-black tracking-tight text-white lg:text-6xl">Simple, Transparent Pricing.</h2>
              </Reveal>
              <Reveal delay={60}>
                <p className="mx-auto max-w-2xl text-xl leading-relaxed text-stone-400">
                  No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.
                </p>
              </Reveal>
            </div>

            <div className="grid gap-12 lg:grid-cols-2">
              {/* Implementation Packages */}
              <div className="rounded-[3rem] border border-stone-900 bg-stone-900 p-12">
                <h3 className="mb-8 text-xl font-bold uppercase tracking-widest text-emerald-400">Implementation Packages</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-950 p-6">
                    <div>
                      <div className="text-xl font-black text-white">Small Team</div>
                      <div className="text-sm font-bold text-stone-400">2 AI Agents • 3 Workflows • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-400">$7,500</div>
                      <div className="text-[10px] font-bold uppercase tracking-tighter text-stone-400">One-Time</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-950 p-6">
                    <div>
                      <div className="text-xl font-black text-white">Growth</div>
                      <div className="text-sm font-bold text-stone-400">5 AI Agents • Cross-Department • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-400">$15,000</div>
                      <div className="text-[10px] font-bold uppercase tracking-tighter text-stone-400">One-Time</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-600 p-6 text-white shadow-xl shadow-emerald-900/30">
                    <div>
                      <div className="text-xl font-black">Scale</div>
                      <div className="text-sm font-bold text-emerald-100">Unlimited Agents • Custom Modeling • 1 CRM Connection</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black">$30,000</div>
                      <div className="text-[10px] font-bold uppercase tracking-tighter text-emerald-200">One-Time</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly per AI Employee */}
              <div className="rounded-[3rem] border border-stone-900 bg-stone-900 p-12">
                <h3 className="mb-8 text-xl font-bold uppercase tracking-widest text-emerald-400">Monthly per AI Employee</h3>
                <p className="mb-6 text-sm text-stone-400">
                  In addition to the one-time build package, you pay a monthly fee for each AI employee you deploy at that employee's listed price. Live integrations today: Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign (QuickBooks in development), with more added on request.
                </p>
                <p className="mb-6 text-sm text-stone-400">
                  No long-term contracts — monthly AI-employee fees you can adjust or cancel anytime.
                </p>
              </div>
            </div>

            <div className="mt-20 space-y-4 text-center">
              <Link
                to="/build"
                className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-12 py-5 text-2xl font-bold text-white shadow-lg transition-all hover:bg-emerald-700"
              >
                Stop Copy-Pasting. Start Your Build ➜
              </Link>
              <p className="font-medium text-stone-400">Choose your package and deploy AI coworkers in weeks, not months.</p>
            </div>
          </div>
        </section>

        {/* ── 5 · DESIGN-PARTNER + CLOSING CTA ── */}
        <section className="relative overflow-hidden bg-stone-900 px-4 py-16 lg:py-28">
          <div className="hero-glow absolute inset-0" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="space-y-8 rounded-[3rem] border border-stone-800 bg-stone-950 p-10 lg:p-16">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Design-Partner Program</div>
              </Reveal>
              <Reveal delay={60}>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                  We're onboarding a small number of professional-services firms for early access.
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-lg leading-relaxed text-stone-400">
                  In exchange for being a reference, early design partners get discounted onboarding and a direct say in
                  what we build next — a real, limited early-access arrangement. If that's your firm, the first step
                  takes 30 seconds and nets you a personalized quote-to-cash plan you can keep.
                </p>
              </Reveal>
              <Reveal delay={160}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    to="/contact"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500"
                  >
                    Start the 30-Second Assessment ➜
                  </Link>
                  <p className="text-sm text-stone-500">Returns a personalized plan you can keep. No credit card required.</p>
                </div>
              </Reveal>
              <Reveal delay={200}>
                <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-6">
                  <div className="mb-3 text-sm font-bold text-stone-300">
                    Run on QuickBooks? Get notified the moment it goes live.
                  </div>
                  {notified ? (
                    <div className="text-sm font-semibold text-emerald-400">✓ You're on the list. We'll email you when QuickBooks is live.</div>
                  ) : (
                    <form onSubmit={submitNotify} className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="email"
                        required
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="you@firm.com"
                        aria-label="Email for QuickBooks launch notification"
                        className="min-h-[48px] flex-1 rounded-xl border border-stone-800 bg-stone-950 px-4 text-sm text-stone-200 outline-none focus:border-emerald-500/60"
                      />
                      <button
                        type="submit"
                        disabled={notifyBusy}
                        className="min-h-[48px] rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        {notifyBusy ? "Sending…" : "Notify me when live"}
                      </button>
                    </form>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-800 bg-stone-950 px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-12 md:flex-row">
          <div>
            <div className="mb-4 text-2xl font-black text-emerald-400">{businessName}</div>
            <p className="max-w-sm text-stone-400">AI coworkers for operations teams. Work less, live more.</p>
          </div>
          <div className="flex flex-col items-center gap-6 md:items-end">
            <div className="flex flex-wrap justify-center gap-8 font-bold text-stone-600">
              <Link to="/build" className="hover:text-emerald-400">Builder</Link>
              <Link to="/support" className="hover:text-emerald-400">Support</Link>
              <Link to="/how-it-works" className="hover:text-emerald-400">How It Works</Link>
              <Link to="/faq" className="hover:text-emerald-400">FAQ</Link>
              <Link to="/about" className="hover:text-emerald-400">About</Link>
              <Link to="/demos/audit-portal" className="underline underline-offset-4 hover:text-emerald-400">Audit Workflow Demo</Link>
            </div>
            <div className="text-sm text-stone-400">
              &copy; {new Date().getFullYear()} {businessName}. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
      <Footer />
    </div>
  );
}
