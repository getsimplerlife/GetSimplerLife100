import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/demos/workflows")({
  component: WorkflowsDemoPage,
});

// Presets for the Email Demo
const emailPresets = [
  {
    label: "Customer Billing Inquiry",
    content: `From: sarah.jones@acme.com
Subject: Discrepancy on invoice INV-2026-882

Hi Simpler Life team,
We received our invoice for June and noticed we were billed for 15 operator seats instead of the 12 we agreed upon in our contract change order. Can you please correct this and send an updated PDF? We'd like to process this payment by end of day Friday.

Thanks,
Sarah Jones
Ops Director, ACME Corp`
  },
  {
    label: "Urgent Supplier Delay",
    content: `From: logistics@globalmetals.org
Subject: SUPPLY CHAIN ALERT: Delay on Order #MET-991

Dear Team,
Due to unexpected labor shortages at our Rotterdam port facility, shipment MET-991 containing your high-grade aluminum bars has been delayed by 12 business days. Revised ETA at your Chicago plant is now July 28th. Please update your master production schedules accordingly.

Warm regards,
Marcus Vance
Global Metals Logistics`
  }
];

// Presets for the Invoice Demo
const invoicePresets = [
  {
    label: "Standard Parts Invoice",
    filename: "INV-PART-9021.pdf",
    content: `INVOICE TO: Simpler Life 100 Chicago
FROM: Apex Machinery Supply Inc.
DATE: July 10, 2026

Items:
1. Carbide End Mill 1/2" - Qty 10 @ $45.00 ea = $450.00
2. Precision HSS Drill Bit Set - Qty 2 @ $125.00 ea = $250.00
3. Shipping & Handling = $45.00

TOTAL DUE: $745.00
PO Reference: PO-2026-9081`
  },
  {
    label: "Enterprise Consulting Invoice",
    filename: "CON-SVCS-008.pdf",
    content: `INVOICE TO: Simpler Life 100 Enterprise
FROM: McKinsey Operations Advisors
DATE: July 08, 2026

Items:
1. Operational Architecture Assessment - 40 hours @ $250/hr = $10,000.00
2. Automation Feasibility Blueprint - 20 hours @ $250/hr = $5,000.00

TOTAL DUE: $15,000.00
PO Reference: PO-McKinsey-77A`
  }
];

// Presets for the CRM Update Demo
const crmPresets = [
  {
    label: "Enterprise Upgrade Call",
    content: `Call Transcript - John (Acme Corp) & Rep:
"Spoke to John from Acme. He confirmed they had a board meeting and approved upgrading their subscription from the standard tier to Enterprise starting next Monday. They want to provision 45 additional seats for their EMEA logistics division. Budget approved is up to $8,500/month. He requested that we send the formal addendum to his email (j.jones@acme.com) by Thursday morning so his legal team can sign off."`
  },
  {
    label: "Discovery Meeting Notes",
    content: `Notes from initial consult with Sarah (Pacific Logistics):
- Company size: 240 staff, 80 manual dispatcher roles
- Major pain: Dispatchers spending 3 hours/day copying container IDs from emails into outdated terminal software
- Systems used: Salesforce CRM, legacy AS400 terminal emulator, Slack
- Next Step: Schedule a deep-dive operational audit on Tuesday at 2 PM. She is very hot to buy before the end of Q3.`
  }
];

