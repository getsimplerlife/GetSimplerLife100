export interface IndustryHub {
  id: string;
  name: string;
  icon: string;
  accent: string;
  bgLight: string;
  tagline: string;
  hook: string;
  description: string;
  painPoints: { title: string; description: string }[];
  workflows: string[];
  integrations: string[];
  auditPackages: {
    efficiency: { price: string; features: string[] };
  };
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
      "Manufacturers lose millions to operational friction — manual QA documentation, fragmented inventory tracking, and paper-based shop floor reporting. Simpler Life 100's platform digitizes every step: from incoming material inspection to finished goods release. It integrates directly with your ERP, MES, and quality systems, eliminating data entry and giving you real-time visibility into production health.",
    painPoints: [
      {
        title: "Manual QA Documentation",
        description:
          "Quality assurance teams spend hours manually transcribing inspection results into spreadsheets and ERP modules. Errors go unnoticed until downstream audits catch them.",
      },
      {
        title: "Inventory Reconciliation Chaos",
        description:
          "Inventory data lives in disconnected systems — raw materials in one, WIP in another, finished goods in a third. Reconciling across them requires constant manual intervention and spreadsheet gymnastics.",
      },
      {
        title: "Paper-Based Shop Floor Reporting",
        description:
          "Production operators fill out paper logs that sit in a binder until someone manually enters them into the system. Real-time decision-making is impossible.",
      },
      {
        title: "Supply Chain Exception Handling",
        description:
          "Supplier delays, material shortages, and quality holds trigger manual notification chains. Each exception takes 45+ minutes of phone-tag and email forwarding to resolve.",
      },
      {
        title: "Production Scheduling Bottlenecks",
        description:
          "Schedulers manually balance machine capacity, labor availability, and material supply daily. One change cascades into hours of re-planning.",
      },
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
    },
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
      "The logistics industry runs on paper — dispatch boards, delivery receipts, driver logs, and freight invoices that all require manual processing. Simpler Life 100 eliminates this paperwork with automations that handle dispatch scheduling, real-time route optimization, carrier rate comparisons, proof-of-delivery capture, and freight audit reconciliation. Your team gains hours every day while your on-time performance climbs.",
    painPoints: [
      {
        title: "Manual Dispatch Scheduling",
        description:
          "Dispatchers spend 2+ hours every morning building routes on a whiteboard, manually calling drivers, and juggling last-minute changes.",
      },
      {
        title: "Paper Proof-of-Delivery",
        description:
          "Drivers collect paper signatures that get lost, fade, or sit in cabs for days. Without POD, invoices can't be sent and disputes pile up.",
      },
      {
        title: "Freight Invoice Reconciliation",
        description:
          "Every carrier sends a different invoice format. AP teams manually cross-reference rates against contracts, taking 10-15 minutes per invoice.",
      },
      {
        title: "Real-Time Shipment Tracking Gap",
        description:
          "Customers call for updates because there's no automated status feed, and the answering lands on a person. Every 'where's my load?' call is time a CSR is not spending on work that needs a human.",
      },
      {
        title: "Carrier Communication Fragmentation",
        description:
          "Rate requests, schedule changes, and issue resolution happen across phone, email, and text — with no audit trail.",
      },
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
    },
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
      "Healthcare providers are drowning in administrative overhead. Clinical staff spend their day on data entry, phone calls, and paper forms instead of patient care. Simpler Life 100's platform handles patient intake, insurance verification, appointment scheduling, medical coding prep, and compliance documentation — all within your existing EHR and practice management systems. HIPAA-compliant by design.",
    painPoints: [
      {
        title: "Manual Patient Intake",
        description:
          "Patients fill paper forms that staff manually transcribe into the EHR. Each new patient takes 15-20 minutes of typing, and errors in transcription cause downstream billing issues.",
      },
      {
        title: "Insurance Verification by Phone/Fax",
        description:
          "Staff spend hours on hold with insurance companies, manually verifying eligibility. Each verification takes 8-12 minutes, and benefits summaries arrive by fax hours later.",
      },
      {
        title: "Appointment Scheduling Friction",
        description:
          "Phone calls for scheduling dominate front desk time. No-shows stay high because reminder systems are manual or non-existent.",
      },
      {
        title: "Medical Coding Backlog",
        description:
          "Clinicians dictate notes that sit in a queue for coders. Average turnaround is 3-5 days, delaying billing cycles and cash flow.",
      },
      {
        title: "Compliance Documentation Overhead",
        description:
          "HIPAA audits require meticulous documentation of PHI access, policy attestations, and breach logs. Collecting evidence takes weeks.",
      },
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
    },
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
          "Estimators lose whole days of the week to compiling bids from spreadsheets, searching for historical pricing, and manually calculating material quantities.",
      },
      {
        title: "Change Order Chaos",
        description:
          "Change orders travel through email threads, text messages, and paper forms. Tracking approvals and budget impact across 20+ subcontractors is impossible.",
      },
      {
        title: "Paper Field Reports",
        description:
          "Superintendents fill daily logs by hand. These sit in a truck until someone drives them to the office, where they're entered into the system 2-3 days late.",
      },
      {
        title: "Material Price Tracking",
        description:
          "Material costs fluctuate weekly, but active project budgets reflect pricing from months ago. Nobody knows the real margin until the job is done.",
      },
      {
        title: "Progress Billing Bottleneck",
        description:
          "Billing requires manually aggregating work completed, materials delivered, and change orders approved. Each invoice takes 4-6 hours to prepare.",
      },
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
    },
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
      "Banks, fintechs, and investment firms operate under a microscope of regulatory scrutiny. Non-compliance is not an option, yet compliance teams spend weeks manually collecting evidence, reconciling transactions, and preparing for exams. Simpler Life 100 deploys automations that continuously monitor regulatory changes, map controls to requirements, generate audit-ready evidence packages, and automate KYC/AML workflows — passing every exam with zero findings.",
    painPoints: [
      {
        title: "Manual Audit Evidence Collection",
        description:
          "Compliance teams spend weeks pulling screenshots, emails, and logs to prove controls are operating effectively. Each exam cycle costs 200+ person-hours of evidence gathering.",
      },
      {
        title: "KYC/AML Onboarding Delays",
        description:
          "Client onboarding requires identity verification, background checks, and document collection. Each new client takes 3-5 business days and $150+ in manual processing costs.",
      },
      {
        title: "Regulatory Reporting Fragmentation",
        description:
          "Reporting requirements vary by jurisdiction. Data must be pulled from 4+ systems, normalized manually, and formatted differently for each regulator.",
      },
      {
        title: "Transaction Alert Overload",
        description:
          "Monitoring systems generate thousands of alerts a month. Most are noise that analysts manually review and dismiss — hours that produce nothing.",
      },
      {
        title: "Policy Attestation Tracking",
        description:
          "Employee policy acknowledgments, training completions, and conflict-of-interest disclosures are tracked in separate spreadsheets. Gaps aren't visible until audit time.",
      },
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
    },
  },
  {
    id: "finance",
    name: "Financial Services",
    icon: "💰",
    accent: "#15803d",
    bgLight: "bg-green-50",
    tagline: "Meet every regulatory requirement — automatically",
    hook: "Financial services face the heaviest compliance burden of any industry.",
    description:
      "Banks, fintechs, and investment firms operate under a microscope of regulatory scrutiny. Non-compliance is not an option, yet compliance teams spend weeks manually collecting evidence, reconciling transactions, and preparing for exams. Simpler Life 100 deploys automations that continuously monitor regulatory changes, map controls to requirements, generate audit-ready evidence packages, and automate KYC/AML workflows — passing every exam with zero findings.",
    painPoints: [
      {
        title: "Manual Audit Evidence Collection",
        description:
          "Compliance teams spend weeks pulling screenshots, emails, and logs to prove controls are operating effectively. Each exam cycle costs 200+ person-hours of evidence gathering.",
      },
      {
        title: "KYC/AML Onboarding Delays",
        description:
          "Client onboarding requires identity verification, background checks, and document collection. Each new client takes 3-5 business days and $150+ in manual processing costs.",
      },
      {
        title: "Regulatory Reporting Fragmentation",
        description:
          "Reporting requirements vary by jurisdiction. Data must be pulled from 4+ systems, normalized manually, and formatted differently for each regulator.",
      },
      {
        title: "Transaction Alert Overload",
        description:
          "Monitoring systems generate thousands of alerts a month. Most are noise that analysts manually review and dismiss — hours that produce nothing.",
      },
      {
        title: "Policy Attestation Tracking",
        description:
          "Employee policy acknowledgments, training completions, and conflict-of-interest disclosures are tracked in separate spreadsheets. Gaps aren't visible until audit time.",
      },
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
    },
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
      "Energy companies manage thousands of assets across vast geographic areas — from wellheads to wind turbines. Each asset generates inspection reports, maintenance logs, compliance documentation, and production data that must be processed manually. Simpler Life 100's automations handle asset data intake, inspection report generation, predictive maintenance scheduling, and regulatory filing preparation — giving you 24/7 operational visibility and eliminating weeks of manual reporting every quarter.",
    painPoints: [
      {
        title: "Asset Data Intake Overload",
        description:
          "New assets arrive with spec sheets, warranty documents, and compliance certificates. Each set of docs takes 45+ minutes to manually enter into the asset management system.",
      },
      {
        title: "Inspection Report Logjams",
        description:
          "Field inspectors collect data on paper or tablets. Reports are compiled into PDFs and emailed — someone spends days copying data from PDFs into tracking systems.",
      },
      {
        title: "Reactive Maintenance Scheduling",
        description:
          "Maintenance is triggered by breakdowns rather than data. Without automated condition monitoring and work order generation, unplanned downtime costs far more than scheduled maintenance.",
      },
      {
        title: "Disconnected Field Operations",
        description:
          "Field data lives in tablets, email, and paper. Office teams can't see real-time asset status, so decisions are based on yesterday's data.",
      },
      {
        title: "Regulatory Filing Burden",
        description:
          "Environmental compliance, safety reporting, and production data must be filed monthly with multiple agencies. Each filing requires pulling data from 4+ silos.",
      },
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
    },
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
      },
      {
        title: "Manual Order Fulfillment",
        description:
          "Orders land in the POS, get emailed to fulfillment, picked from paper lists, packed, and shipped — with status updates entered manually at every step.",
      },
      {
        title: "Customer Support Spikes",
        description:
          "During sales events, order status and return inquiries spike. CSRs handle each inquiry by hand across several disconnected systems.",
      },
      {
        title: "SKU-Level Pricing Updates",
        description:
          "Promotional pricing requires updating 100s of SKUs individually across the POS and ecommerce platform. Errors cause customer complaints and margin loss.",
      },
      {
        title: "Shrinkage Detection Latency",
        description:
          "Inventory shrinkage isn't visible until quarterly physical counts. By then, theft patterns and process failures are months old.",
      },
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
    },
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
      "Law firms leave millions on the table every year through unbillable administrative work — matter creation, document management, client intake, conflict checking, and billing. Associates at top firms spend a large part of their week on tasks that could be fully automated. Simpler Life 100 deploys AI legal assistants that handle intake, conflict checks, document drafting, deadline tracking, and time capture — so every hour worked is an hour billed.",
    painPoints: [
      {
        title: "Non-Billable Administrative Overload",
        description:
          "Attorneys and paralegals spend a large part of their week on administrative tasks — opening matters, organizing files, and managing correspondence — that cannot be billed to clients.",
      },
      {
        title: "Manual Client Intake",
        description:
          "New client inquiries go through phone, email, and web forms. Intake staff manually enter data into the PMS, run conflict checks, and send engagement letters. Each intake takes 45+ minutes.",
      },
      {
        title: "Document Version Chaos",
        description:
          "Contracts and briefs undergo 15+ revisions via email attachments. Without centralized version control, teams waste hours reconciling changes and risk filing the wrong version.",
      },
      {
        title: "Conflict Check Bottleneck",
        description:
          "Every new matter requires conflict checks against current and former clients. Staff manually search 3+ databases, and each check takes 15-20 minutes.",
      },
      {
        title: "Time Capture Leakage",
        description:
          "Attorneys forget to log small time increments — phone calls, quick emails, document reviews. Small increments get lost, and billable time that is never captured is never billed.",
      },
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
    },
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
          "Each new claim requires entering 30+ data fields from phone calls, emails, and paper forms into the claims management system. Every data-entry error becomes downstream rework.",
      },
      {
        title: "Multi-System Policy Verification",
        description:
          "Adjusters manually cross-reference policy details across 3+ legacy systems. Each verification takes 10-15 minutes and pulls data from systems that don't talk to each other.",
      },
      {
        title: "Underwriting Document Review",
        description:
          "Claims over a threshold require underwriter review of policy documents, endorsements, and correspondence. Each review takes 45+ minutes of reading and cross-referencing.",
      },
      {
        title: "Fraud False-Positive Triage",
        description:
          "Fraud detection flags claims for review, most of them false positives. Investigators spend their time clearing innocent claims.",
      },
      {
        title: "Regulatory Filing Burden",
        description:
          "State-level regulatory filings require monthly data submissions. Each filing pulls data from claims, underwriting, finance, and compliance systems.",
      },
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
    },
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
          "Buyers usually contact whoever responds first. Without an automated response, leads sit in your CRM until somebody notices — long enough to lose the deal.",
      },
      {
        title: "Showing Coordination Nightmare",
        description:
          "Each showing requires 6+ calls or texts between agent, buyer, seller, and listing agent. Scheduling a single showing wastes 45+ minutes of back-and-forth.",
      },
      {
        title: "Contract Workflow Fatigue",
        description:
          "Contracts require pulling data from MLS, adding custom terms, calculating prorations, and collecting signatures. Each contract takes 3-4 hours of painstaking work.",
      },
      {
        title: "Lead Nurturing Gaps",
        description:
          "After the first week, most agents stop following up systematically. Most leads never receive a second contact, leaving pipeline value on the table.",
      },
      {
        title: "MLS Data Duplication",
        description:
          "Listing details are entered into MLS, then re-entered into the CRM, then again into marketing materials. Each listing requires 45+ minutes of duplicate data entry.",
      },
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
    },
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
      "Aerospace manufacturers operate under AS9100 standards where a single missing signature can ground a production line. Simpler Life 100 deploys one platform that automates engineering change notice routing, supplier quality documentation, FAA and ITAR compliance reporting, and government contract billing. Your engineers focus on flight-critical work while the platform handles the documentation chain with a complete, traceable record — audit-ready at every step.",
    painPoints: [
      {
        title: "Engineering Change Notice Backlogs",
        description:
          "Every design change triggers a paper trail across engineering, quality, supply chain, and the FAA. Manual ECN routing takes 3–7 days, and a single missing signature can ground a production line. Most shops have 15–30 open ECNs at any time.",
      },
      {
        title: "Supplier Quality Documentation",
        description:
          "AS9100 requires traceable supplier quality records for every part. Receiving teams manually match certs, C of Cs, material test reports, and process specs against POs — 12–18 minutes per shipment, with errors creating audit exposure.",
      },
      {
        title: "Regulatory Compliance Reporting",
        description:
          "FAA, EASA, and ITAR compliance require meticulous documentation. Quarterly reports pull data from 5+ disconnected systems. One missed filing costs $10K+ in penalties and puts certifications at risk.",
      },
      {
        title: "Government Contract Billing",
        description:
          "DCAA-compliant billing requires exact labor hour tracking, cost allocation, and audit-ready documentation. Manual reconciliation across timekeeping, project management, and accounting takes 20+ hours per billing cycle.",
      },
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
    },
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
      "From commodity hedging paperwork to FSMA compliance, agricultural operations run on documentation that's still mostly paper-based. Simpler Life 100's platform automates grain settlement reconciliation, FSMA traceability documentation, equipment maintenance scheduling, and supplier invoice processing. Your operation runs smoothly whether you're in the office or in the field — with complete traceability from seed to settlement.",
    painPoints: [
      {
        title: "Commodity Contract Reconciliation",
        description:
          "Grain elevators and processors manage hundreds of contracts with different basis levels, delivery periods, and quality specs. Manually reconciling settlement sheets against contracts eats a working day or more each week, and errors turn into incorrect payouts.",
      },
      {
        title: "FSMA Traceability Documentation",
        description:
          "The Food Safety Modernization Act requires one-up/one-down traceability for every lot. Paper-based lot tracking means traceability exercises take 24–48 hours when the regulator wants them in under 4.",
      },
      {
        title: "Equipment Maintenance Scheduling",
        description:
          "Planting and harvest windows don't wait. Manual maintenance logs and paper-based service records mean preventative work gets skipped until something breaks — and breakdowns during harvest cascade into six-figure losses.",
      },
      {
        title: "Supplier Invoice Processing",
        description:
          "Seed, chemical, fertilizer, and fuel invoices arrive in dozens of formats — emailed PDFs, portal downloads, paper bills. AP clerks manually key each into the accounting system, averaging 8 minutes per invoice.",
      },
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
    },
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
      "Automotive suppliers operate on razor-thin margins where a single EDI error or missed material release can stop an OEM production line. Simpler Life 100 deploys one platform that automates PPAP documentation, EDI order processing, supplier quality scorecards, and JIT material release management. The platform keeps your supply chain synchronized at production speed — preventing line-down situations before they happen.",
    painPoints: [
      {
        title: "PPAP Documentation Bottlenecks",
        description:
          "Every new part requires a Production Part Approval Process submission — dozens of documents including PFMEAs, control plans, MSA studies, and dimensional results. Manually assembling a PPAP takes 20–40 hours and delays SOP by weeks.",
      },
      {
        title: "EDI Order Processing Errors",
        description:
          "OEMs send releases that get revised every week. Manual EDI translation and order entry leads to mis-shipments, line-down penalties, and premium freight charges.",
      },
      {
        title: "Supplier Quality Scorecards",
        description:
          "IATF 16949 requires tracked supplier performance. Quality teams manually pull data from receiving, production, and warranty systems, spending 8 hours per supplier per quarter building scorecards instead of improving supplier quality.",
      },
      {
        title: "JIT Material Release Management",
        description:
          "MRP signals change daily. Planners manually adjust material releases across dozens of suppliers — a single missed update means either a line-down or excess inventory carrying cost.",
      },
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
    },
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
      "E-commerce brands selling across Shopify, Amazon, Walmart, and wholesale channels drown in order reconciliation, inventory sync, returns processing, and customer support tickets. Simpler Life 100 deploys one platform that reconciles orders across every channel in real time, syncs inventory to prevent oversells, automates returns and RMA processing, and triages customer support so common requests are handled automatically. Your team focuses on growth — the platform handles the operations.",
    painPoints: [
      {
        title: "Multi-Channel Order Reconciliation",
        description:
          "Orders from Shopify, Amazon, Walmart Marketplace, and wholesale EDI each have different formats, fee structures, and fulfillment requirements. Manual reconciliation eats the week, and oversells cost margin.",
      },
      {
        title: "Supplier Purchase Order Management",
        description:
          "Planners manually convert forecasts into POs across 20–50 suppliers with different lead times, MOQs, and pricing tiers. Stockouts during peak season lose sales you had already forecast.",
      },
      {
        title: "Returns & RMA Processing",
        description:
          "Returns from multiple channels with different policies. Manual RMA creation, label generation, disposition assessment, and refund processing takes 8–12 minutes per return — every delay drives a negative review.",
      },
      {
        title: "Customer Support Ticket Triage",
        description:
          "WISMO, return requests, product questions, and account issues flood the inbox. Manual triage means simple questions wait hours while complex ones get rushed — hurting CSAT across the board.",
      },
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
    },
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
      "K-12 districts, community colleges, and universities are buried in enrollment documents, grant compliance reports, procurement requisitions, and faculty onboarding paperwork. Simpler Life 100 deploys one platform that automates new student enrollment processing, federal and state grant compliance tracking, purchase order workflows with multi-level approvals, and faculty onboarding coordination. Your staff reclaims hundreds of hours each semester to focus on educational outcomes.",
    painPoints: [
      {
        title: "Enrollment Document Processing",
        description:
          "Every new student brings transcripts, immunization records, proof of residency, and enrollment forms. Admissions staff manually verify, scan, index, and file each document — 15–20 minutes per student, and peak season means months of overtime.",
      },
      {
        title: "Grant & Title Fund Compliance",
        description:
          "Federal and state grants require meticulous documentation of every dollar spent. Manual reconciliation of grant expenditures against approved budgets takes 25+ hours per grant per reporting period — audit findings can claw back funding.",
      },
      {
        title: "Purchase Order & Procurement",
        description:
          "Schools order everything from textbooks to HVAC maintenance. Manual PO creation, multi-level approval routing, and budget code verification means requisitions take 5–10 days on average.",
      },
      {
        title: "Faculty & Staff Onboarding",
        description:
          "New hires require HR paperwork, credential verification, background checks, IT account provisioning, and benefits enrollment. Manual coordination across HR, IT, and departments means new faculty wait 2–3 weeks for full system access.",
      },
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
    },
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
      "Municipal, county, and state agencies face growing citizen expectations with shrinking administrative bandwidth. Simpler Life 100 deploys one platform that automates FOIA and public records request processing, permit application routing across multiple departments, federal grant performance reporting, and constituent correspondence triage. Your agency meets statutory deadlines, works through backlogs faster, and gives staff time back for the work that requires human judgment.",
    painPoints: [
      {
        title: "Public Records Request Processing",
        description:
          "FOIA and state open records requests require document search across email, file shares, and legacy systems. Manual searches take 4–12 hours per request, and statutory deadlines mean staff are in constant crisis mode — risking lawsuits and fines.",
      },
      {
        title: "Permit Application Processing",
        description:
          "Building permits, business licenses, and environmental permits require multiple department reviews. Paper-based routing takes 2–6 weeks for a simple permit, and lost applications mean citizens restart the process.",
      },
      {
        title: "Grant Management & Reporting",
        description:
          "Federal and state grants require quarterly performance reports, financial reconciliations, and procurement compliance documentation. Manual assembly across disconnected systems takes 30–50 hours per grant per quarter.",
      },
      {
        title: "Constituent Correspondence Management",
        description:
          "Emails, letters, and web forms flow into general inboxes with no triage. Manual sorting means urgent matters get buried, response times average 5–10 business days, and repeat contacts on the same issue are treated as new.",
      },
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
    },
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
      "Hotels, resorts, and multi-property management groups lose revenue to missed room-block cut-off dates, manual BEO processing, AP invoice backlogs, and fragmented guest service requests. Simpler Life 100 deploys one platform that automates group booking management, banquet event order generation, vendor invoice coding, and guest request triage. Your team focuses on guest experience while the platform handles the operational engine that powers every stay.",
    painPoints: [
      {
        title: "Group Booking & Room Block Management",
        description:
          "Sales managers track room blocks, cut-off dates, attrition clauses, and pickup reports across 30–50 active groups. Missed cut-off dates lose revenue from unreleased rooms, and manual pickup reporting means forecasting is always 48 hours behind.",
      },
      {
        title: "Banquet Event Order Processing",
        description:
          "Every wedding, conference, and dinner generates a BEO with AV, menus, setup, and billing. Manual creation and distribution to culinary, AV, and ops takes 2–3 hours per event, and version-chaos means the kitchen works from last week's menu.",
      },
      {
        title: "Vendor Invoice Processing",
        description:
          "F&B, linens, landscaping, maintenance, and amenity suppliers send 200–500 invoices monthly. Manual coding to department and GL takes 6–8 minutes per invoice, and month-end close is a 3-day scramble.",
      },
      {
        title: "Guest Service Request Management",
        description:
          "Requests via text, app, front desk, and housekeeper notes have no unified triage system. Urgent maintenance issues get the same priority as extra towel requests, and shift-change handoffs lose track of open items.",
      },
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
    },
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
      "Media production companies, agencies, and publishers create great content but drown in the operational complexity behind it — rights and clearances tracking, talent payment processing with guild rules, content metadata management across platforms, and vendor invoice reconciliation across dozens of productions. Simpler Life 100 deploys one platform that keeps your production pipeline flowing and your creatives creating, with zero rights violations and audit-ready financials.",
    painPoints: [
      {
        title: "Rights & Clearances Management",
        description:
          "Every piece of content involves music rights, stock footage licenses, talent agreements, and location releases. Manual tracking in spreadsheets means expired licenses slip through — creating legal exposure that can pull content off platforms.",
      },
      {
        title: "Talent & Crew Payment Processing",
        description:
          "Union and non-union talent payments require session fees, residuals, royalties, and expense reimbursements with complex calculation rules. Manual processing takes 15–20 minutes per payment and errors trigger guild audits.",
      },
      {
        title: "Content Metadata Management",
        description:
          "Publishing content across platforms requires consistent metadata — titles, descriptions, tags, rights windows, territory restrictions. Manual entry for each platform means inconsistent metadata and missed discoverability.",
      },
      {
        title: "Vendor & Freelancer Invoice Processing",
        description:
          "Every production uses dozens of vendors and freelancers, each with their own invoice format. AP manually codes to the correct project, cost category, and tax treatment — 8–10 minutes per invoice across hundreds of invoices.",
      },
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
    },
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
      "Pharmaceutical manufacturers and CROs operate under GxP regulations where documentation precision is non-negotiable. Simpler Life 100 deploys one platform that automates batch record review against SOPs, deviation and CAPA lifecycle management, regulatory submission assembly in eCTD format, and supplier qualification documentation tracking. The platform maintains continuous audit readiness — so when the FDA arrives, you're already prepared, with every document traced and every CAPA closed.",
    painPoints: [
      {
        title: "Batch Record Review",
        description:
          "Every batch generates a 50–200 page record. QA reviewers manually verify every entry against SOPs, specs, and GMP requirements — 4–8 hours per batch. A single missed discrepancy can result in a 483 observation or warning letter.",
      },
      {
        title: "Deviation & CAPA Management",
        description:
          "When a deviation occurs, the investigation, root cause analysis, CAPA proposal, and effectiveness verification create a paper trail taking 20–40 hours to document. Manual tracking means CAPAs fall through cracks and repeat deviations occur.",
      },
      {
        title: "Regulatory Submission Assembly",
        description:
          "IND, NDA, and ANDA submissions require thousands of documents in eCTD format. Manual compilation, hyperlinking, and validation takes 200–400 hours per submission — formatting errors cause RTF rejections that delay review timelines.",
      },
      {
        title: "Supplier Qualification Documentation",
        description:
          "GMP requires qualified suppliers with audited quality systems. Manual tracking of supplier audits, quality agreements, and CoAs across 200+ suppliers means qualifications expire unnoticed until an auditor finds the gap.",
      },
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
    },
  },
  {
    id: "professional-services",
    name: "Professional Services",
    icon: "💼",
    accent: "#4b5563",
    bgLight: "bg-gray-50",
    tagline: "Bill more. Admin less.",
    hook: "The most profitable hour in professional services is the one that gets billed — and plenty never do.",
    description:
      "Consulting, accounting, engineering, and advisory firms lose millions to billing leakage, slow engagement setup, manual expense processing, and invoice assembly. Simpler Life 100 deploys one platform that accelerates engagement setup, recovers lost billable time through intelligent time entry review, automates expense report processing, and assembles client-ready invoices in minutes. Your professionals bill more hours while your back office runs on autopilot.",
    painPoints: [
      {
        title: "Engagement Setup Delays",
        description:
          "Every new project requires engagement letters, SOWs, budget setup, and team assignment. Manual coordination across partners, legal, resource management, and finance takes 5–10 days — all non-billable time and a poor first impression.",
      },
      {
        title: "Time Entry & Billing Leakage",
        description:
          "Professionals enter vague time descriptions with wrong project codes, and billable time goes unentered every week. Billing coordinators chase missing time, correct codes, and rewrite narratives — non-billable rework that grows with the team.",
      },
      {
        title: "Expense Report Processing",
        description:
          "Consultants submit crumpled receipts and vague expense descriptions weeks after travel. Finance manually verifies against client billing guidelines, codes to the right project, and chases missing documentation — 12–15 minutes per expense report.",
      },
      {
        title: "Client Invoice Assembly",
        description:
          "Each client has unique formatting, backup documentation, and submission requirements. Manually assembling invoices with time detail, expense backup, and cover pages takes 15–25 minutes per invoice every month.",
      },
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
    },
  },
  {
    id: "technology",
    name: "Technology",
    icon: "💻",
    accent: "#2563eb",
    bgLight: "bg-blue-50",
    tagline: "Scale operations without scaling headcount",
    hook: "SaaS companies pay for licenses nobody uses and auto-renewals nobody reviewed.",
    description:
      "B2B SaaS and tech companies scaling from $10M to $100M hit an operational wall — IT tickets pile up, SaaS vendor sprawl drains budgets, deal desk bottlenecks slow revenue recognition, and customer onboarding documentation takes days per account. Simpler Life 100 deploys one platform that auto-resolves the IT tickets that need no human, discovers and manages every SaaS subscription, validates sales orders against pricing policies in minutes, and generates customized onboarding plans from deal data. Scale revenue without scaling ops headcount.",
    painPoints: [
      {
        title: "IT Operations Ticket Overload",
        description:
          "IT teams drown in access requests, software provisioning, and troubleshooting tickets. Manual triage and routing means critical infrastructure alerts sit alongside password reset requests, and MTTR averages 4+ hours for routine issues.",
      },
      {
        title: "SaaS Vendor Sprawl & Renewals",
        description:
          "Every department buys their own tools. Finance has no centralized view of 150+ SaaS subscriptions, auto-renewals hit without review, and unused licenses quietly consume software spend. Manual tracking in spreadsheets doesn't scale.",
      },
      {
        title: "Deal Desk & Sales Order Processing",
        description:
          "Sales closes deals but order forms arrive with pricing errors, missing approvals, and non-standard terms. Deal desk manually validates every order against price books and discount policies — 25–40 minutes per order, and errors cause billing disputes.",
      },
      {
        title: "Customer Onboarding Documentation",
        description:
          "Every new customer requires a tailored onboarding plan, technical configuration docs, and training materials. CS teams manually assemble these from templates — 3–5 hours per customer that delays time-to-value.",
      },
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
    },
  },
  {
    id: "telecom",
    name: "Telecom",
    icon: "📡",
    accent: "#0891b2",
    bgLight: "bg-cyan-50",
    tagline: "Connect faster. Operate smarter.",
    hook: "A single billing error on a wholesale circuit compounds month after month — and most providers audit only a fraction of their carrier invoices.",
    description:
      "Telecom service providers, ISPs, and MSPs manage extraordinary operational complexity — service order orchestration across 5+ teams, carrier invoice auditing across dozens of underlying providers, network inventory reconciliation, and customer MACD processing. Simpler Life 100 deploys one platform that automates end-to-end service delivery, audits every carrier invoice and recovers what it finds, continuously reconciles network inventory, and processes MACDs same-day. Your NOC focuses on network health, not spreadsheet reconciliation.",
    painPoints: [
      {
        title: "Service Order Processing",
        description:
          "Every new circuit or service order requires coordination across sales engineering, network operations, field services, and billing. Manual handoffs between 5+ teams create 3–10 day provisioning cycles and frequent escalations.",
      },
      {
        title: "Carrier Invoice Auditing",
        description:
          "Providers pay dozens of underlying carriers for circuits, colocation, and transit. Each carrier invoice requires validation against contracted rates and circuit inventory — a single billing error can cost $2K–$10K per month.",
      },
      {
        title: "Network Inventory Reconciliation",
        description:
          "What's actually in the network rarely matches what's in the inventory system. Circuits get turned up without being recorded, decom'd circuits stay in the database, and capacity planning runs on data nobody can vouch for.",
      },
      {
        title: "Customer MACD Processing",
        description:
          "Moves, adds, changes, and disconnects come in via email, portal, and phone. Manual processing means MACDs take 3–7 days, and billing doesn't start/stop automatically — causing credit requests and revenue leakage.",
      },
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
    },
  },
  {
    id: "transportation",
    name: "Transportation",
    icon: "🚌",
    accent: "#d97706",
    bgLight: "bg-amber-50",
    tagline: "Keep moving. Automate the rest.",
    hook: "A single missed PM interval can strand passengers, trigger expensive road calls, and shorten vehicle lifespan.",
    description:
      "Transit agencies, charter services, and paratransit operators manage complex fleet operations where safety, compliance, and on-time performance are non-negotiable. Simpler Life 100 deploys one platform that automates preventive maintenance scheduling across every vehicle, tracks driver CDL and medical certifications with proactive alerts, communicates real-time service alerts to passengers, and optimizes paratransit trip scheduling automatically. Your fleet runs safer, your drivers stay compliant, and your riders stay informed.",
    painPoints: [
      {
        title: "Fleet Maintenance Management",
        description:
          "Preventive maintenance schedules for dozens or hundreds of vehicles are tracked on whiteboards and spreadsheets. Missed PM intervals cause breakdowns that strand passengers, trigger expensive road calls, and shorten vehicle lifespan.",
      },
      {
        title: "Driver Qualification & Compliance",
        description:
          "Every driver requires a CDL with proper endorsements, medical certificates, and annual MVR checks. Manual tracking across a rotating driver roster means expired credentials go unnoticed until a roadside inspection — risking out-of-service orders.",
      },
      {
        title: "Passenger Communication",
        description:
          "When routes are delayed or canceled, passengers find out at the stop. Manual communication means riders wait in the rain for buses that aren't coming, and customer service lines get flooded with calls that could have been a text message.",
      },
      {
        title: "Trip Scheduling & Dispatch",
        description:
          "Paratransit and charter operators manually schedule trips, assign vehicles, and optimize routes. Dispatchers lose hours every day to schedule building, and manual scheduling leaves capacity on the table.",
      },
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
    },
  },
];
