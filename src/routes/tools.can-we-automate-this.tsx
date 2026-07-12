import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { analyzeDescription, type AnalysisResult } from "../tools/automation-analyzer";

export const Route = createFileRoute("/tools/can-we-automate-this")({
  component: CanWeAutomateThis,
});

const examplePrompts = [
  "Every morning I download PDF invoices from email, type the amounts into QuickBooks, then email customers a receipt",
  "Our warehouse team manually counts inventory each week and types updates into a spreadsheet",
  "Patients call to book appointments, we check availability on a paper calendar, and confirm by phone",
  "Sales leads come in from our website form and someone manually enters them into Salesforce",
  "HR manually processes new hire paperwork, sets up benefits, and orders equipment",
];

function CanWeAutomateThis() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ top: AnalysisResult; summary: string; industry: string; allResults: AnalysisResult[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = () => {
    if (!input.trim()) return;
    setAnalyzing(true);

    // Simulate brief analysis delay for UX
    setTimeout(() => {
      const analysis = analyzeDescription(input);
      setResult({
        top: analysis.topMatch,
        summary: analysis.savingsSummary,
        industry: analysis.industryGuess,
        allResults: analysis.allMatches,
      });
      setAnalyzing(false);
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          🤖 FREE AI TOOL
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          Can We <span className="text-emerald-400">Automate</span> This?
        </h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Describe any repetitive workflow your team does. We'll tell you if it can be automated,
          how many hours you'd save, and which AI agent can do it.
        </p>
      </section>

      {/* Input Area */}
      <section className="max-w-3xl mx-auto px-6 pb-8">
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 space-y-4">
          <label className="text-sm font-mono font-bold text-stone-400 tracking-wide">
            Describe the repetitive process:
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Every morning someone downloads PDFs from email, types amounts into QuickBooks, then emails customers..."
            className="w-full h-28 bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 resize-none font-medium leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {examplePrompts.slice(0, 3).map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="text-[10px] font-mono text-stone-500 hover:text-emerald-400 bg-stone-900 hover:bg-stone-800 border border-stone-800 px-2.5 py-1 rounded-lg transition-all truncate max-w-[200px]"
                >
                  {p.slice(0, 40)}...
                </button>
              ))}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!input.trim() || analyzing}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-500 text-black font-bold text-sm px-6 py-2.5 rounded-xl transition-all flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <span className="h-3 w-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <span>🔍</span> Analyze
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Results */}
      {result && (
        <section className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
          {/* Top Match Card */}
          <div className="bg-gradient-to-br from-emerald-950/40 to-stone-900/80 border border-emerald-900/50 rounded-2xl p-8">
            <div className="flex items-start gap-6 flex-col md:flex-row">
              <div className="text-5xl">{result.top.suggestedAgentEmoji}</div>
              <div className="flex-1 space-y-4">
                <div>
                  <div className="text-xs font-mono text-emerald-400 font-bold tracking-wider mb-1">
                    ✅ AUTOMATION OPPORTUNITY DETECTED
                  </div>
                  <h2 className="text-2xl font-black">{result.top.match.name}</h2>
                  <p className="text-stone-400 text-sm mt-1">{result.top.match.description}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-emerald-400">{result.top.estimatedHoursSaved}h</div>
                    <div className="text-[10px] font-mono text-stone-500 mt-1">SAVED / WEEK</div>
                  </div>
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-emerald-400">${(result.top.estimatedHoursSaved * 25).toLocaleString()}</div>
                    <div className="text-[10px] font-mono text-stone-500 mt-1">SAVED / WEEK*</div>
                  </div>
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-black text-emerald-400 capitalize">{result.top.confidence}</div>
                    <div className="text-[10px] font-mono text-stone-500 mt-1">MATCH CONFIDENCE</div>
                  </div>
                  <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                    <div className="text-lg font-black text-stone-300">{result.industry}</div>
                    <div className="text-[10px] font-mono text-stone-500 mt-1">INDUSTRY</div>
                  </div>
                </div>

                {/* Suggested Agent */}
                <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
                  <div className="text-xs font-mono text-stone-500 mb-2">SUGGESTED AI AGENT</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{result.top.suggestedAgentEmoji}</span>
                      <div>
                        <div className="font-bold text-emerald-400">{result.top.suggestedAgentName}</div>
                        <div className="text-xs text-stone-400">{result.top.match.timeSaved}</div>
                      </div>
                    </div>
                    <a
                      href={`/workflows/${result.top.match.id}`}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                    >
                      Learn More →
                    </a>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex gap-3 pt-2">
                  <a
                    href="https://buy.stripe.com/test_14k5nJ6XJ8kX5n6001"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm py-3 rounded-xl text-center transition-all"
                  >
                    🚀 Deploy {result.top.suggestedAgentName} — Starts at $499/mo
                  </a>
                  <a
                    href="/contact"
                    className="px-6 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold py-3 rounded-xl text-center transition-all"
                  >
                    Book Consultation
                  </a>
                </div>

                <p className="text-[10px] text-stone-600 italic">
                  *Savings calculated at $25/hr blended labor rate. Your actual savings may vary based on volume and complexity.
                </p>
              </div>
            </div>
          </div>

          {/* Other Matches */}
          {result.allResults.length > 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-mono font-bold text-stone-500 tracking-wide px-1">
                OTHER AUTOMATION OPPORTUNITIES ({result.allResults.length - 1} found)
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                {result.allResults.slice(1).map((r, i) => (
                  <div key={i} className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-4 flex items-start gap-3 hover:bg-stone-900/60 transition-all">
                    <span className="text-2xl">{r.suggestedAgentEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-stone-200">{r.match.name}</div>
                      <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{r.match.description}</div>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-emerald-400 font-bold">{r.estimatedHoursSaved}h/week</span>
                        <span className="text-stone-600">•</span>
                        <span className="text-stone-500 capitalize">{r.confidence} match</span>
                      </div>
                    </div>
                    <a
                      href={`/workflows/${r.match.id}`}
                      className="text-emerald-400 hover:text-emerald-300 text-xs font-bold shrink-0 mt-1"
                    >
                      Details →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Savings Summary */}
          <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <span className="text-2xl">📊</span>
              <div>
                <div className="text-sm font-bold text-stone-200 mb-1">Summary</div>
                <p className="text-sm text-stone-400 leading-relaxed">{result.summary}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!result && !analyzing && (
        <section className="max-w-3xl mx-auto px-6 pb-20">
          <div className="text-center text-stone-600 space-y-4">
            <div className="text-4xl">🤔</div>
            <p className="text-sm font-medium">
              Describe any manual process your team does daily — we'll match it to an automation workflow
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {examplePrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setInput(p)}
                  className="bg-stone-900/50 hover:bg-stone-900 border border-stone-800/50 px-3 py-1.5 rounded-lg text-stone-400 hover:text-stone-200 transition-all"
                >
                  {i === 0 ? "📄 Invoice processing" : i === 1 ? "📦 Inventory count" : i === 2 ? "🏥 Patient booking" : i === 3 ? "⚡ Lead entry" : "👋 HR onboarding"}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
