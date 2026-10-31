import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import { CapabilityTabs } from "~/components/CapabilityTabs";
import { pageHead } from "~/lib/site-meta";

/**
 * SLICE 157 — the homepage, rebuilt to the owner's chosen direction (Option B,
 * product-led; owner decision 2026-10-31).
 *
 * WHAT WAS WRONG (measured on the 156th publish, not guessed): the page was
 * 8,809 px tall with pricing near the bottom, the header carried eight items and
 * two competing CTAs, and a stuck header clipped the headings it was floating
 * over.
 *
 * STRUCTURE NOW: split hero (promise left, a real screenshot of our own portal
 * right) → the price band inside the first two screens → capability tabs that
 * swap content in place → three outcome cards. Everything else that used to be
 * here is still reachable — the pages exist and the footer lists them; the
 * homepage no longer argues every point three times.
 *
 * COPY DISCIPLINE: no statistics anywhere on this page. The outcome cards are
 * qualitative on purpose (owner rule: no fabricated numbers on a public page),
 * the only figures are the three locked prices, and every product claim below
 * describes something the shipped platform actually does.
 */

export const Route = createFileRoute("/")({
  head: () => pageHead("/"),
  component: Home,
});

/** The one primary action on the page. Repeated in the header, never twice in the body. */
const PRIMARY_CTA = { label: "Get started", to: "/register" } as const;

/** Locked platform tiers (owner 09-27; setup fees dropped 10-30). */
const TIERS = [
  {
    name: "Starter",
    price: "$199/mo",
    forLabel: "Firms ~10–30 people",
    line: "The full platform for your first client workflows.",
    onboarding: "Self-serve onboarding included",
    ctaHref: "https://buy.stripe.com/eVqbJ0aD29JA3bx6R75os03",
  },
  {
    name: "Growth",
    price: "$599/mo",
    forLabel: "Firms ~30–100 people",
    line: "Higher limits and governance for a growing ops team.",
    onboarding: "Guided onboarding included",
    ctaHref: "https://buy.stripe.com/bJe3cubH6f3U3bxdfv5os04",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$1,499/mo",
    forLabel: "Larger or regulated ops",
    line: "The largest limits, audit export and a named contact.",
    onboarding: "Named onboarding included",
    ctaHref: "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
  },
];

/** Three outcomes, qualitative only — no percentages, no invented time savings. */
const OUTCOMES = [
  {
    title: "One place for the client work",
    body: "Proposals, approvals, invoices and the files behind them live in the same portal, so nobody re-keys the same client details into a second tool.",
  },
  {
    title: "Deals that keep moving",
    body: "When a proposal comes back signed, the next step is already waiting in your approval queue instead of in someone's inbox.",
  },
  {
    title: "Invoices you can trust",
    body: "An invoice reads paid only when your own payment account confirms the exact amount and currency arrived — never on a guess.",
  },
];

