
import { Link } from "@tanstack/react-router";
import { RicherROICalculator } from "~/components/RicherROICalculator";
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
              ROI Calculator
            </h1>
            <p className="text-stone-400 text-sm md:text-base leading-relaxed">
              Put your own numbers in — your team, your minutes per task, your labour cost — and see the
              arithmetic. Every input is yours to change, and the one assumption in the model is yours to set.
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
                <span className="text-emerald-400">📊</span> How the model works
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                People × tasks per day × minutes per task ÷ 60 gives hours of manual work; × your working
                days gives hours a year; × your hourly cost gives what the work costs. The working-days
                figure is a planning default you can change, and the arithmetic is printed under the results.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-emerald-400">🛡️</span> The one assumption
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                How much of that work automation actually takes is the only figure in the model nobody can
                know before a pilot. It is a slider you set, it is labelled as your assumption, and we do not
                add an invented error-cost multiplier on top of it.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="text-emerald-400">⚡</span> What the platform costs
              </h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Your only cost is the monthly subscription — no setup fee. The model costs the tier that
                fits the team size you enter and shows the payback against it, so the return is measured
                against a price we actually charge.
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950/40 py-8 text-center text-stone-400 text-[10px] tracking-widest uppercase font-mono">
        &copy; {new Date().getFullYear()} Simpler Life 100 &bull; One Platform, Every Capability
      </footer>

    </div>
  );
}

export default ROICalculatorPage;
