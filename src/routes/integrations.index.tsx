import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { integrations, type Integration } from "../content/integrations";

export const Route = createFileRoute("/integrations/")({
  component: IntegrationExplorerPage,
});

// Define common cross-app automation suggestions based on selected tool types
interface CrossAppAutomation {
  name: string;
  apps: string[];
  description: string;
  trigger: string;
  steps: string[];
  roi: string;
}

const COMMON_CROSS_AUTOMATIONS: CrossAppAutomation[] = [
  {
    name: "Autonomous Lead Intake & CRM Sync",
    apps: ["salesforce", "outlook", "teams"],
    description: "Instantly parse inbound lead inquiries, extract demographic data, sync contact details to Salesforce, and push real-time alerts to Microsoft Teams channels.",
    trigger: "New inbound email matching sales parameters",
    steps: [
      "AI scans Outlook inbox for incoming RFP or lead inquiry emails.",
      "NLP extracts company size, contact details, product interest, and budget range.",
      "AI inserts/updates Lead record in Salesforce and assigns to the matching Account Exec.",
      "Slack/Teams notification is posted with key opportunity data and pre-drafted call agenda."
    ],
    roi: "Average response time reduced from 4 hours to 90 seconds, 25% increase in conversion."
  },
  {
    name: "Automated Invoice & Bill Ingestion",
    apps: ["sap", "oracle-netsuite", "quickbooks", "bill-com"],
    description: "Automatically ingest PDF invoices from shared folders or email attachments, extract line item details, match them with purchase orders, and post invoices directly to your accounting ledger.",
    trigger: "New invoice file added to email or folder",
    steps: [
      "AI detects incoming invoice PDF from email or Sharepoint/OneDrive folder.",
      "OCR and layout intelligence parse line-item details, tax amounts, and payment terms.",
      "AI matches the invoice to open PO and receiving documents in SAP or NetSuite.",
      "If matching is successful, AI posts bill directly to QuickBooks / Bill.com; otherwise, flags variance."
    ],
    roi: "85% reduction in manual AP invoicing costs, straight-through posting rate over 90%."
  },
  {
    name: "Customer Support Ticket Escalation & Auto-Responder",
    apps: ["zendesk", "slack", "outlook"],
    description: "Scan customer emails and support tickets for severity/sentiment, auto-respond with precise help center articles, escalate unresolved issues to Slack channels, and record logs.",
    trigger: "New ticket opened in Zendesk or inquiry on Outlook",
    steps: [
      "AI monitors Zendesk queue and scans email tone/subject for critical sentiment.",
      "System retrieves custom documentation matching the ticket tags.",
      "AI drafts an intelligent response and schedules it for agent approval or auto-sends if low-risk.",
      "Critical SLA breaches trigger real-time hot escalations in Slack engineering channels."
    ],
    roi: "First contact resolution increased by 35%, engineering notification lags reduced by 4 hours."
  },
  {
    name: "Logistical Freight Dispatch Router",
    apps: ["sap", "excel", "outlook", "slack"],
    description: "Parse freight spreadsheets and shipment orders, compute optimal route layouts, schedule dispatch notifications, and draft vendor confirmation updates.",
    trigger: "Spreadsheet upload or ERP order intake",
    steps: [
      "AI reads freight dispatch lists from Excel uploads or NetSuite shipping logs.",
      "Compute scheduling parameters based on active driver hours and geographical routing APIs.",
      "AI generates dispatch orders and distributes confirmations to carriers via Outlook.",
      "Real-time dispatch board in Slack or portal notifies operators of completed routes."
    ],
    roi: "Dispatcher load time reduced by 15 hours/week per operator, fuel cost savings of ~6%."
  },
  {
    name: "Interactive Month-End Financial Close & Reconciliation",
    apps: ["quickbooks", "excel", "stripe", "oracle-netsuite"],
    description: "Compile transaction registers across Stripe, bank portals, and ERP tools, perform automatic balance reconciliation, and flag variances in Excel.",
    trigger: "Month-end close schedule triggered",
    steps: [
      "AI logs into billing registers and exports transaction data.",
      "Cross-references bank transaction statement IDs against QuickBooks ledger accounts.",
      "Flags payment processing discrepancies or missing ledger categories automatically.",
      "Outputs a fully reconciled Excel close workbook with clear audit trails for review."
    ],
    roi: "Month-end reconciliation cycle reduced from 6 days to 3 hours, 100% auditable logs."
  },
];

