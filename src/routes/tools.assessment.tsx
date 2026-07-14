import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { assessmentQuestions, runAssessment, generateReportText, type AssessmentAnswers, type AssessmentReport } from "../tools/assessment-engine";
import { workflows } from "../content/workflows";

export const Route = createFileRoute("/tools/assessment")({
  component: AutomationAssessment,
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

function AutomationAssessment() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AssessmentAnswers>(initialAnswers);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
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
    if (q.type === "text") return val.trim().length > 5;
    if (q.type === "multi") return Array.isArray(val) && val.length > 0;
    if (q.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val || "");
    return val !== "";
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

    // Title
    pdf.setFontSize(22);
    pdf.setTextColor(0, 200, 150);
    pdf.text("AI Automation Assessment", pageWidth / 2, y, { align: "center" });
    y += 10;
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${report.reportDate}`, pageWidth / 2, y, { align: "center" });
    y += 8;
    pdf.text(`Industry: ${report.industry}  |  Size: ${report.companySize} employees`, pageWidth / 2, y, { align: "center" });
    y += 15;

    // Executive Summary
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Executive Summary", 20, y);
    y += 8;
    pdf.setFontSize(12);
    pdf.setTextColor(50);
    pdf.text(`Estimated Annual Savings: $${report.annualSavings.toLocaleString()}`, 20, y);
    y += 7;
    pdf.text(`Top Opportunities: ${report.topWorkflows.length} workflows identified`, 20, y);
    y += 12;

    // Top 5 Workflows
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Top 5 Workflows to Automate", 20, y);
    y += 10;
    pdf.setFontSize(11);

    report.topWorkflows.forEach((w, i) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.setFontSize(12);
      pdf.setTextColor(0, 180, 130);
      pdf.text(`${i + 1}. ${w.workflow.name}`, 25, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setTextColor(80);
      pdf.text(`Impact Score: ${w.impactScore}  |  Est. Savings: $${w.estimatedAnnualSavings.toLocaleString()}/yr  |  Timeline: ${w.implementationTime}`, 30, y);
      y += 5;
      pdf.text(w.workflow.description.substring(0, 100) + "...", 30, y);
      y += 8;
    });
    y += 5;

    // Roadmap
    if (y > 240) { pdf.addPage(); y = 20; }
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Implementation Roadmap", 20, y);
    y += 10;

    pdf.setFontSize(13);
    pdf.setTextColor(0, 180, 50);
    pdf.text("Quick Wins (2-4 weeks)", 20, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setTextColor(80);
    report.roadmap.quickWins.slice(0, 4).forEach((w) => {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(`  ✓ ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr`, 25, y);
      y += 5;
    });
    y += 5;

    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setFontSize(13);
    pdf.setTextColor(200, 150, 0);
    pdf.text("Medium-Term (4-8 weeks)", 20, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setTextColor(80);
    report.roadmap.mediumTerm.slice(0, 4).forEach((w) => {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(`  → ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr`, 25, y);
      y += 5;
    });
    y += 5;

    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setFontSize(13);
    pdf.setTextColor(200, 50, 50);
    pdf.text("Long-Term (8-16 weeks)", 20, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setTextColor(80);
    report.roadmap.longTerm.slice(0, 4).forEach((w) => {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(`  ◆ ${w.workflow.name} — $${w.estimatedAnnualSavings.toLocaleString()}/yr`, 25, y);
      y += 5;
    });
    y += 8;

    // Integrations
    if (y > 240) { pdf.addPage(); y = 20; }
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Recommended Integrations", 20, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.setTextColor(80);
    report.recommendedIntegrations.slice(0, 10).forEach((i) => {
      if (y > 280) { pdf.addPage(); y = 20; }
      pdf.text(`  • ${i.name} — ${i.category}`, 25, y);
      y += 5;
    });
    y += 10;

    // CTA
    if (y > 260) { pdf.addPage(); y = 20; }
    pdf.setFontSize(14);
    pdf.setTextColor(0, 200, 150);
    pdf.text("Ready to get started?", pageWidth / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(11);
    pdf.setTextColor(100);
    pdf.text("Schedule a discovery call: https://simplerlife100.ctonew.app/contact", pageWidth / 2, y, { align: "center" });

    pdf.save("ai-automation-assessment.pdf");
  };

  // ── Progress Bar ──────────────────────────────────────────────────────
  const progress = ((step + (report ? 1 : 0)) / (totalSteps + 1)) * 100;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Header */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-4">
          🏆 KILLER FEATURE
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          AI Automation <span className="text-emerald-400">Assessment</span>
        </h1>
        <p className="text-stone-400 text-sm max-w-xl mx-auto">
          Answer 10 quick questions and get a tailored automation report with savings estimates and a phased implementation roadmap.
        </p>
      </section>

      {/* Progress Bar */}
      <div className="max-w-2xl mx-auto px-6 mb-6">
        <div className="flex justify-between text-[10px] font-mono text-stone-600 mb-2">
          <span>Assessment</span>
          <span>{report ? "Complete!" : `Step ${step + 1} of ${totalSteps}`}</span>
        </div>
        <div className="h-1.5 bg-stone-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {!report ? (
        <>
          {/* Question Card */}
          <section className="max-w-2xl mx-auto px-6 pb-20">
            <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 md:p-8">
              {/* Question */}
              <div className="mb-2 text-[10px] font-mono text-emerald-500 font-bold tracking-wider">
                QUESTION {step + 1} OF {totalSteps}
              </div>
              <h2 className="text-xl font-bold mb-1">{assessmentQuestions[step].question}</h2>
              {assessmentQuestions[step].description && (
                <p className="text-xs text-stone-500 mb-6">{assessmentQuestions[step].description}</p>
              )}

              {/* Options */}
              {assessmentQuestions[step].type === "single" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {assessmentQuestions[step].options?.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateAnswer(assessmentQuestions[step].id, opt.value)}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                        (answers as any)[assessmentQuestions[step].id] === opt.value
                          ? "bg-emerald-950/40 border-emerald-700 text-emerald-300"
                          : "bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                      }`}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {assessmentQuestions[step].type === "multi" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {assessmentQuestions[step].options?.map((opt) => {
                    const selected = ((answers as any)[assessmentQuestions[step].id] as string[] || []).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleMulti(assessmentQuestions[step].id, opt.value)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          selected
                            ? "bg-emerald-950/40 border-emerald-700 text-emerald-300"
                            : "bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs ${
                          selected ? "bg-emerald-600 border-emerald-600 text-white" : "border-stone-700"
                        }`}>
                          {selected ? "✓" : ""}
                        </span>
                        <span className="text-xl">{opt.icon}</span>
                        <span className="text-sm font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {assessmentQuestions[step].type === "text" && (
                <div>
                  <textarea
                    value={(answers as any)[assessmentQuestions[step].id] || ""}
                    onChange={(e) => updateAnswer(assessmentQuestions[step].id, e.target.value)}
                    placeholder={assessmentQuestions[step].placeholder}
                    className="w-full h-28 bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-stone-200 placeholder-stone-600 outline-none focus:border-emerald-700 resize-none font-medium leading-relaxed"
                  />
                  <p className="text-[10px] text-stone-600 mt-2">
                    Be specific — mention systems, people, and frequency for the best recommendations
                  </p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  disabled={step === 0}
                  className="px-5 py-2.5 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-900 disabled:text-stone-600 text-stone-200 font-bold text-sm rounded-xl transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-500 text-black font-bold text-sm rounded-xl transition-all"
                >
                  {step < totalSteps - 1 ? "Next →" : generating ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      Generating Report...
                    </span>
                  ) : "Generate Report →"}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Results */}
          <section className="max-w-4xl mx-auto px-6 pb-20 space-y-6" ref={reportRef}>
            {/* Savings Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 to-stone-900/80 border border-emerald-900/50 rounded-2xl p-6 md:p-8 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-2xl md:text-3xl font-black mb-2">
                Your Automated Future
              </h2>
              <p className="text-stone-400 text-sm mb-6 max-w-lg mx-auto">
                Based on your responses, here's your personalized automation roadmap.
              </p>
              <div className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-900/30 border border-emerald-800/50 rounded-2xl">
                <span className="text-3xl font-black text-emerald-400">${report.annualSavings.toLocaleString()}</span>
                <span className="text-stone-400 text-sm font-medium">estimated annual savings</span>
              </div>
            </div>

            {/* Top 5 Workflows */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6">
              <h3 className="text-sm font-mono font-bold text-emerald-400 tracking-wide mb-4">
                📋 TOP 5 WORKFLOWS TO AUTOMATE
              </h3>
              <div className="space-y-3">
                {report.topWorkflows.map((w, i) => (
                  <div key={w.workflow.id} className="bg-stone-950/60 border border-stone-800/60 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-900/30 border border-emerald-800/50 flex items-center justify-center text-sm font-bold text-emerald-400 shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-stone-200">{w.workflow.name}</h4>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          w.priority === "quick-win" ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50" :
                          w.priority === "medium-term" ? "bg-amber-900/30 text-amber-400 border border-amber-800/50" :
                          "bg-red-900/30 text-red-400 border border-red-800/50"
                        }`}>
                          {w.priority === "quick-win" ? "⚡ Quick Win" : w.priority === "medium-term" ? "📅 Medium" : "🏗️ Long-term"}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-1 line-clamp-2">{w.workflow.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className="text-emerald-400 font-bold">${w.estimatedAnnualSavings.toLocaleString()}/yr</span>
                        <span className="text-stone-600">•</span>
                        <span className="text-stone-500">{w.implementationTime}</span>
                        <span className="text-stone-600">•</span>
                        <span className="text-stone-500">Score: {w.impactScore}</span>
                      </div>
                    </div>
                    <a
                      href={`/workflows/${w.workflow.id}`}
                      className="text-emerald-400 hover:text-emerald-300 text-xs font-bold shrink-0 mt-1"
                    >
                      Details →
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Roadmap */}
            <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6">
              <h3 className="text-sm font-mono font-bold text-stone-400 tracking-wide mb-4">
                🗺️ IMPLEMENTATION ROADMAP
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                {/* Quick Wins */}
                <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-emerald-400 mb-3">⚡ Quick Wins (2-4 weeks)</h4>
                  {report.roadmap.quickWins.length > 0 ? (
                    <ul className="space-y-2">
                      {report.roadmap.quickWins.slice(0, 5).map((w) => (
                        <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2">
                          <span className="text-emerald-400 mt-0.5">✓</span>
                          <div>
                            <span className="font-medium">{w.workflow.name}</span>
                            <span className="text-stone-500 block">${w.estimatedAnnualSavings.toLocaleString()}/yr</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">No quick wins identified for your profile</p>
                  )}
                </div>

                {/* Medium Term */}
                <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-amber-400 mb-3">📅 Medium-Term (4-8 weeks)</h4>
                  {report.roadmap.mediumTerm.length > 0 ? (
                    <ul className="space-y-2">
                      {report.roadmap.mediumTerm.slice(0, 5).map((w) => (
                        <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">→</span>
                          <div>
                            <span className="font-medium">{w.workflow.name}</span>
                            <span className="text-stone-500 block">${w.estimatedAnnualSavings.toLocaleString()}/yr</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">No medium-term items</p>
                  )}
                </div>

                {/* Long Term */}
                <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-red-400 mb-3">🏗️ Long-Term (8-16 weeks)</h4>
                  {report.roadmap.longTerm.length > 0 ? (
                    <ul className="space-y-2">
                      {report.roadmap.longTerm.slice(0, 5).map((w) => (
                        <li key={w.workflow.id} className="text-xs text-stone-300 flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">◆</span>
                          <div>
                            <span className="font-medium">{w.workflow.name}</span>
                            <span className="text-stone-500 block">${w.estimatedAnnualSavings.toLocaleString()}/yr</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-500 italic">No long-term items</p>
                  )}
                </div>
              </div>
            </div>

            {/* Integrations */}
            {report.recommendedIntegrations.length > 0 && (
              <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6">
                <h3 className="text-sm font-mono font-bold text-stone-400 tracking-wide mb-4">
                  🔌 RECOMMENDED INTEGRATIONS
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.recommendedIntegrations.map((i) => (
                    <span key={i.name} className="px-3 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-medium">
                      {i.name}
                      <span className="text-stone-600 ml-1">({i.category})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="bg-gradient-to-br from-emerald-950/30 to-stone-900/60 border border-emerald-900/40 rounded-2xl p-6 text-center">
              <h3 className="text-lg font-bold text-emerald-400 mb-2">Ready to Get Started?</h3>
              <p className="text-sm text-stone-400 mb-6 max-w-md mx-auto">
                Deploy your first AI agent and start saving hours within weeks.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-6 py-3 rounded-xl transition-all"
                >
                  🚀 Deploy Now — $750/mo
                </a>
                <a
                  href="/contact"
                  className="bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold px-6 py-3 rounded-xl transition-all"
                >
                  📞 Schedule Discovery Call
                </a>
                <button
                  onClick={downloadPDF}
                  className="bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 text-sm font-bold px-6 py-3 rounded-xl transition-all"
                >
                  📄 Download PDF Report
                </button>
              </div>
            </div>

            <div className="text-center">
              <a
                href="/tools"
                className="text-xs text-stone-600 hover:text-stone-400 font-mono transition-all"
              >
                ← Back to all tools
              </a>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