function Home() {
  const businessName = "Simpler Life 100";

  return (
    <div className="flex min-h-screen flex-col bg-stone-950">
      <Header businessName={businessName} />
      <main className="flex-1">
        {/* ── 1 · SPLIT HERO — promise left, the real portal right ── */}
        <section
          id="hero"
          className="hero-glow relative border-b border-stone-800 bg-stone-950 px-4 py-14 lg:px-6 lg:py-20"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-300">
                Quote to cash, end to end
              </div>
              <h1 className="mt-5 max-w-xl text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl">
                From proposal to paid, in one place.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone-400">
                Send the proposal, collect the signature and the approval, invoice the work and get paid —
                one platform your team runs client work from.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  to={PRIMARY_CTA.to}
                  data-cta="primary"
                  className="premium-btn inline-flex min-h-[52px] items-center justify-center rounded-2xl px-7 py-3.5 text-base font-bold text-white"
                >
                  {PRIMARY_CTA.label}
                </Link>
                <a href="#pricing" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">
                  See pricing ↓
                </a>
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-stone-500">
                Every write waits for your team's approval before it runs. Nothing here needs an onboarding
                project to learn.
              </p>
            </div>

            {/* The product panel: a real screenshot of our own portal, captured from
                the running app with a demo account (see the caption). Not a drawing. */}
            <figure className="premium-card overflow-hidden rounded-2xl p-2 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <span className="ml-2 truncate text-[11px] font-mono text-stone-500">
                  portal · proposals
                </span>
              </div>
              <img
                src="/product/portal-quote-to-cash.png"
                alt="The Simpler Life 100 portal: a proposal that has been signed and sent, with the write it produced waiting in the approval queue — captured from the running product with an illustrative demo account."
                width={1200}
                height={760}
                loading="eager"
                decoding="async"
                className="block w-full rounded-xl border border-stone-800"
              />
              <figcaption className="px-3 py-2.5 text-[11px] leading-relaxed text-stone-500">
                Our own portal, captured from the running app. The company and amounts are an illustrative
                demo account — not a customer's data.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── 2 · PRICE BAND — inside the first two screens, locked prices only ── */}
        <section id="pricing" className="border-b border-stone-800 bg-stone-900 px-4 py-12 lg:px-6 lg:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-emerald-400">Pricing</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white lg:text-3xl">
                  Three tiers. Onboarding included. No setup fee.
                </h2>
              </div>
              <Link to="/pricing" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">
                What's in each tier →
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-2xl p-5 ${
                    tier.highlight
                      ? "border border-emerald-500/60 bg-emerald-950/40"
                      : "border border-stone-800 bg-stone-950/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-base font-black text-white">{tier.name}</div>
                    <div className="text-[11px] text-stone-500">{tier.forLabel}</div>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{tier.price}</div>
                  <div className="mt-1 text-xs text-stone-400">{tier.onboarding}</div>
                  <p className="mt-3 text-sm leading-relaxed text-stone-400">{tier.line}</p>
                  <a
                    href={tier.ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    Choose {tier.name} →
                  </a>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-stone-500">
              Billed monthly, cancel any time. The price on this page is the price the checkout charges.
            </p>
          </div>
        </section>

        {/* ── 3 · CAPABILITY TABS — content swaps in place ── */}
        <section id="capabilities" className="border-b border-stone-800 bg-stone-950 px-4 py-14 lg:px-6 lg:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-7 max-w-2xl">
              <div className="text-xs font-black uppercase tracking-widest text-emerald-400">The flow</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white lg:text-4xl">
                Four steps, one platform
              </h2>
            </div>
            <CapabilityTabs />
          </div>
        </section>

        {/* ── 4 · THREE OUTCOME CARDS — qualitative only ── */}
        <section id="why" className="border-b border-stone-800 bg-stone-900 px-4 py-14 lg:px-6 lg:py-16">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-7 max-w-2xl text-3xl font-black tracking-tight text-white lg:text-4xl">
              What changes when the paperwork lives in one place
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {OUTCOMES.map((outcome) => (
                <div key={outcome.title} className="premium-card h-full rounded-2xl p-6">
                  <h3 className="text-lg font-black text-white">{outcome.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{outcome.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5 · IMPORT HONESTY — the data comes in on your terms ── */}
        <section id="data" className="border-b border-stone-800 bg-stone-950 px-4 py-12 lg:px-6 lg:py-14">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-xl font-black text-white lg:text-2xl">Your data comes in on your terms</h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-stone-400">
              Import what you already have and run it from here. Nothing imports on its own — external tools
              are client-side, one-time transfers that bring your data in, and every import is
              approval-gated; nothing is written until you approve.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold">
              <Link to="/you-stay-in-control" className="text-emerald-400 hover:text-emerald-300">
                How your team stays in control →
              </Link>
              <Link to="/security" className="text-emerald-400 hover:text-emerald-300">
                How your data is protected →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
