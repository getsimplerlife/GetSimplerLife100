import { useState } from "react";

/**
 * SLICE 157 — capability tabs (Proposals · Approvals · Invoicing · Payments).
 *
 * WHY THIS IS A COMPONENT, NOT INLINE JSX: the brief's third required test has
 * to prove the tabs actually swap visible content, which means clicking them.
 * Keeping the tab strip and its panels in one small component with no router
 * dependency lets the test mount the real thing in jsdom and click each tab,
 * instead of asserting on markup shape and hoping.
 *
 * COPY RULE: every panel describes something the built platform does. No
 * percentages, no "save N hours" — the owner's rule is no fabricated numbers
 * on a public page.
 */
export interface CapabilityTab {
  id: string;
  label: string;
  headline: string;
  body: string;
  bullets: string[];
}

export const CAPABILITY_TABS: CapabilityTab[] = [
  {
    id: "proposals",
    label: "Proposals",
    headline: "A proposal your client can read and sign on the page",
    body:
      "Write the proposal once, attach the line items, and send a share link. The client reads it in the browser and signs — typed or drawn — and the signature is hashed into the record.",
    bullets: [
      "Line items, terms and validity on the document itself",
      "Share links you can revoke or replace",
      "The signed version stays with the client's file",
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    headline: "Every write pauses in a queue your team can see",
    body:
      "Nothing an automation prepares is allowed to land on its own. Each write arrives in the approval queue with what it will do and where it will go — approve it, and only then does it run.",
    bullets: [
      "One queue for every gated action",
      "An immutable audit line for each decision",
      "Reads stay open; writes wait for you",
    ],
  },
  {
    id: "invoicing",
    label: "Invoicing",
    headline: "From approved work to an invoice you can share",
    body:
      "The invoice is drafted from the approved work, with its line items and terms, and delivered by email or a share link. The share link can be revoked or rotated if it goes to the wrong inbox.",
    bullets: [
      "Status you can follow: draft, sent, paid",
      "A public invoice page with no login for the client",
      "Revocable links — a leak is not permanent",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    headline: "Your clients pay you, on your own payment account",
    body:
      "We never hold your customers' money. The checkout is created on your own payment provider with your own key, so the funds settle to you — and the invoice reads paid only when your provider confirms the exact amount and currency arrived.",
    bullets: [
      "Checkout on the tenant's own account, not ours",
      "An amount or currency mismatch writes nothing",
      "The confirmation is stored once, with an audit line",
    ],
  },
];

export function CapabilityTabs({ tabs = CAPABILITY_TABS }: { tabs?: CapabilityTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Platform capabilities"
        className="flex flex-wrap gap-2 rounded-2xl border border-stone-800 bg-stone-900/60 p-2"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`capability-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`capability-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              data-tab={tab.id}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
                selected
                  ? "bg-emerald-500 text-stone-950"
                  : "text-stone-300 hover:bg-stone-800 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`capability-panel-${current.id}`}
        aria-labelledby={`capability-tab-${current.id}`}
        data-tab-panel={current.id}
        className="mt-6 rounded-3xl border border-stone-800 bg-stone-900/40 p-6 lg:p-8"
      >
        <h3 className="text-xl font-black text-white lg:text-2xl">{current.headline}</h3>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-stone-400">{current.body}</p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-3">
          {current.bullets.map((bullet) => (
            <li
              key={bullet}
              className="rounded-xl border border-stone-800 bg-stone-950/60 px-4 py-3 text-sm text-stone-300"
            >
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
