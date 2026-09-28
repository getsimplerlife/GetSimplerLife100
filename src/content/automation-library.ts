export interface AutomationCard {
  id: string;
  name: string;
  industry: string[];
  description: string;
  timeSaved: string;
  difficulty: "easy" | "medium" | "hard";
  integrations: string[];
  roi: string;
  demoDescription: string;
}

export const automationLibrary: AutomationCard[] = [
  // ======================================================================
  // MANUFACTURING
  // ======================================================================
  {
    id: "man-invoice-processing",
    name: "Invoice Processing Automation",
    industry: ["manufacturing"],
    description: "Automatically extract, validate, and post supplier invoices from PDF, email, and EDI sources into your ERP with full three-way matching against POs and receiving documents.",
    timeSaved: "Frees AP clerk time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "quickbooks", "bill-com"],
    roi: "Invoice processing automated end to end with exceptions flagged for human review",
    demoDescription: "Watch the platform open a supplier invoice email, extract line items, match each to an open PO and receiving document, flag a price variance for human review, and post the clean lines."
  },
  {
    id: "man-purchase-orders",
    name: "Purchase Order Management",
    industry: ["manufacturing"],
    description: "Automate PO creation, approval routing, vendor acknowledgment, and change order processing across multiple facilities and ERP systems.",
    timeSaved: "Frees purchasing agent time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "coupa"],
    roi: "PO cycle automated end to end, from requisition to issued order",
    demoDescription: "See the platform take a material requisition from the production floor, check inventory levels against 3 warehouses, generate a PO, route it through a 4-approver workflow, and transmit it to the supplier via EDI — completed in 6 minutes."
  },
  {
    id: "man-inventory-reconciliation",
    name: "Inventory Reconciliation",
    industry: ["manufacturing"],
    description: "Cross-reference physical inventory counts, cycle counts, and ERP records to identify discrepancies, investigate root causes, and generate adjustment recommendations.",
    timeSaved: "Frees inventory analyst time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "plex"],
    roi: "Inventory records kept accurate automatically, with stockout and overstock signals surfaced",
    demoDescription: "The platform reconciles 12,000 SKUs across 4 facilities against cycle count data, flags 47 discrepancies, traces 32 to receiving errors, 12 to mis-picks, and 3 to vendor credits — all before the morning inventory meeting."
  },
  {
    id: "man-supplier-communication",
    name: "Supplier Communication Automation",
    industry: ["manufacturing"],
    description: "Automate RFQ distribution, quote comparison, PO acknowledgments, ASN processing, and supplier scorecard generation across your entire vendor base.",
    timeSaved: "Frees supply chain coordinator time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "outlook", "slack", "teams"],
    roi: "Supplier communications automated so responses arrive faster",
    demoDescription: "The platform simultaneously sends RFQs to 12 qualified suppliers, parses 8 responses within 2 hours, compares unit pricing and lead times, and generates a recommendation matrix — the buyer approves one click."
  },
  {
    id: "man-production-reporting",
    name: "Production Reporting Automation",
    industry: ["manufacturing"],
    description: "Aggregate real-time production data from shop floor systems, generate OEE dashboards, yield reports, and daily production summaries for management review.",
    timeSaved: "Frees production supervisor time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "plex", "dynamics-365", "tableau", "powerbi"],
    roi: "Production data captured in real time so issues get attention faster",
    demoDescription: "The platform pulls shift production data from 3 plants, calculates OEE by line and product family, identifies the top-3 downtime causes, and publishes a dashboard before the plant manager's 7:30 AM standup."
  },
  {
    id: "man-quality-assurance",
    name: "Quality Assurance Document Processing",
    industry: ["manufacturing"],
    description: "Automate collection and analysis of inspection reports, non-conformance records, CAPA forms, and supplier quality documents with trend detection and alerting.",
    timeSaved: "Frees QA engineer time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "abbeyy", "servicenow", "sharepoint"],
    roi: "Non-conformance detected and flagged automatically from inspection data",
    demoDescription: "The platform reads 86 inspection reports from the night shift, identifies 4 recurring non-conformances on Line 3, cross-references with the last 30 days of CAPA records, and alerts the QA manager to a potential systemic issue."
  },
  {
    id: "man-erp-updates",
    name: "ERP Data Entry Automation",
    industry: ["manufacturing"],
    description: "Automate mass updates to item masters, BOMs, routings, cost rolls, and engineering change notices across your manufacturing ERP system.",
    timeSaved: "Frees data entry specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "excel"],
    roi: "ERP records synced from source systems to keep the ledger accurate",
    demoDescription: "The platform processes 214 engineering change notices, updates BOMs for 1,800 affected SKUs, recalculates standard costs, and posts the cost roll — a process that previously took two data entry specialists four full days."
  },
  // ======================================================================
  // LOGISTICS
  // ======================================================================
  {
    id: "log-dispatch-scheduling",
    name: "Dispatch Scheduling Optimization",
    industry: ["logistics", "transportation"],
    description: "Intelligently assign loads to drivers based on location, hours of service, equipment type, customer preferences, and delivery windows.",
    timeSaved: "Frees dispatcher time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["mcleod", "mercergate", "samsara", "motiv"],
    roi: "Dispatch automated so the same team handles more volume with on-time delivery",
    demoDescription: "The platform evaluates 87 available loads against 34 drivers' current locations, remaining HOS, equipment qualifications, and customer appointment windows — generating an optimized dispatch plan in 90 seconds that would take a human dispatcher 4 hours."
  },
  {
    id: "log-route-optimization",
    name: "Route Optimization",
    industry: ["logistics", "transportation"],
    description: "Continuously optimize delivery routes factoring in traffic, weather, driver hours, fuel costs, tolls, and customer time windows across your fleet.",
    timeSaved: "Frees route planner time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["samsara", "motiv", "project44", "google-maps"],
    roi: "Routes planned automatically to reduce fuel use and improve on-time delivery",
    demoDescription: "The platform reassigns the afternoon dispatch after a highway closure is detected, recalculating 22 routes to avoid the delay — 3 drivers rerouted, 0 missed appointments, 8 gallons of fuel saved in that single optimization."
  },
  {
    id: "log-carrier-coordination",
    name: "Carrier Coordination & Rate Negotiation",
    industry: ["logistics"],
    description: "Automate spot market rate comparisons, tender acceptance, carrier performance tracking, and contract rate compliance monitoring across all carrier relationships.",
    timeSaved: "Frees logistics coordinator time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["dat", "truckstop", "project44", "fourkites"],
    roi: "Carrier rates compared automatically so the best spot rate is applied",
    demoDescription: "The platform posts 14 loads to the spot market, evaluates 43 carrier bids across rate, transit time, and safety score, awards 12 loads, and automatically tenders them via API — the human reviews only the one exception."
  },
  {
    id: "log-pod-collection",
    name: "Proof of Delivery Collection & Processing",
    industry: ["logistics"],
    description: "Automatically collect, validate, and archive POD documents from drivers, compare against delivery expectations, and flag exceptions for billing adjustments.",
    timeSaved: "Frees billing clerk time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["samsara", "motiv", "dropbox", "docussign"],
    roi: "Proof-of-delivery collected automatically so bills settle faster",
    demoDescription: "The platform detects a POD image uploaded by a driver at delivery, extracts the signature and delivery timestamp, compares against the BOL, archives to the carrier folder, and triggers invoicing — all within 3 minutes of delivery."
  },
  {
    id: "log-freight-audit",
    name: "Freight Invoice Audit & Payment",
    industry: ["logistics", "transportation"],
    description: "Automate freight bill auditing against contracted rates, detect duplicate billing, validate accessorial charges, and process accurate payments.",
    timeSaved: "Frees freight auditor time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["mcleod", "mercergate", "quickbooks", "bill-com"],
    roi: "Freight bills audited automatically to surface duplicate and overcharged charges",
    demoDescription: "The platform processes 340 freight invoices, cross-references each line against the carrier's contracted rate table, flags 17 overcharges ($4,280 total), identifies 2 duplicate billings ($1,840), and approves the remaining for payment — all before lunch."
  },
  {
    id: "log-ltl-manifesting",
    name: "LTL Manifesting & Rate Calculation",
    industry: ["logistics"],
    description: "Automate class calculation, NMFC verification, dimensional weight audit, and manifest generation for less-than-truckload shipments.",
    timeSaved: "Frees shipping clerk time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["mcleod", "mercergate", "samsara"],
    roi: "Billing reviewed automatically before it reaches the client",
    demoDescription: "The platform audits 62 LTL shipments for correct NMFC classification, catches 8 mis-classed items that would have cost $1,200 in reclassification fees, corrects dimensional weight on 4 others, and generates clean manifests."
  },
  {
    id: "log-wms-inventory",
    name: "Warehouse Inventory Synchronization",
    industry: ["logistics", "manufacturing"],
    description: "Synchronize inventory levels across WMS, ERP, and e-commerce platforms with automated cycle counting triggers and reorder point calculations.",
    timeSaved: "Frees warehouse manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "shopify", "fishbowl"],
    roi: "Inventory counts reconciled automatically against movements",
    demoDescription: "The platform reconciles inventory counts from 3 WMS zones against ERP and Shopify, identifies 12 discrepancies, dispatches a cycle count request to the warehouse floor for only those 12 locations, and updates all systems within an hour."
  },
  // ======================================================================
  // HEALTHCARE
  // ======================================================================
  {
    id: "hc-patient-intake",
    name: "Patient Intake & Registration",
    industry: ["healthcare"],
    description: "Automate patient registration, insurance verification, consent form collection, and medical history import from referring providers.",
    timeSaved: "Frees registration clerk time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["epic", "cerner", "athenahealth", "adobe-sign"],
    roi: "Check-in automated so registration data is captured once, accurately",
    demoDescription: "The platform receives a new patient referral, pre-populates demographics from the referring provider's records, verifies insurance eligibility in real-time, sends digital consent forms, and schedules the first appointment — all before the patient hangs up the phone."
  },
  {
    id: "hc-appointment-scheduling",
    name: "Intelligent Appointment Scheduling",
    industry: ["healthcare"],
    description: "Optimize appointment scheduling based on provider availability, patient preferences, procedure duration, room availability, and urgent slot management.",
    timeSaved: "Frees scheduler time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["epic", "cerner", "calendly", "outlook"],
    roi: "Scheduling automated with reminders that cut no-shows",
    demoDescription: "The platform evaluates an appointment request against 12 providers' schedules, considers the procedure's typical duration and required room setup, identifies the optimal slot that also accommodates the patient's preferred day, and sends the confirmation."
  },
  {
    id: "hc-insurance-verification",
    name: "Insurance Eligibility & Benefits Verification",
    industry: ["healthcare"],
    description: "Batch verify insurance eligibility, deductibles, co-pays, and pre-authorization requirements for scheduled patients days before appointments.",
    timeSaved: "Frees insurance verifier time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["epic", "cerner", "athenahealth", "nextgen"],
    roi: "Claims prepared completely the first time to reduce denials",
    demoDescription: "The platform verifies insurance for 87 scheduled patients in 4 minutes, identifies 12 with eligibility changes, 5 requiring pre-authorization, and flags 3 with deductibles not yet met — each with detailed benefit summaries sent to the front desk."
  },
  {
    id: "hc-medical-coding",
    name: "Medical Coding Automation",
    industry: ["healthcare"],
    description: "Analyze clinical documentation and suggest appropriate ICD-10, CPT, and HCPCS codes based on provider notes, lab results, and imaging reports.",
    timeSaved: "Frees medical coder time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["epic", "cerner", "athenahealth"],
    roi: "Coding assisted by automated extraction so backlogs do not form",
    demoDescription: "The platform reads a surgeon's operative note, identifies 4 procedures performed, cross-references with the pathology report to confirm diagnosis codes, suggests 7 ICD-10 and 4 CPT codes with supporting documentation highlighted for the coder's review."
  },
  {
    id: "hc-claims-processing",
    name: "Claims Submission & Denial Management",
    industry: ["healthcare"],
    description: "Automate claim scrubbing, electronic submission, payment posting, denial analysis, and appeal generation to maximize clean claim rates.",
    timeSaved: "Frees claims specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["epic", "cerner", "athenahealth", "workday"],
    roi: "Claims assembled with complete documentation to prevent rework",
    demoDescription: "The platform pre-scrubs 142 claims before submission, catches 11 errors (incorrect modifiers, missing referral numbers), submits 131 clean claims electronically, posts 89 payments from 3 different payers, and generates 5 appeal letters for denials."
  },
  {
    id: "hc-compliance-reporting",
    name: "Healthcare Compliance Reporting",
    industry: ["healthcare"],
    description: "Automate HIPAA compliance monitoring, audit log analysis, breach detection, and regulatory report generation for federal and state requirements.",
    timeSaved: "Frees compliance officer time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["epic", "sharepoint", "servicenow"],
    roi: "Audit preparation automated so issues are surfaced before they become findings",
    demoDescription: "The platform reviews 14,000 access log entries, identifies 3 anomalous access patterns (after-hours access to patient records by non-clinical staff), correlates with badge-swipe data, and generates a compliance incident report ready for review."
  },
  // ======================================================================
  // FINANCIAL SERVICES
  // ======================================================================
  {
    id: "fin-ap-automation",
    name: "Accounts Payable Full Cycle Automation",
    industry: ["financial-services", "professional-services"],
    description: "End-to-end AP automation from invoice receipt through approval, payment scheduling, and GL coding with full audit trail and exception handling.",
    timeSaved: "Frees AP team time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "bill-com", "expensify"],
    roi: "Invoice processing automated end to end by the platform",
    demoDescription: "The platform processes 300 invoices daily: extracting line items, applying GL codes based on department budgets, routing 42 invoices for department-head approval, scheduling 258 for payment per terms, and reconciling all payments against bank statements."
  },
  {
    id: "fin-ar-automation",
    name: "Accounts Receivable & Collections",
    industry: ["financial-services", "professional-services"],
    description: "Automate invoice generation, delivery, payment tracking, dunning, and collections prioritization with personalized customer communication.",
    timeSaved: "Frees AR specialist time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "salesforce", "hubspot"],
    roi: "Collections automated with scheduled follow-up on every aging balance",
    demoDescription: "The platform generates 87 invoices from time entries, emails each with customer-specific portal links, monitors payment status, sends 34 automated reminders (escalating tone based on aging), and prioritizes 15 accounts for human collector outreach."
  },
  {
    id: "fin-expense-reporting",
    name: "Employee Expense Report Automation",
    industry: ["financial-services", "professional-services"],
    description: "Automate expense report submission, receipt matching, policy compliance checking, approval routing, and reimbursement processing.",
    timeSaved: "Frees finance associate time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["expensify", "quickbooks", "xero", "brex", "ramp"],
    roi: "Expense reports processed automatically with policy checks built in",
    demoDescription: "The platform reads a submitted expense report with 12 receipts, matches each to the credit card transaction, checks all against 23 corporate policy rules, flags one out-of-policy meal, routes to the manager for exception approval, and posts to the GL."
  },
  {
    id: "fin-bank-reconciliation",
    name: "Automated Bank Reconciliation",
    industry: ["financial-services"],
    description: "Match bank statement transactions against ERP entries across multiple accounts and currencies, investigate discrepancies, and generate reconciliation reports.",
    timeSaved: "Frees accountant time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "sap", "oracle-netsuite"],
    roi: "Month-end close automated with reconciliations assembled from live data",
    demoDescription: "The platform reconciles 14 bank accounts (3 currencies, 3,400+ transactions), auto-matches 3,281, identifies 119 unmatched items, investigates 84 by cross-referencing open invoices and checks in-flight, and flags 35 for manual research."
  },
  {
    id: "fin-budget-tracking",
    name: "Budget vs Actual Tracking & Alerts",
    industry: ["financial-services", "professional-services"],
    description: "Monitor departmental spending against budgets, generate variance reports, send proactive alerts when thresholds are exceeded, and forecast end-of-period outcomes.",
    timeSaved: "Frees FP&A analyst time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "powerbi"],
    roi: "Budget tracking automated with real-time variance signals",
    demoDescription: "The platform reviews today's expenditures across 23 departments, identifies 8 cost centers exceeding 85% of monthly budget (with 12 days remaining), sends personalized alerts to department heads with top-3 spend categories driving the variance."
  },
  // ======================================================================
  // CONSTRUCTION
  // ======================================================================
  {
    id: "con-submittal-review",
    name: "Submittal & Shop Drawing Review",
    industry: ["construction"],
    description: "Track, organize, and route submittals and shop drawings through the review-and-approval process across general contractor, architect, and engineer stakeholders.",
    timeSaved: "Frees project engineer time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["procore", "autocad", "sharepoint"],
    roi: "Submittals routed and reviewed faster with automated tracking",
    demoDescription: "The platform logs 28 submittals received, cross-references each against the spec section and drawing number, routes 22 that are complete to the review queue, flags 6 for missing information, and sends automated status updates to the subcontractor."
  },
  {
    id: "con-rfi-processing",
    name: "RFI Processing & Response Tracking",
    industry: ["construction"],
    description: "Automate RFI logging, assignment, response time tracking, and closure documentation with complete audit trail across the project team.",
    timeSaved: "Frees project engineer time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["procore", "autocad", "outlook"],
    roi: "RFIs routed and answered faster with automated follow-up",
    demoDescription: "The platform receives an RFI from the field superintendent, automatically identifies the affected drawing and spec section, assigns it to the design discipline lead, sets a 5-day response deadline, and sends reminders at day 3 and 4."
  },
  {
    id: "con-payroll-timecards",
    name: "Construction Timecard & Payroll",
    industry: ["construction"],
    description: "Collect, validate, and process timecards from multiple job sites with certified payroll reporting, prevailing wage compliance, and union dues tracking.",
    timeSaved: "Frees payroll administrator time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["procore", "adp", "quickbooks"],
    roi: "Payroll processed automatically with compliance checks built in",
    demoDescription: "The platform collects 87 timecards from 4 job sites, validates each against the employee's assigned work classification, flags 5 with overtime exceeding project thresholds, calculates certified payroll for 3 prevailing-wage projects, and generates payroll reports."
  },
  {
    id: "con-change-orders",
    name: "Change Order Management",
    industry: ["construction"],
    description: "Track change order requests through approval workflows, automatically update project budgets, notify stakeholders, and maintain complete documentation lineage.",
    timeSaved: "Frees project manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["procore", "quickbooks", "sage-50"],
    roi: "Change orders routed and approved without manual chasing",
    demoDescription: "The platform processes a change order request from the field, calculates the budget impact against contingency, routes it through the required approval chain (PM → GC → Owner), updates the project forecast, and notifies all 14 stakeholders."
  },
  {
    id: "con-daily-logs",
    name: "Daily Field Report Automation",
    industry: ["construction"],
    description: "Generate comprehensive daily field reports from foreman inputs, weather data, equipment logs, materials received, and work completed percentages.",
    timeSaved: "Frees superintendent time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["procore", "sharepoint", "outlook"],
    roi: "Reports built automatically from live data instead of manual assembly",
    demoDescription: "The platform aggregates foreman reports from 6 work zones, pulls weather data, cross-references equipment hours, calculates day-by-day progress against schedule, and generates a formatted daily report — the superintendent reviews and approves in 3 minutes."
  },
  // ======================================================================
  // ENERGY
  // ======================================================================
  {
    id: "en-well-reporting",
    name: "Well Production Reporting",
    industry: ["energy", "oil-gas"],
    description: "Automate collection and analysis of well production data, generate regulatory reports, and identify underperforming assets with actionable recommendations.",
    timeSaved: "Frees production engineer time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "powerbi", "excel"],
    roi: "Well data monitored automatically so intervention needs surface quickly",
    demoDescription: "The platform aggregates production data from 47 wells, calculates daily rates and decline curves against type curves, flags 3 wells with anomalous decline, cross-references with last intervention date, and recommends candidate wells for workover review."
  },
  {
    id: "en-compliance-monitoring",
    name: "Environmental Compliance Monitoring",
    industry: ["energy", "oil-gas"],
    description: "Monitor emissions data, spill reports, permit conditions, and regulatory deadlines across operating assets with automated alerting and report generation.",
    timeSaved: "Frees compliance specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "servicenow", "sharepoint"],
    roi: "Regulatory filings assembled and validated automatically",
    demoDescription: "The platform monitors 23 permitted emission points, detects a sulfur dioxide reading approaching the permitted limit, cross-references with current production rates, alerts the environmental manager, and pre-populates the deviation report for submission."
  },
  {
    id: "en-invoice-matching",
    name: "Energy Invoice & Royalty Processing",
    industry: ["energy", "oil-gas"],
    description: "Automate processing of vendor invoices, royalty payments, joint interest billings, and revenue distribution with complex division order calculations.",
    timeSaved: "Frees revenue accountant time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "quickbooks"],
    roi: "Royalty payments calculated and processed automatically",
    demoDescription: "The platform processes 1,200+ royalty interests from 47 wells, calculates each owner's share based on division of interest, applies tax withholding and burden deductions, generates stubs for each payee, and posts to the general ledger."
  },
  {
    id: "en-supply-chain",
    name: "Oilfield Supply Chain Automation",
    industry: ["energy", "oil-gas"],
    description: "Automate material requisition, inventory tracking across field locations, vendor PO management, and equipment rental return tracking.",
    timeSaved: "Frees supply chain coordinator time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "outlook"],
    roi: "Material delivery coordinated automatically to keep inventory lean",
    demoDescription: "The platform identifies that 3 well sites are running low on critical consumables, checks current stock at 4 field warehouses, generates transfer orders for 2 sites and a PO for the third, and schedules delivery — all triggered by inventory thresholds."
  },
  // ======================================================================
  // RETAIL
  // ======================================================================
  {
    id: "ret-order-entry",
    name: "Order Entry & Processing Automation",
    industry: ["retail", "ecommerce"],
    description: "Capture orders from multiple channels (web, phone, EDI, marketplace), validate inventory availability, process payments, and route to fulfillment.",
    timeSaved: "Frees order entry clerk time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["shopify", "salesforce", "netsuite", "stripe"],
    roi: "Orders processed automatically from receipt to fulfillment",
    demoDescription: "The platform captures orders from 4 channels, validates inventory across 3 warehouses, checks payment authorization, applies discounts and promotions, assigns to the optimal fulfillment location, and sends order confirmation — completed in under a minute."
  },
  {
    id: "ret-inventory-sync",
    name: "Multi-Channel Inventory Synchronization",
    industry: ["retail", "ecommerce"],
    description: "Synchronize inventory levels across physical stores, warehouses, and all online sales channels in real-time with automated reorder triggers.",
    timeSaved: "Frees inventory planner time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["shopify", "netsuite", "fishbowl", "amazon"],
    roi: "Inventory replenished automatically to prevent stockouts and overstock",
    demoDescription: "The platform monitors 12,000 SKUs across 8 stores, 3 warehouses, and 4 online channels, detects a hot-selling item at 2 units remaining, triggers a transfer from the warehouse, and adjusts the reorder point based on the accelerated sell-through rate."
  },
  {
    id: "ret-customer-emails",
    name: "Customer Email Automation",
    industry: ["retail", "ecommerce"],
    description: "Automate order confirmation, shipping updates, delivery notifications, review requests, abandoned cart recovery, and personalized promotional emails.",
    timeSaved: "Frees marketing coordinator time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["shopify", "hubspot", "gmail", "salesforce"],
    roi: "Abandoned carts recovered automatically with timely email follow-up",
    demoDescription: "The platform detects 23 abandoned carts, sends personalized recovery emails with product images and a time-limited discount code, monitors click-through, and triggers a follow-up SMS if no engagement within 4 hours."
  },
  {
    id: "ret-returns-processing",
    name: "Returns & Refund Processing",
    industry: ["retail", "ecommerce"],
    description: "Process return requests, generate RMA labels, inspect returned items, determine disposition, and issue refunds or exchanges automatically.",
    timeSaved: "Frees returns associate time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["shopify", "netsuite", "stripe"],
    roi: "Returns processing handled end to end, with refund accuracy maintained through automated verification",
    demoDescription: "The platform receives a return request, authorizes it based on policy, sends a prepaid label, and when the item arrives, inspects the photos submitted by the customer, determines it's resalable, and issues the refund — all without human touch."
  },
  {
    id: "ret-vendor-onboarding",
    name: "Vendor Onboarding & Compliance",
    industry: ["retail"],
    description: "Automate vendor application processing, document collection, compliance verification, contract generation, and portal access setup.",
    timeSaved: "Frees vendor manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Vendor onboarding automated with compliance documents requested and tracked",
    demoDescription: "The platform processes a new vendor application, checks the applicant against watchlists, collects W-9 and insurance certificates, generates the vendor agreement, routes for digital signature, and provisions portal access — completed in under 48 hours."
  },
  // ======================================================================
  // LEGAL
  // ======================================================================
  {
    id: "leg-contract-review",
    name: "Contract Review & Analysis",
    industry: ["legal", "professional-services"],
    description: "Review incoming contracts against standard terms, flag deviations, identify risks, and extract key dates and obligations for calendar management.",
    timeSaved: "Frees contract attorney time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Contract review automated to surface key terms and risks quickly",
    demoDescription: "The platform reviews a 34-page vendor agreement, compares 128 clauses against 56 standard terms, flags 7 deviations (including auto-renewal and uncapped indemnification), extracts key dates into the obligation calendar, and prepares a redlined version."
  },
  {
    id: "leg-client-intake",
    name: "Client Intake & Conflict Checking",
    industry: ["legal"],
    description: "Automate new client intake, conflict of interest screening against firm-wide matters and parties, engagement letter generation, and matter opening.",
    timeSaved: "Frees intake specialist time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Intake automated with conflicts detected during data capture",
    demoDescription: "The platform enters a new prospective client and matter, checks against 40,000+ past matters and 200,000+ parties, identifies 2 potential conflicts with affiliated entities, routes to the ethics partner for waiver review, and prepares the engagement letter."
  },
  {
    id: "leg-docketing",
    name: "Docketing & Calendar Management",
    industry: ["legal"],
    description: "Automate deadline calculation, court rule compliance, docket entry, and calendar management across all active matters with proactive reminders.",
    timeSaved: "Frees docketing clerk time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["outlook", "sharepoint", "servicenow"],
    roi: "Deadlines docketed automatically so nothing slips",
    demoDescription: "The platform receives a notice of hearing, calculates all responsive deadlines per court rules (response due 21 days, expert disclosure 45 days before trial), enters each into the firm calendar, links to the matter, and sends confirmation to the assigned attorneys."
  },
  {
    id: "leg-billable-time",
    name: "Billable Time Entry Automation",
    industry: ["legal", "professional-services"],
    description: "Capture billable time from calendar events, emails, and documents, draft time entries in proper narrative format, and submit for attorney review.",
    timeSaved: "Frees attorney time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["outlook", "salesforce", "quickbooks"],
    roi: "Billable time captured automatically so no worked hours are lost",
    demoDescription: "The platform reviews an attorney's calendar, 87 emails, and 12 edited documents, identifies 6.3 hours of billable activity not yet recorded, drafts narrative time entries in proper format, applies the correct client/matter codes, and presents for approval."
  },
  {
    id: "leg-document-discovery",
    name: "Document Discovery & Review",
    industry: ["legal"],
    description: "Process document productions, apply privilege filters, perform keyword and concept searches, and organize responsive documents for review by issue and custodian.",
    timeSaved: "Frees discovery associate time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sharepoint", "dropbox", "azure-sql"],
    roi: "Document review automated to find relevant items faster",
    demoDescription: "The platform processes 50,000 documents from 12 custodians, removes duplicates and near-duplicates (reducing to 18,000 unique), applies privilege filters (removing 2,000), organizes by issue and custodian, and flags the 300 most relevant documents for priority review."
  },
  // ======================================================================
  // INSURANCE
  // ======================================================================
  {
    id: "ins-claims-intake",
    name: "Claims Intake & Triage",
    industry: ["insurance"],
    description: "Automate first notice of loss capture, claim triage based on severity and policy coverage, assignment to appropriate adjuster, and initial reserve setting.",
    timeSaved: "Frees claims intake specialist time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "First notice of loss processed and triaged automatically",
    demoDescription: "The platform receives a claim notification, verifies policy is active, determines coverage type based on the loss description, assigns a severity score, sets an initial reserve based on historical similar claims, and routes to the appropriate adjuster."
  },
  {
    id: "ins-subrogation",
    name: "Subrogation Recovery Automation",
    industry: ["insurance"],
    description: "Identify subrogation opportunities, generate demand letters, track recovery timelines, and manage outside counsel assignments for recovery cases.",
    timeSaved: "Frees subrogation specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "Subrogation cases tracked automatically with scheduled follow-up",
    demoDescription: "The platform reviews 85 closed claims, identifies 23 with subrogation potential based on liability determination and applicable laws, generates demand letters for 18 with clear liability, and refers 5 complex cases to outside recovery counsel."
  },
  {
    id: "ins-policy-admin",
    name: "Policy Administration & Renewal",
    industry: ["insurance"],
    description: "Automate policy issuance, mid-term changes, renewal processing, premium calculations, and non-renewal notifications with full audit trail.",
    timeSaved: "Frees policy services associate time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "hubspot"],
    roi: "Policy renewals processed automatically with proactive follow-up",
    demoDescription: "The platform processes 45 renewal policies, calculates updated premiums based on loss experience and exposure changes, generates renewal documents, and sends personalized renewal offers — 32 accepted automatically, 13 routed to an agent for discussion."
  },
  {
    id: "ins-underwriting-support",
    name: "Underwriting Data Gathering",
    industry: ["insurance"],
    description: "Collect and analyze risk data from applications, loss runs, financial statements, and third-party databases to support underwriting decisions with recommendations.",
    timeSaved: "Frees underwriter time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["salesforce", "servicenow", "hubspot"],
    roi: "Underwriting data assembled automatically to speed quotes",
    demoDescription: "The platform reviews a new business submission, pulls loss runs from the claims system, extracts financial ratios from submitted statements, runs MVR and credit checks, and generates a risk assessment report with coverage recommendations."
  },
  // ======================================================================
  // REAL ESTATE
  // ======================================================================
  {
    id: "re-leasing-documents",
    name: "Lease Document Processing",
    industry: ["real-estate"],
    description: "Extract key terms from lease agreements, calculate rent schedules, track critical dates (renewal, rent escalation, termination), and maintain compliance with ASC 842 reporting.",
    timeSaved: "Frees lease administrator time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "adobe-sign"],
    roi: "Lease data abstracted automatically with compliance terms captured",
    demoDescription: "The platform processes 12 new lease agreements, extracts 240 data points per lease including rent escalations, CAM charges, renewal options, and termination rights — generating complete lease abstracts, payment schedules, and compliance reports."
  },
  {
    id: "re-property-management",
    name: "Property Management Work Orders",
    industry: ["real-estate"],
    description: "Automate work order creation, vendor assignment, approval routing, and status tracking for maintenance requests across commercial and residential portfolios.",
    timeSaved: "Frees property manager time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["outlook", "quickbooks", "servicenow"],
    roi: "Work orders dispatched automatically to the right vendor faster",
    demoDescription: "The platform receives a tenant maintenance request, categorizes it as HVAC emergency, assigns priority level 1, identifies the nearest qualified vendor from the approved list, dispatches the work order, and sends the tenant an estimated arrival time."
  },
  {
    id: "re-rent-collection",
    name: "Rent Collection & Reconciliation",
    industry: ["real-estate"],
    description: "Automate rent invoicing, payment processing, delinquency tracking, late-fee assessment, and monthly reconciliation across diverse property portfolios.",
    timeSaved: "Frees property accountant time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "stripe"],
    roi: "Rent collections automated with scheduled follow-up on every balance",
    demoDescription: "The platform generates 340 rent invoices across 4 properties, applies concessions and late fees as applicable, processes electronic payments from 312 tenants, sends reminders to 28 delinquent tenants, and reconciles all payments against expected amounts."
  },
  // ======================================================================
  // PROFESSIONAL SERVICES
  // ======================================================================
  {
    id: "ps-time-entry",
    name: "Automated Time & Expense Entry",
    industry: ["professional-services"],
    description: "Capture billable and non-billable time from calendar, email, and activity data, submit for approval, and sync to project accounting systems.",
    timeSaved: "Frees consultant time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["outlook", "salesforce", "quickbooks"],
    roi: "Time entry automated so utilization reports reflect all worked hours",
    demoDescription: "The platform reviews a consultant's week: 14 client meetings, 23 emails with project-related content, 8 edited documents — identifies 32.5 hours of billable time, categorizes by project and phase, and submits for approval with detailed descriptions."
  },
  {
    id: "ps-proposal-generation",
    name: "Proposal & SOW Generation",
    industry: ["professional-services"],
    description: "Generate personalized proposals and statements of work from templates, populate with project-specific data, and route for approval and e-signature.",
    timeSaved: "Frees business development manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign"],
    roi: "Proposals generated automatically from templates and approved content",
    demoDescription: "The platform generates a proposal based on the opportunity record: populates the scope section from the discovery notes, calculates pricing from the rate card and effort estimate, generates the SOW with deliverables and milestones, and sends for e-signature."
  },
  {
    id: "ps-resource-scheduling",
    name: "Resource Scheduling & Optimization",
    industry: ["professional-services"],
    description: "Optimize consultant staffing against project demands, skill requirements, availability, and utilization targets across the entire professional services organization.",
    timeSaved: "Frees resource manager time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["salesforce", "outlook", "servicenow"],
    roi: "Staffing requests matched automatically instead of waiting on manual search",
    demoDescription: "The platform evaluates a new staffing request for a senior consultant with specific industry expertise and availability next week, searches the resource pool of 85 consultants, identifies 3 ideal candidates ranked by skillset match and utilization, and sends invitations."
  },
  {
    id: "ps-expense-audit",
    name: "Expense Policy Compliance Audit",
    industry: ["professional-services", "financial-services"],
    description: "Audit submitted expense reports against corporate policy, identify policy violations, flag suspicious patterns, and generate compliance reports.",
    timeSaved: "Frees finance auditor time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["expensify", "quickbooks", "xero"],
    roi: "Expense policies enforced automatically at submission",
    demoDescription: "The platform audits 67 expense reports, identifies 12 policy violations (5 exceeded per-diem limits, 4 missing receipts, 3 non-compliant categories), flags 2 with suspicious patterns for investigation, and sends auto-notifications to the employees."
  },
  // ======================================================================
  // HOSPITALITY
  // ======================================================================
  {
    id: "hosp-reservations",
    name: "Reservation Management & Optimization",
    industry: ["hospitality"],
    description: "Automate reservation processing, room assignment optimization, overbooking management, cancellation tracking, and guest preference logging.",
    timeSaved: "Frees reservationist time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["salesforce", "outlook", "hubspot"],
    roi: "Bookings managed automatically to prevent overbooking",
    demoDescription: "The platform processes 45 incoming reservation requests, checks availability across 3 rate categories, assigns rooms based on 87 tracked guest preferences, manages 4 overbooked dates by identifying upgrade opportunities, and updates guest profiles."
  },
  {
    id: "hosp-procurement",
    name: "Hospitality Procurement Automation",
    industry: ["hospitality"],
    description: "Automate food & beverage procurement, vendor order management, inventory tracking across outlets, and cost per cover analysis.",
    timeSaved: "Frees purchasing manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["quickbooks", "netsuite", "outlook"],
    roi: "Procurement automated to keep inventory lean and waste down",
    demoDescription: "The platform analyzes banquet event orders for the week, calculates required ingredients across all outlets, checks current inventory, generates consolidated purchase orders for 12 vendors, and schedules deliveries to arrive before each event."
  },
  {
    id: "hosp-guest-communication",
    name: "Guest Communication Automation",
    industry: ["hospitality"],
    description: "Automate pre-arrival communications, in-stay messaging, post-stay follow-up, and personalized offer delivery based on guest preferences and history.",
    timeSaved: "Frees front office manager time spent on repetitive manual work",
    difficulty: "easy",
    integrations: ["outlook", "hubspot", "gmail"],
    roi: "Guest follow-up automated so every inquiry gets a timely response",
    demoDescription: "The platform sends personalized pre-arrival emails to 67 arriving guests with room upgrade offers and local event recommendations, checks in with 12 guests during their stay, and sends post-stay thank-you messages with a return booking incentive."
  },
  // ======================================================================
  // AGRICULTURE
  // ======================================================================
  {
    id: "ag-crop-reporting",
    name: "Crop Production Reporting",
    industry: ["agriculture"],
    description: "Aggregate field-level production data, generate yield reports, track input usage, and provide compliance documentation for crop insurance and subsidies.",
    timeSaved: "Frees farm manager time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["excel", "powerbi", "sharepoint"],
    roi: "Reporting automated with claims documentation captured at intake",
    demoDescription: "The platform collects harvest data from 14 fields, calculates yield per acre and total production, cross-references with input applications (seed, fertilizer, chemical), generates USDA-compliant production reports, and identifies top-3 underperforming fields."
  },
  {
    id: "ag-livestock-tracking",
    name: "Livestock Inventory & Health Tracking",
    industry: ["agriculture"],
    description: "Track livestock movements, health records, breeding cycles, feed consumption, and generate reports for herd management and regulatory compliance.",
    timeSaved: "Frees herd manager time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["excel", "sharepoint"],
    roi: "Herd health records automated so issues surface early",
    demoDescription: "The platform processes daily health check data for 1,200 head, flags 8 animals with abnormal temperature or weight metrics, cross-references with vaccination records, identifies a potential respiratory issue in pen 14, and alerts the veterinarian."
  },
  {
    id: "ag-equipment-maint",
    name: "Equipment Maintenance Scheduling",
    industry: ["agriculture"],
    description: "Automate preventive maintenance scheduling based on equipment hours, season usage patterns, and historical failure data across the farm equipment fleet.",
    timeSaved: "Frees maintenance supervisor time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["excel", "outlook"],
    roi: "Maintenance scheduled from live equipment data to prevent downtime",
    demoDescription: "The platform reviews equipment hour meters across 34 tractors and harvesters, identifies 7 pieces due for service within the next 2 weeks, schedules maintenance around forecasted weather windows, orders parts, and coordinates with the service team."
  },
  // ======================================================================
  // GOVERNMENT & EDUCATION
  // ======================================================================
  {
    id: "gov-grant-management",
    name: "Grant Application & Reporting",
    industry: ["government", "education"],
    description: "Automate grant application processing, eligibility verification, award notification, compliance tracking, and reporting across federal and state funding programs.",
    timeSaved: "Frees grants administrator time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["servicenow", "sharepoint", "outlook"],
    roi: "Grants processed and compliance reports assembled automatically",
    demoDescription: "The platform processes 34 grant applications, validates eligibility against program criteria for each, checks for completeness, identifies 5 with missing documentation, notifies applicants, and routes complete applications to the review panel."
  },
  {
    id: "gov-procurement",
    name: "Government Procurement Automation",
    industry: ["government"],
    description: "Automate RFP distribution, bid evaluation, vendor qualification, contract award, and purchase order generation in compliance with procurement regulations.",
    timeSaved: "Frees procurement officer time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["servicenow", "sap", "adobe-sign"],
    roi: "Procurement automated from requisition to issued order",
    demoDescription: "The platform distributes an RFP to 22 qualified vendors, receives 14 responses, evaluates each against 37 criteria, verifies all compliance documents, generates a comparison matrix ranked by score, and prepares the award recommendation."
  },
  {
    id: "edu-student-enrollment",
    name: "Student Enrollment & Registration",
    industry: ["education"],
    description: "Automate application processing, document verification, prerequisite checking, course registration, and fee collection across multiple programs and terms.",
    timeSaved: "Frees registrar time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "Applications processed and registered automatically without manual re-entry",
    demoDescription: "The platform processes 125 applications for the upcoming term, verifies transcripts and prerequisites for each, checks program capacity, generates acceptance letters for 98 qualified applicants, places 12 on waitlist, and notifies 15 of missing documents."
  },
  // ======================================================================
  // TELECOMMUNICATIONS
  // ======================================================================
  {
    id: "tel-customer-provisioning",
    name: "Customer Service Provisioning",
    industry: ["telecommunications"],
    description: "Automate service order entry, circuit provisioning, equipment activation, and customer database updates across multiple network and billing systems.",
    timeSaved: "Frees provisioning specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["salesforce", "servicenow", "outlook"],
    roi: "Provisioning automated from order to activation without manual steps",
    demoDescription: "The platform processes a new customer service order, validates address for serviceability, checks port availability, configures the circuit in the network management system, activates the CPE remotely, and updates the billing system — all in under 2 hours."
  },
  {
    id: "tel-network-fault",
    name: "Network Fault Detection & Ticketing",
    industry: ["telecommunications"],
    description: "Monitor network alerts, correlate events, identify root cause, create trouble tickets, dispatch field technicians, and track repair progress.",
    timeSaved: "Frees NOC engineer time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["servicenow", "outlook", "slack"],
    roi: "Network incidents triaged automatically to speed repair",
    demoDescription: "The platform correlates 340 network alerts from 12 sources into 8 distinct incidents, identifies the most likely root cause for each, assigns priority levels, creates detailed trouble tickets, and dispatches the nearest available field technician."
  },
  {
    id: "tel-billing-mediation",
    name: "Telecom Billing Mediation",
    industry: ["telecommunications"],
    description: "Collect usage records from network elements, rate calls and data sessions, apply discounts and promotions, and generate customer invoices with full audit trail.",
    timeSaved: "Frees billing analyst time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sap", "quickbooks", "excel"],
    roi: "Billing automated to reduce errors and the disputes they cause",
    demoDescription: "The platform processes 2.4 million usage records from network elements, rates each against customer-specific contracts, applies 1,200 promotion codes, verifies against minimum commitments, and generates 8,500 customer invoices — completed before the billing cycle cutoff."
  },
  // ======================================================================
  // PHARMACEUTICALS
  // ======================================================================
  {
    id: "pharm-regulatory-submissions",
    name: "Regulatory Submission Tracking",
    industry: ["pharmaceuticals", "life-sciences"],
    description: "Track regulatory submission deadlines, compile submission packages, monitor agency review progress, and manage correspondence across global health authorities.",
    timeSaved: "Frees regulatory affairs specialist time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sharepoint", "servicenow", "outlook"],
    roi: "Submissions assembled and validated automatically before they go out",
    demoDescription: "The platform monitors 14 active submissions across FDA, EMA, and PMDA, tracks 84 milestones against internal deadlines, identifies 3 submissions at risk of delay, compiles status reports for each, and generates the monthly regulatory dashboard."
  },
  {
    id: "pharm-clinical-trial",
    name: "Clinical Trial Data Management",
    industry: ["pharmaceuticals", "life-sciences"],
    description: "Collect, validate, and process clinical trial data from investigator sites, generate safety reports, track enrollment, and manage trial master files.",
    timeSaved: "Frees clinical data manager time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["sharepoint", "servicenow", "excel"],
    roi: "Data cleaned and synced automatically before every reporting cycle",
    demoDescription: "The platform collects case report forms from 24 investigator sites, validates against 1,200 edit checks, generates 87 queries for missing or inconsistent data, tracks query resolution, and updates the trial master file with new documentation."
  },
  // ======================================================================
  // NONPROFIT
  // ======================================================================
  {
    id: "npo-donor-management",
    name: "Donor Management & Stewardship",
    industry: ["nonprofit"],
    description: "Automate donor acknowledgment, receipt generation, pledge tracking, recurring gift processing, and personalized stewardship communications.",
    timeSaved: "Frees development associate time spent on repetitive manual work",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "quickbooks"],
    roi: "Donor acknowledgments sent automatically on every gift",
    demoDescription: "The platform processes 145 donations received today, generates IRS-compliant acknowledgment letters for each, updates donor records, identifies 34 recurring gifts for processing, and sends personalized impact reports to 3 major donors."
  },
  {
    id: "npo-grant-reporting",
    name: "Grant Reporting & Compliance",
    industry: ["nonprofit"],
    description: "Track grant deliverables, compile progress reports, monitor budget utilization against award terms, and generate compliance documentation for funders.",
    timeSaved: "Frees grants manager time spent on repetitive manual work",
    difficulty: "hard",
    integrations: ["quickbooks", "sharepoint", "outlook"],
    roi: "Reports generated automatically from live program data",
    demoDescription: "The platform reviews 12 active grants, tracks progress against 47 deliverables, calculates budget utilization for each grant, identifies 3 at risk of underspend, compiles quarterly narrative and financial reports, and submits to funders."
  },
];