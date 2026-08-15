import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";
export const Route = createFileRoute("/demos")({
  head: () => pageHead("/demos"),
  component: DemosHub,
});
function DemosHub() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="max-w-5xl mx-auto px-6 pt-6">
        <Link to="/" className="text-xs text-stone-400 hover:text-stone-300 font-mono transition-all">← Back to Home</Link>
      </div>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Interactive <span className="text-emerald-400">Demos</span></h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto mb-12">See Simpler Life 100 in action with these interactive walkthroughs.</p>
        <div className="grid gap-6 max-w-2xl mx-auto">
          <Link to="/demos/audit-portal" className="block bg-stone-900 hover:bg-stone-800 border border-stone-800 rounded-2xl p-8 text-left transition-all">
            <h2 className="text-xl font-black text-white mb-2">🔍 Audit Workflow Demo</h2>
            <p className="text-stone-400 text-sm">Watch AI agents automatically audit compliance, flag issues, and generate reports in real time.</p>
          </Link>
          <Link to="/demos/workflows" className="block bg-stone-900 hover:bg-stone-800 border border-stone-800 rounded-2xl p-8 text-left transition-all">
            <h2 className="text-xl font-black text-white mb-2">⚡ Workflow Automation Demo</h2>
            <p className="text-stone-400 text-sm">Explore how multi-step workflows execute across departments with AI-driven decision nodes.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
