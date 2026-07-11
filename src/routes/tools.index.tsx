import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { analyzeDescription } from "../tools/automation-analyzer";

export const Route = createFileRoute("/tools/")({
  component: ToolsHub,
});

function ToolsHub() {
  const [quickInput, setQuickInput] = useState("");
  const [quickResult, setQuickResult] = useState<string | null>(null);

  const handleQuickAnalyze = () => {
    if (!quickInput.trim()) return;
    const analysis = analyzeDescription(quickInput);
    const top = analysis.topMatch;
    setQuickResult(
      `🎯 **${top.match.name}** — Save ~${top.estimatedHoursSaved}h/week with ${top.suggestedAgentName}`
    );
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Header */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          AI <span className="text-emerald-400">Productivity</span> Tools
        </h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto">
          Free tools to analyze your workflows, estimate savings, and discover automation opportunities — no signup required.
        </p>
      </section>

      {/* Tool Cards */}
      <section className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
        {/* Tool 1: Can We Automate This? */}
        <div className="bg-gradient-to-br from-stone-900/60 to-stone-950 border border-stone-800 rounded-2xl p-6 md:p-8 hover:border-stone-700 transition-all">
          <div className="flex items-start gap-6 flex-col md:flex-row">
            <div className="text-5xl shrink-0">🔍</div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-[10px] font-mono font-bold rounded">POPULAR</span>
                <span className="px-2 py-0.5 bg-stone-800 text-stone-400 text-[10px] font-mono rounded">FREE</span>
              </div>
              <h2 className="text-2xl font-black">Can We Automate This?</h2>
              <p className="text-stone-400 text-sm leading-relaxed">
                Describe any repetitive workflow your team does. We'll match it to our automation library,
                estimate hours saved, and suggest the right AI agent — all in seconds.
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">30+</div>
                  <div className="text-stone-500 mt-0.5">Workflows matched</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">Instant</div>
                  <div className="text-stone-500 mt-0.5">Results</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">No signup</div>
                  <div className="text-stone-500 mt-0.5">Required</div>
                </div>
              </div>
              <a
                href="/tools/can-we-automate-this"
                className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-6 py-3 rounded-xl transition-all"
              >
                Try It Now →
              </a>
            </div>
          </div>
        </div>

        {/* Tool 2: AI Automation Assessment */}
        <div className="bg-gradient-to-br from-indigo-950/20 to-stone-950 border border-stone-800 rounded-2xl p-6 md:p-8 hover:border-indigo-500/30 transition-all">
          <div className="flex items-start gap-6 flex-col md:flex-row">
            <div className="text-5xl shrink-0">📊</div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-900/30 border border-indigo-800/50 text-indigo-400 text-[10px] font-mono font-bold rounded">EXPERT DIAGNOSTIC</span>
                <span className="px-2 py-0.5 bg-stone-800 text-stone-400 text-[10px] font-mono rounded">FREE</span>
              </div>
              <h2 className="text-2xl font-black">AI Automation Assessment</h2>
              <p className="text-stone-400 text-sm leading-relaxed">
                Take our 10-question expert operational assessment. Receive a dynamic annual savings audit, 
                a customized list of high-priority workflows, and download your printable PDF report blueprint.
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-indigo-400">PDF Report</div>
                  <div className="text-stone-500 mt-0.5">Download blueprint</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-indigo-400">10 Questions</div>
                  <div className="text-stone-500 mt-0.5">Detailed audit</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-indigo-400">Strategic ROI</div>
                  <div className="text-stone-500 mt-0.5">Custom analysis</div>
                </div>
              </div>
              <a
                href="/assessment"
                className="inline-block bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all"
              >
                Run Free Diagnostic →
              </a>
            </div>
          </div>
        </div>

        {/* Tool 3: AI Advisor */}
        <div className="bg-gradient-to-br from-stone-900/60 to-stone-950 border border-stone-800 rounded-2xl p-6 md:p-8 hover:border-stone-700 transition-all">
          <div className="flex items-start gap-6 flex-col md:flex-row">
            <div className="text-5xl shrink-0">🎯</div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-stone-800 text-stone-400 text-[10px] font-mono rounded">FREE</span>
              </div>
              <h2 className="text-2xl font-black">AI Operations Advisor</h2>
              <p className="text-stone-400 text-sm leading-relaxed">
                An interactive chat that asks about your team's pain points, follows up with smart
                questions, and generates a personalized automation recommendation with savings estimates.
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">Guided</div>
                  <div className="text-stone-500 mt-0.5">Conversation</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">Personalized</div>
                  <div className="text-stone-500 mt-0.5">Recommendations</div>
                </div>
                <div className="bg-stone-900/50 rounded-lg p-3">
                  <div className="font-bold text-emerald-400">Savings</div>
                  <div className="text-stone-500 mt-0.5">Estimate</div>
                </div>
              </div>
              <a
                href="/tools/ai-advisor"
                className="inline-block bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-sm px-6 py-3 rounded-xl transition-all"
              >
                Start Chat →
              </a>
            </div>
          </div>
        </div>

        {/* Quick Try */}
        <div className="bg-stone-900/30 border border-stone-800/50 rounded-2xl p-6 mt-8">
          <h3 className="text-sm font-mono font-bold text-stone-500 tracking-wide mb-3">
            ⚡ QUICK TEST — Describe a process:
          </h3>
          <div className="flex gap-2">
            <input
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickAnalyze()}
              placeholder="e.g., We manually enter invoices into QuickBooks..."
              className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-700 placeholder-stone-600 text-stone-200"
            />
            <button
              onClick={handleQuickAnalyze}
              disabled={!quickInput.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-500 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
            >
              Analyze
            </button>
          </div>
          {quickResult && (
            <div className="mt-3 p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl text-sm text-emerald-300">
              {quickResult}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
