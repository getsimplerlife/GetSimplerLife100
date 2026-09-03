import { Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { Route } from "~/routes/security";

const businessName = "Simpler Life 100";

/** Truthful security page — only claims what the product actually does. */
export default function SecurityPage() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1 px-6 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-6">
            <span className="inline-block px-3 py-1 text-xs font-mono font-bold tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              Security
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Your data stays under your control.
            </h1>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto leading-relaxed">
              Simpler Life 100 connects to the systems you already use — with your permissions, your approval, and an
              audit trail of everything an AI employee does. This page states plainly what the product does and does
              not do.
            </p>
          </div>

          {/* Permissions / data access */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Permissions &amp; data access</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: "🔑",
                  title: "Scoped permissions",
                  d: "AI employees operate only in the systems and scopes you authorize during connection. They do not get blanket access to everything in your stack.",
                },
                {
                  icon: "🧠",
                  title: "What AI can and cannot do",
                  d: "An AI employee can read what you authorize, draft what the workflow requires, and propose actions. It cannot execute a write on its own — every write waits in the human approval queue.",
                },
                {
                  icon: "🛡️",
                  title: "Authentication",
                  d: "Connections use your authorized OAuth credentials per provider. Admin accounts are owner-only; password resets require a proof-of-ownership email code before any change.",
                },
                {
                  icon: "📊",
                  title: "Data at rest",
                  d: "Each client (tenant) keeps its own isolated data store. There are no cross-tenant data paths — your data is never mixed with another customer's.",
                },
              ].map((c) => (
                <div key={c.title} className="p-6 bg-stone-900/40 border border-stone-800 rounded-2xl space-y-2">
                  <div className="text-3xl">{c.icon}</div>
                  <h3 className="text-lg font-black text-white">{c.title}</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Human approval */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Human approval — a hard rule, not a toggle</h2>
            <div className="p-8 bg-stone-900/40 border border-emerald-500/30 rounded-3xl space-y-4">
              <p className="text-lg text-stone-200 leading-relaxed">
                AI doesn't get to make the final decision. Your team does.
              </p>
              <p className="text-stone-400 leading-relaxed">
                Every write — sending an invoice, moving a dollar, updating a deal, posting to a channel — pauses in a
                queue your team approves before it runs. This is fail-closed by default: if the approval isn't given,
                the action does not happen. Read actions are logged and monitored, but writes always require a human.
              </p>
              <Link
                to="/you-stay-in-control"
                className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400 hover:text-emerald-300"
              >
                See how approval works in practice →
              </Link>
            </div>
          </section>

          {/* Audit log */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Audit trail</h2>
            <p className="text-stone-400 max-w-3xl leading-relaxed">
              Every action an AI employee takes is logged: what it did, which system it touched, when it happened, and
              whether a human approved it. Your portal shows this audit trail for every employee and workflow.
            </p>
          </section>

          {/* Failure behavior */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">When something fails</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: "🔔",
                  title: "Never silently lost",
                  d: "Connections are monitored. If an integration disconnects or an API fails, you're told immediately — WARN state, clear message, and a reconnect path.",
                },
                {
                  icon: "♻️",
                  title: "Self-healing where possible",
                  d: "Transient failures retry with backoff; tokens refresh before expiry. If a connection can't be restored automatically, it stays visible as reconnect-required — it is never silently dropped.",
                },
                {
                  icon: "🚫",
                  title: "Fail-closed writes",
                  d: "If an action can't be safely verified, it doesn't run. Unknown or unverifiable operations fail closed rather than guessing.",
                },
              ].map((c) => (
                <div key={c.title} className="p-6 bg-stone-900/40 border border-stone-800 rounded-2xl space-y-2">
                  <div className="text-3xl">{c.icon}</div>
                  <h3 className="text-lg font-black text-white">{c.title}</h3>
                  <p className="text-sm text-stone-400 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Retention + practices */}
          <section className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black text-white">Data retention &amp; practices</h2>
            <ul className="space-y-3 text-stone-400 leading-relaxed max-w-3xl">
              <li className="flex gap-3"><span className="text-emerald-400">•</span> We do not sell your data. We do not use your data to train models for other customers.</li>
              <li className="flex gap-3"><span className="text-emerald-400">•</span> Per-tenant isolation is a hard guarantee: no cross-tenant paths exist in the product.</li>
              <li className="flex gap-3"><span className="text-emerald-400">•</span> Credentials are stored per-tenant and used only for authorized provider connections.</li>
              <li className="flex gap-3"><span className="text-emerald-400">•</span> Audit logs and approval history are retained per your retention needs and are visible in your portal.</li>
              <li className="flex gap-3"><span className="text-emerald-400">•</span> Real provider contracts are verified before we claim a live integration on this site.</li>
            </ul>
          </section>

          {/* CTA */}
          <section className="p-8 bg-gradient-to-br from-emerald-900/30 to-stone-900 border border-emerald-500/20 rounded-3xl text-center space-y-4">
            <h2 className="text-2xl lg:text-3xl font-black text-white">See it yourself.</h2>
            <p className="text-stone-400 max-w-xl mx-auto">
              The approval queue, audit log, and live connection health are all visible in the portal — no black boxes.
            </p>
            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Link
                to="/demo"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-500 transition-all"
              >
                See the live demo
              </Link>
              <Link
                to="/assessment"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-stone-700 px-6 py-3 font-bold text-stone-200 hover:border-emerald-500/50 hover:text-white transition-all"
              >
                Find My First Automation ➜
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}