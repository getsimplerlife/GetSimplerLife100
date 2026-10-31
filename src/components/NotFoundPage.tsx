/**
 * SLICE 156 — the not-found page.
 *
 * Rendered by the router for any path that matches no route (root route's
 * `notFoundComponent`), and server-side rendered by `entry-server` for the same
 * case, so the visitor sees a real page at the same moment the server answers
 * 404 — not a blank screen, and not the marketing homepage pretending the URL
 * worked.
 *
 * Deliberately NO search box: there is no search index behind it, and a box
 * that returns nothing is worse than no box. Instead: four destinations that
 * genuinely exist and one way home.
 */
import { Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";

const DESTINATIONS = [
  {
    to: "/pricing",
    label: "Pricing",
    blurb: "What each plan includes, and what it costs.",
  },
  {
    to: "/features",
    label: "Platform",
    blurb: "What the platform does, from proposal to paid invoice.",
  },
  {
    to: "/integrations",
    label: "Integrations",
    blurb: "The apps you can bring your data in from.",
  },
  {
    to: "/contact",
    label: "Contact",
    blurb: "Talk to a person, or book a walkthrough.",
  },
] as const;

export function NotFoundPage() {
  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <Header businessName="Simpler Life 100" />
      <main className="flex-1">
        <section className="hero-glow hero-mesh relative overflow-hidden border-b border-stone-800 bg-stone-950 px-4 py-16 lg:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">
              404
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              This page doesn&rsquo;t exist
            </h1>
            <p className="mt-5 text-base text-stone-400 sm:text-lg">
              The address you followed doesn&rsquo;t match any page here. It may be an old
              link, or the address may have a typo in it. Everything below is a real page.
            </p>
            <p className="mt-8">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-black transition-colors hover:bg-emerald-400"
              >
                <span aria-hidden="true">&larr;</span> Back to the homepage
              </Link>
            </p>
          </div>
        </section>
        <section className="border-b border-stone-800 bg-stone-900 px-4 py-14 lg:py-20">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-center text-xs font-black uppercase tracking-[0.2em] text-stone-500">
              Where people usually go next
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {DESTINATIONS.map((destination) => (
                <Link
                  key={destination.to}
                  to={destination.to}
                  className="group rounded-2xl border border-stone-800 bg-stone-950 p-6 transition-colors hover:border-emerald-500/60 hover:bg-emerald-950/30"
                >
                  <span className="flex items-center justify-between text-lg font-black text-white">
                    {destination.label}
                    <span
                      aria-hidden="true"
                      className="text-emerald-400 transition-transform group-hover:translate-x-1"
                    >
                      &rarr;
                    </span>
                  </span>
                  <span className="mt-2 block text-sm text-stone-400">{destination.blurb}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
