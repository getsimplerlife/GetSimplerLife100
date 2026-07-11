import { useState } from "react";

interface TimelineStep {
  week: string;
  title: string;
  benefit: string;
  description: string;
  details: string[];
  icon: string;
  color: string;
}

const steps: TimelineStep[] = [
  {
    week: "Week 1",
    title: "Discovery & Audit",
    benefit: "Value Mapping",
    description: "In 30 minutes, we analyze your current repetitive operations, map data flows, and identify top automation candidates with exact ROI models.",
    details: [
      "No-code pipeline discovery session",
      "Analysis of manual entry and transfer points",
      "Exact ROI and time-saved projection report",
      "Risk assessment and software compatibility check"
    ],
    icon: "🔍",
    color: "from-emerald-500 to-teal-500"
  },
  {
    week: "Week 2",
    title: "Workflow Design & Blueprinting",
    benefit: "Technical Architecture",
    description: "We map out the exact integration pathways, design human-in-the-loop check gates, and compile a custom Blueprint roadmap.",
    details: [
      "Custom flowchart of agent execution steps",
      "API payload schemas and field mappings",
      "Drafting fallback rules and confidence-score gates",
      "Security and encryption design sign-off"
    ],
    icon: "📐",
    color: "from-blue-500 to-indigo-500"
  },
  {
    week: "Week 3",
    title: "AI Agent Engineering & Sandbox Build",
    benefit: "Core Development",
    description: "Our engineers configure the agent loops, integrate with your sandbox APIs (CRM/ERP), and draft system prompts.",
    details: [
      "Prompt engineering and contextual memory setup",
      "Document processing parser training (OCR / Vision)",
      "Secure OAuth and connection routing setup",
      "Initial pipeline training runs on synthetic data"
    ],
    icon: "⚙️",
    color: "from-purple-500 to-pink-500"
  },
  {
    week: "Week 4",
    title: "Testing, Calibration & QA Gates",
    benefit: "Zero-Risk Deployment",
    description: "We run edge-case scenarios, audit error fallbacks, and calibrate safety guardrails to ensure 100% processing reliability.",
    details: [
      "Fuzzing inputs to test agent error-handling",
      "Validating human review trigger thresholds",
      "End-to-end performance latency optimization",
      "Compliance verification against company guidelines"
    ],
    icon: "🧪",
    color: "from-amber-500 to-orange-500"
  },
  {
    week: "Week 5",
    title: "Go-Live & Human-in-the-Loop Integration",
    benefit: "Continuous Operations",
    description: "We launch the AI agents into production. Your team is onboarded to review low-confidence tasks directly inside their portal.",
    details: [
      "Gradual production phase-in starting with 10% volume",
      "Team training on simple approval panels",
      "Real-time execution dashboard activation",
      "Slack / Teams notification triggers configured"
    ],
    icon: "🚀",
    color: "from-emerald-500 to-cyan-500"
  },
  {
    week: "Ongoing",
    title: "Continuous Optimization",
    benefit: "Self-Improving Intelligence",
    description: "Our platform monitors execution patterns, handles exception routing, and continuously updates agent prompt libraries.",
    details: [
      "Weekly analytics review and savings audits",
      "Auto-calibration of processing templates",
      "Adding support for new fields and suppliers",
      "Dedicated automation engineer support desk"
    ],
    icon: "📈",
    color: "from-teal-500 to-indigo-500"
  }
];

export function HowItWorksTimeline() {
  const [activeStep, setActiveStep] = useState<number | null>(0);

  return (
    <div className="space-y-12">
      <div className="text-center space-y-3">
        <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold rounded-full text-xs uppercase tracking-widest">
          The Implementation Playbook
        </span>
        <h2 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
          How We Get You Live in <span className="text-emerald-400">5 Weeks</span>
        </h2>
        <p className="text-stone-400 text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
          Going live with an AI Operations Team shouldn't take months. Our battle-tested process is designed for zero business disruption and maximum security.
        </p>
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-8">
        {/* Decorative central line */}
        <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500/80 via-blue-500/50 to-stone-800 pointer-events-none transform md:-translate-x-1/2" />

        <div className="space-y-12 md:space-y-16 relative">
          {steps.map((step, idx) => {
            const isEven = idx % 2 === 0;
            const isActive = activeStep === idx;

            return (
              <div
                key={idx}
                className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-8 md:gap-4 relative group`}
              >
                {/* Dot anchor */}
                <div
                  onClick={() => setActiveStep(isActive ? null : idx)}
                  className={`absolute left-8 md:left-1/2 h-10 w-10 rounded-full border-4 cursor-pointer z-30 transform -translate-x-1/2 flex items-center justify-center font-bold text-lg transition-all duration-500 shadow-lg ${
                    isActive
                      ? "bg-stone-950 border-emerald-500 text-emerald-400 scale-125 ring-4 ring-emerald-500/10"
                      : "bg-stone-900 border-stone-800 text-stone-500 group-hover:border-stone-700"
                  }`}
                >
                  <span className="text-xs font-mono font-black">{idx + 1}</span>
                </div>

                {/* Left card (Even indices) */}
                <div
                  className={`w-full md:w-[45%] pl-16 md:pl-0 ${
                    isEven ? "md:text-right" : "md:order-2 md:text-left"
                  }`}
                >
                  <div
                    onClick={() => setActiveStep(isActive ? null : idx)}
                    className={`cursor-pointer text-left p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden bg-stone-900/40 hover:bg-stone-900/70 ${
                      isActive
                        ? "border-emerald-500/30 shadow-xl shadow-emerald-950/10"
                        : "border-stone-800/80 hover:border-stone-700"
                    }`}
                  >
                    {/* Glowing corner gradient */}
                    <div
                      className={`absolute -top-12 -right-12 h-24 w-24 rounded-full bg-gradient-to-br ${step.color} opacity-10 filter blur-xl transition-all duration-500 group-hover:scale-150`}
                    />

                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl filter drop-shadow">{step.icon}</span>
                      <div className="flex-1">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                          {step.week}
                        </span>
                        <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors">
                          {step.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-stone-400 text-xs leading-relaxed mt-2">
                      {step.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-2 py-0.5 bg-stone-950/80 border border-stone-800 text-[10px] font-mono font-bold text-stone-400 rounded">
                        🚀 {step.benefit}
                      </span>
                    </div>

                    {/* Animated arrow hint */}
                    <div className="mt-4 text-[11px] font-mono font-bold text-stone-500 flex items-center gap-1 hover:text-emerald-400 transition-colors">
                      <span>{isActive ? "Hide details ▲" : "Expand details ▼"}</span>
                    </div>
                  </div>
                </div>

                {/* Right card (Odd indices or details lists) */}
                <div
                  className={`w-full md:w-[45%] pl-16 md:pl-0 ${
                    isEven ? "md:order-2" : ""
                  } ${isActive ? "opacity-100 block" : "hidden md:opacity-40 md:block pointer-events-none md:pointer-events-auto"}`}
                >
                  <div className="p-6 rounded-3xl border border-stone-850/60 bg-stone-900/15 backdrop-blur-sm space-y-4">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-stone-500">
                      [ Key Deliverables ]
                    </h4>
                    <ul className="space-y-2.5">
                      {step.details.map((detail, dIdx) => (
                        <li key={dIdx} className="flex items-start gap-2.5 text-xs text-stone-400 leading-relaxed">
                          <span className="text-emerald-500 font-black mt-0.5">✓</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
