import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/features')({
  head: () => ({
    meta: [
      { title: 'Features | Simpler Life 100 AI Operations Teams' },
      { name: 'description', content: 'AI employees that understand your systems, monitor them, and automate client-requested tasks — with cross-workspace files, a client portal, and fail-closed security.' },
      { property: 'og:title', content: 'Features | Simpler Life 100 AI Operations Teams' },
      { property: 'og:description', content: 'AI employees that understand, monitor, and safely automate across your operations. Real results, no complexity.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://simplerlife100.ctonew.app/features' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: FeaturesPage,
});

const CAPABILITIES = [
  {
    icon: '👁️',
    title: 'Understand & Read',
    description:
      'AI employees connect to your authorized systems and read operational context — invoices, bills, contacts, documents, calendars, and more — through verified, read-only contracts.',
  },
  {
    icon: '📡',
    title: 'Monitor',
    description:
      'Webhook-based monitoring watches for the events that matter (invoice created, bill created, and more) and dispatches to the right AI employee — gated per organization, fail-closed on unknown tenants.',
  },
  {
    icon: '⚙️',
    title: 'Automate & Write',
    description:
      'Client-requested tasks are executed safely: every artifact is created labeled, kept in place, and never deleted inside your accounts. Deletion happens only on explicit client request.',
  },
  {
    icon: '📁',
    title: 'Cross-Workspace Files',
    description:
      'Create files in Google Workspace or Microsoft 365 — your choice per tenant — with native links and connection badges, routed through a fail-closed resolver that never guesses a provider.',
  },
  {
    icon: '🧑‍💼',
    title: 'Client Portal',
    description:
      'A secure session-gated portal for connections, billing, file library, marketplace, and audit logs — fully tenant-isolated with per-tenant audit trails.',
  },
  {
    icon: '🔌',
    title: 'Connection Packs',
    description:
      'Every plan includes one CRM or ERP Connection Pack — your choice. Standalone packs are available for teams that want both.',
  },
  {
    icon: '🛡️',
    title: 'Fail-Closed Security',
    description:
      'Tenant-scoped data everywhere, no guessed provider URLs, signed webhook verification, constant-time key checks, and per-tenant audit logs. If a check fails, we refuse — we never guess.',
  },
  {
    icon: '🔐',
    title: 'Credentials That Stay Fresh',
    description:
      'OAuth credentials are stored durably and refreshed automatically — including single-use refresh-token rotation, so your connections keep working around the clock.',
  },
];

function FeaturesPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <header className="px-6 py-6 sticky top-0 z-50 border-b border-stone-900 bg-stone-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
            Simpler Life 100
          </Link>
          <nav aria-label="Main navigation" className="hidden md:flex gap-8 items-center">
            <Link to="/pricing" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">Pricing</Link>
            <Link to="/how-it-works" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">How It Works</Link>
            <Link to="/features" className="text-sm font-bold text-emerald-400 transition-colors">Features</Link>
            <Link to="/login" className="text-sm font-bold text-emerald-400 hover:text-emerald-300">Login</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16">
        <section className="text-center max-w-3xl mx-auto">
          <span className="text-[10px] font-mono font-bold tracking-[0.25em] text-emerald-500 uppercase">Capabilities</span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black text-white tracking-tight">
            AI employees that understand, monitor, and automate.
          </h1>
          <p className="mt-5 text-stone-400 text-lg leading-relaxed">
            Simpler Life 100 builds AI Operations Teams: AI employees that understand your operational context,
            monitor your authorized systems, and safely automate client-requested tasks — across industries.
          </p>
        </section>

        <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Product capabilities">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="bg-stone-900/60 border border-stone-800 rounded-2xl p-7 hover:border-stone-700 transition-colors">
              <div className="text-3xl">{cap.icon}</div>
              <h2 className="mt-4 text-lg font-bold text-white">{cap.title}</h2>
              <p className="mt-2 text-sm text-stone-400 leading-relaxed">{cap.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 text-center">
          <Link
            to="/pricing"
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black px-8 py-4 rounded-xl font-bold transition-all shadow-md text-sm"
          >
            View Pricing →
          </Link>
          <Link
            to="/contact"
            className="inline-block ml-4 text-sm font-bold text-stone-400 hover:text-white transition-colors"
          >
            Talk to us
          </Link>
        </section>
      </main>

      <footer className="border-t border-stone-900 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-stone-600 text-sm">© 2026 Simpler Life 100. All rights reserved.</span>
          <nav aria-label="Footer navigation" className="flex gap-6">
            <Link to="/about" className="text-stone-500 hover:text-white text-sm transition-colors">About</Link>
            <Link to="/pricing" className="text-stone-500 hover:text-white text-sm transition-colors">Pricing</Link>
            <Link to="/contact" className="text-stone-500 hover:text-white text-sm transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