// Interactive Short Animated Demo Card Interface
interface SeeItInActionDemo {
  id: string;
  name: string;
  appIcons: string[];
  description: string;
  logs: string[];
}

const SEE_IT_IN_ACTION_DEMOS: SeeItInActionDemo[] = [
  {
    id: "demo-invoice",
    name: "Invoice Processing Pipeline",
    appIcons: ["📄", "⚙️", "💰"],
    description: "Watch the AI parse a multi-line invoice, cross-reference purchase orders, flag a price mismatch, and queue NetSuite posting.",
    logs: [
      "INFO: New Invoice attachment detected (ApexParts_INV_9011.pdf)",
      "OCR: Extracted 3 line items - Unit cost: $45.00 ea, shipping: $45.00",
      "API: Fetching PO-10229 from Oracle NetSuite SCM...",
      "MATCH: PO cost matches ($45.00), quantity matches (10 units)",
      "ALERT: Shipping fee has $15.00 variance from contract. Flagged for review.",
      "STATUS: Posted clean lines to ledger. Queued reviewer dashboard notification."
    ]
  },
  {
    id: "demo-email",
    name: "Customer Support Auto-Responder",
    appIcons: ["📥", "🧠", "✉️"],
    description: "Observe the AI classify customer email intent, analyze SLA terms, fetch internal knowledge base guides, and draft a professional reply.",
    logs: [
      "INFO: Received email from sarah.j@acme.com",
      "NLP: Classified category -> 'Billing Inquiry', Sentiments -> Positive",
      "KNOW: Queried internal knowledge base -> 'Contract Addendum Policy'",
      "DRAFT: Generated draft response addressingINV-2026-882",
      "API: Routing drafted email to Outlook Drafts folder for operator approval.",
      "SUCCESS: Sent reviewer alert: Email draft pending in Outlook."
    ]
  },
  {
    id: "demo-crm",
    name: "Salesforce CRM Auto-Synchronizer",
    appIcons: ["📞", "📊", "⚡"],
    description: "AI extracts action items from customer discovery notes, updates CRM lead records, and schedules immediate review tasks.",
    logs: [
      "INFO: New customer discovery meeting log detected.",
      "NLP: Identified company 'Pacific Logistics', budget $8,500/mo.",
      "API: Querying Salesforce for matching Account record...",
      "WRITE: Inserted new Opportunity 'Pacific Logistics - Enterprise Upgrade'",
      "TASK: Created follow-up calendar event for Tuesday 2 PM.",
      "SUCCESS: Real-time update posted to Slack: New Hot Opportunity synced."
    ]
  },
  {
    id: "demo-dispatch",
    name: "Autonomous Logistics Dispatch Planner",
    appIcons: ["🚛", "🗺️", "📱"],
    description: "AI parses container manifests, cross-references port schedules, and maps optimal delivery routes across carriers.",
    logs: [
      "INFO: Ingested freight schedule Excel upload.",
      "GEO: Calculating optimal transport path from Rotterdam to Chicago...",
      "API: Querying Carrier API for pricing quotes...",
      "SELECT: Assigned load to Apex Global Logistics (lowest cost/high rating)",
      "CONFIRM: Sent booking confirmation sheet to dispatchers via email.",
      "SUCCESS: Dispatch route active. ETA updated in SCM dashboard."
    ]
  },
  {
    id: "demo-reconciliation",
    name: "ERP Inventory Reconciliation Close",
    appIcons: ["📦", "🗄️", "⚖️"],
    description: "AI reconciles physical warehouse inventory counts against ERP logs and highlights transaction leaks.",
    logs: [
      "INFO: Cycle counts upload detected for Chicago Facility B.",
      "API: Fetching current SAP item master inventory registers...",
      "COMPARE: Reconciled 12,000 SKUs. Found 4 discrepancies.",
      "TRACE: Traced 3 variances to receiving delays, 1 to vendor credit.",
      "WRITE: Prepared inventory adjustment draft for warehouse manager.",
      "SUCCESS: Reconciliations logged. SAP records synced with audit trail."
    ]
  },
  {
    id: "demo-onboarding",
    name: "HR Employee Provisioning Automation",
    appIcons: ["👥", "🔑", "💻"],
    description: "AI reads new-hire spreadsheets, provisions SaaS accounts, routes manager approvals, and sends custom onboarding manuals.",
    logs: [
      "INFO: Parsed HR onboarding sheet for 'David Miller' (Operations)",
      "API: Triggering account provisioning for Google Workspace...",
      "API: Generating temporary security credentials in Slack...",
      "WRITE: Drafting welcome email containing secure portals link.",
      "SLA: All HR systems pre-configured. Operator audit completed."
    ]
  },
  {
    id: "demo-vendor",
    name: "Vendor SLA Performance Scorer",
    appIcons: ["📈", "🤝", "📋"],
    description: "AI compiles monthly transit logs, flags supplier SLA violations, calculates scorecard grades, and emails vendor portals.",
    logs: [
      "INFO: Commencing vendor SLA scorecard review for Q2.",
      "DATA: Pulled delivery times across 410 supplier records.",
      "SCORE: Calculated average on-time rate: 94.2% (Grade: B+)",
      "WRITE: Generated PDF report detailing delay categories.",
      "SUCCESS: Scorecard transmitted to supplier representative automatically."
    ]
  },
  {
    id: "demo-expense",
    name: "Corporate Card Expense Auditor",
    appIcons: ["💳", "🏷️", "🔍"],
    description: "AI reads corporate receipts, matches credit card statements, classifies tax codes, and flags policy deviations.",
    logs: [
      "INFO: Processing corporate card expense uploads (41 receipts)",
      "MATCH: Reconciled 38 transactions with statement records.",
      "TAX: Classified tax categories according to 2026 guidelines.",
      "FLAG: Flagged 3 receipts for off-hours dining (review required)",
      "SUCCESS: Reconciled batch pushed to Expensify for finance approval."
    ]
  },
  {
    id: "demo-bids",
    name: "Construction RFP Evaluation Engine",
    appIcons: ["🏗️", "📐", "📄"],
    description: "AI ingests sub-contractor bid filings, normalizes unit costs, and flags pricing anomalies.",
    logs: [
      "INFO: New RFP submissions detected for Site-9 Project.",
      "EXTRACT: Parsed 4 subcontractor bids, extracted raw pricing arrays.",
      "COMPARE: Normalized cost parameters against local averages.",
      "FLAG: Flagged 28% markup on plumbing line-items in Bid C.",
      "SUCCESS: Comparative analysis PDF compiled. Sent to bid manager."
    ]
  },
  {
    id: "demo-claims",
    name: "Healthcare Medical Claim Auditor",
    appIcons: ["🏥", "📋", "⚖️"],
    description: "AI screens patient charts, audits billing codes, detects processing overlaps, and posts approved claims.",
    logs: [
      "INFO: Auditing patient claim ID CL-882193.",
      "CODE: Extracted ICD-10 and CPT codes from physician notes.",
      "AUDIT: Verified codes against medical billing guidelines.",
      "COMPARE: Confirmed no double-billing across overlapping dates.",
      "SUCCESS: Claim validated. Approved invoice pushed to billing queue."
    ]
  },
  {
    id: "demo-loans",
    name: "Financial Mortgage Document Auditor",
    appIcons: ["🏦", "🖊️", "📁"],
    description: "AI inspects mortgage filings, audits signature status, verifies tax documents, and lists omissions.",
    logs: [
      "INFO: Ingesting loan package for Account ID LN-990218.",
      "VERIFY: Audited tax statement pages, confirmed no missing sheets.",
      "SIGN: Signature verification: Confirmed 4 of 4 signing zones active.",
      "ALERT: Tax form 4506-C is missing page 2.",
      "SUCCESS: Omissions report generated. Email drafted to client broker."
    ]
  },
  {
    id: "demo-quality",
    name: "Manufacturing Quality Failure Analyzer",
    appIcons: ["🔧", "📊", "🚨"],
    description: "AI parses factory QA logs, cross-references line telemetry, and schedules preventative maintenance orders.",
    logs: [
      "INFO: Monitoring real-time line sensor registers.",
      "TREND: Detected 12% rise in tolerance failures over last 3 hours.",
      "CROSS: Cross-referencing maintenance records for extruder mold.",
      "ALERT: Extruder Mold A has surpassed scheduled wear limits.",
      "SUCCESS: Triggered preventative maintenance ticket in ServiceNow."
    ]
  },
  {
    id: "demo-procurement",
    name: "Enterprise PO Approval Dispatcher",
    appIcons: ["💼", "📃", "🛒"],
    description: "AI maps material requisitions, routes regional manager approval criteria, and routes purchasing codes.",
    logs: [
      "INFO: Ingested material requisition for Dallas Facility.",
      "ROUTE: Assessed budget limits: Regional Manager approval required.",
      "API: Generated secure digital authorization token.",
      "SUCCESS: Approval dispatch sent to regional director via Teams."
    ]
  },
  {
    id: "demo-sla",
    name: "Helpdesk Ticket SLA Monitor",
    appIcons: ["⏳", "⚠️", "🛎️"],
    description: "AI monitors ticketing queues, tracks critical response margins, and triggers hot SLA alerts.",
    logs: [
      "INFO: Scanned open ticket backlog. Active open items: 14",
      "SLA: Ticket ID TK-9912 is within 15 minutes of SLA limit.",
      "ALERT: Escalating ticket priority to Engineering Team 2.",
      "SUCCESS: Posted SLA hot-alerts inside Slack and dialed technician."
    ]
  },
  {
    id: "demo-yield",
    name: "Automated Plant Production Yield Compiler",
    appIcons: ["🏭", "📈", "📊"],
    description: "AI pulls factory telemetry logs, calculates daily OEE metrics, and drafts reports for managers.",
    logs: [
      "INFO: Compiling shift yield summaries across 3 facilities.",
      "MATH: Formulating overall equipment effectiveness (OEE) scores.",
      "OEE: Yield score: 89.4%, quality index: 99.1%.",
      "WRITE: Compiled HTML shift-report for plant supervisor.",
      "SUCCESS: Production overview dispatched to executive dashboard."
    ]
  },
  {
    id: "demo-contracts",
    name: "Autonomous Contract Compliance Reviewer",
    appIcons: ["⚖️", "📄", "🔍"],
    description: "AI checks incoming NDA documents, cross-references liability caps, and highlights missing safety terms.",
    logs: [
      "INFO: Reviewing contract document (Acme_NDA_v2.docx)",
      "COMPARE: Assessing terms against Standard Corporate Template.",
      "FLAG: Found missing dispute resolution clause.",
      "ALERT: Liability indemnity cap exceeds recommended $1M limit.",
      "SUCCESS: Compliance markup generated. Sent to corporate counsel."
    ]
  }
];

