import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getUser } from '~/db/queries';

export const Route = createFileRoute('/audit')({
  loader: async () => {
    const user = await getUser();
    return { user };
  },
  component: AuditChecklist,
});

const VERTICALS = [
  {
    id: 1,
    title: "Human Resources (HR) Audit",
    icon: "👥",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    description: "Evaluates personnel records, onboarding flow, automated SaaS provisioning/deprovisioning, and shadow HR tracking.",
    points: [
      "Secure centralized storage of all employee/contractor records and access controls.",
      "Automated document generation (offer letters, NDAs, W-4/I-9 compliance structures).",
      "Auto-triggering of background checks directly from Applicant Tracking Systems (ATS).",
      "Automated provisioning/deprovisioning of software seats and email accounts upon hire/exit.",
      "Self-service PTO tracking, calculations, and team calendar sync.",
      "Detection of unapproved 'Shadow HR' tools (chats, personal sheets, unsynced boards)."
    ]
  },
  {
    id: 2,
    title: "Technical Support Audit",
    icon: "💻",
    color: "bg-indigo-50 text-indigo-700 border-indigo-100",
    description: "Audits support ticket dispatch workflows, SLA compliance alerts, API keys lifecycle, and silent form failures.",
    points: [
      "Automated ticket classification, keyword tagging, and routing based on urgency.",
      "SLA breach notifications with escalation rules to senior support engineering.",
      "API Key rotation schedules and expiration warning notifications.",
      "Marketing site webhook logging to catch and alert on form submission silent failures."
    ]
  },
  {
    id: 3,
    title: "Customer Service / Support Audit",
    icon: "🤝",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    description: "Evaluates customer feedback collection, AI chat guardrails, PII masking, and A2P 10DLC SMS compliance.",
    points: [
      "Automated NPS/CSAT survey dispatch triggered on support ticket/deal resolution.",
      "AI Bot response guardrails to prevent price manipulation and discount hacking.",
      "Automated regex scrubbing to remove credit cards, passwords, and PII from transcripts.",
      "Carrier compliant A2P 10DLC text notification systems with active opt-in logging."
    ]
  },
  {
    id: 4,
    title: "Research Skills / Online Research Audit",
    icon: "🔍",
    color: "bg-amber-50 text-amber-700 border-amber-100",
    description: "Audits competitor price tracking, data reliability checks, and research sandboxing.",
    points: [
      "Scheduled scrapers monitoring competitor pricing and updating internal databases.",
      "Automated validation engines checking scraped data for discrepancies.",
      "Sandboxed research pipelines ensuring search queries don't leak proprietary focus topics."
    ]
  },
  {
    id: 5,
    title: "Program Management Audit",
    icon: "📊",
    color: "bg-teal-50 text-teal-700 border-teal-100",
    description: "Analyzes project KPI compilation, automated program timelines, and live contractor cost tracking.",
    points: [
      "Direct auto-compilation of program-level KPI dashboards across team boards.",
      "Budget burn-rate calculators updating in real-time based on actual task inputs.",
      "Overdue milestones trigger alert escalations to program leads."
    ]
  },
  {
    id: 6,
    title: "Administrative & Executive Assistance Audit",
    icon: "📁",
    color: "bg-cyan-50 text-cyan-700 border-cyan-100",
    description: "Audits administrative time-leaks, multi-calendar conflict preventions, and automated receipt filing.",
    points: [
      "Multi-calendar sync matrix auto-blocking overlapping professional bookings.",
      "OCR parsing and automatic extraction of travel and meal expense receipt structures.",
      "Meeting audio transcribers auto-pushing actions items and takeaways to Slack channels."
    ]
  },
  {
    id: 7,
    title: "Strategic Planning Audit",
    icon: "🗺️",
    color: "bg-purple-50 text-purple-700 border-purple-100",
    description: "Audits software license utilization, SaaS seat overlap, and AI integration ROI mapping.",
    points: [
      "Active user log scans to identify inactive user seats, preventing duplicate software billing.",
      "Labor-to-automation priority matrix mapping out LLM vs rule-based engineering gains.",
      "Strategic milestone tracking mapped directly into corporate dashboards."
    ]
  },
  {
    id: 8,
    title: "Filing / File Management Audit",
    icon: "🗄️",
    color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
    description: "Evaluates retention schedules, folder structural compliance, and active cloud sync tracking.",
    points: [
      "Automated archival and deletion pipelines calibrated for regulatory compliance (GDPR/HIPAA).",
      "Dynamic document auto-renaming and folder categorization systems.",
      "Health monitoring systems to immediately detect and report silent cloud storage sync failures."
    ]
  },
  {
    id: 9,
    title: "Outsourcing Audit",
    icon: "🌐",
    color: "bg-rose-50 text-rose-700 border-rose-100",
    description: "Reviews contractor encryption standards, device compliance, and IP repository clearance.",
    points: [
      "Security health probes to verify contractor device firewalls and active file encryption.",
      "Git commit scanning to ensure contractor work carries correct copyright signatures.",
      "Milestone payment escrow triggers tied directly to verified task deliverables."
    ]
  },
  {
    id: 10,
    title: "Data Entry Audit",
    icon: "📝",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    description: "Evaluates inputs regex validation, multi-hop pipeline auditing, and automated data enrichment.",
    points: [
      "Input form text fields fitted with strict validation regex to block database failures.",
      "Multi-hop lead ingestion tracers ensuring website form leads reach the CRM without fail.",
      "Lead-profile background auto-enrichment (LinkedIn, Crunchbase, Lusha integration)."
    ]
  },
  {
    id: 11,
    title: "Typing & Transcription Audit",
    icon: "🎤",
    color: "bg-sky-50 text-sky-700 border-sky-100",
    description: "Audits word-error-rate thresholds, audio quality filters, and client-facing document audits.",
    points: [
      "Transcription fidelity checkers evaluating word-error-rate (WER) against golden sets.",
      "Automated spell and syntax checks on outgoing client documents prior to dispatch.",
      "Live audio stream compression and noise reduction models before transcription processing."
    ]
  },
  {
    id: 12,
    title: "Data Reporting Audit",
    icon: "📈",
    color: "bg-pink-50 text-pink-700 border-pink-100",
    description: "Analyzes API limit safeguards, data lineage registers, and scheduled reporting pipelines.",
    points: [
      "Automated throttling queues keeping reporting queries well within API rate limits.",
      "Trace-auditable record updates showing which webhook or user input generated which row.",
      "Daily telemetry reports compiling business performance logs directly into team channels."
    ]
  },
  {
    id: 13,
    title: "Invoice Processing Audit",
    icon: "💸",
    color: "bg-orange-50 text-orange-700 border-orange-100",
    description: "Audits three-way billing matching, OCR processing, and supplier billing fraud checks.",
    points: [
      "Three-way ledger match ensuring invoices match original purchase orders and shipping slips.",
      "OCR receipt scanners flagging low-confidence fields for rapid administrative review.",
      "Bank detail verification filters matching incoming invoice accounts with historical rosters."
    ]
  },
  {
    id: 14,
    title: "Virtual Assistance / Personal Assistance Audit",
    icon: "🤖",
    color: "bg-violet-50 text-violet-700 border-violet-100",
    description: "Evaluates assistant task queue parsing, priority matrices, and secure credentials storage.",
    points: [
      "Task classification engines ranking personal to-dos via semantic analysis.",
      "Multi-vendor quote consolidator summarizing pricing into structured comparative tables.",
      "Secure, expiring access managers ensuring assistants have time-limited credentials."
    ]
  },
  {
    id: 15,
    title: "Appointment Scheduling Audit",
    icon: "📅",
    color: "bg-yellow-50 text-yellow-700 border-yellow-100",
    description: "Audits DST calendar transitions, dynamic focus hour blocks, and auto-reminders.",
    points: [
      "Daylight Saving Time offsets configured to block scheduling calendar drift.",
      "Automatic focal-work buffers inserted between adjacent meetings to avoid burnout.",
      "Multi-channel booking confirmation sequences (Email, SMS, WhatsApp) to crush no-shows."
    ]
  },
  {
    id: 16,
    title: "Payroll Services Audit",
    icon: "🏦",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    description: "Audits IRS contractor classification compliance and direct deposit payment triggers.",
    points: [
      "AI contractor logs auditor flagging misclassification risks before regulatory reviews.",
      "Multi-factor approvals triggered when direct deposit destination bank routing updates.",
      "Automated pay-slip generation sync based on actual clocked working time logs."
    ]
  },
  {
    id: 17,
    title: "Project Management Audit",
    icon: "🧱",
    color: "bg-zinc-50 text-zinc-700 border-zinc-100",
    description: "Audits project scope amendment logs, timeline projections, and learnings repositories.",
    points: [
      "Scope-creep logs tracking project specification amendments and cost variations.",
      "Dynamic timeline adjustment projections triggered by individual task blockages.",
      "Post-mortem repository parsing to recommend workflow optimizations for next builds."
    ]
  },
  {
    id: 18,
    title: "AI & Automation Infrastructure Audit (Modern Core)",
    icon: "⚙️",
    color: "bg-red-50 text-red-700 border-red-100",
    description: "The absolute modern core of our audit: Webhook failure queues, prompt registries, hallucination tracking, and secure HMAC ledger keeping.",
    points: [
      "Secondary error webhook redirects alerting teams in Slack immediately if Zapier/Make endpoints crash.",
      "Git prompt repository tracking keeping AI prompts version-controlled separate from core code.",
      "AI output validators (Instructor, Guardrails AI schemas) to completely mitigate model hallucination.",
      "API Key storage in secure, encrypted cloud KMS stores (never in code scripts).",
      "HMAC SHA-256 cryptographic signatures sealing operational records to secure a tamper-proof audit log."
    ]
  },
  {
    id: 19,
    title: "Sales Operations Audit",
    icon: "💰",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    description: "Audits lead routing, CRM hygiene, and deal integrity to identify uncontacted leads, dead pipeline, and lost attribution.",
    points: [
      "Automated lead routing logic and multi-channel response triggers.",
      "CRM hygiene scans to detect duplicate opportunities and stale records.",
      "Deal stage integrity analysis to ensure accurate pipeline reporting.",
      "Follow-up compliance monitoring and automated SDR activity logging.",
      "AI sales assistant usage audits and prompt registry optimization.",
      "Automated proposal generation and multi-tier quote approval workflows.",
      "Proactive detection of uncontacted leads and dead pipeline segments.",
      "Attribution mapping and marketing-to-sales handoff synchronization."
    ]
  },
  {
    id: 20,
    title: "Marketing Systems Audit",
    icon: "📣",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    description: "Audits attribution, tracking pixels, and campaign reporting to identify broken tracking, duplicate spend, and untracked conversions.",
    points: [
      "End-to-end attribution modeling and multi-touch tracking validation.",
      "Tracking pixel health checks (Meta, Google, LinkedIn, TikTok) and event firing.",
      "Server-side Conversion API (CAPI) implementation and signal deduplication.",
      "Lead magnet delivery automation and conversion rate optimization.",
      "Unified campaign reporting dashboards and real-time spend tracking.",
      "UTM governance and naming convention enforcement for clean data.",
      "Ad spend leakage detection and low-performing placement pruning.",
      "Disconnected form detection and webhook delivery verification.",
      "Email deliverability and DNS authentication (SPF, DKIM, DMARC) for sending reputation.",
      "Audience list hygiene, bounce scrubbing, and automated ad platform custom audience refresh.",
      "Marketing automation trigger reliability monitoring for behavioral follow-up sequences."
    ]
  },
  {
    id: 21,
    title: "Finance Operations Audit",
    icon: "💳",
    color: "bg-amber-50 text-amber-700 border-amber-100",
    description: "Audits cash reporting, AP/AR synchronization, and spend control to identify duplicate payments, subscription creep, and revenue recognition gaps.",
    points: [
      "Automated daily cash position reporting across all bank accounts and gateways.",
      "Real-time synchronization between AP/AR ledgers and project management milestones.",
      "Automated revenue recognition rules based on multi-stage fulfillment data.",
      "Forecasting integrity checks using historical run-rate and active pipeline telemetry.",
      "Digital procurement approval workflows with automated multi-tier limit triggers.",
      "Automated spend control monitoring for real-time shadow SaaS detection.",
      "Duplicate payment detection algorithms scanning multi-vendor invoice history.",
      "Subscription creep audits flagging inactive software seats and auto-renewals."
    ]
  },
  {
    id: 22,
    title: "Cybersecurity & Access Audit",
    icon: "🛡️",
    color: "bg-red-50 text-red-700 border-red-100",
    description: "Evaluates multi-factor authentication (MFA) adoption, privileged access controls, exposed credential monitoring, and endpoint compliance.",
    points: [
      "MFA adoption tracking and enforcement across all corporate and client-facing assets.",
      "Privileged account auditing ensuring administrative controls follow least-privilege principles.",
      "Exposed credential scanning to detect leaked company passwords on the dark web.",
      "Dormant user purging workflows to automatically disable unused or stale accounts.",
      "Centralized SaaS access management with unified permission levels and onboarding/offboarding.",
      "Third-party vendor risk assessments and security compliance verification.",
      "Endpoint compliance monitoring for device health, encryption, and patch status.",
      "Tamper-proof audit logging of all access requests and permission changes."
    ]
  },
  {
    id: 23,
    title: "AI Governance Audit",
    icon: "🤖",
    color: "bg-indigo-50 text-indigo-700 border-indigo-100",
    description: "Evaluates AI shadow usage, prompt ownership, model access controls, hallucination risk, and sensitive data exposure prevention.",
    points: [
      "AI tool inventory and approval workflows to prevent shadow AI data leaks.",
      "Enterprise AI model access management with strict permission levels.",
      "Centralized repository and ownership policies for high-value internal prompts.",
      "Automated PII and proprietary code filters for AI model inputs.",
      "Mandatory human-in-the-loop verification for high-stakes AI outputs.",
      "Vetting of third-party vendor AI data training and privacy policies.",
      "Formal approval workflows for AI-generated client-facing content.",
      "Tamper-proof logging of all AI model interactions and prompt history."
    ]
  }
];

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function BadgeCheckIcon() {
  return (
    <svg className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}

function AuditChecklist() {
  const { user } = Route.useLoaderData();
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 18: true });

  const toggleSection = (id: number) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (open: boolean) => {
    const updated: Record<number, boolean> = {};
    VERTICALS.forEach(v => {
      updated[v.id] = open;
    });
    setOpenSections(updated);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Nav */}
      <header className="px-6 py-4 border-b bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Home
            </Link>
            {user ? (
              <Link to="/portal" className="text-sm font-bold text-indigo-600 border border-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">Dashboard</Link>
            ) : (
              <Link to="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">Login</Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header Section */}
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-4 uppercase tracking-wider">
              Our Diagnostic Standard
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
              The 23-Vertical Master Operational &amp; Automation Framework
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-500">
              We evaluate client operations across 23 specialized pillars. Expand any category below to inspect our rigid, high-standard technical checklists.
            </p>

            <div className="mt-6 flex justify-center gap-4">
              <button
                onClick={() => toggleAll(true)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                Expand All
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="text-sm font-medium text-gray-500 hover:text-gray-700 transition border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Quick-Jump Vertical Nav */}
          <div className="mb-10 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Jump to Vertical</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {VERTICALS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    const el = document.getElementById(`vertical-${v.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition hover:shadow-sm ${v.color}`}
                  title={v.title}
                >
                  <span className="text-sm">{v.icon}</span>
                  <span className="hidden sm:inline">{v.id}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 mb-16">
            {VERTICALS.map((vertical) => {
              const isOpen = !!openSections[vertical.id];
              return (
                <div
                  key={vertical.id}
                  id={`vertical-${vertical.id}`}
                  className="border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200 bg-white"
                >
                  <button
                    onClick={() => toggleSection(vertical.id)}
                    className="w-full flex items-center justify-between p-5 text-left focus:outline-none hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center space-x-4">
                      <span className={`text-2xl p-2 rounded-lg border ${vertical.color}`}>
                        {vertical.icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">Vertical {vertical.id.toString().padStart(2, '0')}</span>
                          {vertical.id === 18 && (
                            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Modern Core
                            </span>
                          )}
                          {vertical.id === 22 && (
                            <span className="bg-orange-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Security Focus
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 leading-tight mt-0.5">
                          {vertical.title}
                        </h3>
                      </div>
                    </div>
                    <span>
                      {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-6 bg-gray-50">
                      <p className="text-sm text-gray-600 mb-4 font-medium italic">
                        {vertical.description}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {vertical.points.map((point, index) => (
                          <div key={index} className="flex items-start space-x-3 bg-white p-3.5 rounded-lg border border-gray-100 shadow-sm">
                            <CheckIcon />
                            <span className="text-sm text-gray-700 leading-normal font-medium">
                              {point}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 pt-4 border-t border-gray-200/60 flex items-center justify-between flex-wrap gap-3">
                        <span className="text-xs text-gray-500">Diagnostic code: SL-AUD-{vertical.id.toString().padStart(2, '0')}</span>
                        <div className="flex items-center gap-2">
                          <Link
                            to={vertical.id === 1 ? '/industries/human-resources' :
                                 vertical.id === 2 ? '/industries/technology' :
                                 vertical.id === 3 ? '/industries/hospitality' :
                                 vertical.id === 4 ? '/industries/education' :
                                 vertical.id === 5 ? '/industries/government' :
                                 vertical.id === 6 ? '/industries/agency' :
                                 vertical.id === 7 ? '/industries/financial-services' :
                                 vertical.id === 8 ? '/industries/legal' :
                                 vertical.id === 9 ? '/industries/agency' :
                                 vertical.id === 10 ? '/industries/ecommerce' :
                                 vertical.id === 11 ? '/industries/legal' :
                                 vertical.id === 12 ? '/industries/marketing' :
                                 vertical.id === 13 ? '/industries/accounting' :
                                 vertical.id === 14 ? '/industries/agency' :
                                 vertical.id === 15 ? '/industries/healthcare' :
                                 vertical.id === 16 ? '/industries/human-resources' :
                                 vertical.id === 17 ? '/industries/construction' :
                                 vertical.id === 18 ? '/industries/technology' :
                                 vertical.id === 19 ? '/industries/saas' :
                                 vertical.id === 20 ? '/industries/marketing' :
                                 vertical.id === 21 ? '/industries/finance' :
                                 vertical.id === 22 ? '/industries/financial-services' :
                                 vertical.id === 23 ? '/industries/legal' : '/'}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition bg-white hover:bg-indigo-50/60 px-3 py-1.5 rounded-lg border border-gray-200"
                          >
                            View Industry Page <ArrowRightIcon />
                          </Link>
                          <a
                            href="https://buy.stripe.com/14AeVdaEE2qv5xQbta08g0b"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition bg-indigo-50/60 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100"
                          >
                            Get 24-Hour Audit <ArrowRightIcon />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Call to Action Banner */}
          <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 rounded-2xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
            <div className="relative z-10 max-w-2xl">
              <span className="bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">
                24/7 Instant Intake Active
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4">
                Inspect your business using this 23-Vertical Audit framework
              </h2>
              <p className="text-indigo-100 mb-6 leading-relaxed">
                Book our <strong>QuickScan&trade; Diagnostic</strong>. For just $997.00, our senior integration architects analyze your entire operational footprint against all 23 verticals and compile a comprehensive 23-page strategic roadmap.
              </p>
              <div className="bg-indigo-950/40 p-4 rounded-xl border border-indigo-700/50 mb-6 flex items-start gap-3">
                <BadgeCheckIcon />
                <p className="text-sm text-indigo-100">
                  <strong>100% Risk-Free:</strong> The $997 audit fee is credited back entirely toward any implementation package if you decide to build with us.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="https://buy.stripe.com/14AeVdaEE2qv5xQbta08g0b"
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-xl text-indigo-900 bg-white hover:bg-indigo-50 transition shadow-lg shrink-0"
                >
                  Secure Your 24-Hour Audit <ArrowRightIcon />
                </a>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center px-6 py-3 border border-indigo-400 text-base font-semibold rounded-xl text-white hover:bg-indigo-800 transition"
                >
                  Submit an Inquiry
                </Link>
              </div>
            </div>
          </div>

        </div>
      </main>

      <footer className="px-6 py-12 border-t text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.
      </footer>
    </div>
  );
}