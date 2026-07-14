import { useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { 
  assessmentQuestions, 
  runAssessment, 
  type AssessmentAnswers, 
  type AssessmentReport 
} from "../tools/assessment-engine";

export const Route = createFileRoute("/assessment")({
  component: AssessmentPage,
});

const initialAnswers: AssessmentAnswers = {
  industry: "",
  companySize: "",
  department: "",
  topPainPoints: [],
  currentSoftware: [],
  manualProcesses: "",
  monthlyInvoiceVolume: "",
  hasComplianceNeeds: "",
  growthPlans: "",
  timeline: "",
  budget: "",
  email: "",
  company: "",
};

function AssessmentPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswers>(initialAnswers);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const totalSteps = assessmentQuestions.length;

  const updateAnswer = (id: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMulti = (id: string, value: string) => {
    setAnswers((prev) => {
      const current = (prev as any)[id] as string[] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [id]: updated };
    });
  };

  const canProceed = (): boolean => {
    const q = assessmentQuestions[step];
    if (!q) return false;
    const val = (answers as any)[q.id];
    if (q.type === "text") return val?.trim().length > 5;
    if (q.type === "multi") return Array.isArray(val) && val.length > 0;
    if (q.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val || "");
    return val !== "" && val !== undefined;
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      generateReport();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error("Assessment request failed");
      const result = await res.json();
      setReport(result);
    } catch (error) {
      console.error("Assessment error:", error);
    } finally {
      setGenerating(false);
    }
  };

  const downloadPDF = () => {
    if (!report) return;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 20;

    // Header / Title
    pdf.setFontSize(22);
    pdf.setTextColor(99, 102, 241); // Indigo
    pdf.text("AI Automation Assessment Report", pageWidth / 2, y, { align: "center" });
    y += 10;

    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${report.reportDate}`, pageWidth / 2, y, { align: "center" });
    y += 6;
    pdf.text(`Industry: ${report.industry} | Company Size: ${report.companySize} employees`, pageWidth / 2, y, { align: "center" });
    y += 15;

    // Financial Projections
    pdf.setFontSize(16);
    pdf.setTextColor(17, 24, 39); // Gray 900
    pdf.text("1. Executive Summary & Savings", 20, y);
    y += 8;

    pdf.setFontSize(11);
    pdf.setTextColor(75, 85, 99); // Gray 600
    pdf.text(`Estimated Annual Savings from Automation: $${report.annualSavings.toLocaleString()}/year`, 20, y);
    y += 6;
    pdf.text(`Efficiency Rate Target: 85% reduction in manual cycle times.`, 20, y);
    y += 15;

    // Top Workflows
    pdf.setFontSize(16);
    pdf.setTextColor(17, 24, 39);
    pdf.text("2. Recommended Automations", 20, y);
    y += 10;

    report.topWorkflows.forEach((w, i) => {
      if (y > 250) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(12);
      pdf.setTextColor(79, 70, 229); // Indigo 600
      pdf.text(`${i + 1}. ${w.workflow.name}`, 20, y);
      y += 5;

      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128); // Gray 500
      pdf.text(`Est. Savings: $${w.estimatedAnnualSavings.toLocaleString()}/yr | Timeline: ${w.implementationTime} | Impact: ${w.impactScore}/10`, 22, y);
      y += 5;

      pdf.setFontSize(9);
      pdf.setTextColor(55, 65, 81); // Gray 700
      const desc = pdf.splitTextToSize(w.workflow.description, pageWidth - 45);
      pdf.text(desc, 22, y);
      y += desc.length * 4 + 6;
    });

    // Roadmap
    if (y > 220) {
      pdf.addPage();
      y = 20;
    }
    y += 10;
    pdf.setFontSize(16);
    pdf.setTextColor(17, 24, 39);
    pdf.text("3. Phased Implementation Roadmap", 20, y);
    y += 10;

    pdf.setFontSize(11);
    pdf.setTextColor(16, 185, 129); // Emerald
    pdf.text("⚡ Phase 1: Quick Wins (2-4 weeks)", 20, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    report.roadmap.quickWins.slice(0, 3).forEach((w) => {
      pdf.text(`• ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr`, 25, y);
      y += 5;
    });

    y += 5;
    pdf.setFontSize(11);
    pdf.setTextColor(245, 158, 11); // Amber
    pdf.text("📅 Phase 2: Medium-Term (4-8 weeks)", 20, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    report.roadmap.mediumTerm.slice(0, 3).forEach((w) => {
      pdf.text(`• ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr`, 25, y);
      y += 5;
    });

    // Call to Action
    if (y > 230) {
      pdf.addPage();
      y = 20;
    }
    y += 15;
    pdf.setFontSize(14);
    pdf.setTextColor(79, 70, 229);
    pdf.text("Ready to transition to an autonomous operational flow?", pageWidth / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(11);
    pdf.setTextColor(107, 114, 128);
    pdf.text("Schedule your Blueprint Consultation at simplerlife100.ctonew.app/contact", pageWidth / 2, y, { align: "center" });

    pdf.save(`SimplerLife100_AI_Assessment_${report.industry.replace(/\s+/g, "_")}.pdf`);
  };

  const progress = ((step + (report ? 1 : 0)) / (totalSteps + 1)) * 100;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="flex-1">
        {/* Navigation Header */}
        <header className="border-b border-stone-900 bg-stone-950/80 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
              S1
            </span>
            <span className="font-black text-base tracking-tight text-white group-hover:text-indigo-400 transition-colors">
              SIMPLER LIFE <span className="text-indigo-500 font-mono">100</span>
            </span>
          </Link>
          <Link 
            to="/tools" 
            className="text-xs font-mono font-bold text-stone-400 hover:text-white border border-stone-800 hover:border-stone-700 bg-stone-900/30 rounded-lg px-3.5 py-1.5 transition-all"
          >
            ← ALL TOOLS
          </Link>
        </header>

        {/* Assessment Interface */}
        {!report ? (
          <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
            {/* Header Badge & Title */}
            <div className="text-center mb-8">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold tracking-wider mb-4 animate-pulse">
                ✨ EXPERT SYSTEM DIAGNOSTIC
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-white via-stone-100 to-stone-400 bg-clip-text text-transparent">
                AI Operations <span className="text-indigo-400">Assessment</span>
              </h1>
              <p className="text-stone-400 text-sm max-w-lg mx-auto">
                Evaluate your workflow compatibility for automated AI agents and calculate custom efficiency dividends in minutes.
              </p>
            </div>

            {/* Progress Meter */}
            <div className="mb-8">
              <div className="flex justify-between text-[11px] font-mono text-stone-500 mb-2.5">
                <span>ANALYZING OPERATIONAL COMPATIBILITY</span>
                <span>{generating ? "PROCESSING PROFILE" : `STEP ${step + 1} OF ${totalSteps}`}</span>
              </div>
              <div className="h-2 bg-stone-900 rounded-full overflow-hidden p-[2px] border border-stone-800/30">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {generating ? (
              /* Loading Spinner / Processing Screen */
              <div className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full border-2 border-stone-800 border-t-indigo-500 animate-spin" />
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold text-indigo-400">
                    AI
                  </span>
                </div>
                <h3 className="text-lg font-black text-stone-200 mb-2 animate-pulse">
                  Analyzing Compatibility Profile...
                </h3>
                <p className="text-xs text-stone-500 max-w-md leading-relaxed">
                  Our system scoring engine is currently mapping your tech stack, calculating annual labor savings, and ranking optimized multi-step workflows.
                </p>
              </div>
            ) : (
              /* Question Wizard Card */
              <div className="bg-stone-900/30 border border-stone-800/60 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
                {/* Visual Glow Ornament */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="mb-3 text-[10px] font-mono font-extrabold text-indigo-400 tracking-widest uppercase">
                  QUESTION {step + 1} OF {totalSteps}
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight">
                  {assessmentQuestions[step].question}
                </h2>
                {assessmentQuestions[step].description && (
                  <p className="text-xs text-stone-500 mb-8 leading-relaxed">
                    {assessmentQuestions[step].description}
                  </p>
                )}

                {/* Input Controls */}
                <div className="mt-6">
                  {/* Single Choice Selector */}
                  {assessmentQuestions[step].type === "single" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {assessmentQuestions[step].options?.map((opt) => {
                        const isSelected = (answers as any)[assessmentQuestions[step].id] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => updateAnswer(assessmentQuestions[step].id, opt.value)}
                            className={`flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all duration-200 ${
                              isSelected
                                ? "bg-indigo-950/40 border-indigo-500/80 text-indigo-200 shadow-lg shadow-indigo-950/30"
                                : "bg-stone-950/60 border-stone-800/80 text-stone-400 hover:border-stone-700 hover:text-stone-200 hover:translate-y-[-1px]"
                            }`}
                          >
                            <span className="text-2xl shrink-0">{opt.icon || "⚡"}</span>
                            <span className="text-sm font-semibold tracking-wide">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Multi Choice Selector */}
                  {assessmentQuestions[step].type === "multi" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {assessmentQuestions[step].options?.map((opt) => {
                        const selectedList = (answers as any)[assessmentQuestions[step].id] as string[] || [];
                        const isSelected = selectedList.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            onClick={() => toggleMulti(assessmentQuestions[step].id, opt.value)}
                            className={`flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all duration-200 ${
                              isSelected
                                ? "bg-indigo-950/40 border-indigo-500/80 text-indigo-200 shadow-lg shadow-indigo-950/30"
                                : "bg-stone-950/60 border-stone-800/80 text-stone-400 hover:border-stone-700 hover:text-stone-200 hover:translate-y-[-1px]"
                            }`}
                          >
                            <span className={`w-5 h-5 rounded border flex items-center justify-center text-[10px] shrink-0 font-bold transition-all ${
                              isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-stone-700 bg-stone-900"
                            }`}>
                              {isSelected ? "✓" : ""}
                            </span>
                            <span className="text-2xl shrink-0">{opt.icon || "🔌"}</span>
                            <span className="text-sm font-semibold tracking-wide">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Plain Text Inputs */}
                  {assessmentQuestions[step].type === "text" && (
                    <div className="space-y-2">
                      <textarea
                        value={(answers as any)[assessmentQuestions[step].id] || ""}
                        onChange={(e) => updateAnswer(assessmentQuestions[step].id, e.target.value)}
                        placeholder={assessmentQuestions[step].placeholder || "Detail your manual bottlenecks here..."}
                        className="w-full h-32 bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/30 resize-none font-medium leading-relaxed transition-all"
                      />
                      <div className="flex items-center justify-between text-[11px] text-stone-600 font-mono">
                        <span>MINIMUM 6 CHARACTERS REQUIRED</span>
                        <span>{((answers as any)[assessmentQuestions[step].id] || "").length} CHARS</span>
                      </div>
                    </div>
                  )}

                  {/* Email & Text Standard Field Inputs */}
                  {assessmentQuestions[step].type === "email" && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-mono font-bold text-stone-500 mb-2 uppercase">
                          Corporate Email Address
                        </label>
                        <input
                          type="email"
                          value={answers.email || ""}
                          onChange={(e) => updateAnswer("email", e.target.value)}
                          placeholder="operations@yourcompany.com"
                          className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/30 font-medium transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-mono font-bold text-stone-500 mb-2 uppercase">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={answers.company || ""}
                          onChange={(e) => updateAnswer("company", e.target.value)}
                          placeholder="Acme Manufacturing Group"
                          className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3.5 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/30 font-medium transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Wizard Navigation Panel */}
                <div className="flex justify-between items-center mt-10 pt-6 border-t border-stone-800/50">
                  <button
                    onClick={handleBack}
                    disabled={step === 0}
                    className="px-5 py-2.5 bg-stone-900 border border-stone-800 hover:bg-stone-800 disabled:bg-stone-950 disabled:border-transparent disabled:text-stone-700 text-stone-300 font-bold text-xs font-mono rounded-xl transition-all"
                  >
                    ← PREVIOUS
                  </button>

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-white font-bold text-xs font-mono rounded-xl transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                  >
                    {step < totalSteps - 1 ? "CONTINUE →" : "COMPILE REPORT →"}
                  </button>
                </div>
              </div>
            )}
          </main>
        ) : (
          /* Tailored Results Report Page Dashboard View */
          <main className="max-w-4xl mx-auto px-6 py-12 space-y-8 animate-fadeIn" ref={reportRef}>
            {/* Savings Core Hero Banner */}
            <div className="bg-gradient-to-br from-indigo-950/50 via-purple-950/20 to-stone-950 border border-indigo-900/40 rounded-3xl p-6 md:p-10 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
              <div className="text-4xl mb-4">🏆</div>
              <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
                Operational Diagnostic Complete
              </h2>
              <p className="text-stone-400 text-sm max-w-xl mx-auto mb-8">
                We mapped your business bottlenecks against our custom operations neural frameworks. Below is your tailored deployment blueprint.
              </p>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-xl mx-auto bg-stone-950/60 border border-stone-800 p-6 rounded-2xl">
                <div className="text-center md:text-left shrink-0">
                  <div className="text-stone-500 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
                    ESTIMATED ANNUAL DIVIDEND
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-indigo-400 font-mono tracking-tight">
                    ${report.annualSavings.toLocaleString()}
                  </div>
                </div>
                <div className="hidden md:block h-10 w-px bg-stone-800" />
                <div className="text-stone-400 text-xs text-left leading-relaxed">
                  Calculated based on an average fully loaded labor standard of **$45/hr** and an target AI process efficiency rate of **85%** across active departments.
                </div>
              </div>
            </div>

            {/* Recommendations & Custom Workflows Grid */}
            <div className="bg-stone-900/20 border border-stone-800/80 rounded-2xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-mono font-bold text-indigo-400 tracking-widest uppercase">
                  📋 TOP 5 RECOMMENDED WORKFLOW BLUEPRINTS
                </h3>
                <span className="text-xs text-stone-500 font-mono">
                  {report.topWorkflows.length} OPPORTUNITIES MAPPED
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {report.topWorkflows.map((w, i) => (
                  <div 
                    key={w.workflow.id} 
                    className="bg-stone-950/40 border border-stone-800/60 hover:border-indigo-500/30 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-200 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-sm font-black text-indigo-400 group-hover:scale-105 transition-all">
                        {i + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="font-bold text-stone-200 group-hover:text-white transition-colors">
                            {w.workflow.name}
                          </h4>
                          <span className={`text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            w.priority === "quick-win" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            w.priority === "medium-term" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}>
                            {w.priority === "quick-win" ? "⚡ Quick Win" : w.priority === "medium-term" ? "📅 Medium" : "🏗️ Long-term"}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1.5 max-w-2xl leading-relaxed">
                          {w.workflow.description}
                        </p>
                        <div className="flex items-center gap-4 mt-3 text-[11px] font-mono text-stone-400">
                          <span className="text-indigo-400 font-bold">${w.estimatedAnnualSavings.toLocaleString()}/yr</span>
                          <span className="text-stone-700">•</span>
                          <span>Timeline: {w.implementationTime}</span>
                          <span className="text-stone-700">•</span>
                          <span>Impact Score: {w.impactScore}/10</span>
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/workflows/${w.workflow.id}`}
                      className="shrink-0 text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 border border-stone-800 bg-stone-900/30 rounded-lg px-3.5 py-2 text-center transition-all hover:bg-stone-900"
                    >
                      SPECIFICATIONS →
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Phased Roadmap Timeline UI */}
            <div className="bg-stone-900/20 border border-stone-800/80 rounded-2xl p-6 md:p-8">
              <h3 className="text-xs font-mono font-bold text-indigo-400 tracking-widest uppercase mb-6">
                🗺️ DEPLOYMENT ROADMAP SCHEDULE
              </h3>
              <div className="grid md:grid-cols-3 gap-6">
                {/* Quick Wins */}
                <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-emerald-400 mb-4 flex items-center gap-2">
                      <span>⚡</span> Phase 1: Quick Wins (2-4 wks)
                    </h4>
                    {report.roadmap.quickWins.length > 0 ? (
                      <ul className="space-y-3">
                        {report.roadmap.quickWins.slice(0, 4).map((w) => (
                          <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2 leading-relaxed">
                            <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                            <div>
                              <span className="font-semibold block">{w.workflow.name}</span>
                              <span className="text-[10px] text-stone-500 block font-mono">${w.estimatedAnnualSavings.toLocaleString()}/yr saved</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-stone-600 italic">No direct quick-wins detected.</p>
                    )}
                  </div>
                </div>

                {/* Medium Term */}
                <div className="bg-amber-950/10 border border-amber-900/30 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-amber-400 mb-4 flex items-center gap-2">
                      <span>📅</span> Phase 2: Medium-Term (4-8 wks)
                    </h4>
                    {report.roadmap.mediumTerm.length > 0 ? (
                      <ul className="space-y-3">
                        {report.roadmap.mediumTerm.slice(0, 4).map((w) => (
                          <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2 leading-relaxed">
                            <span className="text-amber-500 font-bold mt-0.5">→</span>
                            <div>
                              <span className="font-semibold block">{w.workflow.name}</span>
                              <span className="text-[10px] text-stone-500 block font-mono">${w.estimatedAnnualSavings.toLocaleString()}/yr saved</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-stone-600 italic">No medium-term opportunities.</p>
                    )}
                  </div>
                </div>

                {/* Long Term */}
                <div className="bg-rose-950/10 border border-rose-900/30 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-rose-400 mb-4 flex items-center gap-2">
                      <span>🏗️</span> Phase 3: Long-Term (8-16 wks)
                    </h4>
                    {report.roadmap.longTerm.length > 0 ? (
                      <ul className="space-y-3">
                        {report.roadmap.longTerm.slice(0, 4).map((w) => (
                          <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2 leading-relaxed">
                            <span className="text-rose-500 font-bold mt-0.5">◆</span>
                            <div>
                              <span className="font-semibold block">{w.workflow.name}</span>
                              <span className="text-[10px] text-stone-500 block font-mono">${w.estimatedAnnualSavings.toLocaleString()}/yr saved</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-stone-600 italic">No heavy custom roadmap required.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Integrations Grid */}
            {report.recommendedIntegrations.length > 0 && (
              <div className="bg-stone-900/20 border border-stone-800/80 rounded-2xl p-6 md:p-8">
                <h3 className="text-xs font-mono font-bold text-indigo-400 tracking-widest uppercase mb-5">
                  🔌 RECOMMENDED COMPATIBLE INTEGRATION POINTS
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {report.recommendedIntegrations.slice(0, 12).map((i) => (
                    <div key={i.name} className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-4 text-center hover:border-stone-700 transition-colors">
                      <div className="font-semibold text-xs text-stone-200">{i.name}</div>
                      <div className="text-[9px] text-indigo-400 font-mono mt-1 uppercase tracking-wider">{i.category}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* High Conversion CTAs */}
            <div className="bg-gradient-to-br from-indigo-950/40 via-purple-950/10 to-stone-950 border border-indigo-900/40 rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-500/5 to-transparent pointer-events-none" />
              <h3 className="text-2xl font-black text-white mb-3">Begin Operations Transition</h3>
              <p className="text-sm text-stone-400 mb-8 max-w-md mx-auto leading-relaxed">
                Connect your business endpoints to an autonomous team and reclaim hours. All blueprints include dedicated implementation audits.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href="https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg hover:shadow-[0_0_25px_rgba(99,102,241,0.4)]"
                >
                  🚀 DEPLOY AI TEAM — $750/MO
                </a>
                <Link
                  to="/contact"
                  className="w-full sm:w-auto px-7 py-3.5 bg-stone-900 border border-stone-800 hover:bg-stone-800 text-stone-200 text-sm font-bold rounded-xl transition-all"
                >
                  📞 SCHEDULE blueprint AUDIT
                </Link>
                <button
                  onClick={downloadPDF}
                  className="w-full sm:w-auto px-7 py-3.5 bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-300 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  📄 DOWNLOAD PDF BLUEPRINT
                </button>
              </div>
            </div>

            <div className="text-center pt-4">
              <button
                onClick={() => {
                  setReport(null);
                  setStep(0);
                  setAnswers(initialAnswers);
                }}
                className="text-xs font-mono font-bold text-stone-500 hover:text-stone-300 transition-colors"
              >
                [ RESET DIAGNOSTIC RUN ]
              </button>
            </div>
          </main>
        )}
      </div>

      {/* Footer bar */}
      <footer className="border-t border-stone-900 bg-stone-950/60 py-6 text-center text-xs font-mono text-stone-600">
        © 2026 Simpler Life 100 — Autonomous Operations Engineering.
      </footer>
    </div>
  );
}
