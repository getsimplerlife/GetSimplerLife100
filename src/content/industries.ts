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
];