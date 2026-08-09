import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/tools/can-we-automate-this")({
  head: () => ({ meta: [{ title: "Can We Automate This? | Simpler Life 100" }, { name: "description", content: "Describe any repetitive workflow and our AI will match it to the right automation agent. Free tool, no signup." }] }),

  component: CanWeAutomateThis,
});

const examplePrompts = [
  "Every morning I download PDF invoices from email, type the amounts into QuickBooks, then email customers a receipt",
  "Our warehouse team manually counts inventory each week and types updates into a spreadsheet",
  "Patients call to book appointments, we check availability on a paper calendar, and confirm by phone",
  "Sales leads come in from our website form and someone manually enters them into Salesforce",
  "HR manually processes new hire paperwork, sets up benefits, and orders equipment",
];

interface AnalysisData {
  topMatch: string;
  allMatches: { name: string; match: number }[];
  industryGuess: string;
  savingsSummary: string;
  suggestedAgentPriceId: string;
  suggestedAgentName: string;
  paymentLink: string;
}

function CanWeAutomateThis() {
  const [step, setStep] = useState<"input" | "email" | "results">("input");
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisData | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/tools/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input, context: { tool: "can-we-automate-this" } }),
      });
      const data = await res.json();
      setResult(data.analysis || data);
      setStep("email");
    } catch {
      const { analyzeDescription } = await import("../tools/automation-analyzer");
      const analysis = analyzeDescription(input);
      setResult({
        topMatch: analysis.topMatch.suggestedAgentName,
        allMatches: (analysis.allMatches || []).map((r: any) => ({ name: r.suggestedAgentName, match: r.confidence })),
        industryGuess: analysis.industryGuess || "cross-industry",
        savingsSummary: `${analysis.topMatch.estimatedHoursSaved} hours/week`,
        suggestedAgentPriceId: "",
        suggestedAgentName: analysis.topMatch.suggestedAgentName,
        paymentLink: "",
      });
      setStep("email");
    }
    setAnalyzing(false);
  };

  const handleCaptureLead = async () => {
    if (!email.trim()) return;
    try {
      await fetch("/api/tools/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, toolName: "can-we-automate-this", result }),
      });
    } catch {}
    setStep("results");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }
  };

  const handleToolLeadCapture = async () => {
    if (!emailInput || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/tools/capture-lead', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email: emailInput, toolName: 'can-we-automate-this', result })
      });
      setShowContactForm(true);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <Header businessName="Simpler Life 100" />
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link to="/" className="text-xs text-stone-400 hover:text-stone-300 font-mono transition-all">← Back to Home</Link>
      </div>

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          🤖 FREE AI TOOL
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          Can We <span className="text-emerald-400">Automate</span> This?
        </h1>
        <p className="text-stone-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Describe any repetitive workflow. We'll match it to the right AI agent.
        </p>
      </section>

      {step === "input" && (
        <section className="max-w-3xl mx-auto px-6 pb-8">
          <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 space-y-4">
            <label className="text-sm font-mono font-bold text-stone-400 tracking-wide">Describe the repetitive process:</label>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="e.g. Every morning someone downloads PDFs from email, types amounts into QuickBooks..."
              className="w-full h-28 bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 resize-none" />
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {examplePrompts.slice(0, 3).map((p) => (
                  <button key={p} onClick={() => setInput(p)} className="text-[10px] font-mono text-stone-400 hover:text-emerald-400 bg-stone-900 hover:bg-stone-800 border border-stone-800 px-2.5 py-1 rounded-lg transition-all truncate max-w-[200px]">{p.slice(0, 40)}...</button>
                ))}
              </div>
              <button onClick={handleAnalyze} disabled={!input.trim() || analyzing}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 text-black font-bold text-sm px-6 py-2.5 rounded-xl transition-all">
                {analyzing ? "Analyzing..." : "🔍 Analyze"}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "email" && result && (
        <section className="max-w-3xl mx-auto px-6 pb-20 space-y-6">
          <div className="bg-gradient-to-br from-emerald-950/40 to-stone-900/80 border border-emerald-900/50 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-2xl font-black mb-2">Automation Blueprint Ready</h2>
            <p className="text-stone-400 mb-2">
              We matched your workflow to <span className="text-emerald-400 font-bold">{result.topMatch || result.suggestedAgentName}</span>
            </p>
            <p className="text-sm text-stone-500 mb-6">Estimated savings: {result.savingsSummary}</p>
            <div className="max-w-sm mx-auto space-y-3">
              <label className="text-xs font-mono text-stone-400">Enter your email to see your full blueprint:</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 text-center" />
              <button onClick={handleCaptureLead} disabled={!email.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 text-black font-bold text-sm py-3 rounded-xl transition-all">
                View My Blueprint →
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "results" && result && (
        <section className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
          <div className="bg-gradient-to-br from-emerald-950/40 to-stone-900/80 border border-emerald-900/50 rounded-2xl p-8">
            <div className="text-xs font-mono text-emerald-400 font-bold tracking-wider mb-1">✅ AUTOMATION OPPORTUNITY DETECTED</div>
            <h2 className="text-2xl font-black">{result.topMatch || result.suggestedAgentName}</h2>
            <p className="text-stone-400 text-sm mt-1">AI agent matched to your workflow</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">{result.savingsSummary.split(" ")[0]}</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">SAVED / WEEK</div>
              </div>
              <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-emerald-400">85-95%</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">MATCH CONFIDENCE</div>
              </div>
              <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                <div className="text-lg font-black text-stone-300">{result.industryGuess}</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">INDUSTRY</div>
              </div>
              <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 text-center">
                <div className="text-lg font-black text-emerald-400">$99+/mo</div>
                <div className="text-[10px] font-mono text-stone-400 mt-1">AI AGENT</div>
              </div>
            </div>
            <div className="mt-6 flex gap-3 flex-wrap">
              <a href={result.paymentLink || "https://buy.stripe.com/4gMfZj88TfMz6Hh8TS2Fa1K"} target="_blank" rel="noopener"
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-6 py-3 rounded-xl transition-all">
                🚀 Deploy This Agent →
              </a>
              <Link to="/build" className="bg-stone-800 hover:bg-stone-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all">
                🛠️ Build Custom Team
              </Link>
            </div>
          </div>
        </section>
      )}

      {step === "results" && result && (
        <section className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
          {!showContactForm ? (
            <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 text-center">
              <h3 className="text-lg font-bold text-white mb-2">Want us to build this for you?</h3>
              <p className="text-sm text-stone-400 mb-4">Drop your email and we&apos;ll send you a custom implementation plan.</p>
              <div className="flex gap-2 max-w-md mx-auto">
                <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@company.com" className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700" />
                <button onClick={handleToolLeadCapture} disabled={!emailInput || submitting} className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-all whitespace-nowrap">
                  {submitting ? 'Sending...' : 'Send Me My Plan'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-6 text-center">
              <p className="text-emerald-400 font-bold">✓ We&apos;ll reach out within 24 hours!</p>
            </div>
          )}
        </section>
      )}

    <Footer />
    </div>
  );
}
