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

  {
    id: "automotive",
    name: "Automotive",
    icon: "🚗",
    accent: "#e11d48",
    bgLight: "bg-rose-50",
    tagline: "Lean supply chain. Smart dealerships.",
    hook: "Automotive operations teams juggle parts inventory across locations, manage complex tier-1 supplier relationships, and process mountains of warranty paperwork.",
    description:
      "Automotive manufacturers, dealerships, and suppliers face relentless pressure on margins, supply chain complexity from JIT manufacturing, and a tidal wave of warranty and compliance documentation. Simpler Life 100 deploys AI coworkers that track parts inventory in real-time across locations, coordinate supplier deliveries to prevent line stops, automate warranty claim processing, and digitize F&I paperwork at dealerships — all integrated with your DMS, ERP, and OEM systems.",
    painPoints: [
      {
        title: "Multi-Location Parts Inventory",
        description: "Parts inventory is fragmented across dealerships, warehouses, and service centers with no real-time visibility. Emergency cross-shipments and stockouts are daily occurrences.",
        hoursPerWeek: 18,
      },
      {
        title: "JIT Supply Chain Coordination",
        description: "Tier-1 suppliers deliver on tight JIT schedules. One missed delivery window can stop a production line. Coordinating ASNs, quality certs, and delivery status is a full-time fire drill.",
        hoursPerWeek: 22,
      },
      {
        title: "Warranty Claim Paperwork",
        description: "Each warranty claim requires labor op-codes, part numbers, failure codes, and supporting documentation. A single data entry error triggers a chargeback from the OEM.",
        hoursPerWeek: 15,
      },
      {
        title: "Dealership F&I Document Chaos",
        description: "Finance & insurance paperwork for each sale requires 45+ minutes of manual data entry, printing, scanning, and filing across multiple compliance and lender systems.",
        hoursPerWeek: 20,
      },
      {
        title: "Regulatory Compliance Reporting",
        description: "Safety recalls, emissions data, and corporate average fuel economy reporting require aggregating data from engineering, manufacturing, and sales — each in separate systems.",
        hoursPerWeek: 12,
      },
    ],
    kpis: [
      { value: "70%", label: "Fewer parts stockouts" },
      { value: "85%", label: "Faster warranty claims" },
      { value: "22%", label: "Inventory cost reduction" },
      { value: "96%", label: "Supplier delivery compliance" },
    ],
    workflows: [
      "auto-parts-inventory",
      "auto-supply-chain",
      "auto-warranty-claims",
      "auto-dealership-ops",
      "man-supplier-communication",
      "man-quality-assurance",
      "compliance-reporting",
      "document-processing",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "quickbooks-enterprise",
      "salesforce",
      "hubspot",
      "outlook",
      "sharepoint",
      "servicenow",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Parts inventory management workflow audit",
          "Warranty claim process analysis",
          "Dealership F&I document assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full supply chain & inventory audit",
          "Warranty claim automation opportunity map",
          "Dealership operations bottleneck analysis",
          "Supplier communication optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
      "coastline-logistics",
    ],
    resultsHeadline:
      "Automotive operations teams cut parts stockouts by 70%, process warranty claims 85% faster, and reduce inventory carrying costs by 22%.",
  },
  {
    id: "aerospace-defense",
    name: "Aerospace & Defense",
    icon: "✈️",
    accent: "#2563eb",
    bgLight: "bg-blue-50",
    tagline: "Mission-critical compliance. Zero-defect documentation.",
    hook: "Aerospace and defense contractors operate under AS9100, ITAR, and DFARS — where a single documentation gap can halt production or trigger a government audit.",
    description:
      "Aerospace and defense organizations face the highest documentation and compliance standards in any industry. Quality records, configuration management, supplier certifications, and export control documentation must be flawless. Simpler Life 100 deploys AI coworkers that automate AS9100 compliance documentation, manage engineering changes across aircraft programs, track supplier quality certs, and maintain ITAR-compliant records — all integrated with your ERP and quality systems.",
    painPoints: [
      {
        title: "AS9100 Compliance Documentation",
        description: "Quality records, non-conformance reports, and audit trails must be maintained across every program. Preparing for surveillance audits requires weeks of manual document collection.",
        hoursPerWeek: 24,
      },
      {
        title: "Supplier Certification Tracking",
        description: "Every supplier must maintain current AS9100 certification, ITAR registration, and approved vendor status. Tracking expirations across hundreds of suppliers is a full-time job.",
        hoursPerWeek: 18,
      },
      {
        title: "Engineering Change Configuration",
        description: "ECNs affect multiple aircraft, serial numbers, and effectivity dates. Configuration management requires meticulous tracking and cross-referencing across engineering and manufacturing.",
        hoursPerWeek: 20,
      },
      {
        title: "ITAR & Export Control Compliance",
        description: "Export-controlled technical data requires strict access logging, transmission controls, and record retention. A single compliance gap can result in millions in penalties.",
        hoursPerWeek: 16,
      },
      {
        title: "Counterfeit Part Prevention",
        description: "Every incoming part must be traced to an approved source with complete pedigree documentation. Manual verification is slow and error-prone.",
        hoursPerWeek: 14,
      },
    ],
    kpis: [
      { value: "70%", label: "Faster audit prep" },
      { value: "3x", label: "Non-conformance detection" },
      { value: "100%", label: "ITAR compliance rate" },
      { value: "60%", label: "Faster supplier qualification" },
    ],
    workflows: [
      "aero-compliance-docs",
      "aero-supply-chain",
      "aero-engineering-changes",
      "man-quality-assurance",
      "supplier-communication",
      "compliance-reporting",
      "document-processing",
    ],
    integrations: [
      "sap",
      "oracle-netsuite",
      "servicenow",
      "sharepoint",
      "autocad",
      "outlook",
      "abbeyy",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "AS9100 compliance documentation audit",
          "Supplier certification tracking analysis",
          "Engineering change workflow assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$3,500",
        features: [
          "Full compliance documentation & audit trail review",
          "Supplier qualification automation opportunity map",
          "Configuration management bottleneck analysis",
          "ITAR compliance workflow optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
    ],
    resultsHeadline:
      "Aerospace contractors cut audit preparation time 70%, detect non-conformances 3x faster, and maintain 100% ITAR and AS9100 compliance.",
  },
  {
    id: "pharmaceuticals-life-sciences",
    name: "Pharmaceutical & Life Sciences",
    icon: "💊",
    accent: "#7c3aed",
    bgLight: "bg-violet-50",
    tagline: "21 CFR Part 11 compliance. Accelerated R&D.",
    hook: "Pharmaceutical and life sciences organizations drown in regulatory documentation — lab data, SOPs, clinical trial records, and FDA submission packages.",
    description:
      "Pharma and biotech companies operate in the most heavily regulated environment in the world, where every data point must be ALCOA+ compliant and every SOP revision must be traced. Simpler Life 100 deploys AI coworkers that automate lab data management with 21 CFR Part 11 audit trails, SOP revision control and training tracking, regulatory submission package compilation, and clinical trial data processing — freeing scientists and compliance teams to focus on breakthrough work.",
    painPoints: [
      {
        title: "21 CFR Part 11 Lab Data Compliance",
        description: "Every lab result must be collected, validated, and reported with complete audit trails. Manual data handling creates compliance gaps and slows decision-making.",
        hoursPerWeek: 22,
      },
      {
        title: "SOP Revision & Training Tracking",
        description: "Each SOP revision triggers training assignments across departments and shifts. Tracking completion manually is impossible at scale, risking GMP citations.",
        hoursPerWeek: 14,
      },
      {
        title: "Regulatory Submission Packages",
        description: "FDA and EMA submissions require compiling thousands of documents, cross-references, and metadata. A single error can delay approval by months.",
        hoursPerWeek: 25,
      },
      {
        title: "Clinical Trial Data Reconciliation",
        description: "Clinical trial data from investigator sites must be cleaned, validated, and locked per protocol. Manual query resolution is the critical path to database lock.",
        hoursPerWeek: 20,
      },
    ],
    kpis: [
      { value: "65%", label: "Faster lab data processing" },
      { value: "99.8%", label: "Data integrity compliance" },
      { value: "21 days", label: "Reduced from SOP-to-training completion" },
      { value: "100%", label: "Regulatory filing accuracy" },
    ],
    workflows: [
      "pharm-regulatory-submissions",
      "pharm-clinical-trial",
      "pharm-lab-data",
      "pharm-sop-management",
      "compliance-reporting",
      "document-processing",
      "quality-assurance",
    ],
    integrations: [
      "sap",
      "servicenow",
      "sharepoint",
      "outlook",
      "abbeyy",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Lab data management & compliance audit",
          "SOP training completion workflow analysis",
          "Regulatory submission process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$3,500",
        features: [
          "Full 21 CFR Part 11 compliance audit",
          "Lab data automation opportunity map",
          "SOP management bottleneck analysis",
          "Regulatory submission optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [
      "meridian-manufacturing",
    ],
    resultsHeadline:
      "Pharma teams process lab data 65% faster, achieve 99.8% data integrity compliance, and cut SOP training cycles from 21 to 5 days.",
  },
  {
    id: "education",
    name: "Education",
    icon: "🎓",
    accent: "#f59e0b",
    bgLight: "bg-amber-50",
    tagline: "Smarter enrollment. Seamless compliance.",
    hook: "Educational institutions process thousands of applications, transcripts, and financial aid files — each requiring manual verification, data entry, and compliance checks.",
    description:
      "Schools and universities face rising enrollment pressure, shrinking administrative budgets, and increasing regulatory demands from accreditors and the Department of Education. Simpler Life 100 deploys AI coworkers that process student applications and transcripts, verify financial aid documents, manage accreditation evidence collection, and automate grade posting — giving registrars and administrators hours back every day.",
    painPoints: [
      {
        title: "Transcript Request Backlog",
        description: "Transcript processing requires identity verification, financial clearance, and manual record retrieval. During peak periods, turnaround can exceed 5 business days.",
        hoursPerWeek: 16,
      },
      {
        title: "Accreditation Document Collection",
        description: "Preparing for accreditation reviews requires collecting evidence from every department, organizing it by standard, and cross-referencing assessment data — a process that takes 2+ months.",
        hoursPerWeek: 20,
      },
      {
        title: "Financial Aid Verification Bottleneck",
        description: "Each verification file requires collecting tax returns, checking against FAFSA data, and calculating awards. A single error delays disbursement for an entire cohort.",
        hoursPerWeek: 18,
      },
      {
        title: "Grade Posting & Degree Audit",
        description: "Final grades from faculty must be posted, degree audits run, and diplomas ordered — all within tight graduation deadlines. Manual data entry creates errors and delays.",
        hoursPerWeek: 14,
      },
    ],
    kpis: [
      { value: "80%", label: "Faster transcript processing" },
      { value: "99.8%", label: "Degree audit accuracy" },
      { value: "70%", label: "Less accreditation prep time" },
      { value: "99.5%", label: "Financial aid accuracy" },
    ],
    workflows: [
      "edu-student-enrollment",
      "edu-transcript-processing",
      "edu-accreditation",
      "edu-fa-verification",
      "document-processing",
      "data-entry-automation",
    ],
    integrations: [
      "servicenow",
      "salesforce",
      "sharepoint",
      "outlook",
      "quickbooks",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Transcript processing workflow audit",
          "Enrollment documentation analysis",
          "Financial aid verification assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full enrollment & records management audit",
          "Accreditation evidence automation map",
          "Financial aid bottleneck analysis",
          "Degree audit workflow optimization plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Educational institutions process transcripts 80% faster, achieve 99.8% degree audit accuracy, and cut accreditation preparation time by 70%.",
  },
  {
    id: "hospitality",
    name: "Hospitality",
    icon: "🏨",
    accent: "#14b8a6",
    bgLight: "bg-teal-50",
    tagline: "Flawless guest experiences. Lean operations.",
    hook: "Hospitality teams juggle reservations, guest communications, F&B procurement, and revenue management — each requiring meticulous coordination across properties.",
    description:
      "Hotels and hospitality groups operate on razor-thin margins where every guest interaction and operational cost matters. Simpler Life 100 deploys AI coworkers that optimize reservation management across rate categories, automate personalized guest communications throughout the stay, streamline F&B procurement and inventory, and drive revenue through dynamic pricing — all without adding headcount.",
    painPoints: [
      {
        title: "Reservation Overbooking & Optimization",
        description: "Managing reservations across rate categories, OTA channels, and direct bookings requires constant manual balancing. Overbookings damage reputation and revenue.",
        hoursPerWeek: 20,
      },
      {
        title: "F&B Procurement Waste",
        description: "Banquet event orders and restaurant demand must be forecasted and ordered for each outlet. Over-ordering drives waste, under-ordering disappoints guests.",
        hoursPerWeek: 14,
      },
      {
        title: "Personalized Guest Communication",
        description: "Pre-arrival, in-stay, and post-stay communications should be personalized but most properties send generic messages — or none at all.",
        hoursPerWeek: 10,
      },
      {
        title: "Manual Revenue Management",
        description: "Rate adjustments based on competitor pricing, demand forecasts, and occupancy projections require constant manual monitoring across all channels.",
        hoursPerWeek: 14,
      },
    ],
    kpis: [
      { value: "90%", label: "Fewer overbooking incidents" },
      { value: "12%", label: "RevPAR increase" },
      { value: "35%", label: "Higher guest engagement" },
      { value: "30%", label: "Less F&B waste" },
    ],
    workflows: [
      "hosp-reservations",
      "hosp-procurement",
      "hosp-guest-communication",
      "hosp-revenue-management",
      "ret-customer-emails",
      "customer-support",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "outlook",
      "gmail",
      "quickbooks",
      "oracle-netsuite",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Reservation management workflow audit",
          "Guest communication analysis",
          "F&B procurement process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full revenue management & OTA channel audit",
          "Guest communication automation map",
          "F&B procurement optimization plan",
          "Revenue management automation roadmap",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Hospitality groups reduce overbooking incidents by 90%, increase RevPAR by 12% through dynamic pricing, and cut F&B waste by 30%.",
  },
  {
    id: "agriculture",
    name: "Agriculture",
    icon: "🌾",
    accent: "#22c55e",
    bgLight: "bg-green-50",
    tagline: "Harvest data. Sow efficiency.",
    hook: "Agriculture operations manage vast amounts of field data, supply chain logistics, and compliance paperwork with teams that are already stretched thin.",
    description:
      "Modern agriculture operations combine production data from hundreds of fields with complex supply chains, equipment maintenance schedules, and increasing regulatory requirements. Simpler Life 100 deploys AI coworkers that aggregate crop production data for yield analysis and insurance reporting, track livestock health and breeding records, schedule preventive equipment maintenance, and maintain farm-to-fork traceability documentation for food safety compliance.",
    painPoints: [
      {
        title: "Crop Production Data Aggregation",
        description: "Yield data, input applications, and field activities are recorded in multiple formats across acres. Manual aggregation delays reporting and decision-making.",
        hoursPerWeek: 12,
      },
      {
        title: "Livestock Health & Breeding Records",
        description: "Health records, breeding cycles, and feed consumption for large herds must be meticulously tracked. Missed health indicators can become herd-wide problems.",
        hoursPerWeek: 15,
      },
      {
        title: "Equipment Downtime & Maintenance",
        description: "Farm equipment has narrow seasonal windows. Unplanned downtime during planting or harvest means millions in lost revenue. Preventive maintenance is critical but often deferred.",
        hoursPerWeek: 8,
      },
      {
        title: "Food Safety Traceability Documentation",
        description: "From field to fork, every lot must be traceable. Regulators demand complete documentation within hours during an audit or food safety event.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "80%", label: "Faster production reporting" },
      { value: "25%", label: "Herd health incident reduction" },
      { value: "55%", label: "Less unplanned downtime" },
      { value: "2 weeks", label: "Reduced audit prep time" },
    ],
    workflows: [
      "ag-crop-reporting",
      "ag-livestock-tracking",
      "ag-equipment-maint",
      "ag-supply-chain",
      "compliance-reporting",
      "document-processing",
    ],
    integrations: [
      "quickbooks",
      "sap",
      "sharepoint",
      "outlook",
      "excel",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Production reporting workflow audit",
          "Livestock record management analysis",
          "Equipment maintenance scheduling assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full operations & supply chain audit",
          "Production data automation opportunity map",
          "Equipment maintenance optimization plan",
          "Food safety traceability workflow design",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Agricultural operations cut production reporting time 80%, reduce herd health incidents 25%, and audit food safety records in hours instead of weeks.",
  },
  {
    id: "telecommunications",
    name: "Telecommunications",
    icon: "📡",
    accent: "#06b6d4",
    bgLight: "bg-cyan-50",
    tagline: "Connected networks. Automated operations.",
    hook: "Telecommunications providers manage millions of network elements, customer orders, and billing records — with legacy systems that don't talk to each other.",
    description:
      "Telecom operators face exploding data volumes from 5G networks, complex customer provisioning workflows across hundreds of systems, and billing mediation that processes billions of records monthly. Simpler Life 100 deploys AI coworkers that automate customer service provisioning from order to activation, correlate network alerts into actionable incidents with automated dispatch, and mediate usage records into accurate customer invoices — reducing order-to-cash cycles and improving network availability.",
    painPoints: [
      {
        title: "Multi-System Service Provisioning",
        description: "Each new customer order requires entering data into network management, billing, CRM, and provisioning systems. Manual data entry creates errors and delays activation.",
        hoursPerWeek: 18,
      },
      {
        title: "Network Fault Overload",
        description: "NOC teams are overwhelmed by alert noise — thousands of events that must be correlated into actionable incidents. Critical faults get buried in the noise.",
        hoursPerWeek: 24,
      },
      {
        title: "Billing Mediation Errors",
        description: "Usage records from network elements must be rated, promoted, and audited before billing. Rate errors and data gaps create revenue leakage and customer disputes.",
        hoursPerWeek: 20,
      },
      {
        title: "Legacy System Integration",
        description: "BSS and OSS systems from different eras don't integrate, requiring manual workarounds and data re-entry for every customer and network operation.",
        hoursPerWeek: 16,
      },
    ],
    kpis: [
      { value: "93%", label: "Faster service provisioning" },
      { value: "45%", label: "MTTR reduction" },
      { value: "99.95%", label: "Billing accuracy" },
      { value: "99.97%", label: "Network availability" },
    ],
    workflows: [
      "tel-customer-provisioning",
      "tel-network-fault",
      "tel-billing-mediation",
      "customer-support",
      "document-processing",
    ],
    integrations: [
      "salesforce",
      "servicenow",
      "sap",
      "quickbooks",
      "outlook",
      "slack",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Customer provisioning workflow audit",
          "NOC alert correlation analysis",
          "Billing mediation process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$3,000",
        features: [
          "Full order-to-cash process audit",
          "Network fault automation opportunity map",
          "Billing system integration analysis",
          "Legacy system modernization roadmap",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Telecom providers activate services 93% faster, reduce network MTTR by 45%, and maintain 99.95% billing accuracy.",
  },
  {
    id: "government-public-sector",
    name: "Government & Public Sector",
    icon: "🏛️",
    accent: "#64748b",
    bgLight: "bg-slate-50",
    tagline: "Efficient public service. Compliant operations.",
    hook: "Government agencies face shrinking budgets and growing demands for transparency, while managing complex procurement, grant, and records management processes.",
    description:
      "Public sector organizations operate under strict procurement regulations, grant compliance requirements, and records retention mandates — all with limited staff. Simpler Life 100 deploys AI coworkers that automate RFP distribution and bid evaluation, process grant applications and compliance reporting, manage records classification and FOIA requests, and streamline citizen services — helping agencies do more with less while maintaining full compliance.",
    painPoints: [
      {
        title: "Lengthy Procurement Cycles",
        description: "Government procurement from RFP to award can take 90+ days. Manual bid evaluation, vendor qualification, and compliance checking are the primary bottlenecks.",
        hoursPerWeek: 22,
      },
      {
        title: "Grant Application Backlog",
        description: "Grant applications must be validated for eligibility, completeness, and compliance. Manual processing creates backlogs that delay funding to critical programs.",
        hoursPerWeek: 18,
      },
      {
        title: "Records Retention & FOIA",
        description: "Every document must be classified, retained per schedule, and retrievable for FOIA requests. Manual classification is inconsistent and retrieval is slow.",
        hoursPerWeek: 16,
      },
      {
        title: "Cross-Department Data Silos",
        description: "Constituent data, financial records, and program data live in separate systems. Reporting and compliance requires manual data consolidation across departments.",
        hoursPerWeek: 14,
      },
    ],
    kpis: [
      { value: "61%", label: "Faster procurement cycles" },
      { value: "60%", label: "Faster grant processing" },
      { value: "80%", label: "Faster records retrieval" },
      { value: "100%", label: "FOIA compliance rate" },
    ],
    workflows: [
      "gov-grant-management",
      "gov-procurement",
      "gov-records-mgmt",
      "document-processing",
      "compliance-reporting",
      "data-entry-automation",
    ],
    integrations: [
      "servicenow",
      "sap",
      "sharepoint",
      "outlook",
      "adobe-sign",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Procurement cycle workflow audit",
          "Grant application process analysis",
          "Records management compliance assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full procurement & grant management audit",
          "Records automation opportunity map",
          "FOIA compliance workflow optimization",
          "Cross-department data integration plan",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Government agencies cut procurement cycles by 61%, process grants 60% faster, and maintain 100% records compliance.",
  },
  {
    id: "nonprofit",
    name: "Nonprofit",
    icon: "🤝",
    accent: "#f43f5e",
    bgLight: "bg-rose-50",
    tagline: "Mission-focused. Administration automated.",
    hook: "Nonprofits run on tight budgets where every dollar counts, yet administrative work — donor management, grant reporting, volunteer coordination — consumes resources that could go to the mission.",
    description:
      "Nonprofit organizations maximize impact by directing resources to their mission, but donor management, grant compliance, and volunteer coordination create unavoidable administrative overhead. Simpler Life 100 deploys AI coworkers that automate donor acknowledgment and stewardship, process grant deliverables and compliance reporting, schedule and coordinate volunteers across programs, and maintain financial records — freeing development and program staff to focus on impact.",
    painPoints: [
      {
        title: "Donor Acknowledgment Delays",
        description: "Timely donor acknowledgment is critical for retention but processing donations, generating letters, and updating donor records is labor-intensive and often delayed.",
        hoursPerWeek: 12,
      },
      {
        title: "Grant Reporting Burden",
        description: "Each grant requires tracking deliverables, compiling progress reports, and monitoring budget utilization. Multiple active grants create a crushing reporting calendar.",
        hoursPerWeek: 14,
      },
      {
        title: "Volunteer Scheduling Chaos",
        description: "Recruiting, scheduling, training, and tracking volunteers across programs is managed with spreadsheets and manual coordination. No-shows and scheduling conflicts are common.",
        hoursPerWeek: 12,
      },
      {
        title: "Donor Data Fragmentation",
        description: "Donor information lives in the CRM, email platform, and spreadsheets. Inconsistent data means missed stewardship opportunities and duplicative communications.",
        hoursPerWeek: 8,
      },
    ],
    kpis: [
      { value: "20%", label: "Higher donor retention" },
      { value: "70%", label: "Faster grant reporting" },
      { value: "80%", label: "Less scheduling time" },
      { value: "30%", label: "More recurring gift revenue" },
    ],
    workflows: [
      "npo-donor-management",
      "npo-grant-reporting",
      "npo-volunteer-coordination",
      "fin-ap-automation",
      "customer-emails",
      "document-processing",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "quickbooks",
      "outlook",
      "sharepoint",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Donor management workflow audit",
          "Grant compliance process analysis",
          "Volunteer coordination assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$1,500",
        features: [
          "Full donor lifecycle & stewardship audit",
          "Grant management automation opportunity map",
          "Volunteer program optimization plan",
          "Donor data integration strategy",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Nonprofit organizations increase donor retention 20%, reduce grant reporting time 70%, and cut volunteer scheduling time 80%.",
  },
  {
    id: "technology-saas",
    name: "Technology & SaaS",
    icon: "💻",
    accent: "#8b5cf6",
    bgLight: "bg-violet-50",
    tagline: "Scale your platform. Automate your operations.",
    hook: "SaaS companies grow fast but operational complexity scales with every new customer — from subscription billing to customer support to implementation.",
    description:
      "Technology and SaaS companies face unique operational challenges: recurring billing with revenue recognition compliance, customer support volumes that grow with the user base, and onboarding processes that determine long-term retention. Simpler Life 100 deploys AI coworkers that automate subscription billing and ASC 606 revenue recognition, triage and resolve customer support tickets, orchestrate customer onboarding for faster time-to-value, and streamline DevOps incident management — letting engineering and CS teams focus on product and growth.",
    painPoints: [
      {
        title: "Subscription Billing Complexity",
        description: "Multi-tier pricing, usage-based billing, credits, and plan changes create invoicing complexity. Errors in billing erode customer trust and create revenue leakage.",
        hoursPerWeek: 18,
      },
      {
        title: "Support Ticket Overload",
        description: "As the customer base grows, support ticket volume grows linearly. First-response times slip, backlog builds, and CSAT declines.",
        hoursPerWeek: 25,
      },
      {
        title: "Manual Customer Onboarding",
        description: "Each new customer requires account provisioning, welcome sequences, training scheduling, and implementation tracking. Manual onboarding creates inconsistent experiences.",
        hoursPerWeek: 15,
      },
      {
        title: "Incident Response Coordination",
        description: "When the platform goes down, the manual process of triaging, notifying, documenting, and communicating creates chaos and delays resolution.",
        hoursPerWeek: 12,
      },
      {
        title: "Revenue Recognition Reconciliation",
        description: "ASC 606 requires allocating transaction price to performance obligations, adjusting for variable consideration, and updating schedules for contract modifications.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "65%", label: "Ticket deflection rate" },
      { value: "94%", label: "Customer satisfaction" },
      { value: "91%", label: "90-day retention" },
      { value: "99.8%", label: "Revenue recognition accuracy" },
    ],
    workflows: [
      "tech-subscription-billing",
      "tech-customer-support",
      "tech-saas-onboarding",
      "tech-devops-ticketing",
      "customer-support",
      "document-processing",
    ],
    integrations: [
      "quickbooks",
      "stripe",
      "salesforce",
      "hubspot",
      "zendesk",
      "intercom",
      "slack",
      "jira",
      "servicenow",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Subscription billing & revenue recognition audit",
          "Customer support workflow analysis",
          "Customer onboarding process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full order-to-cash & revenue audit",
          "Support automation opportunity map",
          "Onboarding optimization & health scoring plan",
          "Incident management workflow design",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "SaaS companies achieve 65% ticket deflection, boost 90-day retention to 91%, and maintain 99.8% revenue recognition accuracy.",
  },
  {
    id: "ecommerce-retail",
    name: "E-commerce & Retail",
    icon: "🛒",
    accent: "#e11d48",
    bgLight: "bg-red-50",
    tagline: "Faster orders. Smarter inventory. Happier customers.",
    hook: "E-commerce and retail operations fight a daily battle against inventory drift, order processing delays, and the rising cost of returns.",
    description:
      "Retailers and e-commerce brands operate on thin margins where every operational inefficiency directly impacts profitability. Inventory must be synchronized across channels, orders processed in seconds, and returns handled before the customer asks for an update. Simpler Life 100 deploys AI coworkers that capture and process orders from every channel, synchronize inventory in real-time across stores and warehouses, automate customer email sequences from confirmation to recovery, and process returns in under 24 hours — all while keeping vendor compliance in check.",
    painPoints: [
      {
        title: "Multi-Channel Inventory Drift",
        description: "Inventory sold on one channel isn't reflected on others until the next sync cycle. Overselling damages reputation; underselling leaves revenue on the table.",
        hoursPerWeek: 15,
      },
      {
        title: "Manual Order Entry Errors",
        description: "Orders from phone, email, and chat must be manually entered into the system. Each entry is an opportunity for error — wrong item, wrong address, wrong quantity.",
        hoursPerWeek: 20,
      },
      {
        title: "Returns Processing Bottleneck",
        description: "Each returned item must be inspected, dispositioned, restocked or written off, and refunded — a process that currently takes 7+ days and frustrates customers.",
        hoursPerWeek: 14,
      },
      {
        title: "Vendor Compliance Management",
        description: "Vendors must maintain packaging specs, labeling standards, and documentation. Manual compliance checking creates bottlenecks in onboarding and receiving.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "94%", label: "Faster order processing" },
      { value: "65%", label: "Fewer stockouts" },
      { value: "32%", label: "Cart recovery rate" },
      { value: "24 hrs", label: "Returns processing time" },
    ],
    workflows: [
      "ret-order-entry",
      "ret-inventory-sync",
      "ret-customer-emails",
      "ret-returns-processing",
      "ret-vendor-onboarding",
      "customer-support",
    ],
    integrations: [
      "shopify",
      "woocommerce",
      "bigcommerce",
      "magento",
      "amazon-seller-central",
      "oracle-netsuite",
      "quickbooks",
      "salesforce",
      "hubspot",
      "stripe",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Order processing workflow audit",
          "Inventory synchronization analysis",
          "Returns management process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full multi-channel operations audit",
          "Inventory automation opportunity map",
          "Returns process optimization plan",
          "Vendor compliance workflow design",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "E-commerce brands process orders 94% faster, reduce stockouts 65%, and handle returns in 24 hours flat.",
  },
  {
    id: "media-entertainment",
    name: "Media & Entertainment",
    icon: "🎬",
    accent: "#f97316",
    bgLight: "bg-orange-50",
    tagline: "Content is king. Automation is the crown.",
    hook: "Media and entertainment companies manage complex rights agreements, production schedules, and royalty calculations — all without dedicated operations software.",
    description:
      "Media and entertainment organizations juggle content rights across territories and platforms, production schedules for multiple concurrent projects, and complex royalty calculations for thousands of rights holders. Simpler Life 100 deploys AI coworkers that track content rights and automate royalty calculations, coordinate production schedules and crew assignments, manage content distribution metadata and delivery, and maintain compliance with licensing agreements — giving creative teams more time to create.",
    painPoints: [
      {
        title: "Rights & Royalty Complexity",
        description: "Content rights are licensed by territory, platform, and window. Calculating royalties across these dimensions for thousands of titles and rights holders is a nightmare of spreadsheets.",
        hoursPerWeek: 24,
      },
      {
        title: "Production Schedule Conflicts",
        description: "Managing crew, equipment, locations, and post-production timelines across multiple projects generates constant scheduling conflicts and last-minute scrambles.",
        hoursPerWeek: 20,
      },
      {
        title: "Distribution Metadata Errors",
        description: "Each platform requires specific metadata, formatting, and delivery specs. Metadata errors cause content rejection and re-delivery delays.",
        hoursPerWeek: 16,
      },
      {
        title: "Licensing Compliance Tracking",
        description: "Licensing agreements have territory restrictions, exclusivity windows, and reporting requirements. Manual tracking creates compliance risk and missed revenue.",
        hoursPerWeek: 14,
      },
    ],
    kpis: [
      { value: "99.6%", label: "Royalty accuracy" },
      { value: "94%", label: "On-time production wrap" },
      { value: "99.7%", label: "Metadata accuracy" },
      { value: "100%", label: "Licensing compliance" },
    ],
    workflows: [
      "media-rights-mgmt",
      "media-production-scheduling",
      "media-content-distribution",
      "leg-contract-review",
      "document-processing",
      "compliance-reporting",
    ],
    integrations: [
      "sap",
      "quickbooks",
      "salesforce",
      "sharepoint",
      "dropbox",
      "outlook",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Rights & royalty management process audit",
          "Production scheduling workflow analysis",
          "Content distribution metadata assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full content lifecycle & rights audit",
          "Royalty automation opportunity map",
          "Production scheduling optimization plan",
          "Distribution workflow modernization design",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Media companies achieve 99.6% royalty accuracy, wrap 94% of productions on time, and maintain 100% licensing compliance.",
  },
  {
    id: "professional-services",
    name: "Professional Services",
    icon: "📊",
    accent: "#6366f1",
    bgLight: "bg-indigo-50",
    tagline: "More billable hours. Less admin overhead.",
    hook: "Professional services firms lose millions in unbilled time, proposal delays, and resource scheduling inefficiencies — all while trying to deliver exceptional client work.",
    description:
      "Consulting, accounting, legal, and other professional services firms operate on billable hours. Every minute spent on admin — time entry, proposal generation, resource scheduling, expense auditing — is a minute not billed to a client. Simpler Life 100 deploys AI coworkers that automatically capture billable time from calendar and email activity, generate personalized proposals and SOWs in minutes, optimize consultant staffing against utilization targets, and audit expense reports for policy compliance — driving utilization and profitability higher.",
    painPoints: [
      {
        title: "Uncaptured Billable Time",
        description: "Consultants forget to record time after client calls, document reviews, and internal meetings. Studies show 15-25% of billable time goes unrecorded.",
        hoursPerWeek: 10,
      },
      {
        title: "Slow Proposal Generation",
        description: "Each proposal requires custom scope, pricing, and terms pulled from multiple templates and spreadsheets. Slow turnaround costs deals.",
        hoursPerWeek: 8,
      },
      {
        title: "Resource Scheduling Conflicts",
        description: "Staffing consultants to projects requires matching skills, availability, and preferences. Manual scheduling fills desks but misses optimization opportunities.",
        hoursPerWeek: 10,
      },
      {
        title: "Expense Report Fraud & Errors",
        description: "Policy violations, missing receipts, and suspicious patterns in expense reports require careful auditing that most firms don't have the resources to perform.",
        hoursPerWeek: 8,
      },
      {
        title: "Client Onboarding Friction",
        description: "Each new client requires engagement letters, compliance checks, portal setup, and project creation. Manual onboarding delays revenue recognition.",
        hoursPerWeek: 10,
      },
    ],
    kpis: [
      { value: "78%", label: "Billable utilization rate" },
      { value: "65%", label: "Faster proposal generation" },
      { value: "96%", label: "Expense policy compliance" },
      { value: "3 days", label: "Client onboarding time" },
    ],
    workflows: [
      "ps-time-entry",
      "ps-proposal-generation",
      "ps-resource-scheduling",
      "ps-expense-audit",
      "ps-client-onboarding",
      "fin-ar-automation",
      "client-intake",
    ],
    integrations: [
      "salesforce",
      "hubspot",
      "quickbooks",
      "xero",
      "outlook",
      "adobe-sign",
      "expensify",
      "sharepoint",
    ],
    auditPackages: {
      efficiency: {
        price: "Free",
        features: [
          "Time capture & utilization audit",
          "Proposal generation workflow analysis",
          "Resource scheduling process assessment",
          "24-hour executive summary with risk score",
        ],
      },
      deepDive: {
        price: "$2,500",
        features: [
          "Full billable utilization & profitability audit",
          "Proposal automation opportunity map",
          "Resource optimization & staffing plan",
          "Expense policy automation design",
          "Custom automation roadmap with ROI projections",
        ],
      },
    },
    relatedCaseStudies: [],
    resultsHeadline:
      "Professional services firms achieve 78% billable utilization, generate proposals 65% faster, and onboard clients in 3 days flat.",
  },
];
