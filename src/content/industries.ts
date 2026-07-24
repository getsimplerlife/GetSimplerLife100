export interface IndustryHub {
  id: string;
  name: string;
  icon: string;
  accent: string;
  bgLight: string;
  tagline: string;
  hook: string;
  description: string;
  painPoints: { title: string; description: string; hoursPerWeek?: number }[];
  kpis: { value: string; label: string }[];
  workflows: string[];
  integrations: string[];
  auditPackages: {
    efficiency: { price: string; features: string[] };
    deepDive: { price: string; features: string[] };
  };
  relatedCaseStudies: string[];
  resultsHeadline: string;
}

export const industries: IndustryHub[] = [
  {
    id: "manufacturing",
    name: "Manufacturing",
    icon: "🏭",
    accent: "#0891b2",
    bgLight: "bg-cyan-50",
    tagline: "Precision automation. Lean operations.",
    hook: "Manual document review and inventory reconciliation are massive overhead costs for modern manufacturers.",
    description:
      "Manufacturers lose millions to operational friction — manual QA documentation, fragmented inventory tracking, and paper-based shop floor reporting. Simpler Life 100 deploys AI coworkers that digitize every step: from incoming material inspection to finished goods release. Our agents integrate directly with your ERP, MES, and quality systems, eliminating data entry and giving you real-time visibility into production health.",
    painPoints: [
      {
        title: "Manual QA Documentation",
        description:
          "Quality assurance teams spend hours manually transcribing inspection results into spreadsheets and ERP modules. Errors go unnoticed until downstream audits catch them.",
        hoursPerWeek: 18,
      },
      {
        title: "Inventory Reconciliation Chaos",
        description:
          "Inventory data lives in disconnected systems — raw materials in one, WIP in another, finished goods in a third. Reconciling across them requires constant manual intervention and spreadsheet gymnastics.",
        hoursPerWeek: 12,
      },
      {
        title: "Paper-Based Shop Floor Reporting",
        description:
          "Production operators fill out paper logs that sit in a binder until someone manually enters them into the system. Real-time decision-making is impossible.",
        hoursPerWeek: 15,
      },
      {
        title: "Supply Chain Exception Handling",
        description:
          "Supplier delays, material shortages, and quality holds trigger manual notification chains. Each exception takes 45+ minutes of phone-tag and email forwarding to resolve.",
        hoursPerWeek: 10,
      },
      {
        title: "Production Scheduling Bottlenecks",
        description:
          "Schedulers manually balance machine capacity, labor availability, and material supply daily. One change cascades into hours of re-planning.",
        hoursPerWeek: 20,
      },
    ],
    kpis: [
      { value: "2.1x", label: "Measured efficiency gain" },
      { value: "50%", label: "Reduction in QC overhead" },
      { value: "99.9%", label: "Inventory data accuracy" },
      { value: "85%", label: "Faster order processing" },
    ],
    workflows: [
      "invoice-automation",
      "purchase-order-management",
      "inventory-reconciliation",
      "supplier-communication",
      "production-reporting",
      "quality-assurance",
      "erp-updates",
      "data-entry-automation",
      "document-processing",
      "compliance-reporting",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "ms-dynamics-365",
      "quickbooks",
      "sharepoint",
      "outlook",
      "power-bi",
      "jira",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "QA document workflow audit",
          "Inventory reconciliation cycle analysis",
          "QC logging process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full manufacturing operations audit",
          "Supply chain automation analysis",
          "Production scheduling optimization plan",
          "Lean AI deployment roadmap",
          "Custom ROI projections for AI coworkers",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
      "redwood-industrial",
      "pioneer-aerospace",
    ],
    resultsHeadline:
      "Manufacturing clients reclaim 2.1x efficiency and cut QC overhead by 50% within the first quarter.",
  },
  {
    id: "logistics",
    name: "Logistics",
    icon: "🚚",
    accent: "#ca8a04",
    bgLight: "bg-yellow-50",
    tagline: "Ship faster. Optimize routes. Eliminate delays.",
    hook: "Logistics profits are made or lost on route efficiency and delivery accuracy.",
    description:
      "The logistics industry runs on paper — dispatch boards, delivery receipts, driver logs, and freight invoices that all require manual processing. Simpler Life 100 eliminates this paperwork with AI agents that automate dispatch scheduling, real-time route optimization, carrier rate comparisons, proof-of-delivery capture, and freight audit reconciliation. Your team gains hours every day while your on-time performance climbs.",
    painPoints: [
      {
        title: "Manual Dispatch Scheduling",
        description:
          "Dispatchers spend 2+ hours every morning building routes on a whiteboard, manually calling drivers, and juggling last-minute changes.",
        hoursPerWeek: 25,
      },
      {
        title: "Paper Proof-of-Delivery",
        description:
          "Drivers collect paper signatures that get lost, fade, or sit in cabs for days. Without POD, invoices can't be sent and disputes pile up.",
        hoursPerWeek: 8,
      },
      {
        title: "Freight Invoice Reconciliation",
        description:
          "Every carrier sends a different invoice format. AP teams manually cross-reference rates against contracts, taking 10-15 minutes per invoice.",
        hoursPerWeek: 20,
      },
      {
        title: "Real-Time Shipment Tracking Gap",
        description:
          "Customers call for updates because there's no automated status feed. CSRs spend 30% of their day answering 'where's my load?' questions.",
        hoursPerWeek: 15,
      },
      {
        title: "Carrier Communication Fragmentation",
        description:
          "Rate requests, schedule changes, and issue resolution happen across phone, email, and text — with no audit trail.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "98%", label: "On-time delivery rate" },
      { value: "22%", label: "Fuel cost reduction" },
      { value: "2.0x", label: "ROI on automation investment" },
      { value: "140 hrs", label: "Monthly labor hours saved" },
    ],
    workflows: [
      "dispatch-scheduling",
      "route-optimization",
      "carrier-coordination",
      "pod-collection",
      "freight-audit",
      "invoice-automation",
      "supplier-communication",
      "data-entry-automation",
      "document-processing",
      "compliance-reporting",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "outlook",
      "gmail",
      "google-drive",
      "quickbooks",
      "slack",
      "ms-teams",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Dispatch & routing workflow audit",
          "On-time delivery performance analysis",
          "Fuel efficiency opportunity assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full logistics operations audit",
          "Route optimization & fuel savings analysis",
          "Dispatch scheduling automation plan",
          "Shipment tracking & proof-of-delivery assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastline-logistics",
      "thunder-freight",
      "harbor-supply-chain",
    ],
    resultsHeadline:
      "Logistics operators reclaim 140+ labor hours monthly while boosting on-time delivery to 98%.",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: "🏥",
    accent: "#059669",
    bgLight: "bg-emerald-50",
    tagline: "HIPAA-compliant automation for providers",
    hook: "Automate patient intake, scheduling, and compliance documentation.",
    description:
      "Healthcare providers are drowning in administrative overhead. Clinical staff spend 40%+ of their day on data entry, phone calls, and paper forms instead of patient care. Simpler Life 100's AI coworkers handle patient intake, insurance verification, appointment scheduling, medical coding prep, and compliance documentation — all within your existing EHR and practice management systems. HIPAA-compliant by design.",
    painPoints: [
      {
        title: "Manual Patient Intake",
        description:
          "Patients fill paper forms that staff manually transcribe into the EHR. Each new patient takes 15-20 minutes of typing, and errors in transcription cause downstream billing issues.",
        hoursPerWeek: 40,
      },
      {
        title: "Insurance Verification by Phone/Fax",
        description:
          "Staff spend hours on hold with insurance companies, manually verifying eligibility. Each verification takes 8-12 minutes, and benefits summaries arrive by fax hours later.",
        hoursPerWeek: 15,
      },
      {
        title: "Appointment Scheduling Friction",
        description:
          "Phone calls for scheduling dominate front desk time. No-show rates of 15-30% persist because reminder systems are manual or non-existent.",
        hoursPerWeek: 30,
      },
      {
        title: "Medical Coding Backlog",
        description:
          "Clinicians dictate notes that sit in a queue for coders. Average turnaround is 3-5 days, delaying billing cycles and cash flow.",
        hoursPerWeek: 25,
      },
      {
        title: "Compliance Documentation Overhead",
        description:
          "HIPAA audits require meticulous documentation of PHI access, policy attestations, and breach logs. Collecting evidence takes weeks.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "18+ hrs", label: "Saved per provider weekly" },
      { value: "94%", label: "No-show reduction achieved" },
      { value: "100%", label: "HIPAA compliance assured" },
      { value: "60%", label: "Faster claims processing" },
    ],
    workflows: [
      "patient-intake",
      "appointment-scheduling",
      "insurance-verification",
      "medical-coding",
      "claims-processing",
      "compliance-reporting",
      "document-processing",
      "data-entry-automation",
      "onboarding",
      "client-intake",
    ],
    integrations: [
      "epic",
      "cerner",
      "salesforce",
      "outlook",
      "gmail",
      "google-drive",
      "sharepoint",
      "ms-teams",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "HIPAA/PHI compliance gap analysis",
          "Patient intake workflow map",
          "Scheduling bottleneck identification",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full HIPAA compliance diagnostic",
          "Patient intake & scheduling audit",
          "Medical coding workflow assessment",
          "Claims cycle time analysis",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "mercy-health-partners",
      "premier-dental-group",
      "northstar-urgent-care",
    ],
    resultsHeadline:
      "Healthcare providers save 18+ hours per provider weekly while cutting no-show rates by 94%.",
  },
  {
    id: "construction",
    name: "Construction",
    icon: "🏗️",
    accent: "#d97706",
    bgLight: "bg-amber-50",
    tagline: "Protect margins. Win bids. Deliver on time.",
    hook: "Construction margins live or die on accurate estimates and field reporting.",
    description:
      "Construction firms operate on razor-thin margins where every delay, change order, and rework cycle erodes profitability. Simpler Life 100 automates the manual workflows that drain your team — bid generation from project specs, change order tracking across subcontractors, daily field report digitization, material procurement matching, and progress billing. Your project managers get real-time visibility instead of weekly spreadsheets.",
    painPoints: [
      {
        title: "Manual Bid Preparation",
        description:
          "Estimators spend 15-30 hours per week compiling bids from spreadsheets, searching for historical pricing, and manually calculating material quantities.",
        hoursPerWeek: 25,
      },
      {
        title: "Change Order Chaos",
        description:
          "Change orders travel through email threads, text messages, and paper forms. Tracking approvals and budget impact across 20+ subcontractors is impossible.",
        hoursPerWeek: 15,
      },
      {
        title: "Paper Field Reports",
        description:
          "Superintendents fill daily logs by hand. These sit in a truck until someone drives them to the office, where they're entered into the system 2-3 days late.",
        hoursPerWeek: 12,
      },
      {
        title: "Material Price Tracking",
        description:
          "Material costs fluctuate weekly, but active project budgets reflect pricing from months ago. Nobody knows the real margin until the job is done.",
        hoursPerWeek: 8,
      },
      {
        title: "Progress Billing Bottleneck",
        description:
          "Billing requires manually aggregating work completed, materials delivered, and change orders approved. Each invoice takes 4-6 hours to prepare.",
        hoursPerWeek: 18,
      },
    ],
    kpis: [
      { value: "20+ hrs", label: "Saved per estimator weekly" },
      { value: "35%", label: "Faster project closeouts" },
      { value: "2.5x", label: "Bid submission speed increase" },
      { value: "15%", label: "Margin improvement" },
    ],
    workflows: [
      "invoice-automation",
      "purchase-order-management",
      "data-entry-automation",
      "document-processing",
      "compliance-reporting",
      "contract-review",
      "onboarding",
      "payroll-processing",
      "supplier-communication",
      "production-reporting",
    ],
    integrations: [
      "procore",
      "autocad",
      "quickbooks",
      "oracle-netsuite",
      "sharepoint",
      "outlook",
      "google-drive",
      "ms-teams",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Field reporting workflow audit",
          "Change order process efficiency analysis",
          "Budget tracking gap assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full project operations audit",
          "Estimation accuracy & bid win-rate analysis",
          "Change order lifecycle assessment",
          "Field-to-office data flow audit",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "summit-construction",
      "pacific-builders",
      "atlantic-infrastructure",
    ],
    resultsHeadline:
      "Construction firms save 20+ hours per estimator each week and close out projects 35% faster.",
  },
  {
    id: "financial-services",
    name: "Financial Services",
    icon: "💰",
    accent: "#15803d",
    bgLight: "bg-green-50",
    tagline: "Meet every regulatory requirement — automatically",
    hook: "Financial services face the heaviest compliance burden of any industry.",
    description:
      "Banks, fintechs, and investment firms operate under a microscope of regulatory scrutiny. Non-compliance is not an option, yet compliance teams spend weeks manually collecting evidence, reconciling transactions, and preparing for exams. Simpler Life 100 deploys AI agents that continuously monitor regulatory changes, map controls to requirements, generate audit-ready evidence packages, and automate KYC/AML workflows — passing every exam with zero findings.",
    painPoints: [
      {
        title: "Manual Audit Evidence Collection",
        description:
          "Compliance teams spend weeks pulling screenshots, emails, and logs to prove controls are operating effectively. Each exam cycle costs 200+ person-hours of evidence gathering.",
        hoursPerWeek: 30,
      },
      {
        title: "KYC/AML Onboarding Delays",
        description:
          "Client onboarding requires identity verification, background checks, and document collection. Each new client takes 3-5 business days and $150+ in manual processing costs.",
        hoursPerWeek: 20,
      },
      {
        title: "Regulatory Reporting Fragmentation",
        description:
          "Reporting requirements vary by jurisdiction. Data must be pulled from 4+ systems, normalized manually, and formatted differently for each regulator.",
        hoursPerWeek: 15,
      },
      {
        title: "Transaction Alert Overload",
        description:
          "Monitoring systems generate 10,000+ alerts monthly. 97% are false positives that analysts manually review and dismiss — wasting hundreds of hours.",
        hoursPerWeek: 35,
      },
      {
        title: "Policy Attestation Tracking",
        description:
          "Employee policy acknowledgments, training completions, and conflict-of-interest disclosures are tracked in separate spreadsheets. Gaps aren't visible until audit time.",
        hoursPerWeek: 8,
      },
    ],
    kpis: [
      { value: "100%", label: "Audit pass rate achieved" },
      { value: "80%", label: "Faster regulatory reporting" },
      { value: "14 days", label: "Client onboarding time" },
      { value: "3.5x", label: "Compliance team productivity" },
    ],
    workflows: [
      "compliance-reporting",
      "client-intake",
      "onboarding",
      "document-processing",
      "data-entry-automation",
      "contract-review",
      "invoice-automation",
      "ap-ar-automation",
      "payroll-processing",
      "benefits-administration",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "oracle-netsuite",
      "quickbooks",
      "xero",
      "workday",
      "adp",
      "tableau",
      "power-bi",
      "jira",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Regulatory compliance gap analysis",
          "Audit trail quality assessment",
          "Security posture review",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full regulatory compliance audit",
          "KYC/AML onboarding workflow analysis",
          "Transaction monitoring effectiveness assessment",
          "Audit trail completeness verification",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-trust-bank",
      "pacific-capital-group",
      "horizon-wealth-management",
    ],
    resultsHeadline:
      "Financial services firms achieve 100% audit pass rates and cut client onboarding from 5 days to 14 hours.",
  },
  {
    id: "energy",
    name: "Energy",
    icon: "⚡",
    accent: "#059669",
    bgLight: "bg-emerald-50",
    tagline: "Grid-scale efficiency. Automated asset management.",
    hook: "Manual overhead in the energy sector eats into margins through manual intake and asset inspections.",
    description:
      "Energy companies manage thousands of assets across vast geographic areas — from wellheads to wind turbines. Each asset generates inspection reports, maintenance logs, compliance documentation, and production data that must be processed manually. Simpler Life 100's AI agents automate asset data intake, inspection report generation, predictive maintenance scheduling, and regulatory filing preparation — giving you 24/7 operational visibility and eliminating weeks of manual reporting every quarter.",
    painPoints: [
      {
        title: "Asset Data Intake Overload",
        description:
          "New assets arrive with spec sheets, warranty documents, and compliance certificates. Each set of docs takes 45+ minutes to manually enter into the asset management system.",
        hoursPerWeek: 20,
      },
      {
        title: "Inspection Report Logjams",
        description:
          "Field inspectors collect data on paper or tablets. Reports are compiled into PDFs and emailed — someone spends days copying data from PDFs into tracking systems.",
        hoursPerWeek: 25,
      },
      {
        title: "Reactive Maintenance Scheduling",
        description:
          "Maintenance is triggered by breakdowns rather than data. Without automated condition monitoring and work order generation, unplanned downtime costs 3-5x more than scheduled maintenance.",
        hoursPerWeek: 15,
      },
      {
        title: "Disconnected Field Operations",
        description:
          "Field data lives in tablets, email, and paper. Office teams can't see real-time asset status, so decisions are based on yesterday's data.",
        hoursPerWeek: 12,
      },
      {
        title: "Regulatory Filing Burden",
        description:
          "Environmental compliance, safety reporting, and production data must be filed monthly with multiple agencies. Each filing requires pulling data from 4+ silos.",
        hoursPerWeek: 18,
      },
    ],
    kpis: [
      { value: "2.2x", label: "Average efficiency gain" },
      { value: "65%", label: "Reduction in reporting time" },
      { value: "24/7", label: "Automated monitoring availability" },
      { value: "40%", label: "Maintenance cost reduction" },
    ],
    workflows: [
      "data-entry-automation",
      "document-processing",
      "compliance-reporting",
      "production-reporting",
      "invoice-automation",
      "purchase-order-management",
      "supplier-communication",
      "inventory-reconciliation",
      "erp-updates",
      "quality-assurance",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "ms-dynamics-365",
      "sharepoint",
      "power-bi",
      "tableau",
      "outlook",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Asset data intake workflow audit",
          "Inspection reporting cycle assessment",
          "Compliance document review analysis",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full energy operations audit",
          "Predictive maintenance opportunity analysis",
          "Grid-scale automation roadmap",
          "Real-time data integration assessment",
          "Custom ROI model for AI agent deployment",
        ],
      },
    },
    relatedCaseStudies: [
      "sovereign-energy",
      "cascade-power-group",
      "northern-ridge-wind",
    ],
    resultsHeadline:
      "Energy operators report 2.2x efficiency gains and cut reporting time by 65% within 60 days.",
  },
  {
    id: "retail",
    name: "Retail",
    icon: "🏬",
    accent: "#dc2626",
    bgLight: "bg-red-50",
    tagline: "Prevent stockouts. Reduce shrinkage. Sell more.",
    hook: "Retail margins live or die on inventory accuracy and labor efficiency.",
    description:
      "Retailers compete on price and availability, but operational friction erodes both. Inventory counts are outdated, fulfillment is manual, pricing updates are tedious, and customer support teams are overwhelmed during every sale event. Simpler Life 100 automates inventory reconciliation across stores and warehouses, order fulfillment workflows, dynamic pricing updates, and customer support triage. Your team focuses on exceptions instead of manual data entry.",
    painPoints: [
      {
        title: "Reactive Inventory Management",
        description:
          "Stockouts trigger emergency PO workflows that bypass normal procurement. Inventory counts are always 2-3 days behind reality, causing overstock and understock simultaneously.",
        hoursPerWeek: 18,
      },
      {
        title: "Manual Order Fulfillment",
        description:
          "Orders land in the POS, get emailed to fulfillment, picked from paper lists, packed, and shipped — with status updates entered manually at every step.",
        hoursPerWeek: 22,
      },
      {
        title: "Customer Support Spikes",
        description:
          "During sales events, order status and return inquiries spike 4x. CSRs handle each inquiry in 6-8 minutes by checking 2-3 systems manually.",
        hoursPerWeek: 30,
      },
      {
        title: "SKU-Level Pricing Updates",
        description:
          "Promotional pricing requires updating 100s of SKUs individually across the POS and ecommerce platform. Errors cause customer complaints and margin loss.",
        hoursPerWeek: 10,
      },
      {
        title: "Shrinkage Detection Latency",
        description:
          "Inventory shrinkage isn't visible until quarterly physical counts. By then, theft patterns and process failures are months old.",
        hoursPerWeek: 6,
      },
    ],
    kpis: [
      { value: "99.5%", label: "Inventory accuracy achieved" },
      { value: "55%", label: "Shrinkage reduction" },
      { value: "1.6x", label: "ROI on automation investment" },
      { value: "70%", label: "Faster fulfillment cycle" },
    ],
    workflows: [
      "inventory-reconciliation",
      "purchase-order-management",
      "invoice-automation",
      "data-entry-automation",
      "document-processing",
      "supplier-communication",
      "erp-updates",
      "ap-ar-automation",
      "onboarding",
      "payroll-processing",
    ],
    integrations: [
      "quickbooks",
      "xero",
      "salesforce",
      "hubspot",
      "google-drive",
      "sharepoint",
      "slack",
      "ms-teams",
      "outlook",
      "gmail",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Inventory management workflow audit",
          "Order fulfillment cycle analysis",
          "Shrinkage detection process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full retail operations audit",
          "Supply chain & inventory optimization plan",
          "Fulfillment automation opportunity map",
          "Pricing & promotions workflow assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastal-outfitters-retail",
      "summit-sports-group",
      "harbor-markets",
    ],
    resultsHeadline:
      "Retailers achieve 99.5% inventory accuracy and reduce shrinkage by 55% with AI-operated fulfillment.",
  },
  {
    id: "legal",
    name: "Legal",
    icon: "⚖️",
    accent: "#7c3aed",
    bgLight: "bg-violet-50",
    tagline: "Streamline matter management & maximize billable hours",
    hook: "Stop losing 15+ billable hours a week to administrative work.",
    description:
      "Law firms leave millions on the table every year through unbillable administrative work — matter creation, document management, client intake, conflict checking, and billing. Associates at top firms spend 30%+ of their week on tasks that could be fully automated. Simpler Life 100 deploys AI legal assistants that handle intake, conflict checks, document drafting, deadline tracking, and time capture — so every hour worked is an hour billed.",
    painPoints: [
      {
        title: "Non-Billable Administrative Overload",
        description:
          "Attorneys and paralegals spend 30%+ of their week on administrative tasks — opening matters, organizing files, and managing correspondence — that cannot be billed to clients.",
        hoursPerWeek: 15,
      },
      {
        title: "Manual Client Intake",
        description:
          "New client inquiries go through phone, email, and web forms. Intake staff manually enter data into the PMS, run conflict checks, and send engagement letters. Each intake takes 45+ minutes.",
        hoursPerWeek: 20,
      },
      {
        title: "Document Version Chaos",
        description:
          "Contracts and briefs undergo 15+ revisions via email attachments. Without centralized version control, teams waste hours reconciling changes and risk filing the wrong version.",
        hoursPerWeek: 8,
      },
      {
        title: "Conflict Check Bottleneck",
        description:
          "Every new matter requires conflict checks against current and former clients. Staff manually search 3+ databases, and each check takes 15-20 minutes.",
        hoursPerWeek: 10,
      },
      {
        title: "Time Capture Leakage",
        description:
          "Attorneys forget to log small time increments — phone calls, quick emails, document reviews. Industry averages show 5-10% of billable time is never captured.",
        hoursPerWeek: 6,
      },
    ],
    kpis: [
      { value: "12+ hrs", label: "Billable hours recovered weekly" },
      { value: "60%", label: "Faster document turnaround" },
      { value: "99.9%", label: "Deadline compliance rate" },
      { value: "18%", label: "Revenue increase per attorney" },
    ],
    workflows: [
      "contract-review",
      "client-intake",
      "onboarding",
      "document-processing",
      "data-entry-automation",
      "compliance-reporting",
      "invoice-automation",
      "ap-ar-automation",
      "payroll-processing",
      "benefits-administration",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "outlook",
      "gmail",
      "google-drive",
      "sharepoint",
      "dropbox",
      "onedrive",
      "box",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Billable hour recovery opportunity analysis",
          "Document workflow bottleneck mapping",
          "Matter management efficiency audit",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full practice management workflow audit",
          "Billable hour leakage quantification",
          "Document automation opportunity assessment",
          "Conflict check & intake process redesign",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "stonebridge-law-group",
      "crescent-city-legal",
      "maple-ridge-attorneys",
    ],
    resultsHeadline:
      "Law firms recover 12+ billable hours per attorney weekly and boost per-attorney revenue by 18%.",
  },
  {
    id: "insurance",
    name: "Insurance",
    icon: "🛡️",
    accent: "#0284c7",
    bgLight: "bg-sky-50",
    tagline: "Process claims in hours, not weeks",
    hook: "Insurance runs on claims processing speed.",
    description:
      "The insurance industry is defined by claims velocity — the faster you process, the more competitive your premiums and the higher your customer retention. Yet most carriers still enter claim data manually, verify policies across 3+ legacy systems, and route documents through email chains. Simpler Life 100 automates the entire claims lifecycle: first notice of loss intake, policy verification, damage assessment triage, fraud scoring, adjuster assignment, and settlement preparation. Cut weeks of manual review out of every claim.",
    painPoints: [
      {
        title: "Manual Claims Data Entry",
        description:
          "Each new claim requires entering 30+ data fields from phone calls, emails, and paper forms into the claims management system. Errors in data entry cause 15% rework rate.",
        hoursPerWeek: 28,
      },
      {
        title: "Multi-System Policy Verification",
        description:
          "Adjusters manually cross-reference policy details across 3+ legacy systems. Each verification takes 10-15 minutes and pulls data from systems that don't talk to each other.",
        hoursPerWeek: 15,
      },
      {
        title: "Underwriting Document Review",
        description:
          "Claims over a threshold require underwriter review of policy documents, endorsements, and correspondence. Each review takes 45+ minutes of reading and cross-referencing.",
        hoursPerWeek: 20,
      },
      {
        title: "Fraud False-Positive Triage",
        description:
          "Fraud detection flags 15% of claims for review, but 80% of flags are false positives. Investigators waste 70% of their time clearing innocent claims.",
        hoursPerWeek: 18,
      },
      {
        title: "Regulatory Filing Burden",
        description:
          "State-level regulatory filings require monthly data submissions. Each filing pulls data from claims, underwriting, finance, and compliance systems.",
        hoursPerWeek: 12,
      },
    ],
    kpis: [
      { value: "80%", label: "Faster claims processing" },
      { value: "65%", label: "Claim leakage reduction" },
      { value: "1.8x", label: "ROI on automation investment" },
      { value: "95%", label: "Data accuracy rate" },
    ],
    workflows: [
      "claims-processing",
      "document-processing",
      "data-entry-automation",
      "compliance-reporting",
      "client-intake",
      "onboarding",
      "invoice-automation",
      "ap-ar-automation",
      "contract-review",
      "payroll-processing",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "oracle-netsuite",
      "quickbooks",
      "xero",
      "workday",
      "adp",
      "tableau",
      "power-bi",
      "jira",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Claims processing workflow audit",
          "Policy administration cycle assessment",
          "Fraud detection efficiency analysis",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full claims operations audit",
          "Claims lifecycle automation opportunity map",
          "Underwriting process efficiency assessment",
          "Fraud detection model optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "shield-insurance-group",
      "pacific-ridge-underwriters",
      "heritage-life-accident",
    ],
    resultsHeadline:
      "Insurance carriers process claims 80% faster and reduce claim leakage by 65% with AI-operated workflows.",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    icon: "🏠",
    accent: "#2563eb",
    bgLight: "bg-blue-50",
    tagline: "Capture leads faster, close deals sooner",
    hook: "Speed-to-lead is everything in real estate.",
    description:
      "In real estate, the agent who responds first wins the listing or the buyer. But most agents waste hours on administrative work — responding to inquiries, scheduling showings, preparing contracts, managing leads, and entering listing data. Simpler Life 100 automates the entire real estate workflow: instant lead response, intelligent showing coordination, contract drafting, pipeline management, and commission tracking. Your agents spend their time with clients, not on spreadsheets.",
    painPoints: [
      {
        title: "Leads Go Cold Instantly",
        description:
          "80% of buyers contact the first agent who responds. Without automated response, leads sit in your CRM for 30+ minutes — long enough to lose the deal.",
        hoursPerWeek: 25,
      },
      {
        title: "Showing Coordination Nightmare",
        description:
          "Each showing requires 6+ calls or texts between agent, buyer, seller, and listing agent. Scheduling a single showing wastes 45+ minutes of back-and-forth.",
        hoursPerWeek: 12,
      },
      {
        title: "Contract Workflow Fatigue",
        description:
          "Contracts require pulling data from MLS, adding custom terms, calculating prorations, and collecting signatures. Each contract takes 3-4 hours of painstaking work.",
        hoursPerWeek: 15,
      },
      {
        title: "Lead Nurturing Gaps",
        description:
          "After the first week, most agents stop following up systematically. 60% of leads never receive a second contact, leaving thousands in pipeline value on the table.",
        hoursPerWeek: 8,
      },
      {
        title: "MLS Data Duplication",
        description:
          "Listing details are entered into MLS, then re-entered into the CRM, then again into marketing materials. Each listing requires 45+ minutes of duplicate data entry.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "45 sec", label: "Lead response time achieved" },
      { value: "3.4x", label: "More leads converted" },
      { value: "22 hrs", label: "Saved per agent weekly" },
      { value: "60%", label: "Faster contract turnaround" },
    ],
    workflows: [
      "client-intake",
      "onboarding",
      "document-processing",
      "data-entry-automation",
      "contract-review",
      "invoice-automation",
      "compliance-reporting",
      "appointment-scheduling",
      "ap-ar-automation",
      "benefits-administration",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "outlook",
      "gmail",
      "google-drive",
      "sharepoint",
      "dropbox",
      "slack",
      "ms-teams",
      "quickbooks",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Lead response time & conversion audit",
          "Showing coordination workflow analysis",
          "Contract process efficiency assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full sales pipeline & conversion audit",
          "Lead response automation opportunity map",
          "Showing coordination bottleneck analysis",
          "Contract workflow optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "premier-properties-realty",
      "summit-homes-realty",
      "coastal-living-group",
    ],
    resultsHeadline:
      "Real estate agents respond to leads in 45 seconds flat, convert 3.4x more prospects, and save 22 hours weekly.",
  },
  // ============================================================
  // 13 NEW ENTRIES — aerospace through transportation
  // ============================================================

  {
    id: "aerospace",
    name: "Aerospace",
    icon: "✈️",
    accent: "#0284c7",
    bgLight: "bg-sky-50",
    tagline: "Mission-critical precision — automated",
    hook: "Every design change in aerospace triggers a paper trail across engineering, quality, supply chain, and regulators.",
    description:
      "Aerospace manufacturers operate under AS9100 standards where a single missing signature can ground a production line. Simpler Life 100 deploys AI operations teams that automate engineering change notice routing, supplier quality documentation, FAA and ITAR compliance reporting, and government contract billing. Your engineers focus on flight-critical work while our AI agents handle the documentation chain with 100% traceability — audit-ready at every step.",
    painPoints: [
      {
        title: "Engineering Change Notice Backlogs",
        description:
          "Every design change triggers a paper trail across engineering, quality, supply chain, and the FAA. Manual ECN routing takes 3–7 days, and a single missing signature can ground a production line. Most shops have 15–30 open ECNs at any time.",
        hoursPerWeek: 20,
      },
      {
        title: "Supplier Quality Documentation",
        description:
          "AS9100 requires traceable supplier quality records for every part. Receiving teams manually match certs, C of Cs, material test reports, and process specs against POs — 12–18 minutes per shipment, with errors creating audit exposure.",
        hoursPerWeek: 15,
      },
      {
        title: "Regulatory Compliance Reporting",
        description:
          "FAA, EASA, and ITAR compliance require meticulous documentation. Quarterly reports pull data from 5+ disconnected systems. One missed filing costs $10K+ in penalties and puts certifications at risk.",
        hoursPerWeek: 12,
      },
      {
        title: "Government Contract Billing",
        description:
          "DCAA-compliant billing requires exact labor hour tracking, cost allocation, and audit-ready documentation. Manual reconciliation across timekeeping, project management, and accounting takes 20+ hours per billing cycle.",
        hoursPerWeek: 18,
      },
    ],
    kpis: [
      { value: "65%", label: "Faster ECN cycle time" },
      { value: "4.2x", label: "First-year ROI multiplier" },
      { value: "99.8%", label: "Documentation accuracy" },
      { value: "$48K", label: "Avoided compliance penalties" },
    ],
    workflows: [
      "document-processing",
      "compliance-reporting",
      "contract-review",
      "supplier-communication",
      "quality-assurance",
      "production-reporting",
      "data-entry-automation",
      "invoice-automation",
      "purchase-order-management",
      "erp-updates",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "ms-dynamics-365",
      "salesforce",
      "sharepoint",
      "outlook",
      "power-bi",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "ECN routing workflow audit",
          "Supplier quality documentation gap analysis",
          "ITAR compliance screening assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full aerospace operations audit",
          "AS9100 compliance gap analysis",
          "DCAA billing readiness assessment",
          "Supply chain documentation optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "pioneer-aerospace",
      "redwood-industrial",
      "meridian-manufacturing",
    ],
    resultsHeadline:
      "Aerospace manufacturers cut ECN cycle time by 65% and achieve 99.8% documentation accuracy for every audit.",
  },
  {
    id: "agriculture",
    name: "Agriculture",
    icon: "🌾",
    accent: "#65a30d",
    bgLight: "bg-lime-50",
    tagline: "Farm smarter — automate the back office",
    hook: "Agribusiness margins are made or lost in the paperwork between field and market.",
    description:
      "From commodity hedging paperwork to FSMA compliance, agricultural operations run on documentation that's still mostly paper-based. Simpler Life 100 deploys AI coworkers that automate grain settlement reconciliation, FSMA traceability documentation, equipment maintenance scheduling, and supplier invoice processing. Your operation runs smoothly whether you're in the office or in the field — with complete traceability from seed to settlement.",
    painPoints: [
      {
        title: "Commodity Contract Reconciliation",
        description:
          "Grain elevators and processors manage hundreds of contracts with different basis levels, delivery periods, and quality specs. Manually reconciling settlement sheets against contracts takes 8–12 hours per week, and errors cost thousands in incorrect payouts.",
        hoursPerWeek: 12,
      },
      {
        title: "FSMA Traceability Documentation",
        description:
          "The Food Safety Modernization Act requires one-up/one-down traceability for every lot. Paper-based lot tracking means traceability exercises take 24–48 hours when the regulator wants them in under 4.",
        hoursPerWeek: 10,
      },
      {
        title: "Equipment Maintenance Scheduling",
        description:
          "Planting and harvest windows don't wait. Manual maintenance logs and paper-based service records mean preventative work gets skipped until something breaks — and breakdowns during harvest cascade into six-figure losses.",
        hoursPerWeek: 8,
      },
      {
        title: "Supplier Invoice Processing",
        description:
          "Seed, chemical, fertilizer, and fuel invoices arrive in dozens of formats — emailed PDFs, portal downloads, paper bills. AP clerks manually key each into the accounting system, averaging 8 minutes per invoice.",
        hoursPerWeek: 15,
      },
    ],
    kpis: [
      { value: "78%", label: "Faster traceability response" },
      { value: "62%", label: "Reduction in invoice processing time" },
      { value: "99.5%", label: "Settlement accuracy" },
      { value: "3.1x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "invoice-automation",
      "document-processing",
      "inventory-reconciliation",
      "supplier-communication",
      "purchase-order-management",
      "compliance-reporting",
      "data-entry-automation",
      "erp-updates",
      "production-reporting",
      "vendor-invoice-matching",
    ],
    integrations: [
      "quickbooks",
      "oracle-netsuite",
      "sharepoint",
      "outlook",
      "gmail",
      "google-drive",
      "ms-teams",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Commodity contract reconciliation audit",
          "FSMA traceability gap analysis",
          "Maintenance scheduling workflow assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full agribusiness operations audit",
          "Commodity settlement accuracy analysis",
          "Equipment uptime optimization plan",
          "FSMA compliance readiness assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
      "sovereign-energy",
    ],
    resultsHeadline:
      "Agribusinesses achieve 78% faster traceability response and 99.5% settlement accuracy — audit-ready in minutes, not days.",
  },
  {
    id: "automotive",
    name: "Automotive",
    icon: "🚗",
    accent: "#dc2626",
    bgLight: "bg-red-50",
    tagline: "Keep the line moving — automate everything else",
    hook: "JIT manufacturing leaves zero margin for paperwork delays.",
    description:
      "Automotive suppliers operate on razor-thin margins where a single EDI error or missed material release can stop an OEM production line. Simpler Life 100 deploys AI operations teams that automate PPAP documentation, EDI order processing, supplier quality scorecards, and JIT material release management. Our agents keep your supply chain synchronized at production speed — preventing line-down situations that cost $50K+ per hour.",
    painPoints: [
      {
        title: "PPAP Documentation Bottlenecks",
        description:
          "Every new part requires a Production Part Approval Process submission — dozens of documents including PFMEAs, control plans, MSA studies, and dimensional results. Manually assembling a PPAP takes 20–40 hours and delays SOP by weeks.",
        hoursPerWeek: 25,
      },
      {
        title: "EDI Order Processing Errors",
        description:
          "OEMs send 830/862 releases with weekly revisions. Manual EDI translation and order entry leads to mis-shipments, line-down penalties, and premium freight charges that eat 3–5% of revenue.",
        hoursPerWeek: 18,
      },
      {
        title: "Supplier Quality Scorecards",
        description:
          "IATF 16949 requires tracked supplier performance. Quality teams manually pull data from receiving, production, and warranty systems, spending 8 hours per supplier per quarter building scorecards instead of improving supplier quality.",
        hoursPerWeek: 12,
      },
      {
        title: "JIT Material Release Management",
        description:
          "MRP signals change daily. Planners manually adjust material releases across dozens of suppliers — a single missed update means either a line-down or excess inventory carrying cost.",
        hoursPerWeek: 15,
      },
    ],
    kpis: [
      { value: "85%", label: "Faster PPAP submissions" },
      { value: "$120K", label: "Annual premium freight savings" },
      { value: "99.2%", label: "EDI order accuracy" },
      { value: "5.0x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "document-processing",
      "quality-assurance",
      "supplier-communication",
      "purchase-order-management",
      "inventory-reconciliation",
      "production-reporting",
      "compliance-reporting",
      "data-entry-automation",
      "invoice-automation",
      "erp-updates",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "ms-dynamics-365",
      "salesforce",
      "quickbooks",
      "sharepoint",
      "outlook",
      "power-bi",
      "jira",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "PPAP documentation workflow audit",
          "EDI order accuracy assessment",
          "Supplier quality scorecard gap analysis",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full automotive supply chain audit",
          "IATF 16949 compliance assessment",
          "JIT material release optimization plan",
          "Premium freight root cause analysis",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
      "redwood-industrial",
      "pioneer-aerospace",
    ],
    resultsHeadline:
      "Automotive suppliers cut PPAP submission time by 85% and save $120K annually in premium freight alone.",
  },
  {
    id: "e-commerce",
    name: "E-Commerce",
    icon: "📦",
    accent: "#ea580c",
    bgLight: "bg-orange-50",
    tagline: "Sell everywhere — automate operations everywhere",
    hook: "Multi-channel commerce creates multi-channel operational chaos.",
    description:
      "E-commerce brands selling across Shopify, Amazon, Walmart, and wholesale channels drown in order reconciliation, inventory sync, returns processing, and customer support tickets. Simpler Life 100 deploys AI operations teams that reconcile orders across every channel in real time, sync inventory to prevent oversells, automate returns and RMA processing, and triage customer support to auto-resolve 80%+ of tickets. Your team focuses on growth — our AI handles the operations.",
    painPoints: [
      {
        title: "Multi-Channel Order Reconciliation",
        description:
          "Orders from Shopify, Amazon, Walmart Marketplace, and wholesale EDI each have different formats, fee structures, and fulfillment requirements. Manual reconciliation takes 15+ hours per week and oversells cost 3–5% of GMV.",
        hoursPerWeek: 15,
      },
      {
        title: "Supplier Purchase Order Management",
        description:
          "Planners manually convert forecasts into POs across 20–50 suppliers with different lead times, MOQs, and pricing tiers. Stockouts during peak season lose 8–10% of potential revenue.",
        hoursPerWeek: 12,
      },
      {
        title: "Returns & RMA Processing",
        description:
          "Returns from multiple channels with different policies. Manual RMA creation, label generation, disposition assessment, and refund processing takes 8–12 minutes per return — every delay drives a negative review.",
        hoursPerWeek: 20,
      },
      {
        title: "Customer Support Ticket Triage",
        description:
          "WISMO, return requests, product questions, and account issues flood the inbox. Manual triage means simple questions wait hours while complex ones get rushed — hurting CSAT across the board.",
        hoursPerWeek: 25,
      },
    ],
    kpis: [
      { value: "82%", label: "Auto-resolved support tickets" },
      { value: "99.7%", label: "Order reconciliation accuracy" },
      { value: "15%", label: "Inventory carrying cost reduction" },
      { value: "5.5x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "invoice-automation",
      "inventory-reconciliation",
      "order-fulfillment",
      "customer-support-triage",
      "purchase-order-management",
      "supplier-communication",
      "data-entry-automation",
      "document-processing",
      "payment-reconciliation",
      "lead-response",
    ],
    integrations: [
      "quickbooks",
      "xero",
      "salesforce",
      "hubspot",
      "google-drive",
      "sharepoint",
      "slack",
      "ms-teams",
      "outlook",
      "gmail",
      "zendesk",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Order reconciliation workflow audit",
          "Inventory sync gap analysis",
          "Returns processing efficiency assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full e-commerce operations audit",
          "Multi-channel inventory optimization plan",
          "Returns reduction & automation analysis",
          "Support ticket deflection strategy",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastal-outfitters-retail",
      "meridian-manufacturing",
    ],
    resultsHeadline:
      "E-commerce brands auto-resolve 82% of support tickets and achieve 99.7% order reconciliation accuracy across every channel.",
  },
  {
    id: "education",
    name: "Education",
    icon: "📚",
    accent: "#4f46e5",
    bgLight: "bg-indigo-50",
    tagline: "Streamline administration so educators can educate",
    hook: "School administrators spend more time on paperwork than supporting students.",
    description:
      "K-12 districts, community colleges, and universities are buried in enrollment documents, grant compliance reports, procurement requisitions, and faculty onboarding paperwork. Simpler Life 100 deploys AI operations teams that automate new student enrollment processing, federal and state grant compliance tracking, purchase order workflows with multi-level approvals, and faculty onboarding coordination. Your staff reclaims hundreds of hours each semester to focus on educational outcomes.",
    painPoints: [
      {
        title: "Enrollment Document Processing",
        description:
          "Every new student brings transcripts, immunization records, proof of residency, and enrollment forms. Admissions staff manually verify, scan, index, and file each document — 15–20 minutes per student, and peak season means months of overtime.",
        hoursPerWeek: 30,
      },
      {
        title: "Grant & Title Fund Compliance",
        description:
          "Federal and state grants require meticulous documentation of every dollar spent. Manual reconciliation of grant expenditures against approved budgets takes 25+ hours per grant per reporting period — audit findings can claw back funding.",
        hoursPerWeek: 15,
      },
      {
        title: "Purchase Order & Procurement",
        description:
          "Schools order everything from textbooks to HVAC maintenance. Manual PO creation, multi-level approval routing, and budget code verification means requisitions take 5–10 days on average.",
        hoursPerWeek: 10,
      },
      {
        title: "Faculty & Staff Onboarding",
        description:
          "New hires require HR paperwork, credential verification, background checks, IT account provisioning, and benefits enrollment. Manual coordination across HR, IT, and departments means new faculty wait 2–3 weeks for full system access.",
        hoursPerWeek: 8,
      },
    ],
    kpis: [
      { value: "70%", label: "Faster enrollment processing" },
      { value: "85%", label: "Faster procurement cycle" },
      { value: "99.3%", label: "Enrollment document accuracy" },
      { value: "3.5x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "document-processing",
      "onboarding",
      "compliance-reporting",
      "purchase-order-management",
      "data-entry-automation",
      "client-intake",
      "invoice-automation",
      "payroll-processing",
      "benefits-administration",
      "budget-tracking",
    ],
    integrations: [
      "oracle-netsuite",
      "workday",
      "salesforce",
      "outlook",
      "gmail",
      "google-drive",
      "sharepoint",
      "ms-teams",
      "quickbooks",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Enrollment document workflow audit",
          "Grant compliance gap analysis",
          "Procurement cycle time assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full education administration audit",
          "Title fund compliance readiness assessment",
          "Faculty onboarding workflow optimization",
          "Procurement-to-payment cycle analysis",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "mercy-health-partners",
      "meridian-trust-bank",
    ],
    resultsHeadline:
      "Educational institutions cut enrollment processing time by 70% and accelerate procurement cycles by 85%.",
  },
  {
    id: "government",
    name: "Government",
    icon: "🏛️",
    accent: "#475569",
    bgLight: "bg-slate-50",
    tagline: "Serve citizens faster — automate the paperwork",
    hook: "Public records requests and permit backlogs don't just frustrate citizens — they create legal liability.",
    description:
      "Municipal, county, and state agencies face growing citizen expectations with shrinking administrative bandwidth. Simpler Life 100 deploys AI operations teams that automate FOIA and public records request processing, permit application routing across multiple departments, federal grant performance reporting, and constituent correspondence triage. Your agency meets statutory deadlines, reduces processing backlogs by 75%, and gives staff time back for the work that requires human judgment.",
    painPoints: [
      {
        title: "Public Records Request Processing",
        description:
          "FOIA and state open records requests require document search across email, file shares, and legacy systems. Manual searches take 4–12 hours per request, and statutory deadlines mean staff are in constant crisis mode — risking lawsuits and fines.",
        hoursPerWeek: 20,
      },
      {
        title: "Permit Application Processing",
        description:
          "Building permits, business licenses, and environmental permits require multiple department reviews. Paper-based routing takes 2–6 weeks for a simple permit, and lost applications mean citizens restart the process.",
        hoursPerWeek: 25,
      },
      {
        title: "Grant Management & Reporting",
        description:
          "Federal and state grants require quarterly performance reports, financial reconciliations, and procurement compliance documentation. Manual assembly across disconnected systems takes 30–50 hours per grant per quarter.",
        hoursPerWeek: 15,
      },
      {
        title: "Constituent Correspondence Management",
        description:
          "Emails, letters, and web forms flow into general inboxes with no triage. Manual sorting means urgent matters get buried, response times average 5–10 business days, and repeat contacts on the same issue are treated as new.",
        hoursPerWeek: 18,
      },
    ],
    kpis: [
      { value: "75%", label: "Reduction in FOIA backlog" },
      { value: "68%", label: "Faster permit issuance" },
      { value: "99.1%", label: "Records request completeness" },
      { value: "3.3x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "document-processing",
      "compliance-reporting",
      "data-entry-automation",
      "client-intake",
      "onboarding",
      "project-status-reporting",
      "vendor-management",
      "contract-review",
      "invoice-automation",
      "regulatory-filing",
    ],
    integrations: [
      "ms-dynamics-365",
      "sharepoint",
      "outlook",
      "google-drive",
      "salesforce",
      "oracle-netsuite",
      "power-bi",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "FOIA/records request workflow audit",
          "Permit processing cycle assessment",
          "Grant compliance readiness review",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full agency operations audit",
          "Statutory deadline compliance analysis",
          "Constituent service optimization plan",
          "Digital records management assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-trust-bank",
      "summit-construction",
    ],
    resultsHeadline:
      "Government agencies reduce FOIA backlogs by 75% and issue permits 68% faster while meeting every statutory deadline.",
  },
  {
    id: "hospitality",
    name: "Hospitality",
    icon: "🏨",
    accent: "#db2777",
    bgLight: "bg-pink-50",
    tagline: "Five-star operations — automated behind every stay",
    hook: "The difference between a good guest experience and a great one is what happens behind the scenes.",
    description:
      "Hotels, resorts, and multi-property management groups lose revenue to missed room-block cut-off dates, manual BEO processing, AP invoice backlogs, and fragmented guest service requests. Simpler Life 100 deploys AI operations teams that automate group booking management, banquet event order generation, vendor invoice coding, and guest request triage. Your team focuses on guest experience while our AI handles the operational engine that powers every stay.",
    painPoints: [
      {
        title: "Group Booking & Room Block Management",
        description:
          "Sales managers track room blocks, cut-off dates, attrition clauses, and pickup reports across 30–50 active groups. Missed cut-off dates lose revenue from unreleased rooms, and manual pickup reporting means forecasting is always 48 hours behind.",
        hoursPerWeek: 15,
      },
      {
        title: "Banquet Event Order Processing",
        description:
          "Every wedding, conference, and dinner generates a BEO with AV, menus, setup, and billing. Manual creation and distribution to culinary, AV, and ops takes 2–3 hours per event, and version-chaos means the kitchen works from last week's menu.",
        hoursPerWeek: 12,
      },
      {
        title: "Vendor Invoice Processing",
        description:
          "F&B, linens, landscaping, maintenance, and amenity suppliers send 200–500 invoices monthly. Manual coding to department and GL takes 6–8 minutes per invoice, and month-end close is a 3-day scramble.",
        hoursPerWeek: 18,
      },
      {
        title: "Guest Service Request Management",
        description:
          "Requests via text, app, front desk, and housekeeper notes have no unified triage system. Urgent maintenance issues get the same priority as extra towel requests, and shift-change handoffs lose track of open items.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "65%", label: "Faster month-end close" },
      { value: "4.2%", label: "Group revenue recovery" },
      { value: "99.2%", label: "Invoice coding accuracy" },
      { value: "3.8x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "invoice-automation",
      "contract-review",
      "document-processing",
      "supplier-communication",
      "data-entry-automation",
      "vendor-invoice-matching",
      "customer-support-triage",
      "purchase-order-management",
      "ap-ar-automation",
      "report-generation",
    ],
    integrations: [
      "quickbooks",
      "oracle-netsuite",
      "salesforce",
      "outlook",
      "gmail",
      "google-drive",
      "slack",
      "ms-teams",
      "xero",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Group booking workflow audit",
          "AP invoice processing assessment",
          "Guest service request triage analysis",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full hospitality operations audit",
          "Revenue management & group block analysis",
          "Event operations workflow optimization",
          "Vendor spend & AP efficiency assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastal-outfitters-retail",
      "premier-properties-realty",
    ],
    resultsHeadline:
      "Hospitality operators close month-end 65% faster and recover 4.2% of group revenue through automated block management.",
  },
  {
    id: "media",
    name: "Media",
    icon: "📺",
    accent: "#c026d3",
    bgLight: "bg-fuchsia-50",
    tagline: "Create content — automate everything behind it",
    hook: "Every piece of content carries a web of rights, payments, and metadata that can pull it off platforms if mismanaged.",
    description:
      "Media production companies, agencies, and publishers create great content but drown in the operational complexity behind it — rights and clearances tracking, talent payment processing with guild rules, content metadata management across platforms, and vendor invoice reconciliation across dozens of productions. Simpler Life 100 deploys AI operations teams that keep your production pipeline flowing and your creatives creating, with zero rights violations and audit-ready financials.",
    painPoints: [
      {
        title: "Rights & Clearances Management",
        description:
          "Every piece of content involves music rights, stock footage licenses, talent agreements, and location releases. Manual tracking in spreadsheets means expired licenses slip through — creating legal exposure that can pull content off platforms.",
        hoursPerWeek: 10,
      },
      {
        title: "Talent & Crew Payment Processing",
        description:
          "Union and non-union talent payments require session fees, residuals, royalties, and expense reimbursements with complex calculation rules. Manual processing takes 15–20 minutes per payment and errors trigger guild audits.",
        hoursPerWeek: 15,
      },
      {
        title: "Content Metadata Management",
        description:
          "Publishing content across platforms requires consistent metadata — titles, descriptions, tags, rights windows, territory restrictions. Manual entry for each platform means inconsistent metadata and missed discoverability.",
        hoursPerWeek: 8,
      },
      {
        title: "Vendor & Freelancer Invoice Processing",
        description:
          "Every production uses dozens of vendors and freelancers, each with their own invoice format. AP manually codes to the correct project, cost category, and tax treatment — 8–10 minutes per invoice across hundreds of invoices.",
        hoursPerWeek: 12,
      },
    ],
    kpis: [
      { value: "100%", label: "Rights compliance achieved" },
      { value: "65%", label: "Faster vendor payments" },
      { value: "90%", label: "Reduction in metadata errors" },
      { value: "3.2x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "contract-review",
      "invoice-automation",
      "document-processing",
      "data-entry-automation",
      "vendor-management",
      "payroll-processing",
      "compliance-reporting",
      "project-status-reporting",
      "ap-ar-automation",
      "supplier-communication",
    ],
    integrations: [
      "quickbooks",
      "oracle-netsuite",
      "outlook",
      "gmail",
      "google-drive",
      "dropbox",
      "sharepoint",
      "slack",
      "salesforce",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Rights & clearances workflow audit",
          "Talent payment accuracy assessment",
          "Content metadata consistency review",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full media operations audit",
          "Rights compliance & risk exposure analysis",
          "Production accounting workflow optimization",
          "Content distribution metadata audit",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "stonebridge-law-group",
      "coastal-outfitters-retail",
    ],
    resultsHeadline:
      "Media companies achieve 100% rights compliance and reduce metadata errors by 90% across all distribution platforms.",
  },
  {
    id: "pharmaceuticals",
    name: "Pharmaceuticals",
    icon: "💊",
    accent: "#0d9488",
    bgLight: "bg-teal-50",
    tagline: "Regulatory-ready, always audit-ready",
    hook: "A single missed discrepancy in a batch record can result in a 483 observation or FDA warning letter.",
    description:
      "Pharmaceutical manufacturers and CROs operate under GxP regulations where documentation precision is non-negotiable. Simpler Life 100 deploys AI operations teams that automate batch record review against SOPs, deviation and CAPA lifecycle management, regulatory submission assembly in eCTD format, and supplier qualification documentation tracking. Our AI maintains continuous audit readiness — so when the FDA arrives, you're already prepared, with every document traced and every CAPA closed.",
    painPoints: [
      {
        title: "Batch Record Review",
        description:
          "Every batch generates a 50–200 page record. QA reviewers manually verify every entry against SOPs, specs, and GMP requirements — 4–8 hours per batch. A single missed discrepancy can result in a 483 observation or warning letter.",
        hoursPerWeek: 30,
      },
      {
        title: "Deviation & CAPA Management",
        description:
          "When a deviation occurs, the investigation, root cause analysis, CAPA proposal, and effectiveness verification create a paper trail taking 20–40 hours to document. Manual tracking means CAPAs fall through cracks and repeat deviations occur.",
        hoursPerWeek: 18,
      },
      {
        title: "Regulatory Submission Assembly",
        description:
          "IND, NDA, and ANDA submissions require thousands of documents in eCTD format. Manual compilation, hyperlinking, and validation takes 200–400 hours per submission — formatting errors cause RTF rejections that delay review timelines.",
        hoursPerWeek: 25,
      },
      {
        title: "Supplier Qualification Documentation",
        description:
          "GMP requires qualified suppliers with audited quality systems. Manual tracking of supplier audits, quality agreements, and CoAs across 200+ suppliers means qualifications expire unnoticed until an auditor finds the gap.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "70%", label: "Faster batch release" },
      { value: "$180K", label: "Avoided compliance findings" },
      { value: "100%", label: "Batch record review completeness" },
      { value: "5.8x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "document-processing",
      "compliance-reporting",
      "quality-assurance",
      "contract-review",
      "supplier-communication",
      "data-entry-automation",
      "audit-trail-generation",
      "production-reporting",
      "invoice-automation",
      "regulatory-filing",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "ms-dynamics-365",
      "salesforce",
      "sharepoint",
      "outlook",
      "power-bi",
      "workday",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Batch record review workflow audit",
          "CAPA lifecycle gap analysis",
          "Supplier qualification compliance assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full GxP compliance audit",
          "Regulatory submission readiness assessment",
          "Deviation trend analysis & CAPA optimization",
          "Supplier quality management review",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "mercy-health-partners",
      "hartford-healthcare-network",
    ],
    resultsHeadline:
      "Pharmaceutical manufacturers achieve 100% batch record completeness and save $180K annually in avoided compliance findings.",
  },
  {
    id: "professional-services",
    name: "Professional Services",
    icon: "💼",
    accent: "#4b5563",
    bgLight: "bg-gray-50",
    tagline: "Bill more. Admin less.",
    hook: "The most profitable hour in professional services is the one that gets billed — and 10–15% never do.",
    description:
      "Consulting, accounting, engineering, and advisory firms lose millions to billing leakage, slow engagement setup, manual expense processing, and invoice assembly. Simpler Life 100 deploys AI operations teams that accelerate engagement setup from 7 days to 24 hours, recover 5–8% of lost billable time through intelligent time entry review, automate expense report processing, and assemble client-ready invoices in minutes. Your professionals bill more hours while your back office runs on autopilot.",
    painPoints: [
      {
        title: "Engagement Setup Delays",
        description:
          "Every new project requires engagement letters, SOWs, budget setup, and team assignment. Manual coordination across partners, legal, resource management, and finance takes 5–10 days — all non-billable time and a poor first impression.",
        hoursPerWeek: 12,
      },
      {
        title: "Time Entry & Billing Leakage",
        description:
          "Professionals enter vague time descriptions with wrong project codes, and 10–15% of billable time goes unentered each week. Billing coordinators chase missing time, correct codes, and massage narratives — 20+ hours per week of non-billable rework.",
        hoursPerWeek: 20,
      },
      {
        title: "Expense Report Processing",
        description:
          "Consultants submit crumpled receipts and vague expense descriptions weeks after travel. Finance manually verifies against client billing guidelines, codes to the right project, and chases missing documentation — 12–15 minutes per expense report.",
        hoursPerWeek: 10,
      },
      {
        title: "Client Invoice Assembly",
        description:
          "Each client has unique formatting, backup documentation, and submission requirements. Manually assembling invoices with time detail, expense backup, and cover pages takes 15–25 minutes per invoice every month.",
        hoursPerWeek: 15,
      },
    ],
    kpis: [
      { value: "7%", label: "Billable hour recovery" },
      { value: "12 days", label: "DSO improvement" },
      { value: "99.5%", label: "Invoicing accuracy" },
      { value: "5.5x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "invoice-automation",
      "document-processing",
      "contract-review",
      "client-intake",
      "onboarding",
      "time-tracking",
      "expense-reporting",
      "project-status-reporting",
      "data-entry-automation",
      "payment-reconciliation",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "quickbooks",
      "xero",
      "oracle-netsuite",
      "workday",
      "outlook",
      "gmail",
      "google-drive",
      "sharepoint",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Billable hour leakage audit",
          "Engagement setup cycle analysis",
          "Expense processing workflow assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full practice operations audit",
          "Billing & collections optimization plan",
          "Utilization & realization analysis",
          "Client profitability assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "stonebridge-law-group",
      "meridian-trust-bank",
    ],
    resultsHeadline:
      "Professional services firms recover 7% of lost billable hours and improve DSO by 12 days — adding millions to the bottom line.",
  },
  {
    id: "technology",
    name: "Technology",
    icon: "💻",
    accent: "#2563eb",
    bgLight: "bg-blue-50",
    tagline: "Scale operations without scaling headcount",
    hook: "SaaS companies waste 15–25% of software spend on unused licenses and auto-renewals nobody reviewed.",
    description:
      "B2B SaaS and tech companies scaling from $10M to $100M hit an operational wall — IT tickets pile up, SaaS vendor sprawl drains budgets, deal desk bottlenecks slow revenue recognition, and customer onboarding documentation takes days per account. Simpler Life 100 deploys AI operations teams that auto-resolve 40% of IT tickets, discover and manage every SaaS subscription, validate sales orders against pricing policies in minutes, and generate customized onboarding plans from deal data. Scale revenue without scaling ops headcount.",
    painPoints: [
      {
        title: "IT Operations Ticket Overload",
        description:
          "IT teams drown in access requests, software provisioning, and troubleshooting tickets. Manual triage and routing means critical infrastructure alerts sit alongside password reset requests, and MTTR averages 4+ hours for routine issues.",
        hoursPerWeek: 25,
      },
      {
        title: "SaaS Vendor Sprawl & Renewals",
        description:
          "Every department buys their own tools. Finance has no centralized view of 150+ SaaS subscriptions, auto-renewals hit without review, and unused licenses cost 15–25% of total software spend. Manual tracking in spreadsheets doesn't scale.",
        hoursPerWeek: 10,
      },
      {
        title: "Deal Desk & Sales Order Processing",
        description:
          "Sales closes deals but order forms arrive with pricing errors, missing approvals, and non-standard terms. Deal desk manually validates every order against price books and discount policies — 25–40 minutes per order, and errors cause billing disputes.",
        hoursPerWeek: 15,
      },
      {
        title: "Customer Onboarding Documentation",
        description:
          "Every new customer requires a tailored onboarding plan, technical configuration docs, and training materials. CS teams manually assemble these from templates — 3–5 hours per customer that delays time-to-value.",
        hoursPerWeek: 12,
      },
    ],
    kpis: [
      { value: "40%", label: "Auto-resolved IT tickets" },
      { value: "20%", label: "SaaS spend reduction" },
      { value: "99.5%", label: "Order accuracy" },
      { value: "6.0x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "service-desk-automation",
      "invoice-automation",
      "contract-review",
      "onboarding",
      "document-processing",
      "data-entry-automation",
      "sales-order-processing",
      "vendor-management",
      "compliance-reporting",
      "project-status-reporting",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "oracle-netsuite",
      "quickbooks",
      "zendesk",
      "servicenow",
      "jira",
      "slack",
      "ms-teams",
      "outlook",
      "google-drive",
      "workday",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "IT ticket triage workflow audit",
          "SaaS vendor spend analysis",
          "Deal desk process efficiency assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full tech operations audit",
          "SaaS portfolio optimization plan",
          "Order-to-cash cycle analysis",
          "Customer onboarding efficiency assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-trust-bank",
      "coastline-logistics",
    ],
    resultsHeadline:
      "Tech companies auto-resolve 40% of IT tickets and reduce SaaS spend by 20% — achieving 6.0x first-year ROI.",
  },
  {
    id: "telecom",
    name: "Telecom",
    icon: "📡",
    accent: "#0891b2",
    bgLight: "bg-cyan-50",
    tagline: "Connect faster. Operate smarter.",
    hook: "A single billing error on a wholesale circuit can cost $2K–$10K per month — and most providers audit less than 60% of carrier invoices.",
    description:
      "Telecom service providers, ISPs, and MSPs manage extraordinary operational complexity — service order orchestration across 5+ teams, carrier invoice auditing across dozens of underlying providers, network inventory reconciliation, and customer MACD processing. Simpler Life 100 deploys AI operations teams that automate end-to-end service delivery, audit every carrier invoice to recover 3–7% of costs, continuously reconcile network inventory, and process MACDs same-day. Your NOC focuses on network health, not spreadsheet reconciliation.",
    painPoints: [
      {
        title: "Service Order Processing",
        description:
          "Every new circuit or service order requires coordination across sales engineering, network operations, field services, and billing. Manual handoffs between 5+ teams create 3–10 day provisioning cycles and frequent escalations.",
        hoursPerWeek: 20,
      },
      {
        title: "Carrier Invoice Auditing",
        description:
          "Providers pay dozens of underlying carriers for circuits, colocation, and transit. Each carrier invoice requires validation against contracted rates and circuit inventory — a single billing error can cost $2K–$10K per month.",
        hoursPerWeek: 15,
      },
      {
        title: "Network Inventory Reconciliation",
        description:
          "What's actually in the network rarely matches what's in the inventory system. Circuits get turned up without being recorded, decom'd circuits stay in the database, and capacity planning runs on data that's 15–20% inaccurate.",
        hoursPerWeek: 12,
      },
      {
        title: "Customer MACD Processing",
        description:
          "Moves, adds, changes, and disconnects come in via email, portal, and phone. Manual processing means MACDs take 3–7 days, and billing doesn't start/stop automatically — causing credit requests and revenue leakage.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "65%", label: "Faster service delivery" },
      { value: "5%", label: "Carrier cost recovery" },
      { value: "98%", label: "Network inventory accuracy" },
      { value: "4.8x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "invoice-automation",
      "inventory-reconciliation",
      "service-desk-automation",
      "document-processing",
      "data-entry-automation",
      "vendor-invoice-matching",
      "contract-review",
      "project-status-reporting",
      "compliance-reporting",
      "supplier-communication",
    ],
    integrations: [
      "salesforce",
      "oracle-netsuite",
      "servicenow",
      "outlook",
      "gmail",
      "power-bi",
      "jira",
      "slack",
      "ms-teams",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Service order orchestration audit",
          "Carrier invoice audit recovery analysis",
          "Network inventory accuracy assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full telecom operations audit",
          "Carrier cost optimization plan",
          "Service delivery cycle analysis",
          "MACD processing workflow assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastline-logistics",
      "meridian-manufacturing",
    ],
    resultsHeadline:
      "Telecom providers recover 5% of carrier costs through automated audit and drive network inventory accuracy to 98%.",
  },
  {
    id: "transportation",
    name: "Transportation",
    icon: "🚌",
    accent: "#d97706",
    bgLight: "bg-amber-50",
    tagline: "Keep moving. Automate the rest.",
    hook: "A single missed PM interval can strand passengers, trigger expensive road calls, and reduce vehicle lifespan by 15–20%.",
    description:
      "Transit agencies, charter services, and paratransit operators manage complex fleet operations where safety, compliance, and on-time performance are non-negotiable. Simpler Life 100 deploys AI operations teams that automate preventive maintenance scheduling across every vehicle, track driver CDL and medical certifications with proactive alerts, communicate real-time service alerts to passengers, and optimize paratransit trip scheduling automatically. Your fleet runs safer, your drivers stay compliant, and your riders stay informed.",
    painPoints: [
      {
        title: "Fleet Maintenance Management",
        description:
          "Preventive maintenance schedules for dozens or hundreds of vehicles are tracked on whiteboards and spreadsheets. Missed PM intervals cause breakdowns that strand passengers, trigger expensive road calls, and reduce vehicle lifespan by 15–20%.",
        hoursPerWeek: 15,
      },
      {
        title: "Driver Qualification & Compliance",
        description:
          "Every driver requires a CDL with proper endorsements, medical certificates, and annual MVR checks. Manual tracking across a rotating driver roster means expired credentials go unnoticed until a roadside inspection — risking out-of-service orders.",
        hoursPerWeek: 8,
      },
      {
        title: "Passenger Communication",
        description:
          "When routes are delayed or canceled, passengers find out at the stop. Manual communication means riders wait in the rain for buses that aren't coming, and customer service lines get flooded with calls that could have been a text message.",
        hoursPerWeek: 12,
      },
      {
        title: "Trip Scheduling & Dispatch",
        description:
          "Paratransit and charter operators manually schedule trips, assign vehicles, and optimize routes. Dispatchers spend 3–5 hours per day on schedule building, and manual scheduling leaves 10–15% efficiency on the table.",
        hoursPerWeek: 20,
      },
    ],
    kpis: [
      { value: "95%", label: "PM compliance rate" },
      { value: "12%", label: "On-time performance improvement" },
      { value: "100%", label: "Driver compliance achieved" },
      { value: "4.2x", label: "First-year ROI multiplier" },
    ],
    workflows: [
      "inventory-reconciliation",
      "compliance-reporting",
      "dispatch-scheduling",
      "route-optimization",
      "document-processing",
      "customer-support-triage",
      "data-entry-automation",
      "onboarding",
      "payroll-processing",
      "benefits-administration",
    ],
    integrations: [
      "quickbooks",
      "oracle-netsuite",
      "salesforce",
      "outlook",
      "gmail",
      "google-drive",
      "slack",
      "ms-teams",
      "sharepoint",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Fleet maintenance workflow audit",
          "Driver qualification compliance assessment",
          "Passenger communication gap analysis",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full transportation operations audit",
          "Fleet uptime & PM optimization plan",
          "Paratransit scheduling efficiency analysis",
          "DOT compliance readiness assessment",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "coastline-logistics",
      "thunder-freight",
    ],
    resultsHeadline:
      "Transportation operators achieve 95% PM compliance and 100% driver qualification compliance — with 12% better on-time performance.",
  },
];
