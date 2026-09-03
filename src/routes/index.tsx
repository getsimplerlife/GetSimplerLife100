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

/* ── Animated quote-to-cash flow — the hero workflow ── */
const QUOTE_FLOW = [
  { icon: "📝", t: "Deal gets signed", d: "The proposal is signed — the AI employee is notified the moment it lands." },
  { icon: "🤝", t: "Updates the CRM", d: "Deal + contact are created in HubSpot automatically." },
  { icon: "🧾", t: "Drafts the invoice", d: "An invoice is drafted in Xero from the signed deal." },
  { icon: "💬", t: "Notifies your team", d: "The revenue team is pinged in Slack — nothing siloed." },
  { icon: "📁", t: "Files the documents", d: "The signed proposal is filed where it belongs (Google / Microsoft)." },
  { icon: "✅", t: "Human approves", d: "Every write pauses for your team's approval — nothing runs on its own.", highlight: true },
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
            <li
              key={s.t}
              className={`reveal in rounded-3xl border p-6 ${
                s.highlight
                  ? "border-emerald-500/60 bg-emerald-950/40 ring-1 ring-emerald-500/40"
                  : "border-stone-800 bg-stone-900/60"
              } ${cls}`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl leading-none">{s.icon}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-400">{String(i + 1).padStart(2, "0")}</span>
                    <h4 className="font-black text-white text-lg">{s.t}</h4>
                    {s.highlight && (
                      <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                        Human approves
                      </span>
                    )}
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

/* ── Outcomes grid ("What your AI team does" — sell outcomes, not agent counts) ── */
const OUTCOMES = [
  { icon: "🧾", t: "Invoice processing", d: "Drafts invoices from signed deals and PO-matched intake.", systems: "Xero · HubSpot" },
  { icon: "🤝", t: "CRM updates", d: "Creates deals + contacts the moment a proposal is signed.", systems: "HubSpot" },
  { icon: "📋", t: "Client intake", d: "Captures and classifies incoming client info, then routes it.", systems: "Forms · Google · Microsoft" },
  { icon: "🗓️", t: "Scheduling", d: "Books time and sends reminders from approved requests.", systems: "Google Calendar · Microsoft" },
  { icon: "🔄", t: "Reconciliation", d: "Matches invoices to payments and flags variances for review.", systems: "Xero" },
  { icon: "📄", t: "Document processing", d: "Files, classifies, and extracts from signed agreements.", systems: "DocuSign · Google Drive · Microsoft" },
];

/* ── How it works — 5 steps (done-for-you) ── */
const STEPS = [
  { n: "01", t: "Discovery", d: "We map the process your team does by hand and the systems it touches." },
  { n: "02", t: "Design", d: "We design the workflow and show you exactly what the AI employee will do — and where your team still approves." },
  { n: "03", t: "Build", d: "We build and integrate the workflow across your stack. You don't touch a builder." },
  { n: "04", t: "Test", d: "Every connection is live-verified and every write is tested against your real systems." },
  { n: "05", t: "Deploy + monitor", d: "We deploy it, watch the connections 24/7, and escalate loudly if anything needs you." },
];

function Home() {
  const businessName = "Simpler Life 100";

  // Notify-me (QuickBooks) capture — reuses the SendGrid capture-lead endpoint.
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notified, setNotified] = useState(false);

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
        {/* ── 1 · HERO (problem → solution → CTA) ── */}
        <section className="hero-glow relative overflow-hidden border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="space-y-8">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300">
                    We eliminate repetitive operational work — with AI coworkers we build, integrate, and monitor for you
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <h1 className="max-w-2xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    Your team is entering the same information into{" "}
                    <span className="text-emerald-400">three different systems.</span>
                  </h1>
                </Reveal>
                <Reveal delay={140}>
                  <p className="max-w-xl text-lg leading-relaxed text-stone-400">
                    We eliminate that repetitive operational work — with AI coworkers we build, integrate, and monitor
                    for you. No workflows to learn. No tools to manage.
                  </p>
                </Reveal>
                <Reveal delay={200} className="flex flex-wrap items-center gap-4">
                  <Link
                    to="/assessment"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500"
                  >
                    Find My First Automation ➜
                  </Link>
                  <Link
                    to="/demo"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl border border-stone-700 px-8 py-4 text-lg font-bold text-stone-200 transition-all hover:border-emerald-500/50 hover:text-white"
                  >
                    See it working — live demo
                  </Link>
                </Reveal>
                <Reveal delay={240}>
                  <p className="max-w-xl text-sm leading-relaxed text-stone-500">
                    Tell us what your team does manually. We'll show you the workflow worth automating first and how
                    we'd build it. You don't need to learn automation — we build, integrate, deploy, monitor, and
                    support it for you.
                  </p>
                </Reveal>
              </div>

              {/* Hero visual: the quote-to-cash promise, condensed */}
              <Reveal delay={160}>
                <div className="rounded-[2rem] border border-stone-800 bg-stone-900/70 p-6 shadow-2xl shadow-black/40">
                  <div className="mb-4 text-xs font-black uppercase tracking-widest text-emerald-400">
                    A signed proposal moves itself
                  </div>
                  <ol className="space-y-2.5">
                    {["Signed → DocuSign", "Deal + contact → HubSpot", "Invoice draft → Xero", "Notify team → Slack", "File docs → Drive", "✓ Human approves each write"].map((step, i) => (
                      <li
                        key={step}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold ${
                          step.startsWith("✓")
                            ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-200"
                            : "border-stone-800 bg-stone-950 text-stone-200"
                        }`}
                      >
                        <span className="text-[10px] font-mono text-emerald-400">{String(i + 1).padStart(2, "0")}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-xs leading-relaxed text-stone-500">
                    Every step is a real, verified connection. Your team does zero keystrokes — and approves every write.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 2 · THAT'S MY DAY — the quote-to-cash hero workflow (visually dominant) ── */}
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
                  Today a human spends hours copy-pasting and re-keying. With Simpler Life 100, one signed proposal
                  moves itself through each step below — every one a real, verified connection. And the last step is
                  always a human: nothing runs on its own.
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

        {/* ── 3 · REAL EXAMPLE (before / after) ── */}
        <section className="border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Real example</div>
                <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
                  Before, a signed proposal meant an hour of re-keying. After, your team does zero keystrokes.
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-stone-400">
                  A signed proposal moves itself through DocuSign → HubSpot → Xero → Slack → Drive. Every step is a
                  verified connection, and every write pauses for a human to approve before it runs.
                </p>
              </Reveal>
              <Reveal delay={80}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-6">
                    <div className="text-xs font-black uppercase tracking-widest text-stone-500">Before</div>
                    <ul className="mt-4 space-y-2 text-sm text-stone-400">
                      <li>✋ Proposal lands in the inbox</li>
                      <li>⌨️ Someone re-keys client + deal into the CRM</li>
                      <li>⌨️ Someone re-keys the invoice</li>
                      <li>💬 Someone emails the team to tell them</li>
                      <li>📁 Someone saves the file — maybe</li>
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-emerald-500/40 bg-emerald-950/30 p-6">
                    <div className="text-xs font-black uppercase tracking-widest text-emerald-400">After</div>
                    <ul className="mt-4 space-y-2 text-sm text-stone-300">
                      <li>📝 Proposal signed — AI employee notified</li>
                      <li>🤝 Deal + contact created in HubSpot</li>
                      <li>🧾 Invoice drafted in Xero</li>
                      <li>💬 Team notified in Slack</li>
                      <li>📁 Docs filed where they belong</li>
                      <li className="font-bold text-emerald-300">✅ A human approves every write</li>
                    </ul>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 4 · WHAT YOUR AI TEAM DOES (outcomes, not agent counts) ── */}
        <section className="border-b border-stone-800 bg-stone-900 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl space-y-4">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Outcomes</div>
              </Reveal>
              <Reveal delay={60}>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                  What your AI team does
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-lg leading-relaxed text-stone-400">
                  Not "agents" to manage — work that stops needing your people. Each outcome touches the systems you
                  already use.
                </p>
              </Reveal>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {OUTCOMES.map((o, i) => (
                <Reveal key={o.t} delay={i * 60}>
                  <div className="h-full rounded-3xl border border-stone-800 bg-stone-950/60 p-6">
                    <div className="text-3xl">{o.icon}</div>
                    <h3 className="mt-3 text-lg font-black text-white">{o.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-400">{o.d}</p>
                    <div className="mt-3 text-[11px] font-mono text-emerald-400/70">{o.systems}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5 · RESULTS / ROI (illustrative) ── */}
        <section className="border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 max-w-2xl space-y-4">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Results / ROI</div>
              </Reveal>
              <Reveal delay={60}>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                  How much is the manual work costing you?
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-lg leading-relaxed text-stone-400">
                  Estimate the current annual labor cost, the potential savings, the implementation cost, and the
                  payback. All figures are illustrative estimates — your real numbers depend on your process.
                </p>
              </Reveal>
            </div>
            <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                ["CURRENT ANNUAL LABOR COST", "The hours your team spends re-keying, × their loaded cost."],
                ["POTENTIAL ANNUAL SAVINGS", "The labor (and error) hours an AI employee can eliminate."],
                ["ESTIMATED IMPLEMENTATION", "One-time build package — you pay for working, deployed workflows."],
                ["ESTIMATED PAYBACK", "Implementation ÷ annual savings, in months — typically inside year one."],
              ].map(([t, d], i) => (
                <Reveal key={t} delay={i * 60}>
                  <div className="h-full rounded-3xl border border-stone-800 bg-stone-900/60 p-6">
                    <div className="text-[10px] font-mono text-stone-400">{t}</div>
                    <p className="mt-3 text-sm leading-relaxed text-stone-400">{d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <p className="mt-4 text-xs italic text-stone-500">
                Illustrative estimate — your real numbers depend on your process, systems, and team.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link
                  to="/roi-calculator"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500"
                >
                  Run the interactive ROI calculator ➜
                </Link>
                <p className="text-sm text-stone-500">Free · no credit card · returns a personalized estimate you can keep.</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 6 · HOW IT WORKS (5 steps, done-for-you) ── */}
        <section className="border-b border-stone-800 bg-stone-900 px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl space-y-4">
              <Reveal>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">How it works</div>
              </Reveal>
              <Reveal delay={60}>
                <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                  We do the building. You do the approving.
                </h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="text-lg leading-relaxed text-stone-400">
                  You don't need to learn automation. You don't need to build workflows. You don't need to manage AI
                  agents. We build, integrate, deploy, monitor, and support them for you.
                </p>
              </Reveal>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 60}>
                  <div className="h-full rounded-3xl border border-stone-800 bg-stone-950/60 p-6">
                    <div className="text-[10px] font-mono text-emerald-400">{s.n}</div>
                    <h3 className="mt-2 text-lg font-black text-white">{s.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-400">{s.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <p className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 text-sm text-stone-300">
                <span className="font-bold text-emerald-300">"✓ Human approves" is built in:</span> an AI employee
                never sends an invoice, moves a dollar, or posts to your channel on its own. Every write waits in a
                queue your team approves — fail-closed by default.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── 7 · TRUST (approval queue + verified integrations) ── */}
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
                  <Link to="/you-stay-in-control" className="mt-3 inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300">
                    How your team stays in control →
                  </Link>
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
                  <Link to="/security" className="mt-3 inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300">
                    How your data stays protected →
                  </Link>
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

        {/* ── 8 · PRICING (preserved exactly) ── */}
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
                to="/assessment"
                className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-12 py-5 text-2xl font-bold text-white shadow-lg transition-all hover:bg-emerald-700"
              >
                Find the first process worth automating ➜
              </Link>
              <p className="font-medium text-stone-400">30-second assessment · no credit card · personalized automation plan.</p>
            </div>
          </div>
        </section>

        {/* ── 9 · CLOSING CTA (outcome-oriented) ── */}
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
                    to="/assessment"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500"
                  >
                    Find the first process worth automating ➜
                  </Link>
                  <p className="text-sm text-stone-500">30-second assessment · no credit card · personalized plan.</p>
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

      <Footer />
    </div>
  );
}