function WorkflowsDemoPage() {
  const [activeTab, setActiveTab] = useState<"email" | "invoice" | "crm">("email");
  const [simulationState, setSimulationState] = useState<"idle" | "running" | "done">("idle");
  const [currentStep, setCurrentStep] = useState(0);

  // Email Demo states
  const [emailText, setEmailText] = useState(emailPresets[0].content);
  const [emailLogs, setEmailLogs] = useState<string[]>([]);
  const [emailExtracted, setEmailExtracted] = useState<any>(null);
  const [emailDraft, setEmailDraft] = useState("");

  // Invoice Demo states
  const [invoiceText, setInvoiceText] = useState(invoicePresets[0].content);
  const [invoiceLogs, setInvoiceLogs] = useState<string[]>([]);
  const [invoiceExtracted, setInvoiceExtracted] = useState<any>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<"pending" | "matched" | "flagged" | "approved">("pending");

  // CRM Demo states
  const [crmText, setCrmText] = useState(crmPresets[0].content);
  const [crmLogs, setCrmLogs] = useState<string[]>([]);
  const [crmExtracted, setCrmExtracted] = useState<any>(null);

  // Clear states when switching tabs
  const handleTabChange = (tab: "email" | "invoice" | "crm") => {
    setActiveTab(tab);
    setSimulationState("idle");
    setCurrentStep(0);
    setEmailLogs([]);
    setInvoiceLogs([]);
    setCrmLogs([]);
    setEmailExtracted(null);
    setInvoiceExtracted(null);
    setCrmExtracted(null);
    setInvoiceStatus("pending");
  };

  // Run Email Simulation pipeline
  const runEmailSimulation = () => {
    setSimulationState("running");
    setCurrentStep(1);
    setEmailLogs(["[1/4] Ingesting incoming message...", "Analyzing sender reputation and SPF/DKIM flags: PASS"]);

    setTimeout(() => {
      setCurrentStep(2);
      setEmailLogs(prev => [
        ...prev,
        "[2/4] Classifying intent using fine-tuned NLP...",
        `Intent identified: ${emailText.includes("invoice") ? "Billing/Invoicing Inquiry" : "Supplier Logistical Delay"}`
      ]);
    }, 1500);

    setTimeout(() => {
      setCurrentStep(3);
      setEmailLogs(prev => [
        ...prev,
        "[3/4] Extracting operational entities...",
        "Identifying transaction keys and metadata..."
      ]);
      
      if (emailText.includes("invoice")) {
        setEmailExtracted({
          sender: "Sarah Jones",
          company: "ACME Corp",
          documentId: "INV-2026-882",
          discrepancyType: "Billing discrepancy (billed 15 seats, contract specifies 12)",
          priority: "High"
        });
      } else {
        setEmailExtracted({
          sender: "Marcus Vance",
          company: "Global Metals",
          documentId: "Order #MET-991",
          discrepancyType: "Supply chain delay (12 business days delay, new ETA July 28th)",
          priority: "Urgent"
        });
      }
    }, 3000);

    setTimeout(() => {
      setCurrentStep(4);
      setEmailLogs(prev => [
        ...prev,
        "[4/4] Draft replying and preparing context-rich draft response...",
        "Applying corporate tone-of-voice and SLAs..."
      ]);

      if (emailText.includes("invoice")) {
        setEmailDraft(`Subject: Re: Discrepancy on invoice INV-2026-882

Dear Sarah,

Thank you for bringing this discrepancy to our attention. I have immediately cross-referenced our Contract Change Order record with Invoice INV-2026-882 and verified that the charge for 15 operator seats is incorrect. Your contract establishes a baseline of 12 seats.

I have updated our accounts receivable records, corrected the invoice to reflect 12 operator seats, and generated a revised PDF (attached below). The corrected total due has been updated from the original balance.

We appreciate ACME Corp's continued partnership. Please let me know if you require any additional support.

Best regards,
Operations Auto-Assistant
Simpler Life 100`);
      } else {
        setEmailDraft(`Subject: Update: Scheduled Production Mitigation for MET-991

Dear Manufacturing Team & Production Lead,

We have processed a high-priority logistical delay notification regarding Aluminum Bar Order #MET-991 from Global Metals.

- Event: Port labor bottleneck in Rotterdam
- Delay Magnitude: 12 business days
- Revised Plant Delivery ETA: July 28th

I have automatically triggered our master production scheduler and identified that Job orders #M-102 and #M-114 rely on this shipment. I have pre-drafted scheduling mitigations to shift assembly queue priorities to steel fabrication until July 28th, avoiding 48 hours of estimated line stoppage.

Please confirm the schedule shift in the portal.

Best regards,
Supply Chain Auto-Assistant
Simpler Life 100`);
      }
      setSimulationState("done");
    }, 4500);
  };

  // Run Invoice Simulation pipeline
  const runInvoiceSimulation = () => {
    setSimulationState("running");
    setCurrentStep(1);
    setInvoiceLogs(["[1/4] Ingesting document invoice text...", "Running OCR text boundary projection..."]);

    setTimeout(() => {
      setCurrentStep(2);
      setInvoiceLogs(prev => [
        ...prev,
        "[2/4] Parsing document schema and validating structure...",
        "Identifying lines items and extracting line array..."
      ]);
      
      if (invoiceText.includes("Apex")) {
        setInvoiceExtracted({
          vendor: "Apex Machinery Supply Inc.",
          invoiceDate: "July 10, 2026",
          poRef: "PO-2026-9081",
          total: "$745.00",
          items: [
            "Carbide End Mill 1/2\" (Qty 10) - $450.00",
            "Precision HSS Drill Set (Qty 2) - $250.00",
            "Shipping - $45.00"
          ]
        });
      } else {
        setInvoiceExtracted({
          vendor: "McKinsey Operations Advisors",
          invoiceDate: "July 08, 2026",
          poRef: "PO-McKinsey-77A",
          total: "$15,000.00",
          items: [
            "Operational Assessment (40 hrs) - $10,000.00",
            "Automation Blueprint (20 hrs) - $5,000.00"
          ]
        });
      }
    }, 1500);

    setTimeout(() => {
      setCurrentStep(3);
      setInvoiceLogs(prev => [
        ...prev,
        "[3/4] Cross-checking purchase order (PO) reference in ERP ledger..."
      ]);

      if (invoiceText.includes("Apex")) {
        setInvoiceLogs(prev => [
          ...prev,
          "MATCH SUCCESS: Purchase Order PO-2026-9081 exists and matches line pricing and quantities exactly."
        ]);
        setInvoiceStatus("matched");
      } else {
        setInvoiceLogs(prev => [
          ...prev,
          "WARNING FLAG: PO Reference 'PO-McKinsey-77A' is missing database authorization signature or is over spending threshold ($10,000 baseline)."
        ]);
        setInvoiceStatus("flagged");
      }
    }, 3000);

    setTimeout(() => {
      setCurrentStep(4);
      setInvoiceLogs(prev => [
        ...prev,
        "[4/4] Executing downstream ledger sync actions..."
      ]);

      if (invoiceText.includes("Apex")) {
        setInvoiceLogs(prev => [
          ...prev,
          "SUCCESS: Invoice pre-approved and queued in Accounts Payable. Sync complete."
        ]);
        setInvoiceStatus("approved");
      } else {
        setInvoiceLogs(prev => [
          ...prev,
          "ROUTING HOLD: Routed invoice INV-McKinsey to VP of Operations for secondary manual review override."
        ]);
      }
      setSimulationState("done");
    }, 4500);
  };

  // Run CRM Simulation pipeline
  const runCRMSimulation = () => {
    setSimulationState("running");
    setCurrentStep(1);
    setCrmLogs(["[1/3] Parsing transcript audio-text boundary...", "Isolating customer intent tags..."]);

    setTimeout(() => {
      setCurrentStep(2);
      setCrmLogs(prev => [
        ...prev,
        "[2/3] Performing entity-relation mapping...",
        "Identifying action triggers and deadlines..."
      ]);

      if (crmText.includes("John")) {
        setCrmExtracted({
          contact: "John Jones",
          company: "Acme Corp",
          actionTrigger: "Subscription Upgrade",
          updates: {
            tier: "Enterprise (EMEA Logistics)",
            seats: "+45 additional seats",
            newMonthlyValue: "$8,500/month",
            effectiveDate: "Next Monday"
          },
          downstreamTask: "Generate custom formal contract addendum by Thursday AM"
        });
      } else {
        setCrmExtracted({
          contact: "Sarah Vance",
          company: "Pacific Logistics",
          actionTrigger: "New Business Lead",
          updates: {
            leadSource: "Discovery Consult",
            staffCount: "240 dispatchers",
            majorPain: "3 hours manual dispatch duplicate container keying per dispatcher",
            systems: "Salesforce CRM, Legacy AS400, Slack"
          },
          downstreamTask: "Schedule 2-hour Technical Audit Tuesday at 2:00 PM"
        });
      }
    }, 1500);

    setTimeout(() => {
      setCurrentStep(3);
      setCrmLogs(prev => [
        ...prev,
        "[3/3] Synchronizing fields across internal business endpoints...",
        "Wrote record updates to CRM Database.",
        "Slack alert successfully dispatched to Sales channel (#team-deals)."
      ]);
      setSimulationState("done");
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-500 selection:text-stone-950">
      
      {/* Header */}
      <header className="px-6 py-6 border-b border-stone-900 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-emerald-500 tracking-tight flex items-center gap-2">
            <span>⚡</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs font-black bg-stone-900 text-stone-400 px-3 py-1.5 rounded-xl border border-stone-850 uppercase tracking-widest hidden sm:inline">
              Simulation Portal
            </span>
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">
              Exit Demo
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 py-12 lg:py-16 px-6 max-w-7xl mx-auto w-full space-y-12">
        
        {/* Intro */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            Interactive AI Playgrounds
          </span>
          <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            See AI Operations in Action
          </h1>
          <p className="text-stone-400 text-sm md:text-base leading-relaxed">
            Run real-time animated simulations showing exactly how our industry-specific AI Operations Teams ingest data, classify intent, extract parameters, and execute downstream operations automatically.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex justify-center border-b border-stone-900 pb-1 max-w-xl mx-auto">
          <div className="grid grid-cols-3 gap-2 w-full">
            <button
              onClick={() => handleTabChange("email")}
              className={`py-3 text-xs font-black uppercase tracking-wider rounded-2xl border transition-all ${
                activeTab === "email"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-md shadow-emerald-500/5"
                  : "border-transparent text-stone-400 hover:text-white"
              }`}
            >
              ✉️ Email Assistant
            </button>
            <button
              onClick={() => handleTabChange("invoice")}
              className={`py-3 text-xs font-black uppercase tracking-wider rounded-2xl border transition-all ${
                activeTab === "invoice"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-md shadow-emerald-500/5"
                  : "border-transparent text-stone-400 hover:text-white"
              }`}
            >
              📄 Invoice AP Auto
            </button>
            <button
              onClick={() => handleTabChange("crm")}
              className={`py-3 text-xs font-black uppercase tracking-wider rounded-2xl border transition-all ${
                activeTab === "crm"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-md shadow-emerald-500/5"
                  : "border-transparent text-stone-400 hover:text-white"
              }`}
            >
              💼 CRM Data Sync
            </button>
          </div>
        </div>

        {/* Interactive Layout of Selected Demo Tab */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Panel: Inputs and Controls (5 columns) */}
          <div className="lg:col-span-5 bg-stone-900/40 rounded-3xl p-6 border border-stone-850 space-y-6">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                {activeTab === "email" && "✉️ Simulate Email Ingest"}
                {activeTab === "invoice" && "📄 Simulate AP Invoice"}
                {activeTab === "crm" && "💼 Simulate Deal Transcript Sync"}
              </h3>
              <p className="text-xs text-stone-400 mt-1">
                Select a preset configuration below or enter custom text to test the intelligence boundaries of our operation models.
              </p>
            </div>

            {/* Presets List */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Available Presets</span>
              <div className="flex flex-wrap gap-2">
                {activeTab === "email" &&
                  emailPresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setEmailText(preset.content);
                        setSimulationState("idle");
                        setCurrentStep(0);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-stone-800 bg-stone-950/40 text-stone-300 hover:border-emerald-500/30 hover:text-emerald-400 text-xs font-bold transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                {activeTab === "invoice" &&
                  invoicePresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setInvoiceText(preset.content);
                        setSimulationState("idle");
                        setCurrentStep(0);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-stone-800 bg-stone-950/40 text-stone-300 hover:border-emerald-500/30 hover:text-emerald-400 text-xs font-bold transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                {activeTab === "crm" &&
                  crmPresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setCrmText(preset.content);
                        setSimulationState("idle");
                        setCurrentStep(0);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-stone-800 bg-stone-950/40 text-stone-300 hover:border-emerald-500/30 hover:text-emerald-400 text-xs font-bold transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
              </div>
            </div>

            {/* Ingestion Content Box */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Input Raw Content</span>
              {activeTab === "email" && (
                <textarea
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                  className="w-full h-64 p-4 rounded-2xl border border-stone-850 bg-stone-950 text-stone-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all leading-relaxed"
                />
              )}
              {activeTab === "invoice" && (
                <textarea
                  value={invoiceText}
                  onChange={(e) => setInvoiceText(e.target.value)}
                  className="w-full h-64 p-4 rounded-2xl border border-stone-850 bg-stone-950 text-stone-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all leading-relaxed"
                />
              )}
              {activeTab === "crm" && (
                <textarea
                  value={crmText}
                  onChange={(e) => setCrmText(e.target.value)}
                  className="w-full h-64 p-4 rounded-2xl border border-stone-850 bg-stone-950 text-stone-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all leading-relaxed"
                />
              )}
            </div>

            {/* Run Trigger */}
            <button
              onClick={() => {
                if (activeTab === "email") runEmailSimulation();
                if (activeTab === "invoice") runInvoiceSimulation();
                if (activeTab === "crm") runCRMSimulation();
              }}
              disabled={simulationState === "running"}
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm transition-all shadow-lg hover:shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {simulationState === "running" ? (
                <>
                  <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  Running AI Pipeline...
                </>
              ) : (
                <>⚡ Execute Live Simulation</>
              )}
            </button>
          </div>

          {/* Right Panel: Simulated Live Pipeline Visualization (7 columns) */}
          <div className="lg:col-span-7 bg-stone-900 border border-stone-850 rounded-[2rem] p-6 lg:p-8 shadow-2xl relative overflow-hidden space-y-8">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex justify-between items-center border-b border-stone-850 pb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>🖥️</span> Execution Monitoring Console
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                simulationState === "running"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : simulationState === "done"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-stone-850 text-stone-500"
              }`}>
                {simulationState === "running" && "SIMULATING_RUN"}
                {simulationState === "done" && "EXEC_COMPLETE"}
                {simulationState === "idle" && "STANDBY"}
              </span>
            </div>

            {/* Display State when simulation is completely idle */}
            {simulationState === "idle" && (
              <div className="text-center py-20 border border-dashed border-stone-800 rounded-3xl bg-stone-950/10">
                <span className="text-4xl">🚀</span>
                <h4 className="text-sm font-bold text-white mt-4">Waiting to start simulation</h4>
                <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
                  Click the "Execute Live Simulation" button on the left to see the step-by-step AI operations workflow.
                </p>
              </div>
            )}

            {/* Step Pipeline Progress (Shown during or after execution) */}
            {simulationState !== "idle" && (
              <div className="space-y-6">
                
                {/* Simulated Logs Terminal */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 font-mono text-[11px] text-emerald-400 space-y-1.5 h-36 overflow-y-auto leading-relaxed shadow-inner">
                  {activeTab === "email" && emailLogs.map((log, i) => <div key={i}>{log}</div>)}
                  {activeTab === "invoice" && invoiceLogs.map((log, i) => <div key={i}>{log}</div>)}
                  {activeTab === "crm" && crmLogs.map((log, i) => <div key={i}>{log}</div>)}
                  {simulationState === "running" && (
                    <div className="flex items-center gap-1 text-stone-500 animate-pulse mt-1">
                      <span>_</span>
                    </div>
                  )}
                </div>

                {/* Main Visual Pipeline Steps */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-stone-400">Pipeline Stages</h4>
                  
                  {activeTab === "email" && (
                    <div className="grid gap-3">
                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 1 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">01</span>
                          <span className="text-xs font-bold text-stone-200">Email Ingestion</span>
                        </div>
                        {currentStep > 1 ? <span className="text-emerald-400 text-xs">✔ Ingested</span> : currentStep === 1 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 2 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">02</span>
                          <span className="text-xs font-bold text-stone-200">Cognitive Classification</span>
                        </div>
                        {currentStep > 2 ? <span className="text-emerald-400 text-xs">✔ Classified</span> : currentStep === 2 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 3 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">03</span>
                          <span className="text-xs font-bold text-stone-200">Entity Extraction & Structured NLP</span>
                        </div>
                        {currentStep > 3 ? <span className="text-emerald-400 text-xs">✔ Extracted</span> : currentStep === 3 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 4 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">04</span>
                          <span className="text-xs font-bold text-stone-200">Draft Response Generation</span>
                        </div>
                        {currentStep === 4 && simulationState === "done" ? <span className="text-emerald-400 text-xs">✔ Draft Complete</span> : currentStep === 4 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>
                    </div>
                  )}

                  {activeTab === "invoice" && (
                    <div className="grid gap-3">
                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 1 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">01</span>
                          <span className="text-xs font-bold text-stone-200">OCR Boundary Parsing</span>
                        </div>
                        {currentStep > 1 ? <span className="text-emerald-400 text-xs">✔ Text Extracted</span> : currentStep === 1 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 2 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">02</span>
                          <span className="text-xs font-bold text-stone-200">Schema Parsing & Line Matching</span>
                        </div>
                        {currentStep > 2 ? <span className="text-emerald-400 text-xs">✔ Items Synced</span> : currentStep === 2 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 3 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">03</span>
                          <span className="text-xs font-bold text-stone-200">Purchase Order Cross-Ref</span>
                        </div>
                        {currentStep > 3 ? (
                          <span className={`text-xs font-bold ${invoiceStatus === "matched" ? "text-emerald-400" : "text-amber-400"}`}>
                            {invoiceStatus === "matched" ? "✔ PO Matched" : "⚠ Flagged"}
                          </span>
                        ) : currentStep === 3 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 4 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">04</span>
                          <span className="text-xs font-bold text-stone-200">Accounts Payable Ledger Insert</span>
                        </div>
                        {currentStep === 4 && simulationState === "done" ? (
                          <span className={`text-xs font-bold ${invoiceStatus === "approved" ? "text-emerald-400" : "text-amber-400"}`}>
                            {invoiceStatus === "approved" ? "✔ Ledger Approved" : "✔ Routed for Overrides"}
                          </span>
                        ) : currentStep === 4 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>
                    </div>
                  )}

                  {activeTab === "crm" && (
                    <div className="grid gap-3">
                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 1 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">01</span>
                          <span className="text-xs font-bold text-stone-200">Audio/Text Transcript Ingest</span>
                        </div>
                        {currentStep > 1 ? <span className="text-emerald-400 text-xs">✔ Loaded</span> : currentStep === 1 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 2 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">02</span>
                          <span className="text-xs font-bold text-stone-200">Relational Intent Extraction</span>
                        </div>
                        {currentStep > 2 ? <span className="text-emerald-400 text-xs">✔ Mapped</span> : currentStep === 2 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>

                      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${currentStep >= 3 ? "bg-stone-950/40 border-stone-800" : "border-transparent opacity-40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-stone-500">03</span>
                          <span className="text-xs font-bold text-stone-200">Salesforce & Slack Push Sync</span>
                        </div>
                        {currentStep === 3 && simulationState === "done" ? <span className="text-emerald-400 text-xs">✔ Records Synchronized</span> : currentStep === 3 ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" /> : null}
                      </div>
                    </div>
                  )}

                </div>

                {/* Final Process Outputs Container (Structured results display) */}
                {simulationState === "done" && (
                  <div className="p-5 rounded-2xl bg-stone-950 border border-stone-850 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <h5 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-1.5">
                      <span>🎯</span> AI-Generated Structured Output
                    </h5>
                    
                    {/* Structured Display for Email Demo */}
                    {activeTab === "email" && emailExtracted && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-stone-850 pb-3">
                          <div>
                            <span className="text-stone-500 block">SENDER</span>
                            <span className="font-bold text-stone-200">{emailExtracted.sender}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">COMPANY</span>
                            <span className="font-bold text-stone-200">{emailExtracted.company}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">KEY ENTITY</span>
                            <span className="font-bold text-emerald-400">{emailExtracted.documentId}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">PRIORITY</span>
                            <span className="font-black text-rose-500 uppercase">{emailExtracted.priority}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-stone-500 block font-bold">DRAFT RESPONSE</span>
                          <pre className="p-3 bg-stone-900 rounded-xl font-mono text-[10px] text-stone-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                            {emailDraft}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Structured Display for Invoice Demo */}
                    {activeTab === "invoice" && invoiceExtracted && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-stone-850 pb-3">
                          <div>
                            <span className="text-stone-500 block">SUPPLIER / VENDOR</span>
                            <span className="font-bold text-stone-200">{invoiceExtracted.vendor}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">INVOICE DATE</span>
                            <span className="font-bold text-stone-200">{invoiceExtracted.invoiceDate}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">PO REFERENCE</span>
                            <span className="font-bold text-emerald-400">{invoiceExtracted.poRef}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">TOTAL BALANCE</span>
                            <span className="font-bold text-white text-sm">{invoiceExtracted.total}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-stone-500 block font-bold">LINE ITEMS EXTRACTED</span>
                          <div className="space-y-1 bg-stone-900 p-3 rounded-xl">
                            {invoiceExtracted.items.map((it: string, i: number) => (
                              <div key={i} className="text-[10px] text-stone-300 font-mono flex items-center gap-1.5">
                                <span className="text-emerald-500">•</span> {it}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Structured Display for CRM Demo */}
                    {activeTab === "crm" && crmExtracted && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-stone-850 pb-3">
                          <div>
                            <span className="text-stone-500 block">KEY CONTACT</span>
                            <span className="font-bold text-stone-200">{crmExtracted.contact}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">ORGANIZATION</span>
                            <span className="font-bold text-stone-200">{crmExtracted.company}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">CRM ACTION TRIGGER</span>
                            <span className="font-bold text-emerald-400">{crmExtracted.actionTrigger}</span>
                          </div>
                          <div>
                            <span className="text-stone-500 block">AUTOPILOT DOWNSTREAM TASK</span>
                            <span className="font-bold text-stone-300">{crmExtracted.downstreamTask}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] text-stone-500 block font-bold">DB UPDATES REGISTERED</span>
                          <div className="bg-stone-900 p-3 rounded-xl space-y-1 text-[10px] font-mono">
                            {Object.entries(crmExtracted.updates).map(([k, v]: any) => (
                              <div key={k} className="flex justify-between text-stone-300 border-b border-stone-850 pb-1 last:border-0 last:pb-0">
                                <span className="text-stone-500 uppercase">{k.replace(/([A-Z])/g, ' $1')}</span>
                                <span className="text-white font-bold">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Compound Business Value Callout */}
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[10px] leading-relaxed font-bold">
                      🏆 Automated in 4.5 seconds with 100% data fidelity. Under standard manual dispatch rules, this transaction would require an estimated 15 minutes of employee keyboard-keying, risking copy-paste fat-finger mistakes.
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

        {/* CTA Footer */}
        <div className="p-8 lg:p-12 bg-gradient-to-r from-emerald-950 via-stone-900 to-stone-950 rounded-3xl border border-stone-900 text-center max-w-4xl mx-auto space-y-6">
          <div className="max-w-xl mx-auto space-y-2">
            <h3 className="text-2xl font-black text-white">Unlock True Autonomous Operations</h3>
            <p className="text-xs text-stone-400 leading-relaxed font-medium">
              Simpler Life 100 deploys industry-tailored ops assistants equipped with exact models like these. Zero manual keying, zero scheduling delays, and zero missing receipts.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link 
              to="/roi-calculator"
              className="px-8 py-3.5 rounded-xl bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs border border-stone-800 hover:border-stone-700 transition-all uppercase tracking-wider w-full sm:w-auto"
            >
              📊 Try ROI Calculator
            </Link>
            <a 
              href="/#contact"
              className="px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs transition-all uppercase tracking-wider w-full sm:w-auto shadow-md"
            >
              Book My Free Efficiency Audit
            </a>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950/40 py-8 text-center text-stone-500 text-[10px] tracking-widest uppercase font-mono mt-12">
        &copy; {new Date().getFullYear()} Simpler Life 100 &bull; Strategic AI Operations
      </footer>

    </div>
  );
}
