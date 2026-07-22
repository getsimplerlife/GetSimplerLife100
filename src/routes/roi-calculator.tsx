import { createFileRoute, Link } from "@tanstack/react-router";
import { RicherROICalculator } from "~/components/RicherROICalculator";

export const Route = createFileRoute("/roi-calculator")({
  component: ROICalculatorPage,
});

function ROICalculatorPage() {
  return (
    <div className="min-h-screen bg-stone-950 flex flex-col selection:bg-emerald-500 selection:text-stone-950">
      
      {/* Header */}
      <header className="px-6 py-6 border-b border-stone-900 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-emerald-500 tracking-tight flex items-center gap-2">
            <span>✨</span> Simpler Life 100
          </Link>
          <Link to="/" className="text-xs font-bold text-stone-400 hover:text-white transition-colors uppercase tracking-widest border border-stone-800 hover:border-stone-700 px-4 py-2 rounded-xl">
            ← Exit Calculator
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-12 lg:py-16 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Hero Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              Interactive ROI Projections
            </span>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              AI Operations ROI Calculator
            </h1>
            <p className="text-stone-400 text-sm md:text-base leading-relaxed">
              Quantify your labor waste and calculate the precise break-even and compounding net returns of deploying a dedicated AI Operations Team in your workflows.
            </p>
          </div>

          {/* Interactive Calculator Component */}
          <div className="bg-stone-950/50 rounded-[2.5rem] p-1 border border-stone-900 shadow-3xl">
            <RicherROICalculator />
          </div>

          {/* Additional context & FAQ footer to provide maximum business credibility */}
          <div className="grid md:grid-cols-3 gap-8 pt-12 border-t border-stone-900 max-w-5xl mx-auto">
            <div className="space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-emerald-400">📊</span> How we model your savings
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Calculations are modeled based on standard 250-day working years, with an average AI-driven efficiency/reclamation rate of 85% on manual redundant steps.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-emerald-400">🛡️</span> Mitigating manual error costs
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Standard industry models state locating and remediating manual process errors costs approximately 3x the standard hourly task rate. Our calculator integrates this mitigation.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-emerald-400">⚡</span> Rapid 21-day deployment
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Because Simpler Life 100 uses pre-trained vertical adapters, our deployment timeline averages 21 days with no legacy ERP disruptions.
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950/40 py-8 text-center text-stone-400 text-[10px] tracking-widest uppercase font-mono">
        &copy; {new Date().getFullYear()} Simpler Life 100 &bull; Strategic AI Operations
      </footer>

    </div>
  );
}