function IntegrationExplorerPage() {
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [explorerSearch, setExplorerSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [demoState, setDemoState] = useState<"idle" | "running" | "done">("idle");
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const [activeLogIndex, setActiveLogIndex] = useState(0);

  // Filter integrations based on search and category
  const categories = useMemo(() => {
    const cats = new Set(integrations.map((i) => i.category.toUpperCase()));
    return ["ALL", ...Array.from(cats)];
  }, []);

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((i) => {
      const matchesCategory = activeCategory === "ALL" || i.category.toUpperCase() === activeCategory;
      const matchesSearch =
        explorerSearch === "" ||
        i.name.toLowerCase().includes(explorerSearch.toLowerCase()) ||
        i.category.toLowerCase().includes(explorerSearch.toLowerCase()) ||
        i.description.toLowerCase().includes(explorerSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [explorerSearch, activeCategory]);

  // Toggle app selection in Explorer
  const toggleAppSelection = (id: string) => {
    if (selectedApps.includes(id)) {
      setSelectedApps(selectedApps.filter((appId) => appId !== id));
    } else {
      setSelectedApps([...selectedApps, id]);
    }
  };

  // Find cross-app automation matches based on selected apps
  const matchedAutomations = useMemo(() => {
    if (selectedApps.length === 0) return [];
    return COMMON_CROSS_AUTOMATIONS.filter((automation) => {
      // Return true if at least two selected apps are in the automation or
      // if one is in it and there are no other apps selected
      const overlapCount = automation.apps.filter((app) => selectedApps.includes(app)).length;
      return overlapCount >= 2 || (overlapCount >= 1 && selectedApps.length === 1);
    });
  }, [selectedApps]);

  // Handle running the animated See It In Action demos
  const runDemoAnimation = (demoId: string) => {
    setSelectedDemoId(demoId);
    setDemoState("running");
    setVisibleLogs([]);
    setActiveLogIndex(0);
  };

  const activeDemo = useMemo(() => {
    return SEE_IT_IN_ACTION_DEMOS.find((d) => d.id === selectedDemoId) || null;
  }, [selectedDemoId]);

  useEffect(() => {
    if (demoState !== "running" || !activeDemo) return;

    if (activeLogIndex < activeDemo.logs.length) {
      const timer = setTimeout(() => {
        setVisibleLogs((prev) => [...prev, activeDemo.logs[activeLogIndex]]);
        setActiveLogIndex((prev) => prev + 1);
      }, 1000); // 1-second interval for real-time typewriter console effect
      return () => clearTimeout(timer);
    } else {
      setDemoState("done");
    }
  }, [demoState, activeLogIndex, activeDemo]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      <div>
        {/* Header */}
        <header className="border-b border-stone-900 bg-stone-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
              S1
            </span>
            <span className="font-black text-base tracking-tight text-white group-hover:text-indigo-400 transition-colors">
              SIMPLER LIFE <span className="text-indigo-500 font-mono">100</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              to="/workflows" 
              className="text-xs font-mono font-bold text-stone-400 hover:text-white border border-stone-850 hover:border-stone-700 bg-stone-900/30 rounded-lg px-3.5 py-1.5 transition-all"
            >
              ← WORKFLOW LIBRARY
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative px-6 pt-16 pb-12 text-center overflow-hidden border-b border-stone-900/50">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold tracking-wider">
              🔌 MULTI-APP CONNECTORS EXPLORER
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Interactive Integration <span className="text-indigo-400">Explorer</span>
            </h1>
            <p className="text-stone-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
              Select your organization's tools to instantly identify proven automation blueprints. Watch automated operations compile across your existing SaaS platform stacks.
            </p>
          </div>
        </section>

        {/* Integration Explorer Tool */}
        <section className="px-6 py-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Selector List */}
          <div className="lg:col-span-1 space-y-5 bg-stone-900/20 border border-stone-900 p-5 rounded-2xl h-fit">
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm text-white">1. Select Your Software Stack</h3>
              <p className="text-xs text-stone-500">Pick any combination of tools below to query connections.</p>
            </div>

            {/* Selector Search */}
            <input
              type="text"
              value={explorerSearch}
              onChange={(e) => setExplorerSearch(e.target.value)}
              placeholder="Search Salesforce, Gmail, SAP..."
              className="w-full bg-stone-950 border border-stone-850 focus:border-indigo-600 rounded-xl px-3.5 py-2 text-xs text-stone-200 outline-none placeholder:text-stone-700"
            />

            {/* Category Pills */}
            <div className="flex flex-wrap gap-1 pt-1">
              {categories.slice(0, 7).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-[9px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    activeCategory === cat ? "bg-indigo-600 text-white" : "bg-stone-900 text-stone-400 hover:text-stone-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* App List */}
            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1.5 scrollbar-thin scrollbar-thumb-stone-850">
              {filteredIntegrations.map((app) => {
                const isSelected = selectedApps.includes(app.id);
                return (
                  <div
                    key={app.id}
                    onClick={() => toggleAppSelection(app.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-indigo-950/20 border-indigo-500/40 text-white"
                        : "bg-stone-950/40 border-stone-850 hover:border-stone-800 text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs uppercase font-mono px-1.5 py-0.5 rounded bg-stone-900 border border-stone-850/60 font-black text-indigo-400">
                        {app.id.slice(0, 3)}
                      </span>
                      <span className="text-xs font-bold leading-none">{app.name}</span>
                    </div>
                    <div className={`h-4 w-4 rounded-full border flex items-center justify-center text-[8px] ${
                      isSelected ? "bg-indigo-600 border-indigo-500 text-white" : "border-stone-800"
                    }`}>
                      {isSelected && "✓"}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedApps.length > 0 && (
              <button
                onClick={() => setSelectedApps([])}
                className="w-full py-2 bg-stone-900 hover:bg-stone-850 border border-stone-850 text-stone-400 hover:text-stone-300 rounded-xl text-[10px] font-mono font-bold transition-all"
              >
                [ RESET SELECTIONS ]
              </button>
            )}
          </div>

          {/* Right Column: Connection Suggestions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-stone-900 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-white">2. Suggested Cross-App Automations</h3>
                <p className="text-xs text-stone-500">Live matched recommendations based on your selected stack.</p>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
                {matchedAutomations.length} MATCHES
              </span>
            </div>

            {selectedApps.length === 0 ? (
              /* Explorer Placeholder Empty State */
              <div className="text-center py-20 bg-stone-900/5 border border-stone-900/60 border-dashed rounded-3xl p-8 space-y-4">
                <div className="text-4xl text-stone-600">🔌</div>
                <h4 className="text-sm font-black text-white">Explore Integration Combinations</h4>
                <p className="text-xs text-stone-400 max-w-sm mx-auto leading-relaxed">
                  Select at least one tool from your software stack (such as Salesforce, SAP, Outlook, or Slack) on the left sidebar to generate matching multi-step autonomous pipelines.
                </p>
              </div>
            ) : matchedAutomations.length > 0 ? (
              <div className="space-y-4">
                {matchedAutomations.map((autom, index) => (
                  <div key={index} className="bg-stone-900/30 border border-stone-850 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-850 pb-3">
                      <div>
                        <h4 className="font-extrabold text-sm text-white">{autom.name}</h4>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {autom.apps.map((app) => (
                            <span key={app} className="text-[9px] font-mono font-bold text-stone-400 bg-stone-950 border border-stone-850 px-2 py-0.5 rounded uppercase">
                              {app}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-2 py-1 rounded h-fit">
                        ROI: {autom.roi.split(",")[0]}
                      </span>
                    </div>

                    <p className="text-xs text-stone-300 leading-relaxed">
                      {autom.description}
                    </p>

                    <div className="space-y-2.5">
                      <h5 className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">How S1 Executes This Pipeline:</h5>
                      <ol className="space-y-2">
                        {autom.steps.map((step, sIdx) => (
                          <li key={sIdx} className="flex items-start gap-2.5 text-xs text-stone-400 leading-relaxed">
                            <span className="text-indigo-400 font-mono font-bold text-[11px] pt-0.5">0{sIdx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="pt-3 border-t border-stone-850/60 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-400 uppercase">Trigger Event: {autom.trigger}</span>
                      <Link
                        to="/build"
                        className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
                      >
                        [ Configure S1 Connector → ]
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Selected apps but no specific cross matches */
              <div className="bg-stone-900/10 border border-stone-850 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <h4 className="font-extrabold text-sm text-white">Custom Connector Multi-App Pipeline</h4>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Your selected combination is fully supported! Simpler Life 100 handles custom multi-system endpoints across our entire library of over 175 integrated applications.
                </p>
                <div className="bg-stone-950/40 p-4 rounded-xl space-y-2">
                  <h5 className="text-[10px] font-mono font-bold text-stone-400 uppercase">Selected Services Connected:</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedApps.map((app) => (
                      <span key={app} className="text-xs font-mono font-bold text-stone-300 bg-stone-900 border border-stone-850 px-2.5 py-1 rounded">
                        {app.toUpperCase()} CONNECTOR ACTIVE
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Link
                    to="/build"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
                  >
                    Build Custom Agent Pipeline →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* See It In Action Animated Demos Section */}
        <section className="bg-stone-900/10 border-t border-stone-900 px-6 py-16">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest">[ REAL-TIME BLUEPRINT CONSOLE ]</span>
              <h2 className="text-2xl md:text-3xl font-black text-white">See It In Action</h2>
              <p className="text-stone-400 text-xs md:text-sm">
                Watch 15+ interactive autonomous operations compile. Click any play blueprint card to simulate the S1 Agent executing live workloads.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
              {/* Demos Checklist Card Grid */}
              <div className="lg:col-span-1 max-h-[500px] overflow-y-auto pr-2 space-y-2.5 scrollbar-thin scrollbar-thumb-stone-850">
                {SEE_IT_IN_ACTION_DEMOS.map((demo) => {
                  const isActive = selectedDemoId === demo.id;
                  return (
                    <div
                      key={demo.id}
                      onClick={() => runDemoAnimation(demo.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 justify-between ${
                        isActive
                          ? "bg-emerald-950/10 border-emerald-500/40 text-white shadow-lg shadow-emerald-950/10"
                          : "bg-stone-950/40 border-stone-850 hover:border-stone-800 text-stone-400 hover:text-stone-200"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs uppercase font-mono font-extrabold text-emerald-400">
                            {demo.id.replace("demo-", "")}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold">{demo.name}</h4>
                        <p className="text-[10px] text-stone-400 leading-normal line-clamp-1">{demo.description}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {demo.appIcons.map((ico, idx) => (
                          <span key={idx} className="text-xs bg-stone-900 border border-stone-850 p-1 rounded">
                            {ico}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Console Simulation Monitor View */}
              <div className="lg:col-span-2 bg-stone-950 border border-stone-850 rounded-3xl p-6 flex flex-col justify-between h-full min-h-[380px] font-mono relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                    demoState === "idle" ? "bg-stone-900 text-stone-500" :
                    demoState === "running" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse" :
                    "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  }`}>
                    ● {demoState.toUpperCase()}
                  </span>
                </div>

                <div>
                  {/* Console Header */}
                  <div className="flex items-center gap-1.5 border-b border-stone-900 pb-3 mb-4 text-[11px] text-stone-400 uppercase">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="pl-2">S1 Autonomous Operations Console v3.1</span>
                  </div>

                  {/* Terminal Screen */}
                  {selectedDemoId === null ? (
                    <div className="text-center py-20 space-y-3">
                      <div className="text-2xl">🖥️</div>
                      <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                        No active simulation console. Select any blueprint demo card from the left panel to execute an S1 operation flow.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs leading-relaxed max-h-[280px] overflow-y-auto pr-2 scrollbar-thin">
                      <div className="text-stone-500">SYS_EXECUTE: Initiating {activeDemo?.name} simulation...</div>
                      {visibleLogs.map((log, index) => {
                        const isAlert = log.includes("ALERT") || log.includes("WARN");
                        const isSuccess = log.includes("SUCCESS") || log.includes("STATUS");
                        return (
                          <div
                            key={index}
                            className={`${
                              isAlert ? "text-amber-400 font-bold" : isSuccess ? "text-emerald-400 font-bold" : "text-stone-300"
                            }`}
                          >
                            {log}
                          </div>
                        );
                      })}
                      {demoState === "running" && (
                        <div className="text-stone-400 animate-pulse">■ Executing operational tasks...</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Console Footer Status */}
                {selectedDemoId !== null && (
                  <div className="pt-4 border-t border-stone-900 mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-stone-500">
                    <span>OPERATOR: SIMULATED BLUEPRINT WORKLOAD</span>
                    {demoState === "done" && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => activeDemo && runDemoAnimation(activeDemo.id)}
                          className="text-stone-400 hover:text-white underline"
                        >
                          [ RERUN SIMULATION ]
                        </button>
                        <Link
                          to="/build"
                          className="text-emerald-400 hover:text-emerald-300 font-bold underline"
                        >
                          [ DEPLOY THIS BLUEPRINT → ]
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer bar */}
      <footer className="border-t border-stone-900 bg-stone-950/60 py-6 text-center text-xs font-mono text-stone-600">
        © 2026 Simpler Life 100 — Autonomous Operations Engineering.
      </footer>
    </div>
  );
}
