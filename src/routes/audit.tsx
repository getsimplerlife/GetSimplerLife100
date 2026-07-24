import { MinimalHeader } from "~/components/MinimalHeader";
import { useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Header } from "~/components/Header";
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
    title: "Energy Audit",
    slug: "energy",
    icon: "⚡",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-100",
    description: "Analyzes grid load balancing, predictive maintenance alerts, and renewable energy credit reconciliation.",
    points: [
      "Real-time grid stability monitoring and automated peak-shaving triggers.",
      "Predictive sensor data analysis to identify potential hardware failures before they occur.",
      "Automated tracking and reconciliation of Renewable Energy Credits (RECs).",
      "Field maintenance dispatch automation based on geo-located telemetry.",
      "Compliance reporting for environmental regulations and safety standards."
    ]
  },
  {
    id: 2,
    title: "Manufacturing Audit",
    slug: "manufacturing",
    icon: "🏭",
    color: "bg-cyan-50 text-cyan-700 border-cyan-100",
    description: "Evaluates production line throughput, inventory lifecycle, and quality control automation.",
    points: [
      "IoT-driven production line speed optimization and downtime tracking.",
      "Just-in-Time (JIT) inventory replenishment triggers synced with order flow.",
      "Automated visual inspection using AI to detect surface-level defects.",
      "Worker safety monitoring and incident report auto-generation.",
      "Supply chain transparency tracking from raw material to finished product."
    ]
  },
  {
    id: 3,
    title: "Automotive Audit",
    slug: "automotive",
    icon: "🚗",
    color: "bg-yellow-50 text-yellow-700 border-yellow-100",
    description: "Audits vehicle lifecycle data, parts supply chain, and dealership inventory sync.",
    points: [
      "Vehicle identification number (VIN) level tracking across the full supply chain.",
      "Automated service reminder dispatch based on real-time vehicle mileage telemetry.",
      "Dealer inventory management automation and cross-location stock balancing.",
      "Warranty claim processing automation and fraud detection filters.",
      "Regulatory compliance tracking for emissions and safety recalls."
    ]
  },
  {
    id: 4,
    title: "Financial Services Audit",
    slug: "financial-services",
    icon: "💰",
    color: "bg-green-50 text-green-700 border-green-100",
    description: "Evaluates loan processing workflows, AML/KYC compliance, and automated wealth management reporting.",
    points: [
      "Automated loan application routing and preliminary credit risk scoring.",
      "Real-time AML/KYC document verification and background check triggers.",
      "Automated portfolio performance report generation and client dispatch.",
      "Fraud detection algorithms scanning for anomalous transaction patterns.",
      "Compliance audit trail automation for SEC/FINRA regulatory requirements."
    ]
  },
  {
    id: 5,
    title: "Logistics Audit",
    slug: "logistics",
    icon: "🚚",
    color: "bg-amber-500/10 text-amber-400 border-amber-100",
    description: "Audits route optimization, warehouse space utilization, and last-mile delivery tracking.",
    points: [
      "AI-driven route planning to minimize fuel consumption and delivery times.",
      "Warehouse bin-level inventory tracking and automated picking path generation.",
      "Real-time shipment tracking updates and automated delay notifications.",
      "Carrier performance auditing and automated bill-of-lading reconciliation.",
      "Driver hours-of-service (HOS) monitoring and compliance logging."
    ]
  },
  {
    id: 6,
    title: "Healthcare Audit",
    slug: "healthcare",
    icon: "🏥",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-100",
    description: "Evaluates patient intake efficiency, HIPAA-compliant document storage, and insurance claim reconciliation.",
    points: [
      "Digital patient intake forms with automated data sync to EMR systems.",
      "HIPAA-compliant document archival with strict access control logging.",
      "Automated insurance eligibility verification and claim status tracking.",
      "Patient appointment reminder sequences (SMS/Email) to reduce no-shows.",
      "Medical supply inventory tracking and automated restock triggers."
    ]
  },
  {
    id: 7,
    title: "Agriculture Audit",
    slug: "agriculture",
    icon: "🌾",
    color: "bg-green-50 text-green-700 border-green-100",
    description: "Audits yield projections, automated irrigation schedules, and livestock health tracking.",
    points: [
      "Yield prediction models based on historical data and current soil sensors.",
      "Automated irrigation systems triggered by real-time weather and soil moisture telemetry.",
      "Livestock health monitoring via wearable sensors and health alert triggers.",
      "Harvest labor scheduling and equipment maintenance automation.",
      "Pesticide and fertilizer application logging for regulatory compliance."
    ]
  },
  {
    id: 8,
    title: "Legal Audit",
    slug: "legal",
    icon: "⚖️",
    color: "bg-violet-50 text-violet-700 border-violet-100",
    description: "Evaluates case document indexing, automated discovery pipelines, and billable hour tracking.",
    points: [
      "Automated document classification and OCR-based indexing for case files.",
      "Electronic discovery (eDiscovery) pipelines with AI-assisted relevance tagging.",
      "Billable hour capture automation via calendar and communication log sync.",
      "Client onboarding automation including engagement letters and conflict checks.",
      "Legal deadline monitoring and automated task escalation."
    ]
  },
  {
    id: 9,
    title: "Accounting Audit",
    slug: "accounting",
    icon: "📊",
    color: "bg-teal-50 text-teal-700 border-teal-100",
    description: "Audits accounts payable workflows, automated ledger reconciliation, and tax deadline tracking.",
    points: [
      "Automated AP processing with OCR invoice extraction and approval workflows.",
      "Real-time bank statement reconciliation against general ledger entries.",
      "Tax document collection automation and deadline management.",
      "Expense report auditing and automated reimbursement triggers.",
      "Fixed asset depreciation tracking and automated schedule updates."
    ]
  },
  {
    id: 10,
    title: "SaaS Audit",
    slug: "saas",
    icon: "☁️",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-100",
    description: "Evaluates churn prediction models, automated user onboarding, and SaaS seat utilization.",
    points: [
      "Churn risk scoring based on user activity levels and support ticket frequency.",
      "Self-service onboarding flows with automated product tour triggers.",
      "License utilization tracking to identify inactive seats and upsell opportunities.",
      "Automated recurring billing reconciliation and failed payment recovery.",
      "Product usage telemetry aggregation for executive reporting."
    ]
  },
  {
    id: 11,
    title: "Technology Audit",
    slug: "technology",
    icon: "💻",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    description: "Audits software release cycles, API usage limits, and internal tool sprawl.",
    points: [
      "CI/CD pipeline monitoring and automated deployment status notifications.",
      "API rate limit tracking and automated alerting for threshold breaches.",
      "Inventory of internal tools and automated unused software seat purging.",
      "Technical debt backlog analysis and prioritization mapping.",
      "Cloud resource cost monitoring and automated spend spike alerts."
    ]
  },
  {
    id: 12,
    title: "Finance Audit",
    slug: "finance",
    icon: "💳",
    color: "bg-cyan-50 text-cyan-700 border-cyan-100",
    description: "Evaluates cash flow reporting, treasury management, and spend control automation.",
    points: [
      "Automated daily cash position reporting across all global bank accounts.",
      "Treasury management automation for interest optimization and liquidity.",
      "Digital spend controls with automated multi-tier approval triggers.",
      "Shadow SaaS detection algorithms scanning corporate card transactions.",
      "Revenue recognition automation based on contract fulfillment data."
    ]
  },
  {
    id: 13,
    title: "Agency Audit",
    slug: "agency",
    icon: "🎯",
    color: "bg-pink-50 text-pink-700 border-pink-100",
    description: "Audits client project profitability, automated reporting, and creative asset management.",
    points: [
      "Real-time project profitability tracking against budget and labor hours.",
      "Automated client-facing performance reports pulling from multi-platform data.",
      "Centralized creative asset management with version control and approval logs.",
      "Client onboarding automation and brief intake workflows.",
      "Contract renewal monitoring and automated follow-up sequences."
    ]
  },
  {
    id: 14,
    title: "Insurance Audit",
    slug: "insurance",
    icon: "🛡️",
    color: "bg-sky-50 text-sky-700 border-sky-100",
    description: "Evaluates policy issuance automation, claim adjudication workflows, and risk assessment AI.",
    points: [
      "Automated policy generation and electronic dispatch to policyholders.",
      "AI-assisted claim adjudication to flag suspicious or low-confidence claims.",
      "Actuarial risk assessment models updated with real-time data feeds.",
      "Agency commission calculation automation and payout tracking.",
      "Regulatory reporting automation for state-level insurance mandates."
    ]
  },
  {
    id: 15,
    title: "Telecommunications Audit",
    slug: "telecommunications",
    icon: "📡",
    color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
    description: "Audits network uptime telemetry, subscriber lifecycle management, and hardware provisioning.",
    points: [
      "Real-time network node health monitoring and automated fault detection.",
      "Subscriber churn prediction and automated retention offer triggers.",
      "Network equipment inventory tracking and automated restock orders.",
      "Service outage notification automation via SMS and app push.",
      "Regulatory compliance logging for spectrum usage and safety."
    ]
  },
  {
    id: 16,
    title: "Retail Audit",
    slug: "retail",
    icon: "🏬",
    color: "bg-red-50 text-red-700 border-red-100",
    description: "Evaluates store level inventory sync, point-of-sale data integrity, and labor scheduling.",
    points: [
      "Real-time store-to-warehouse inventory synchronization.",
      "Automated labor scheduling based on foot traffic and sales projections.",
      "POS data auditing to detect shrinkage and transaction anomalies.",
      "Local store marketing automation via geo-fenced mobile notifications.",
      "Vendor delivery window tracking and automated delay alerts."
    ]
  },
  {
    id: 17,
    title: "Ecommerce Audit",
    slug: "ecommerce",
    icon: "🛒",
    color: "bg-orange-50 text-orange-700 border-orange-100",
    description: "Audits shopping cart abandonment flows, automated customer reviews, and fraud prevention.",
    points: [
      "Multi-stage cart abandonment recovery sequences (Email/SMS/Push).",
      "Automated customer review requests triggered post-delivery.",
      "Real-time fraud scoring for high-value orders and suspicious IPs.",
      "Dynamic pricing engines based on competitor levels and inventory data.",
      "Reverse logistics automation for streamlined returns and exchanges."
    ]
  },
  {
    id: 18,
    title: "Marketing Audit",
    slug: "marketing",
    icon: "📣",
    color: "bg-pink-50 text-pink-700 border-pink-100",
    description: "Evaluates campaign attribution accuracy, CRM hygiene, and lead scoring models.",
    points: [
      "End-to-end attribution modeling across paid and organic channels.",
      "Automated CRM hygiene scans for duplicate and stale records.",
      "AI-driven lead scoring models updated with behavioral telemetry.",
      "Content calendar automation and cross-platform publishing sync.",
      "Email list hygiene and automated bounce scrubbing."
    ]
  },
  {
    id: 19,
    title: "Construction Audit",
    slug: "construction",
    icon: "🏗️",
    color: "bg-amber-500/10 text-amber-400 border-amber-100",
    description: "Audits project budget burn, safety compliance logs, and vendor payment triggers.",
    points: [
      "Real-time project cost tracking against initial budget estimates.",
      "Safety incident log automation and mandatory compliance check alerts.",
      "Subcontractor milestone verification and automated payment triggers.",
      "Equipment rental tracking and automated return notifications.",
      "Supply chain tracking for critical materials (steel, lumber, concrete)."
    ]
  },
  {
    id: 20,
    title: "Real Estate Audit",
    slug: "real-estate",
    icon: "🏠",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    description: "Evaluates property listing sync, automated lead follow-up, and lease renewal tracking.",
    points: [
      "Automated property listing syndication across major portals.",
      "Instant lead response triggers and automated follow-up sequences.",
      "Lease renewal tracking and automated notification dispatch.",
      "Property maintenance ticket automation and vendor dispatch.",
      "Transaction management automation from offer to closing."
    ]
  },
  {
    id: 21,
    title: "Government Audit",
    slug: "government",
    icon: "🏛️",
    color: "bg-stone-900 text-stone-300 border-stone-100",
    description: "Audits public record accessibility, grant management workflows, and procurement compliance.",
    points: [
      "Automated indexing and searchability of public records and documents.",
      "Grant application tracking and milestone reporting automation.",
      "Procurement workflow automation with strict regulatory guardrails.",
      "Public inquiry routing and automated response systems.",
      "Legislative tracking and automated impact reporting."
    ]
  },
  {
    id: 22,
    title: "Hospitality Audit",
    slug: "hospitality",
    icon: "🏨",
    color: "bg-rose-500/10 text-rose-400 border-rose-100",
    description: "Evaluates booking system integrity, housekeeping automation, and guest sentiment AI.",
    points: [
      "Real-time room availability sync across global distribution systems.",
      "Housekeeping management automation with real-time status updates.",
      "AI-driven guest review analysis and automated response drafting.",
      "Guest service request routing and escalation tracking.",
      "Loyalty program management and automated reward dispatch."
    ]
  },
  {
    id: 23,
    title: "Restaurants Audit",
    slug: "restaurants",
    icon: "🍽️",
    color: "bg-orange-50 text-orange-700 border-orange-100",
    description: "Audits inventory waste, labor cost ratios, and online order integration.",
    points: [
      "Food waste tracking and automated order quantity adjustments.",
      "Labor cost monitoring against real-time sales and foot traffic.",
      "Online order integration sync between platforms and kitchen displays.",
      "Digital menu management and automated price updates.",
      "Customer feedback collection and loyalty program integration."
    ]
  },
  {
    id: 24,
    title: "Human Resources Audit",
    slug: "human-resources",
    icon: "👥",
    color: "bg-lime-50 text-lime-700 border-lime-100",
    description: "Evaluates personnel records, onboarding flow, and automated seat provisioning.",
    points: [
      "Secure centralized storage of all employee/contractor records.",
      "Automated document generation (offer letters, NDAs, compliance).",
      "Auto-triggering of background checks from ATS systems.",
      "Automated software seat and email account provisioning/exit.",
      "Self-service PTO tracking and team calendar sync."
    ]
  },
  {
    id: 25,
    title: "Education Audit",
    slug: "education",
    icon: "📚",
    color: "bg-purple-50 text-purple-700 border-purple-100",
    description: "Audits student enrollment data, curriculum delivery sync, and grant compliance.",
    points: [
      "Digital student enrollment and automated data sync to SIS systems.",
      "Curriculum delivery tracking and automated assessment grading.",
      "Grant fund usage tracking and automated compliance reporting.",
      "Parent/Student communication automation and event notifications.",
      "Faculty workload monitoring and automated scheduling."
    ]
  },
  {
    id: 26,
    title: "Nonprofits Audit",
    slug: "nonprofits",
    icon: "🤝",
    color: "bg-stone-900 text-stone-300 border-stone-100",
    description: "Evaluates donor management hygiene, automated grant reporting, and volunteer tracking.",
    points: [
      "Donor database hygiene and automated tax receipt dispatch.",
      "Grant milestone tracking and automated reporting pipelines.",
      "Volunteer onboarding and hour tracking automation.",
      "Campaign performance reporting and real-time spend tracking.",
      "Compliance audit trail automation for 501(c)(3) requirements."
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
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 1: true });

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
    <div className="flex flex-col min-h-screen bg-stone-950">
      {/* Nav */}
      <Header businessName="Simpler Life 100" user={user} />

      
      <MinimalHeader />
      <main className="flex-1 py-12 md:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Header Section */}
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-4 uppercase tracking-wider">
              Our Diagnostic Standard
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
              The 26-Vertical Master Operational &amp; Automation Framework
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-500">
              We evaluate client operations across 26 specialized industry verticals. Expand any category below to inspect our rigid, high-standard technical checklists.
            </p>

            <div className="mt-6 flex justify-center gap-4">
              <button
                onClick={() => toggleAll(true)}
                className="text-sm font-medium text-emerald-400 hover:text-emerald-400 transition border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
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
          <div className="mb-10 bg-stone-950 border border-gray-200 rounded-xl p-4 shadow-sm">
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition hover:shadow-black/20 ${v.color}`}
                  title={v.title}
                >
                  <span className="text-sm">{v.icon}</span>
                  <span className="hidden sm:inline text-[10px] font-bold uppercase">{v.slug.replace('-', ' ')}</span>
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
                  className="border border-gray-200 rounded-xl overflow-hidden shadow-black/20 hover:shadow-md transition duration-200 bg-white"
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
                          <div key={index} className="flex items-start space-x-3 bg-stone-950 p-3.5 rounded-lg border border-gray-100 shadow-sm">
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
                            to={`/industries/${vertical.slug}` as any}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-emerald-400 transition bg-stone-950 hover:bg-emerald-50/60 px-3 py-1.5 rounded-lg border border-gray-200"
                          >
                            View Industry Page <ArrowRightIcon />
                          </Link>
                          <a
                            href="https://buy.stripe.com/14A8wRgFp0RFd5Feec2Fa1a"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-400 transition bg-emerald-50/60 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-100"
                          >
                            Get Deep-Dive Audit <ArrowRightIcon />
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
          <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
            <div className="relative z-10 max-w-2xl">
              <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">
                Deep Diagnostics Active
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-4">
                Inspect your business using this 26-Vertical Audit framework
              </h2>
              <p className="text-emerald-100 mb-6 leading-relaxed">
                Book our <strong>Deep-Dive AI Opportunity Audit</strong>. For $2,500.00, our senior integration architects analyze your entire operational footprint against all 26 verticals and compile a comprehensive strategic roadmap.
              </p>
              <div className="bg-emerald-950/40 p-4 rounded-xl border border-emerald-700/50 mb-6 flex items-start gap-3">
                <BadgeCheckIcon />
                <p className="text-sm text-emerald-100">
                  <strong>100% Risk-Free:</strong> The $2,500 audit fee is credited back entirely toward any implementation package if you decide to build with us.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="https://buy.stripe.com/14A8wRgFp0RFd5Feec2Fa1a"
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-bold rounded-xl text-emerald-900 bg-stone-950 hover:bg-emerald-500/10 transition shadow-lg shrink-0"
                >
                  Secure Your Deep-Dive Audit <ArrowRightIcon />
                </a>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center px-6 py-3 border border-emerald-400 text-base font-semibold rounded-xl text-white hover:bg-emerald-800 transition"
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
