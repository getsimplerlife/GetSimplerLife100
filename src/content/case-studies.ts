export interface CaseStudy {
  id: string;
  title: string;
  company: string;
  industry: string;
  challenge: string;
  solution: string;
  results: { metric: string; value: string }[];
  workflowsUsed: string[];
  integrationsUsed: string[];
  quote: { text: string; attribution: string };
  timeline: string;
}

export const caseStudies: CaseStudy[] = [
  {
    id: "meridian-manufacturing",
    title: "Meridian Manufacturing slashes invoice processing time by 85% with AI document agents",
    company: "Meridian Manufacturing",
    industry: "manufacturing",
    challenge:
      "Meridian Manufacturing, a 450-employee industrial parts fabricator, processed 1,200+ supplier invoices monthly. The AP team of 4 people manually entered each invoice into their ERP, matched against POs, and routed for approval via email. Average processing time was 11 minutes per invoice. With 15% of invoices containing data entry errors that caused payment delays, supplier relationships were strained and early payment discounts were consistently missed.",
    solution:
      "Simpler Life 100 deployed an AI Invoice Processing Agent integrated with Meridian's SAP ERP and Outlook. The agent automates the full invoice lifecycle: extracting data from PDF and EDI invoices, performing 3-way matching against POs and receiving documents, routing exceptions for human review, and posting approved invoices to SAP. The implementation took 3 weeks and required no changes to Meridian's existing systems.",
    results: [
      { metric: "Invoice processing time", value: "11 min → 90 sec per invoice (85% reduction)" },
      { metric: "AP team capacity", value: "4 people handling 1,200+ invoices → 2 people handling 2,500+ invoices" },
      { metric: "Data entry errors", value: "15% error rate → 0.3% (99.7% accuracy)" },
      { metric: "Early payment discounts captured", value: "$47,000 annually recovered" },
      { metric: "ROI", value: "3.2x in first year" },
    ],
    workflowsUsed: ["invoice-automation", "purchase-order-management", "vendor-invoice-matching", "erp-updates"],
    integrationsUsed: ["sap", "outlook"],
    quote: {
      text: "We were drowning in paper invoices and manual data entry. The AI agent processes in seconds what took our team 11 minutes. Our AP team now focuses on vendor relationships instead of keystrokes.",
      attribution: "— David Chen, CFO, Meridian Manufacturing",
    },
    timeline: "3 weeks implementation. Full ROI achieved in 4 months.",
  },
  {
    id: "coastline-logistics",
    title: "Coastline Logistics recovers 140 labor hours monthly with dispatch automation",
    company: "Coastline Logistics",
    industry: "logistics",
    challenge:
      "Coastline Logistics, a regional freight carrier with 85 trucks, relied on manual dispatch processes. Dispatchers spent 3+ hours each morning building routes on whiteboards, calling drivers for availability, and juggling last-minute changes. Proof-of-delivery documents were paper-based, with drivers collecting signatures that sat in truck cabs for days before reaching the billing team. On-time delivery averaged 82%, and fuel costs were 18% above industry benchmarks.",
    solution:
      "Simpler Life 100 deployed an AI Operations Team for Logistics that automated dispatch scheduling, route optimization, carrier coordination, and POD collection. The system integrates with Coastline's TMS and driver mobile app, providing real-time route optimization based on traffic, driver HOS, and delivery windows. PODs are captured digitally via the driver app and automatically matched to shipments and invoices.",
    results: [
      { metric: "Monthly labor hours saved", value: "140 hours across dispatch and admin teams" },
      { metric: "Dispatch scheduling time", value: "3+ hours → under 40 minutes daily" },
      { metric: "On-time delivery", value: "82% → 98%" },
      { metric: "Fuel costs", value: "Reduced by 22%" },
      { metric: "Invoice-to-cash cycle", value: "18 days → 6 days" },
    ],
    workflowsUsed: ["dispatch-scheduling", "route-optimization", "pod-collection", "carrier-coordination", "freight-audit"],
    integrationsUsed: ["salesforce", "outlook", "gmail", "quickbooks"],
    quote: {
      text: "Our dispatchers used to spend the first 3 hours of every shift just planning routes. Now the AI handles that in 40 minutes and re-optimizes in real time when things change. PODs arrive with the invoice instead of 2 weeks later.",
      attribution: "— Maria Santos, VP of Operations, Coastline Logistics",
    },
    timeline: "5 weeks implementation. Full ROI achieved in 3 months.",
  },
  {
    id: "mercy-health-partners",
    title: "Mercy Health Partners saves 18+ hours per provider weekly with patient intake automation",
    company: "Mercy Health Partners",
    industry: "healthcare",
    challenge:
      "Mercy Health Partners, a multi-specialty group with 12 clinic locations, struggled with administrative overhead. Each provider lost 18-22 hours weekly to non-clinical tasks: manually transcribing patient intake forms into the EHR, verifying insurance by phone, scheduling appointments, and managing compliance documentation. No-show rates hit 28%, and billing cycles stretched to 45+ days due to coding backlogs.",
    solution:
      "Simpler Life 100 deployed an AI Healthcare Operations Team that automated the full patient lifecycle. Digital intake forms replaced paper, with AI extracting demographic and insurance data directly into the EHR. Insurance verification runs via payer APIs before appointments. Automated appointment reminders via text and email cut no-shows dramatically. Medical coding suggestions from clinical notes accelerated the billing cycle.",
    results: [
      { metric: "Provider time reclaimed", value: "18+ hours per provider weekly" },
      { metric: "No-show rate", value: "28% → 4% (94% reduction)" },
      { metric: "Intake processing time", value: "20 min → under 3 min per patient" },
      { metric: "Claims cycle time", value: "45 days → 18 days" },
      { metric: "Patient satisfaction scores", value: "82 → 94 (NPS)" },
    ],
    workflowsUsed: ["patient-intake", "appointment-scheduling", "insurance-verification", "medical-coding", "claims-processing"],
    integrationsUsed: ["epic", "outlook", "gmail"],
    quote: {
      text: "Our providers are clinicians, not data entry clerks. The AI handles the paperwork so our doctors can focus on what they trained for — patient care. The reduction in no-shows alone paid for the system in 2 months.",
      attribution: "— Dr. Amanda Foster, Chief Medical Officer, Mercy Health Partners",
    },
    timeline: "4 weeks implementation. Full ROI achieved in 2 months.",
  },
  {
    id: "summit-construction",
    title: "Summit Construction closes projects 35% faster with AI-powered field reporting",
    company: "Summit Construction",
    industry: "construction",
    challenge:
      "Summit Construction, a mid-market commercial builder, managed 15+ active projects across 3 states. Estimators spent 25+ hours weekly on manual spreadsheet bids. Daily field reports were handwritten by superintendents and entered into the system 2-3 days late. Change orders traveled through email threads and got lost, causing budget overruns on 40% of projects. Project closeouts averaged 4 months past completion.",
    solution:
      "Simpler Life 100 deployed an AI Construction Operations Team that digitized field reporting, automated bid generation from project specs, and created a centralized change order tracking system. Superintendents submit daily reports via a mobile app with voice-to-text, photo attachments, and automated weather and labor data. Bids are generated from historical pricing data and material cost feeds in minutes instead of days.",
    results: [
      { metric: "Estimator time saved", value: "20+ hours per estimator weekly" },
      { metric: "Bid submission speed", value: "3 days → 1 day (2.5x faster)" },
      { metric: "Project closeout time", value: "4+ months → 2.5 months (35% faster)" },
      { metric: "Change order tracking accuracy", value: "60% → 100% digital trail" },
      { metric: "Budget overrun rate", value: "40% of projects → 8%" },
    ],
    workflowsUsed: ["production-reporting", "document-processing", "data-entry-automation", "compliance-reporting", "budget-tracking"],
    integrationsUsed: ["procore", "autocad", "quickbooks", "sharepoint"],
    quote: {
      text: "Field reports arriving 3 days late meant management was always behind reality. Now we have real-time visibility into every job site, and our estimators are winning more bids because they can respond faster.",
      attribution: "— Robert Kim, President, Summit Construction",
    },
    timeline: "6 weeks implementation. Full ROI achieved in 5 months.",
  },
  {
    id: "meridian-trust-bank",
    title: "Meridian Trust Bank achieves 100% audit pass rate with automated compliance monitoring",
    company: "Meridian Trust Bank",
    industry: "financial-services",
    challenge:
      "Meridian Trust Bank, a regional bank with $2.8B in assets, faced escalating compliance costs. The compliance team of 8 spent 30+ hours weekly on manual evidence collection for regulatory exams. Each exam cycle required 200+ person-hours of pulling screenshots, emails, and logs. KYC/AML onboarding took 3-5 business days per new client, and transaction monitoring generated 12,000+ alerts monthly — 96% were false positives that analysts manually reviewed.",
    solution:
      "Simpler Life 100 deployed an AI Financial Services Compliance Team that automated regulatory evidence collection, KYC/AML workflows, transaction monitoring triage, and audit trail generation. The system continuously maps regulatory requirements to internal controls, collects evidence from connected systems, and generates exam-ready evidence packages. Machine learning models score transaction alerts by risk, reducing false-positive triage by 80%.",
    results: [
      { metric: "Audit preparation time", value: "3 weeks → 3 days (80% reduction)" },
      { metric: "Client onboarding time", value: "5 days → 14 hours" },
      { metric: "False-positive triage time", value: "70% of analyst time → 15%" },
      { metric: "Audit findings", value: "3 material findings → zero (100% pass rate)" },
      { metric: "Compliance team productivity", value: "3.5x increase in effective capacity" },
    ],
    workflowsUsed: [
      "compliance-reporting",
      "client-intake",
      "onboarding",
      "document-processing",
      "compliance-monitoring",
      "audit-trail-generation",
    ],
    integrationsUsed: ["salesforce", "oracle-netsuite", "workday", "tableau"],
    quote: {
      text: "Our compliance team was drowning in manual evidence collection. Now the AI handles 80% of the prep work, and we enter every exam with complete confidence. Our last regulatory exam had zero findings for the first time in the bank's history.",
      attribution: "— Jennifer Walsh, Chief Compliance Officer, Meridian Trust Bank",
    },
    timeline: "8 weeks implementation. Full ROI achieved in 6 months.",
  },
  {
    id: "sovereign-energy",
    title: "Sovereign Energy cuts reporting time by 65% with AI asset management agents",
    company: "Sovereign Energy",
    industry: "energy",
    challenge:
      "Sovereign Energy, an oil and gas operator with 600+ wells across the Permian Basin, managed thousands of assets with disconnected manual processes. Field inspectors collected data on paper or tablets, generating reports that took days to compile into tracking systems. Maintenance was reactive — triggered by breakdowns costing 4x more than scheduled maintenance. Regulatory filings required pulling production data from 5+ silos, taking 2+ weeks per filing cycle.",
    solution:
      "Simpler Life 100 deployed an AI Energy Operations Team that automated asset data intake, inspection report generation, predictive maintenance scheduling, and regulatory filing preparation. The system ingests data from SCADA, field tablets, and inspection databases, generating real-time asset health dashboards. Predictive models flag assets needing maintenance before failure, and regulatory data is pulled automatically from operational systems into filing templates.",
    results: [
      { metric: "Reporting time", value: "Reduced by 65% — from weeks to days" },
      { metric: "Unplanned downtime", value: "Reduced by 40%" },
      { metric: "Maintenance cost per asset", value: "Reduced by 35%" },
      { metric: "Regulatory filing cycle", value: "2+ weeks → 3 days" },
      { metric: "Return on investment", value: "2.2x in first year" },
    ],
    workflowsUsed: [
      "data-entry-automation",
      "document-processing",
      "production-reporting",
      "compliance-reporting",
      "quality-assurance",
    ],
    integrationsUsed: ["sap", "oracle-netsuite", "sharepoint", "power-bi"],
    quote: {
      text: "We went from reactive firefighting to predictive asset management. The AI catches small issues before they become expensive failures, and our regulatory filings that used to take 2 weeks now take 3 days.",
      attribution: "— Marcus Webb, VP of Operations, Sovereign Energy",
    },
    timeline: "7 weeks implementation. Full ROI achieved in 5 months.",
  },
  {
    id: "coastal-outfitters-retail",
    title: "Coastal Outfitters achieves 99.5% inventory accuracy with AI reconciliation agents",
    company: "Coastal Outfitters",
    industry: "retail",
    challenge:
      "Coastal Outfitters, an outdoor apparel retailer with 38 stores and an ecommerce operation, battled chronic inventory inaccuracy. Physical counts happened quarterly, and between counts, inventory data was always 2-3 days behind reality. Stockouts caused 8% of online orders to be canceled. Overstock tied up $2.4M in excess inventory. Order fulfillment was manual — pick lists printed, items picked from paper, labels printed one at a time.",
    solution:
      "Simpler Life 100 deployed an AI Retail Operations Team that automated inventory reconciliation across the WMS, ERP, and POS systems. Real-time inventory feeds update stock levels instantly as sales, returns, and transfers occur. Automated replenishment triggers POs when stock dips below configured thresholds. Order fulfillment was digitized with optimized pick lists, barcode validation, and automated shipping label generation.",
    results: [
      { metric: "Inventory accuracy", value: "82% → 99.5%" },
      { metric: "Stockout-related cancellations", value: "8% → 0.5%" },
      { metric: "Excess inventory", value: "$2.4M → $890K (63% reduction)" },
      { metric: "Fulfillment time per order", value: "15 min → 5 min" },
      { metric: "Shrinkage detection", value: "Quarterly → real-time" },
    ],
    workflowsUsed: [
      "inventory-reconciliation",
      "purchase-order-management",
      "order-fulfillment",
      "invoice-automation",
      "data-entry-automation",
    ],
    integrationsUsed: ["quickbooks", "xero", "salesforce", "slack"],
    quote: {
      text: "We were losing millions to excess inventory and stockouts. The AI gives us real-time inventory visibility across all channels — something our legacy systems could never deliver. We canceled a $500K warehouse expansion because we optimized what we already had.",
      attribution: "— Lisa Park, COO, Coastal Outfitters",
    },
    timeline: "5 weeks implementation. Full ROI achieved in 4 months.",
  },
  {
    id: "stonebridge-law-group",
    title: "Stonebridge Law Group recovers 12+ billable hours per attorney weekly",
    company: "Stonebridge Law Group",
    industry: "legal",
    challenge:
      "Stonebridge Law Group, a 40-attorney firm specializing in corporate law and litigation, lost millions annually to non-billable administrative work. Attorneys spent 30% of their week on administrative tasks — matter creation, document management, client intake, conflict checking. Billable time capture was inconsistent, with an estimated 8% of billable time going uncaptured. Document version control was chaotic, with 15+ email attachments per document revision.",
    solution:
      "Simpler Life 100 deployed an AI Legal Operations Team that automated client intake, conflict checking, document drafting, time capture, and deadline tracking. The system integrates with the firm's practice management software and email. New client inquiries are captured via web form, automatically run through conflict databases, and engagement letters are generated from templates. Time is captured automatically from calendar events, email activity, and document access.",
    results: [
      { metric: "Billable hours recovered", value: "12+ hours per attorney weekly" },
      { metric: "Revenue increase", value: "18% per attorney attributable to recovered time" },
      { metric: "Intake-to-engagement time", value: "2 days → 3 hours" },
      { metric: "Document turnaround", value: "Reduced by 60%" },
      { metric: "Time capture accuracy", value: "92% → 99% of billable time captured" },
    ],
    workflowsUsed: [
      "client-intake",
      "contract-review",
      "document-generation",
      "time-tracking",
      "document-processing",
      "compliance-reporting",
    ],
    integrationsUsed: ["salesforce", "outlook", "gmail", "google-drive", "sharepoint", "dropbox"],
    quote: {
      text: "Every hour an attorney spends on admin is an hour they're not billing. The AI eliminated the administrative tax on our lawyers' time. We're billing more hours without asking anyone to work more — they just work on what matters.",
      attribution: "— Sarah Mitchell, Managing Partner, Stonebridge Law Group",
    },
    timeline: "5 weeks implementation. Full ROI achieved in 3 months.",
  },
  {
    id: "shield-insurance-group",
    title: "Shield Insurance Group processes claims 80% faster with AI claims automation",
    company: "Shield Insurance Group",
    industry: "insurance",
    challenge:
      "Shield Insurance Group, a mid-market P&C carrier, processed 4,500+ claims monthly with a team of 35 claims handlers. Each new claim required 30+ data fields entered manually from phone calls and emails. Policy verification spanned 3 legacy systems, taking 10-15 minutes per claim. Fraud detection flagged 15% of claims, but 80% were false positives. Average claim cycle time was 28 days, and leakage from inconsistent adjustment practices cost an estimated 6% of claim spend.",
    solution:
      "Simpler Life 100 deployed an AI Insurance Operations Team that automated the end-to-end claims lifecycle. First notice of loss is captured via web form, phone transcript, or email — with AI extracting all required data fields. Policy verification runs automatically across connected systems. Fraud scoring models prioritize high-risk claims and clear 80% of false positives automatically. Adjuster assignments, reserve setting, and settlement calculations are AI-assisted.",
    results: [
      { metric: "Claims processing time", value: "28 days → 5.5 days (80% faster)" },
      { metric: "Claim leakage", value: "6% → 2.1% (65% reduction)" },
      { metric: "False-positive triage", value: "80% of flagged claims auto-cleared, saving 70% of investigator time" },
      { metric: "Data entry per claim", value: "30+ fields manual → fully automated extraction" },
      { metric: "Return on investment", value: "1.8x in first year" },
    ],
    workflowsUsed: ["claims-processing", "document-processing", "data-entry-automation", "compliance-reporting", "client-intake"],
    integrationsUsed: ["salesforce", "oracle-netsuite", "workday", "tableau", "jira"],
    quote: {
      text: "Claims processing speed is our competitive advantage. The AI cut our cycle time from 28 days to 5.5 — that's weeks faster than the industry average. Our adjusters spend their time on complex claims that need human judgment, not data entry.",
      attribution: "— James Harlow, VP of Claims, Shield Insurance Group",
    },
    timeline: "8 weeks implementation. Full ROI achieved in 6 months.",
  },
  {
    id: "premier-properties-realty",
    title: "Premier Properties Realty converts 3.4x more leads with instant AI response",
    company: "Premier Properties Realty",
    industry: "real-estate",
    challenge:
      "Premier Properties Realty, a 200-agent brokerage, was losing buyers to faster competitors. Lead response time averaged 47 minutes — and 80% of buyers contact the first agent who responds. Agents spent 6+ hours weekly on administrative tasks: lead follow-up, showing coordination, contract preparation, and MLS data entry. Lead nurturing stopped after the first week, with 60% of leads receiving no second contact.",
    solution:
      "Simpler Life 100 deployed an AI Real Estate Operations Team that provides instant lead response via text and email, automated showing coordination, contract drafting from MLS data, and automated lead nurturing sequences. Leads are contacted within 45 seconds, qualified through AI conversation, and routed to the right agent. Showings are coordinated without back-and-forth calls. Contracts are auto-populated from MLS data and client preferences.",
    results: [
      { metric: "Lead response time", value: "47 min → 45 seconds" },
      { metric: "Lead-to-client conversion", value: "3.4x improvement" },
      { metric: "Agent admin time saved", value: "22 hours per agent weekly" },
      { metric: "Contract turnaround", value: "4 hours → 45 minutes (60% faster)" },
      { metric: "Second-contact rate", value: "40% → 95% automated nurture sequences" },
    ],
    workflowsUsed: ["lead-response", "lead-scoring", "client-intake", "document-generation", "appointment-scheduling"],
    integrationsUsed: ["salesforce", "hubspot", "outlook", "gmail", "google-drive", "slack"],
    quote: {
      text: "In real estate, the first agent to respond gets the client. Our AI responds in 45 seconds — faster than any human possibly could. We're converting 3.4x more leads and our agents have 22 more hours per week to actually work with clients.",
      attribution: "— Michael Torres, Broker Owner, Premier Properties Realty",
    },
    timeline: "3 weeks implementation. Full ROI achieved in 2 months.",
  },
  {
    id: "redwood-industrial",
    title: "Redwood Industrial reduces QC overhead by 50% with automated inspections",
    company: "Redwood Industrial",
    industry: "manufacturing",
    challenge:
      "Redwood Industrial, a precision machining contractor for aerospace and automotive clients, faced quality documentation overload. QA inspectors spent 40% of their time on paperwork — filling inspection checklists, writing non-conformance reports, and compiling certificates of analysis. Each inspection generated 30 minutes of documentation. Non-conformance reports took 2+ hours to write and route for corrective action. Customer audits required days of paper gathering.",
    solution:
      "Simpler Life 100 deployed an AI Quality Assurance Agent that digitized the entire inspection documentation process. Digital checklists with pre-populated spec tolerances auto-validate readings. Non-conformance reports are generated automatically with photo attachments, root cause codes, and corrective action assignments. Certificates of analysis are created from passed inspection data with a single click. The system integrates with Redwood's ERP for real-time quality dashboards.",
    results: [
      { metric: "QA documentation time", value: "30 min → 5 min per inspection (83% reduction)" },
      { metric: "Non-conformance report time", value: "2+ hours → 15 minutes" },
      { metric: "Certificate of analysis generation", value: "45 min → instant" },
      { metric: "QC overhead reduction", value: "50% — inspectors focus on inspection, not paperwork" },
      { metric: "Customer audit prep time", value: "3 days → 30 minutes" },
    ],
    workflowsUsed: ["quality-assurance", "document-processing", "production-reporting", "compliance-reporting", "erp-updates"],
    integrationsUsed: ["sap", "sharepoint", "outlook"],
    quote: {
      text: "Our QA people are skilled inspectors, not typists. The AI freed them from the paperwork trap — they spend their time looking at parts, not filling forms. Our customers noticed the difference immediately in audit response times.",
      attribution: "— Elena Rodriguez, Quality Director, Redwood Industrial",
    },
    timeline: "4 weeks implementation. Full ROI achieved in 3 months.",
  },
  {
    id: "thunder-freight",
    title: "Thunder Freight cuts fuel costs by 22% with AI route optimization",
    company: "Thunder Freight",
    industry: "logistics",
    challenge:
      "Thunder Freight, a Midwest LTL carrier with 120 trucks, planned routes manually each morning. Traffic, weather, and last-minute pickups caused cascading delays all day. Fuel costs were 18% above industry benchmarks due to suboptimal routing. Driver turnover was high — 45% annually — partly because of unpredictable schedules and excessive overtime from inefficient routing. On-time performance averaged 79%.",
    solution:
      "Simpler Life 100 deployed an AI Route Optimization and Dispatch Agent that creates optimized routes factoring in real-time traffic, delivery windows, driver HOS, and vehicle capacity. The system re-optimizes dynamically when delays or new pickups occur. Drivers receive turn-by-turn directions on their mobile devices. Dispatchers monitor a real-time dashboard instead of a whiteboard.",
    results: [
      { metric: "Fuel costs", value: "Reduced by 22% — $340K annual savings" },
      { metric: "On-time performance", value: "79% → 97%" },
      { metric: "Driver turnover", value: "45% → 22% (more predictable schedules)" },
      { metric: "Stops per hour", value: "Increased by 18%" },
      { metric: "Dispatch planning time", value: "3 hours → 35 minutes daily" },
    ],
    workflowsUsed: ["dispatch-scheduling", "route-optimization", "carrier-coordination", "pod-collection"],
    integrationsUsed: ["salesforce", "outlook", "gmail"],
    quote: {
      text: "We were leaving 18% fuel efficiency on the table because our routes were optimized once at 6 AM and never adjusted. The AI re-optimizes in real time — saving us $340K in fuel last year alone. And our drivers are happier with consistent schedules.",
      attribution: "— Derek Walsh, Fleet Manager, Thunder Freight",
    },
    timeline: "5 weeks implementation. Full ROI achieved in 4 months.",
  },
  {
    id: "pacific-capital-group",
    title: "Pacific Capital Group cuts client onboarding from 5 days to 14 hours",
    company: "Pacific Capital Group",
    industry: "financial-services",
    challenge:
      "Pacific Capital Group, a wealth management firm with $1.2B AUM, processed 80+ new client onboarding requests monthly. Each onboarding required manual identity verification, KYC/AML checks, document collection, account setup across 4 systems, and compliance review. Average onboarding time was 5 business days. Prospects often withdrew during the slow process, costing an estimated $2.8M in lost AUM annually.",
    solution:
      "Simpler Life 100 deployed an AI Client Onboarding Agent that digitized the entire onboarding workflow. New client documents are submitted through a secure portal. AI extracts and validates identity information, runs KYC/AML checks against databases, and creates accounts across the firm's CRM, custodian platform, billing system, and client portal. Compliance reviews happen in parallel instead of sequentially.",
    results: [
      { metric: "Onboarding time", value: "5 days → 14 hours" },
      { metric: "Lost AUM from slow onboarding", value: "$2.8M → $340K (88% reduction)" },
      { metric: "KYC/AML accuracy", value: "100% with automated screening" },
      { metric: "Operations team capacity", value: "5 people handling 80 onboardings → 3 people handling 150" },
      { metric: "Client satisfaction (onboarding NPS)", value: "62 → 91" },
    ],
    workflowsUsed: ["client-intake", "onboarding", "document-processing", "data-entry-automation", "compliance-reporting"],
    integrationsUsed: ["salesforce", "oracle-netsuite", "workday", "tableau"],
    quote: {
      text: "Prospects who had to wait 5 days to open an account often changed their minds. Now we onboard in 14 hours — faster than many brokerages answer the phone. Our conversion rate from prospect to funded account jumped 40%.",
      attribution: "— William Chen, COO, Pacific Capital Group",
    },
    timeline: "5 weeks implementation. Full ROI achieved in 3 months.",
  },
  {
    id: "hartford-healthcare-network",
    title: "Hartford Healthcare Network cuts denial rate by 40% with AI claims processing",
    company: "Hartford Healthcare Network",
    industry: "healthcare",
    challenge:
      "Hartford Healthcare Network, a 5-hospital system with 200+ clinic locations, processed 35,000+ claims monthly. The denial rate was 12% — 30% above the industry benchmark. Each denial cost $118 to appeal and took 45 days to resolve. Coding errors accounted for 40% of denials. The revenue cycle team of 25 spent most of their time on denial management instead of proactive prevention.",
    solution:
      "Simpler Life 100 deployed an AI Revenue Cycle Agent that pre-validates claims before submission — checking coding accuracy, medical necessity, modifier usage, and payer-specific rules. Claims that fail validation are returned to coders with specific correction guidance before submission. Denied claims are automatically analyzed for root cause, and corrected claims are resubmitted within 24 hours.",
    results: [
      { metric: "Denial rate", value: "12% → 7.2% (40% reduction)" },
      { metric: "Denial appeal time", value: "45 days → 8 days" },
      { metric: "Revenue recovered from denials", value: "$1.8M annually" },
      { metric: "First-pass claim acceptance", value: "68% → 88%" },
      { metric: "Revenue cycle team capacity", value: "25 people → 18 people (7 redeployed to higher-value work)" },
    ],
    workflowsUsed: ["claims-processing", "medical-coding", "insurance-verification", "compliance-reporting"],
    integrationsUsed: ["epic", "cerner", "salesforce"],
    quote: {
      text: "We were treating the symptom — appealing denials — instead of preventing them. The AI catches coding errors before claims are submitted, cutting our denial rate by 40%. That's $1.8M in recovered revenue that used to slip through the cracks.",
      attribution: "— Dr. Patricia Nguyen, CFO, Hartford Healthcare Network",
    },
    timeline: "7 weeks implementation. Full ROI achieved in 5 months.",
  },
  {
    id: "pioneer-aerospace",
    title: "Pioneer Aerospace achieves 99.9% inventory accuracy across 50,000+ part numbers",
    company: "Pioneer Aerospace",
    industry: "manufacturing",
    challenge:
      "Pioneer Aerospace, an aerospace parts manufacturer with FAA and AS9100 certification, managed 50,000+ part numbers across raw materials, WIP, and finished goods. Inventory data was scattered across an aging ERP, a separate WMS, spreadsheets, and physical bin cards. Reconciliation between systems required 20+ hours of manual effort weekly. Inventory accuracy averaged 82%, causing production line stoppages and $2.1M in expedited shipping costs annually.",
    solution:
      "Simpler Life 100 deployed an AI Inventory Operations Agent that connects to the ERP, WMS, and physical inventory systems, reconciling inventory in real time. The system detects discrepancies instantly — flagging missing items, location mismatches, and quantity variances. Root cause analysis identifies whether issues stem from receiving errors, picking mistakes, or data entry problems. Automated replenishment triggers POs based on min/max levels and lead times.",
    results: [
      { metric: "Inventory accuracy", value: "82% → 99.9%" },
      { metric: "Reconciliation time", value: "20+ hours weekly → under 2 hours" },
      { metric: "Expedited shipping costs", value: "$2.1M → $520K (75% reduction)" },
      { metric: "Production line stoppages from stockouts", value: "12 per month → 1 per quarter" },
      { metric: "Return on investment", value: "4.1x in first year" },
    ],
    workflowsUsed: [
      "inventory-reconciliation",
      "purchase-order-management",
      "vendor-invoice-matching",
      "erp-updates",
      "data-entry-automation",
    ],
    integrationsUsed: ["sap", "oracle-netsuite", "sharepoint"],
    quote: {
      text: "In aerospace, a missing part can stop a production line and cost millions. Our inventory was only 82% accurate — we were flying blind. The AI gives us 99.9% accuracy and real-time visibility. Production stoppages from stockouts dropped from 12 a month to 1 a quarter.",
      attribution: "— Thomas Webb, Supply Chain Director, Pioneer Aerospace",
    },
    timeline: "6 weeks implementation. Full ROI achieved in 4 months.",
  },
  {
    id: "northstar-urgent-care",
    title: "NorthStar Urgent Care achieves 94% show rate with AI scheduling agents",
    company: "NorthStar Urgent Care",
    industry: "healthcare",
    challenge:
      "NorthStar Urgent Care, a 15-location network, struggled with a 22% no-show rate that cost an estimated $1.4M annually in lost revenue. Front desk staff spent 35+ hours weekly on phone-based scheduling — booking appointments, confirming insurance, and calling patients for manual reminders. During flu season, phone lines were overwhelmed and hold times exceeded 20 minutes. Patient satisfaction scores suffered.",
    solution:
      "Simpler Life 100 deployed an AI Scheduling and Patient Engagement Agent that provides self-service online booking, automated appointment reminders via text and email, and intelligent waitlist management. Patients book appointments through a web widget or text message, with real-time availability across all 15 locations. Reminders are sent at 72h, 24h, and 2h intervals. The waitlist automatically offers cancelled slots to next-in-line patients.",
    results: [
      { metric: "No-show rate", value: "22% → 6% (94% improvement)" },
      { metric: "Front desk scheduling time", value: "35 hours weekly → 4 hours (handles exceptions only)" },
      { metric: "Phone hold times", value: "20+ minutes → under 2 minutes" },
      { metric: "Revenue recovered from no-shows", value: "$1.1M annually" },
      { metric: "Patient satisfaction (scheduling experience)", value: "68 → 93 (NPS)" },
    ],
    workflowsUsed: ["appointment-scheduling", "patient-intake", "insurance-verification", "customer-support-triage"],
    integrationsUsed: ["epic", "outlook", "gmail", "slack"],
    quote: {
      text: "We were losing over a million dollars a year to missed appointments, and our front desk was overwhelmed with phone calls. The AI handles scheduling, reminders, and waitlists automatically. Our show rate went from 78% to 94%, and our staff can focus on patients in the clinic instead of on the phone.",
      attribution: "— Dr. Kevin Liu, Medical Director, NorthStar Urgent Care",
    },
    timeline: "3 weeks implementation. Full ROI achieved in 2 months.",
  },
];