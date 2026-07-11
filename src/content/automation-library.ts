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
    timeSaved: "18 hrs/week per AP clerk",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "quickbooks", "bill-com"],
    roi: "85% reduction in invoice processing cost, 90% straight-through processing",
    demoDescription: "Watch the AI operations team open a supplier invoice email, extract 47 line items, match each to an open PO and receiving document, flag a $0.23 price variance for human review, and post the clean lines — all in under 90 seconds."
  },
  {
    id: "man-purchase-orders",
    name: "Purchase Order Management",
    industry: ["manufacturing"],
    description: "Automate PO creation, approval routing, vendor acknowledgment, and change order processing across multiple facilities and ERP systems.",
    timeSaved: "12 hrs/week per purchasing agent",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "coupa"],
    roi: "3-day PO cycle reduced to 4 hours; 92% of POs touch no human hands",
    demoDescription: "See the AI team take a material requisition from the production floor, check inventory levels against 3 warehouses, generate a PO, route it through a 4-approver workflow, and transmit it to the supplier via EDI — completed in 6 minutes."
  },
  {
    id: "man-inventory-reconciliation",
    name: "Inventory Reconciliation",
    industry: ["manufacturing"],
    description: "Cross-reference physical inventory counts, cycle counts, and ERP records to identify discrepancies, investigate root causes, and generate adjustment recommendations.",
    timeSaved: "15 hrs/week per inventory analyst",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "plex"],
    roi: "99.7% inventory accuracy; 80% fewer stockouts and overstock events",
    demoDescription: "The AI team reconciles 12,000 SKUs across 4 facilities against cycle count data, flags 47 discrepancies, traces 32 to receiving errors, 12 to mis-picks, and 3 to vendor credits — all before the morning inventory meeting."
  },
  {
    id: "man-supplier-communication",
    name: "Supplier Communication Automation",
    industry: ["manufacturing"],
    description: "Automate RFQ distribution, quote comparison, PO acknowledgments, ASN processing, and supplier scorecard generation across your entire vendor base.",
    timeSaved: "10 hrs/week per supply chain coordinator",
    difficulty: "medium",
    integrations: ["sap", "outlook", "slack", "teams"],
    roi: "Supplier response time reduced from 3.2 days to 4.1 hours; 94% on-time delivery",
    demoDescription: "The AI team simultaneously sends RFQs to 12 qualified suppliers, parses 8 responses within 2 hours, compares unit pricing and lead times, and generates a recommendation matrix — the buyer approves one click."
  },
  {
    id: "man-production-reporting",
    name: "Production Reporting Automation",
    industry: ["manufacturing"],
    description: "Aggregate real-time production data from shop floor systems, generate OEE dashboards, yield reports, and daily production summaries for management review.",
    timeSaved: "8 hrs/week per production supervisor",
    difficulty: "medium",
    integrations: ["sap", "plex", "dynamics-365", "tableau", "powerbi"],
    roi: "Production OEE improved 12% through real-time visibility and faster corrective action",
    demoDescription: "The AI team pulls shift production data from 3 plants, calculates OEE by line and product family, identifies the top-3 downtime causes, and publishes a dashboard before the plant manager's 7:30 AM standup."
  },
  {
    id: "man-quality-assurance",
    name: "Quality Assurance Document Processing",
    industry: ["manufacturing"],
    description: "Automate collection and analysis of inspection reports, non-conformance records, CAPA forms, and supplier quality documents with trend detection and alerting.",
    timeSaved: "14 hrs/week per QA engineer",
    difficulty: "hard",
    integrations: ["sap", "abbeyy", "servicenow", "sharepoint"],
    roi: "Non-conformance detection time reduced from 3 days to 20 minutes; 50% fewer escapes",
    demoDescription: "The AI team reads 86 inspection reports from the night shift, identifies 4 recurring non-conformances on Line 3, cross-references with the last 30 days of CAPA records, and alerts the QA manager to a potential systemic issue."
  },
  {
    id: "man-erp-updates",
    name: "ERP Data Entry Automation",
    industry: ["manufacturing"],
    description: "Automate mass updates to item masters, BOMs, routings, cost rolls, and engineering change notices across your manufacturing ERP system.",
    timeSaved: "20 hrs/week per data entry specialist",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "excel"],
    roi: "ERP data accuracy improved from 82% to 99.6%; month-end close accelerated by 3 days",
    demoDescription: "The AI team processes 214 engineering change notices, updates BOMs for 1,800 affected SKUs, recalculates standard costs, and posts the cost roll — a process that previously took two data entry specialists four full days."
  },
  // ======================================================================
  // LOGISTICS
  // ======================================================================
  {
    id: "log-dispatch-scheduling",
    name: "Dispatch Scheduling Optimization",
    industry: ["logistics", "transportation"],
    description: "Intelligently assign loads to drivers based on location, hours of service, equipment type, customer preferences, and delivery windows.",
    timeSaved: "25 hrs/week per dispatcher",
    difficulty: "hard",
    integrations: ["mcleod", "mercergate", "samsara", "motiv"],
    roi: "Dispatchers handle 2.3x volume; on-time delivery improves from 84% to 97%",
    demoDescription: "The AI team evaluates 87 available loads against 34 drivers' current locations, remaining HOS, equipment qualifications, and customer appointment windows — generating an optimized dispatch plan in 90 seconds that would take a human dispatcher 4 hours."
  },
  {
    id: "log-route-optimization",
    name: "Route Optimization",
    industry: ["logistics", "transportation"],
    description: "Continuously optimize delivery routes factoring in traffic, weather, driver hours, fuel costs, tolls, and customer time windows across your fleet.",
    timeSaved: "18 hrs/week per route planner",
    difficulty: "hard",
    integrations: ["samsara", "motiv", "project44", "google-maps"],
    roi: "12% reduction in fuel costs; 15% fewer miles driven; 98% on-time delivery",
    demoDescription: "The AI team reassigns the afternoon dispatch after a highway closure is detected, recalculating 22 routes to avoid the delay — 3 drivers rerouted, 0 missed appointments, 8 gallons of fuel saved in that single optimization."
  },
  {
    id: "log-carrier-coordination",
    name: "Carrier Coordination & Rate Negotiation",
    industry: ["logistics"],
    description: "Automate spot market rate comparisons, tender acceptance, carrier performance tracking, and contract rate compliance monitoring across all carrier relationships.",
    timeSaved: "16 hrs/week per logistics coordinator",
    difficulty: "medium",
    integrations: ["dat", "truckstop", "project44", "fourkites"],
    roi: "Spot rate savings of 8-12%; carrier compliance improved from 72% to 95%",
    demoDescription: "The AI team posts 14 loads to the spot market, evaluates 43 carrier bids across rate, transit time, and safety score, awards 12 loads, and automatically tenders them via API — the human reviews only the one exception."
  },
  {
    id: "log-pod-collection",
    name: "Proof of Delivery Collection & Processing",
    industry: ["logistics"],
    description: "Automatically collect, validate, and archive POD documents from drivers, compare against delivery expectations, and flag exceptions for billing adjustments.",
    timeSaved: "12 hrs/week per billing clerk",
    difficulty: "easy",
    integrations: ["samsara", "motiv", "dropbox", "docussign"],
    roi: "POD collection in under 30 minutes (down from 2.4 days); billing disputes reduced 70%",
    demoDescription: "The AI team detects a POD image uploaded by a driver at delivery, extracts the signature and delivery timestamp, compares against the BOL, archives to the carrier folder, and triggers invoicing — all within 3 minutes of delivery."
  },
  {
    id: "log-freight-audit",
    name: "Freight Invoice Audit & Payment",
    industry: ["logistics", "transportation"],
    description: "Automate freight bill auditing against contracted rates, detect duplicate billing, validate accessorial charges, and process accurate payments.",
    timeSaved: "20 hrs/week per freight auditor",
    difficulty: "hard",
    integrations: ["mcleod", "mercergate", "quickbooks", "bill-com"],
    roi: "3-5% recovery on duplicate/overcharged freight bills; audit cost reduced 90%",
    demoDescription: "The AI team processes 340 freight invoices, cross-references each line against the carrier's contracted rate table, flags 17 overcharges ($4,280 total), identifies 2 duplicate billings ($1,840), and approves the remaining for payment — all before lunch."
  },
  {
    id: "log-ltl-manifesting",
    name: "LTL Manifesting & Rate Calculation",
    industry: ["logistics"],
    description: "Automate class calculation, NMFC verification, dimensional weight audit, and manifest generation for less-than-truckload shipments.",
    timeSaved: "10 hrs/week per shipping clerk",
    difficulty: "medium",
    integrations: ["mcleod", "mercergate", "samsara"],
    roi: "Reclassification claims reduced 45%; billing accuracy improved to 99.3%",
    demoDescription: "The AI team audits 62 LTL shipments for correct NMFC classification, catches 8 mis-classed items that would have cost $1,200 in reclassification fees, corrects dimensional weight on 4 others, and generates clean manifests."
  },
  {
    id: "log-wms-inventory",
    name: "Warehouse Inventory Synchronization",
    industry: ["logistics", "manufacturing"],
    description: "Synchronize inventory levels across WMS, ERP, and e-commerce platforms with automated cycle counting triggers and reorder point calculations.",
    timeSaved: "14 hrs/week per warehouse manager",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "shopify", "fishbowl"],
    roi: "Inventory accuracy maintained at 99.8%; stockout incidents reduced 80%",
    demoDescription: "The AI team reconciles inventory counts from 3 WMS zones against ERP and Shopify, identifies 12 discrepancies, dispatches a cycle count request to the warehouse floor for only those 12 locations, and updates all systems within an hour."
  },
  // ======================================================================
  // HEALTHCARE
  // ======================================================================
  {
    id: "hc-patient-intake",
    name: "Patient Intake & Registration",
    industry: ["healthcare"],
    description: "Automate patient registration, insurance verification, consent form collection, and medical history import from referring providers.",
    timeSaved: "22 hrs/week per registration clerk",
    difficulty: "medium",
    integrations: ["epic", "cerner", "athenahealth", "adobe-sign"],
    roi: "Check-in time reduced from 12 minutes to 90 seconds; 60% reduction in registration errors",
    demoDescription: "The AI team receives a new patient referral, pre-populates demographics from the referring provider's records, verifies insurance eligibility in real-time, sends digital consent forms, and schedules the first appointment — all before the patient hangs up the phone."
  },
  {
    id: "hc-appointment-scheduling",
    name: "Intelligent Appointment Scheduling",
    industry: ["healthcare"],
    description: "Optimize appointment scheduling based on provider availability, patient preferences, procedure duration, room availability, and urgent slot management.",
    timeSaved: "15 hrs/week per scheduler",
    difficulty: "medium",
    integrations: ["epic", "cerner", "calendly", "outlook"],
    roi: "No-show rate reduced from 18% to 7%; scheduling throughput increased 3x",
    demoDescription: "The AI team evaluates an appointment request against 12 providers' schedules, considers the procedure's typical duration and required room setup, identifies the optimal slot that also accommodates the patient's preferred day, and sends the confirmation."
  },
  {
    id: "hc-insurance-verification",
    name: "Insurance Eligibility & Benefits Verification",
    industry: ["healthcare"],
    description: "Batch verify insurance eligibility, deductibles, co-pays, and pre-authorization requirements for scheduled patients days before appointments.",
    timeSaved: "18 hrs/week per insurance verifier",
    difficulty: "medium",
    integrations: ["epic", "cerner", "athenahealth", "nextgen"],
    roi: "Claim denial rate reduced from 12% to 3%; revenue cycle accelerated by 5 days",
    demoDescription: "The AI team verifies insurance for 87 scheduled patients in 4 minutes, identifies 12 with eligibility changes, 5 requiring pre-authorization, and flags 3 with deductibles not yet met — each with detailed benefit summaries sent to the front desk."
  },
  {
    id: "hc-medical-coding",
    name: "Medical Coding Automation",
    industry: ["healthcare"],
    description: "Analyze clinical documentation and suggest appropriate ICD-10, CPT, and HCPCS codes based on provider notes, lab results, and imaging reports.",
    timeSaved: "16 hrs/week per medical coder",
    difficulty: "hard",
    integrations: ["epic", "cerner", "athenahealth"],
    roi: "Coding accuracy improved from 88% to 97%; coding backlog reduced 85%",
    demoDescription: "The AI team reads a surgeon's operative note, identifies 4 procedures performed, cross-references with the pathology report to confirm diagnosis codes, suggests 7 ICD-10 and 4 CPT codes with supporting documentation highlighted for the coder's review."
  },
  {
    id: "hc-claims-processing",
    name: "Claims Submission & Denial Management",
    industry: ["healthcare"],
    description: "Automate claim scrubbing, electronic submission, payment posting, denial analysis, and appeal generation to maximize clean claim rates.",
    timeSaved: "25 hrs/week per claims specialist",
    difficulty: "hard",
    integrations: ["epic", "cerner", "athenahealth", "workday"],
    roi: "Clean claim rate improved from 72% to 95%; days in AR reduced from 45 to 18",
    demoDescription: "The AI team pre-scrubs 142 claims before submission, catches 11 errors (incorrect modifiers, missing referral numbers), submits 131 clean claims electronically, posts 89 payments from 3 different payers, and generates 5 appeal letters for denials."
  },
  {
    id: "hc-compliance-reporting",
    name: "Healthcare Compliance Reporting",
    industry: ["healthcare"],
    description: "Automate HIPAA compliance monitoring, audit log analysis, breach detection, and regulatory report generation for federal and state requirements.",
    timeSaved: "12 hrs/week per compliance officer",
    difficulty: "hard",
    integrations: ["epic", "sharepoint", "servicenow"],
    roi: "Audit preparation time reduced 80%; compliance findings reduced 60%",
    demoDescription: "The AI team reviews 14,000 access log entries, identifies 3 anomalous access patterns (after-hours access to patient records by non-clinical staff), correlates with badge-swipe data, and generates a compliance incident report ready for review."
  },
  // ======================================================================
  // FINANCIAL SERVICES
  // ======================================================================
  {
    id: "fin-ap-automation",
    name: "Accounts Payable Full Cycle Automation",
    industry: ["financial-services", "professional-services"],
    description: "End-to-end AP automation from invoice receipt through approval, payment scheduling, and GL coding with full audit trail and exception handling.",
    timeSaved: "30 hrs/week per AP team",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "bill-com", "expensify"],
    roi: "Invoice processing cost reduced from $12 to $0.80 per invoice; payment cycles shortened 65%",
    demoDescription: "The AI team processes 300 invoices daily: extracting line items, applying GL codes based on department budgets, routing 42 invoices for department-head approval, scheduling 258 for payment per terms, and reconciling all payments against bank statements."
  },
  {
    id: "fin-ar-automation",
    name: "Accounts Receivable & Collections",
    industry: ["financial-services", "professional-services"],
    description: "Automate invoice generation, delivery, payment tracking, dunning, and collections prioritization with personalized customer communication.",
    timeSaved: "20 hrs/week per AR specialist",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "salesforce", "hubspot"],
    roi: "DSO reduced from 47 to 28 days; collections efficiency improved 3x",
    demoDescription: "The AI team generates 87 invoices from time entries, emails each with customer-specific portal links, monitors payment status, sends 34 automated reminders (escalating tone based on aging), and prioritizes 15 accounts for human collector outreach."
  },
  {
    id: "fin-expense-reporting",
    name: "Employee Expense Report Automation",
    industry: ["financial-services", "professional-services"],
    description: "Automate expense report submission, receipt matching, policy compliance checking, approval routing, and reimbursement processing.",
    timeSaved: "12 hrs/week per finance associate",
    difficulty: "easy",
    integrations: ["expensify", "quickbooks", "xero", "brex", "ramp"],
    roi: "Expense report processing time reduced from 11 minutes to 45 seconds; policy compliance improved to 98%",
    demoDescription: "The AI team reads a submitted expense report with 12 receipts, matches each to the credit card transaction, checks all against 23 corporate policy rules, flags one out-of-policy meal, routes to the manager for exception approval, and posts to the GL."
  },
  {
    id: "fin-bank-reconciliation",
    name: "Automated Bank Reconciliation",
    industry: ["financial-services"],
    description: "Match bank statement transactions against ERP entries across multiple accounts and currencies, investigate discrepancies, and generate reconciliation reports.",
    timeSaved: "16 hrs/week per accountant",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "sap", "oracle-netsuite"],
    roi: "Month-end close reduced from 8 days to 2 days; reconciliation accuracy at 99.9%",
    demoDescription: "The AI team reconciles 14 bank accounts (3 currencies, 3,400+ transactions), auto-matches 3,281, identifies 119 unmatched items, investigates 84 by cross-referencing open invoices and checks in-flight, and flags 35 for manual research."
  },
  {
    id: "fin-budget-tracking",
    name: "Budget vs Actual Tracking & Alerts",
    industry: ["financial-services", "professional-services"],
    description: "Monitor departmental spending against budgets, generate variance reports, send proactive alerts when thresholds are exceeded, and forecast end-of-period outcomes.",
    timeSaved: "8 hrs/week per FP&A analyst",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "dynamics-365", "powerbi"],
    roi: "Budget variance reduction from 12% to 4%; forecasting accuracy improved to 95%",
    demoDescription: "The AI team reviews today's expenditures across 23 departments, identifies 8 cost centers exceeding 85% of monthly budget (with 12 days remaining), sends personalized alerts to department heads with top-3 spend categories driving the variance."
  },
  // ======================================================================
  // CONSTRUCTION
  // ======================================================================
  {
    id: "con-submittal-review",
    name: "Submittal & Shop Drawing Review",
    industry: ["construction"],
    description: "Track, organize, and route submittals and shop drawings through the review-and-approval process across general contractor, architect, and engineer stakeholders.",
    timeSaved: "14 hrs/week per project engineer",
    difficulty: "medium",
    integrations: ["procore", "autocad", "sharepoint"],
    roi: "Submittal review cycle shortened from 21 days to 8 days; RFIs reduced 35%",
    demoDescription: "The AI team logs 28 submittals received, cross-references each against the spec section and drawing number, routes 22 that are complete to the review queue, flags 6 for missing information, and sends automated status updates to the subcontractor."
  },
  {
    id: "con-rfi-processing",
    name: "RFI Processing & Response Tracking",
    industry: ["construction"],
    description: "Automate RFI logging, assignment, response time tracking, and closure documentation with complete audit trail across the project team.",
    timeSaved: "8 hrs/week per project engineer",
    difficulty: "easy",
    integrations: ["procore", "autocad", "outlook"],
    roi: "RFI response time reduced from 12 days to 3.5 days; project delays attributed to RFIs reduced 60%",
    demoDescription: "The AI team receives an RFI from the field superintendent, automatically identifies the affected drawing and spec section, assigns it to the design discipline lead, sets a 5-day response deadline, and sends reminders at day 3 and 4."
  },
  {
    id: "con-payroll-timecards",
    name: "Construction Timecard & Payroll",
    industry: ["construction"],
    description: "Collect, validate, and process timecards from multiple job sites with certified payroll reporting, prevailing wage compliance, and union dues tracking.",
    timeSaved: "18 hrs/week per payroll administrator",
    difficulty: "medium",
    integrations: ["procore", "adp", "quickbooks"],
    roi: "Payroll processing time cut 75%; certified payroll compliance errors eliminated",
    demoDescription: "The AI team collects 87 timecards from 4 job sites, validates each against the employee's assigned work classification, flags 5 with overtime exceeding project thresholds, calculates certified payroll for 3 prevailing-wage projects, and generates payroll reports."
  },
  {
    id: "con-change-orders",
    name: "Change Order Management",
    industry: ["construction"],
    description: "Track change order requests through approval workflows, automatically update project budgets, notify stakeholders, and maintain complete documentation lineage.",
    timeSaved: "10 hrs/week per project manager",
    difficulty: "medium",
    integrations: ["procore", "quickbooks", "sage-50"],
    roi: "Change order approval cycle reduced from 18 days to 5 days; revenue leakage reduced 40%",
    demoDescription: "The AI team processes a change order request from the field, calculates the budget impact against contingency, routes it through the required approval chain (PM → GC → Owner), updates the project forecast, and notifies all 14 stakeholders."
  },
  {
    id: "con-daily-logs",
    name: "Daily Field Report Automation",
    industry: ["construction"],
    description: "Generate comprehensive daily field reports from foreman inputs, weather data, equipment logs, materials received, and work completed percentages.",
    timeSaved: "6 hrs/week per superintendent",
    difficulty: "easy",
    integrations: ["procore", "sharepoint", "outlook"],
    roi: "Report generation time reduced 85%; report accuracy improved from 72% to 96%",
    demoDescription: "The AI team aggregates foreman reports from 6 work zones, pulls weather data, cross-references equipment hours, calculates day-by-day progress against schedule, and generates a formatted daily report — the superintendent reviews and approves in 3 minutes."
  },
  // ======================================================================
  // ENERGY
  // ======================================================================
  {
    id: "en-well-reporting",
    name: "Well Production Reporting",
    industry: ["energy", "oil-gas"],
    description: "Automate collection and analysis of well production data, generate regulatory reports, and identify underperforming assets with actionable recommendations.",
    timeSaved: "20 hrs/week per production engineer",
    difficulty: "hard",
    integrations: ["sap", "powerbi", "excel"],
    roi: "Reporting time reduced 85%; well intervention identification accelerated from 2 weeks to 2 days",
    demoDescription: "The AI team aggregates production data from 47 wells, calculates daily rates and decline curves against type curves, flags 3 wells with anomalous decline, cross-references with last intervention date, and recommends candidate wells for workover review."
  },
  {
    id: "en-compliance-monitoring",
    name: "Environmental Compliance Monitoring",
    industry: ["energy", "oil-gas"],
    description: "Monitor emissions data, spill reports, permit conditions, and regulatory deadlines across operating assets with automated alerting and report generation.",
    timeSaved: "16 hrs/week per compliance specialist",
    difficulty: "hard",
    integrations: ["sap", "servicenow", "sharepoint"],
    roi: "Regulatory filing accuracy improved to 100%; compliance event response time reduced 75%",
    demoDescription: "The AI team monitors 23 permitted emission points, detects a sulfur dioxide reading approaching the permitted limit, cross-references with current production rates, alerts the environmental manager, and pre-populates the deviation report for submission."
  },
  {
    id: "en-invoice-matching",
    name: "Energy Invoice & Royalty Processing",
    industry: ["energy", "oil-gas"],
    description: "Automate processing of vendor invoices, royalty payments, joint interest billings, and revenue distribution with complex division order calculations.",
    timeSaved: "24 hrs/week per revenue accountant",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "quickbooks"],
    roi: "Royalty payment accuracy improved from 93% to 99.8%; processing time reduced 80%",
    demoDescription: "The AI team processes 1,200+ royalty interests from 47 wells, calculates each owner's share based on division of interest, applies tax withholding and burden deductions, generates stubs for each payee, and posts to the general ledger."
  },
  {
    id: "en-supply-chain",
    name: "Oilfield Supply Chain Automation",
    industry: ["energy", "oil-gas"],
    description: "Automate material requisition, inventory tracking across field locations, vendor PO management, and equipment rental return tracking.",
    timeSaved: "14 hrs/week per supply chain coordinator",
    difficulty: "medium",
    integrations: ["sap", "oracle-netsuite", "outlook"],
    roi: "Material delivery time reduced 40%; inventory carrying cost reduced 18%",
    demoDescription: "The AI team identifies that 3 well sites are running low on critical consumables, checks current stock at 4 field warehouses, generates transfer orders for 2 sites and a PO for the third, and schedules delivery — all triggered by inventory thresholds."
  },
  // ======================================================================
  // RETAIL
  // ======================================================================
  {
    id: "ret-order-entry",
    name: "Order Entry & Processing Automation",
    industry: ["retail", "ecommerce"],
    description: "Capture orders from multiple channels (web, phone, EDI, marketplace), validate inventory availability, process payments, and route to fulfillment.",
    timeSaved: "20 hrs/week per order entry clerk",
    difficulty: "medium",
    integrations: ["shopify", "salesforce", "netsuite", "stripe"],
    roi: "Order processing time reduced from 8 minutes to 30 seconds; error rate reduced to 0.2%",
    demoDescription: "The AI team captures orders from 4 channels, validates inventory across 3 warehouses, checks payment authorization, applies discounts and promotions, assigns to the optimal fulfillment location, and sends order confirmation — completed in under a minute."
  },
  {
    id: "ret-inventory-sync",
    name: "Multi-Channel Inventory Synchronization",
    industry: ["retail", "ecommerce"],
    description: "Synchronize inventory levels across physical stores, warehouses, and all online sales channels in real-time with automated reorder triggers.",
    timeSaved: "15 hrs/week per inventory planner",
    difficulty: "hard",
    integrations: ["shopify", "netsuite", "fishbowl", "amazon"],
    roi: "Stockout incidents reduced 65%; overstock write-downs reduced 40%",
    demoDescription: "The AI team monitors 12,000 SKUs across 8 stores, 3 warehouses, and 4 online channels, detects a hot-selling item at 2 units remaining, triggers a transfer from the warehouse, and adjusts the reorder point based on the accelerated sell-through rate."
  },
  {
    id: "ret-customer-emails",
    name: "Customer Email Automation",
    industry: ["retail", "ecommerce"],
    description: "Automate order confirmation, shipping updates, delivery notifications, review requests, abandoned cart recovery, and personalized promotional emails.",
    timeSaved: "12 hrs/week per marketing coordinator",
    difficulty: "easy",
    integrations: ["shopify", "hubspot", "gmail", "salesforce"],
    roi: "Abandoned cart recovery rate improved from 8% to 32%; email marketing ROI increased 4x",
    demoDescription: "The AI team detects 23 abandoned carts, sends personalized recovery emails with product images and a time-limited discount code, monitors click-through, and triggers a follow-up SMS if no engagement within 4 hours."
  },
  {
    id: "ret-returns-processing",
    name: "Returns & Refund Processing",
    industry: ["retail", "ecommerce"],
    description: "Process return requests, generate RMA labels, inspect returned items, determine disposition, and issue refunds or exchanges automatically.",
    timeSaved: "14 hrs/week per returns associate",
    difficulty: "medium",
    integrations: ["shopify", "netsuite", "stripe"],
    roi: "Returns processing time reduced from 7 days to 24 hours; refund accuracy improved to 99.8%",
    demoDescription: "The AI team receives a return request, authorizes it based on policy, sends a prepaid label, and when the item arrives, inspects the photos submitted by the customer, determines it's resalable, and issues the refund — all without human touch."
  },
  {
    id: "ret-vendor-onboarding",
    name: "Vendor Onboarding & Compliance",
    industry: ["retail"],
    description: "Automate vendor application processing, document collection, compliance verification, contract generation, and portal access setup.",
    timeSaved: "10 hrs/week per vendor manager",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Vendor onboarding time reduced from 30 days to 5 days; compliance documentation completeness at 100%",
    demoDescription: "The AI team processes a new vendor application, checks the applicant against watchlists, collects W-9 and insurance certificates, generates the vendor agreement, routes for digital signature, and provisions portal access — completed in under 48 hours."
  },
  // ======================================================================
  // LEGAL
  // ======================================================================
  {
    id: "leg-contract-review",
    name: "Contract Review & Analysis",
    industry: ["legal", "professional-services"],
    description: "Review incoming contracts against standard terms, flag deviations, identify risks, and extract key dates and obligations for calendar management.",
    timeSaved: "20 hrs/week per contract attorney",
    difficulty: "hard",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Contract review time reduced 70%; risk identification improved 3x vs manual review",
    demoDescription: "The AI team reviews a 34-page vendor agreement, compares 128 clauses against 56 standard terms, flags 7 deviations (including auto-renewal and uncapped indemnification), extracts key dates into the obligation calendar, and prepares a redlined version."
  },
  {
    id: "leg-client-intake",
    name: "Client Intake & Conflict Checking",
    industry: ["legal"],
    description: "Automate new client intake, conflict of interest screening against firm-wide matters and parties, engagement letter generation, and matter opening.",
    timeSaved: "12 hrs/week per intake specialist",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign", "sharepoint"],
    roi: "Intake process reduced from 2 days to 3 hours; conflict detection accuracy improved to 99.9%",
    demoDescription: "The AI team enters a new prospective client and matter, checks against 40,000+ past matters and 200,000+ parties, identifies 2 potential conflicts with affiliated entities, routes to the ethics partner for waiver review, and prepares the engagement letter."
  },
  {
    id: "leg-docketing",
    name: "Docketing & Calendar Management",
    industry: ["legal"],
    description: "Automate deadline calculation, court rule compliance, docket entry, and calendar management across all active matters with proactive reminders.",
    timeSaved: "8 hrs/week per docketing clerk",
    difficulty: "hard",
    integrations: ["outlook", "sharepoint", "servicenow"],
    roi: "Docketing errors reduced 95%; missed deadline risk eliminated",
    demoDescription: "The AI team receives a notice of hearing, calculates all responsive deadlines per court rules (response due 21 days, expert disclosure 45 days before trial), enters each into the firm calendar, links to the matter, and sends confirmation to the assigned attorneys."
  },
  {
    id: "leg-billable-time",
    name: "Billable Time Entry Automation",
    industry: ["legal", "professional-services"],
    description: "Capture billable time from calendar events, emails, and documents, draft time entries in proper narrative format, and submit for attorney review.",
    timeSaved: "10 hrs/week per attorney",
    difficulty: "medium",
    integrations: ["outlook", "salesforce", "quickbooks"],
    roi: "Billable time capture improved from 74% to 94%; annual revenue increase of $40K per attorney",
    demoDescription: "The AI team reviews an attorney's calendar, 87 emails, and 12 edited documents, identifies 6.3 hours of billable activity not yet recorded, drafts narrative time entries in proper format, applies the correct client/matter codes, and presents for approval."
  },
  {
    id: "leg-document-discovery",
    name: "Document Discovery & Review",
    industry: ["legal"],
    description: "Process document productions, apply privilege filters, perform keyword and concept searches, and organize responsive documents for review by issue and custodian.",
    timeSaved: "40 hrs/week per discovery associate",
    difficulty: "hard",
    integrations: ["sharepoint", "dropbox", "azure-sql"],
    roi: "Document review throughput increased 5x; discovery cost reduced 60%",
    demoDescription: "The AI team processes 50,000 documents from 12 custodians, removes duplicates and near-duplicates (reducing to 18,000 unique), applies privilege filters (removing 2,000), organizes by issue and custodian, and flags the 300 most relevant documents for priority review."
  },
  // ======================================================================
  // INSURANCE
  // ======================================================================
  {
    id: "ins-claims-intake",
    name: "Claims Intake & Triage",
    industry: ["insurance"],
    description: "Automate first notice of loss capture, claim triage based on severity and policy coverage, assignment to appropriate adjuster, and initial reserve setting.",
    timeSaved: "18 hrs/week per claims intake specialist",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "FNOW processing time reduced from 4 hours to 15 minutes; accurate triage at 94%",
    demoDescription: "The AI team receives a claim notification, verifies policy is active, determines coverage type based on the loss description, assigns a severity score, sets an initial reserve based on historical similar claims, and routes to the appropriate adjuster."
  },
  {
    id: "ins-subrogation",
    name: "Subrogation Recovery Automation",
    industry: ["insurance"],
    description: "Identify subrogation opportunities, generate demand letters, track recovery timelines, and manage outside counsel assignments for recovery cases.",
    timeSaved: "14 hrs/week per subrogation specialist",
    difficulty: "hard",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "Subrogation recovery rate improved from 34% to 52%; recovery cycle reduced by 40%",
    demoDescription: "The AI team reviews 85 closed claims, identifies 23 with subrogation potential based on liability determination and applicable laws, generates demand letters for 18 with clear liability, and refers 5 complex cases to outside recovery counsel."
  },
  {
    id: "ins-policy-admin",
    name: "Policy Administration & Renewal",
    industry: ["insurance"],
    description: "Automate policy issuance, mid-term changes, renewal processing, premium calculations, and non-renewal notifications with full audit trail.",
    timeSaved: "16 hrs/week per policy services associate",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "hubspot"],
    roi: "Policy processing time reduced 75%; renewal retention increased 12% through proactive engagement",
    demoDescription: "The AI team processes 45 renewal policies, calculates updated premiums based on loss experience and exposure changes, generates renewal documents, and sends personalized renewal offers — 32 accepted automatically, 13 routed to an agent for discussion."
  },
  {
    id: "ins-underwriting-support",
    name: "Underwriting Data Gathering",
    industry: ["insurance"],
    description: "Collect and analyze risk data from applications, loss runs, financial statements, and third-party databases to support underwriting decisions with recommendations.",
    timeSaved: "12 hrs/week per underwriter",
    difficulty: "hard",
    integrations: ["salesforce", "servicenow", "hubspot"],
    roi: "Underwriting productivity improved 40%; submission-to-quote time reduced from 7 days to 2 days",
    demoDescription: "The AI team reviews a new business submission, pulls loss runs from the claims system, extracts financial ratios from submitted statements, runs MVR and credit checks, and generates a risk assessment report with coverage recommendations."
  },
  // ======================================================================
  // REAL ESTATE
  // ======================================================================
  {
    id: "re-leasing-documents",
    name: "Lease Document Processing",
    industry: ["real-estate"],
    description: "Extract key terms from lease agreements, calculate rent schedules, track critical dates (renewal, rent escalation, termination), and maintain compliance with ASC 842 reporting.",
    timeSaved: "16 hrs/week per lease administrator",
    difficulty: "hard",
    integrations: ["sap", "oracle-netsuite", "adobe-sign"],
    roi: "Lease abstraction time reduced 80%; ASC 842 compliance achieved with zero audit findings",
    demoDescription: "The AI team processes 12 new lease agreements, extracts 240 data points per lease including rent escalations, CAM charges, renewal options, and termination rights — generating complete lease abstracts, payment schedules, and compliance reports."
  },
  {
    id: "re-property-management",
    name: "Property Management Work Orders",
    industry: ["real-estate"],
    description: "Automate work order creation, vendor assignment, approval routing, and status tracking for maintenance requests across commercial and residential portfolios.",
    timeSaved: "10 hrs/week per property manager",
    difficulty: "easy",
    integrations: ["outlook", "quickbooks", "servicenow"],
    roi: "Work order response time reduced 60%; maintenance costs reduced 15% through competitive vendor assignment",
    demoDescription: "The AI team receives a tenant maintenance request, categorizes it as HVAC emergency, assigns priority level 1, identifies the nearest qualified vendor from the approved list, dispatches the work order, and sends the tenant an estimated arrival time."
  },
  {
    id: "re-rent-collection",
    name: "Rent Collection & Reconciliation",
    industry: ["real-estate"],
    description: "Automate rent invoicing, payment processing, delinquency tracking, late-fee assessment, and monthly reconciliation across diverse property portfolios.",
    timeSaved: "14 hrs/week per property accountant",
    difficulty: "medium",
    integrations: ["quickbooks", "xero", "stripe"],
    roi: "Rent collections accelerated by 5 days; delinquency rate reduced from 9% to 4%",
    demoDescription: "The AI team generates 340 rent invoices across 4 properties, applies concessions and late fees as applicable, processes electronic payments from 312 tenants, sends reminders to 28 delinquent tenants, and reconciles all payments against expected amounts."
  },
  // ======================================================================
  // PROFESSIONAL SERVICES
  // ======================================================================
  {
    id: "ps-time-entry",
    name: "Automated Time & Expense Entry",
    industry: ["professional-services"],
    description: "Capture billable and non-billable time from calendar, email, and activity data, submit for approval, and sync to project accounting systems.",
    timeSaved: "8 hrs/week per consultant",
    difficulty: "easy",
    integrations: ["outlook", "salesforce", "quickbooks"],
    roi: "Billable utilization increased from 62% to 78%; time entry compliance improved to 97%",
    demoDescription: "The AI team reviews a consultant's week: 14 client meetings, 23 emails with project-related content, 8 edited documents — identifies 32.5 hours of billable time, categorizes by project and phase, and submits for approval with detailed descriptions."
  },
  {
    id: "ps-proposal-generation",
    name: "Proposal & SOW Generation",
    industry: ["professional-services"],
    description: "Generate personalized proposals and statements of work from templates, populate with project-specific data, and route for approval and e-signature.",
    timeSaved: "6 hrs/week per business development manager",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "adobe-sign"],
    roi: "Proposal generation time reduced 65%; win rate improved 18% through faster response",
    demoDescription: "The AI team generates a proposal based on the opportunity record: populates the scope section from the discovery notes, calculates pricing from the rate card and effort estimate, generates the SOW with deliverables and milestones, and sends for e-signature."
  },
  {
    id: "ps-resource-scheduling",
    name: "Resource Scheduling & Optimization",
    industry: ["professional-services"],
    description: "Optimize consultant staffing against project demands, skill requirements, availability, and utilization targets across the entire professional services organization.",
    timeSaved: "10 hrs/week per resource manager",
    difficulty: "hard",
    integrations: ["salesforce", "outlook", "servicenow"],
    roi: "Consultant utilization improved from 65% to 82%; staffing requests filled in 4 hours (down from 3 days)",
    demoDescription: "The AI team evaluates a new staffing request for a senior consultant with specific industry expertise and availability next week, searches the resource pool of 85 consultants, identifies 3 ideal candidates ranked by skillset match and utilization, and sends invitations."
  },
  {
    id: "ps-expense-audit",
    name: "Expense Policy Compliance Audit",
    industry: ["professional-services", "financial-services"],
    description: "Audit submitted expense reports against corporate policy, identify policy violations, flag suspicious patterns, and generate compliance reports.",
    timeSaved: "8 hrs/week per finance auditor",
    difficulty: "medium",
    integrations: ["expensify", "quickbooks", "xero"],
    roi: "Policy compliance improved from 78% to 96%; expense leakage reduced 45%",
    demoDescription: "The AI team audits 67 expense reports, identifies 12 policy violations (5 exceeded per-diem limits, 4 missing receipts, 3 non-compliant categories), flags 2 with suspicious patterns for investigation, and sends auto-notifications to the employees."
  },
  // ======================================================================
  // HOSPITALITY
  // ======================================================================
  {
    id: "hosp-reservations",
    name: "Reservation Management & Optimization",
    industry: ["hospitality"],
    description: "Automate reservation processing, room assignment optimization, overbooking management, cancellation tracking, and guest preference logging.",
    timeSaved: "20 hrs/week per reservationist",
    difficulty: "medium",
    integrations: ["salesforce", "outlook", "hubspot"],
    roi: "Occupancy rate improved 8%; overbooking incidents reduced 90%; guest satisfaction scores up 12%",
    demoDescription: "The AI team processes 45 incoming reservation requests, checks availability across 3 rate categories, assigns rooms based on 87 tracked guest preferences, manages 4 overbooked dates by identifying upgrade opportunities, and updates guest profiles."
  },
  {
    id: "hosp-procurement",
    name: "Hospitality Procurement Automation",
    industry: ["hospitality"],
    description: "Automate food & beverage procurement, vendor order management, inventory tracking across outlets, and cost per cover analysis.",
    timeSaved: "14 hrs/week per purchasing manager",
    difficulty: "medium",
    integrations: ["quickbooks", "netsuite", "outlook"],
    roi: "Food cost reduced 8%; inventory waste reduced 30%; procurement efficiency improved 60%",
    demoDescription: "The AI team analyzes banquet event orders for the week, calculates required ingredients across all outlets, checks current inventory, generates consolidated purchase orders for 12 vendors, and schedules deliveries to arrive before each event."
  },
  {
    id: "hosp-guest-communication",
    name: "Guest Communication Automation",
    industry: ["hospitality"],
    description: "Automate pre-arrival communications, in-stay messaging, post-stay follow-up, and personalized offer delivery based on guest preferences and history.",
    timeSaved: "10 hrs/week per front office manager",
    difficulty: "easy",
    integrations: ["outlook", "hubspot", "gmail"],
    roi: "Guest engagement rate improved 35%; direct booking volume increased 22%",
    demoDescription: "The AI team sends personalized pre-arrival emails to 67 arriving guests with room upgrade offers and local event recommendations, checks in with 12 guests during their stay, and sends post-stay thank-you messages with a return booking incentive."
  },
  // ======================================================================
  // AGRICULTURE
  // ======================================================================
  {
    id: "ag-crop-reporting",
    name: "Crop Production Reporting",
    industry: ["agriculture"],
    description: "Aggregate field-level production data, generate yield reports, track input usage, and provide compliance documentation for crop insurance and subsidies.",
    timeSaved: "12 hrs/week per farm manager",
    difficulty: "medium",
    integrations: ["excel", "powerbi", "sharepoint"],
    roi: "Reporting time reduced 80%; insurance claim processing accelerated 45% through better documentation",
    demoDescription: "The AI team collects harvest data from 14 fields, calculates yield per acre and total production, cross-references with input applications (seed, fertilizer, chemical), generates USDA-compliant production reports, and identifies top-3 underperforming fields."
  },
  {
    id: "ag-livestock-tracking",
    name: "Livestock Inventory & Health Tracking",
    industry: ["agriculture"],
    description: "Track livestock movements, health records, breeding cycles, feed consumption, and generate reports for herd management and regulatory compliance.",
    timeSaved: "15 hrs/week per herd manager",
    difficulty: "hard",
    integrations: ["excel", "sharepoint"],
    roi: "Herd health incidents reduced 25%; breeding success rate improved 18%",
    demoDescription: "The AI team processes daily health check data for 1,200 head, flags 8 animals with abnormal temperature or weight metrics, cross-references with vaccination records, identifies a potential respiratory issue in pen 14, and alerts the veterinarian."
  },
  {
    id: "ag-equipment-maint",
    name: "Equipment Maintenance Scheduling",
    industry: ["agriculture"],
    description: "Automate preventive maintenance scheduling based on equipment hours, season usage patterns, and historical failure data across the farm equipment fleet.",
    timeSaved: "8 hrs/week per maintenance supervisor",
    difficulty: "medium",
    integrations: ["excel", "outlook"],
    roi: "Unplanned downtime reduced 55%; equipment life extended 30%; maintenance cost reduced 22%",
    demoDescription: "The AI team reviews equipment hour meters across 34 tractors and harvesters, identifies 7 pieces due for service within the next 2 weeks, schedules maintenance around forecasted weather windows, orders parts, and coordinates with the service team."
  },
  // ======================================================================
  // GOVERNMENT & EDUCATION
  // ======================================================================
  {
    id: "gov-grant-management",
    name: "Grant Application & Reporting",
    industry: ["government", "education"],
    description: "Automate grant application processing, eligibility verification, award notification, compliance tracking, and reporting across federal and state funding programs.",
    timeSaved: "18 hrs/week per grants administrator",
    difficulty: "hard",
    integrations: ["servicenow", "sharepoint", "outlook"],
    roi: "Grant processing cycle reduced 60%; compliance reporting accuracy improved to 99%",
    demoDescription: "The AI team processes 34 grant applications, validates eligibility against program criteria for each, checks for completeness, identifies 5 with missing documentation, notifies applicants, and routes complete applications to the review panel."
  },
  {
    id: "gov-procurement",
    name: "Government Procurement Automation",
    industry: ["government"],
    description: "Automate RFP distribution, bid evaluation, vendor qualification, contract award, and purchase order generation in compliance with procurement regulations.",
    timeSaved: "22 hrs/week per procurement officer",
    difficulty: "hard",
    integrations: ["servicenow", "sap", "adobe-sign"],
    roi: "Procurement cycle reduced from 90 to 35 days; vendor compliance improved to 98%",
    demoDescription: "The AI team distributes an RFP to 22 qualified vendors, receives 14 responses, evaluates each against 37 criteria, verifies all compliance documents, generates a comparison matrix ranked by score, and prepares the award recommendation."
  },
  {
    id: "edu-student-enrollment",
    name: "Student Enrollment & Registration",
    industry: ["education"],
    description: "Automate application processing, document verification, prerequisite checking, course registration, and fee collection across multiple programs and terms.",
    timeSaved: "16 hrs/week per registrar",
    difficulty: "medium",
    integrations: ["servicenow", "salesforce", "outlook"],
    roi: "Application processing time reduced 70%; registration accuracy improved to 99.5%",
    demoDescription: "The AI team processes 125 applications for the upcoming term, verifies transcripts and prerequisites for each, checks program capacity, generates acceptance letters for 98 qualified applicants, places 12 on waitlist, and notifies 15 of missing documents."
  },
  // ======================================================================
  // TELECOMMUNICATIONS
  // ======================================================================
  {
    id: "tel-customer-provisioning",
    name: "Customer Service Provisioning",
    industry: ["telecommunications"],
    description: "Automate service order entry, circuit provisioning, equipment activation, and customer database updates across multiple network and billing systems.",
    timeSaved: "18 hrs/week per provisioning specialist",
    difficulty: "hard",
    integrations: ["salesforce", "servicenow", "outlook"],
    roi: "Provisioning time reduced from 5 days to 8 hours; order accuracy improved to 99.8%",
    demoDescription: "The AI team processes a new customer service order, validates address for serviceability, checks port availability, configures the circuit in the network management system, activates the CPE remotely, and updates the billing system — all in under 2 hours."
  },
  {
    id: "tel-network-fault",
    name: "Network Fault Detection & Ticketing",
    industry: ["telecommunications"],
    description: "Monitor network alerts, correlate events, identify root cause, create trouble tickets, dispatch field technicians, and track repair progress.",
    timeSaved: "24 hrs/week per NOC engineer",
    difficulty: "hard",
    integrations: ["servicenow", "outlook", "slack"],
    roi: "Mean time to repair reduced 45%; network availability improved to 99.97%",
    demoDescription: "The AI team correlates 340 network alerts from 12 sources into 8 distinct incidents, identifies the most likely root cause for each, assigns priority levels, creates detailed trouble tickets, and dispatches the nearest available field technician."
  },
  {
    id: "tel-billing-mediation",
    name: "Telecom Billing Mediation",
    industry: ["telecommunications"],
    description: "Collect usage records from network elements, rate calls and data sessions, apply discounts and promotions, and generate customer invoices with full audit trail.",
    timeSaved: "20 hrs/week per billing analyst",
    difficulty: "hard",
    integrations: ["sap", "quickbooks", "excel"],
    roi: "Billing accuracy improved to 99.95%; billing dispute rate reduced 60%",
    demoDescription: "The AI team processes 2.4 million usage records from network elements, rates each against customer-specific contracts, applies 1,200 promotion codes, verifies against minimum commitments, and generates 8,500 customer invoices — completed before the billing cycle cutoff."
  },
  // ======================================================================
  // PHARMACEUTICALS
  // ======================================================================
  {
    id: "pharm-regulatory-submissions",
    name: "Regulatory Submission Tracking",
    industry: ["pharmaceuticals", "life-sciences"],
    description: "Track regulatory submission deadlines, compile submission packages, monitor agency review progress, and manage correspondence across global health authorities.",
    timeSaved: "20 hrs/week per regulatory affairs specialist",
    difficulty: "hard",
    integrations: ["sharepoint", "servicenow", "outlook"],
    roi: "Submission accuracy improved to 99.5%; submission-to-approval cycle reduced 20%",
    demoDescription: "The AI team monitors 14 active submissions across FDA, EMA, and PMDA, tracks 84 milestones against internal deadlines, identifies 3 submissions at risk of delay, compiles status reports for each, and generates the monthly regulatory dashboard."
  },
  {
    id: "pharm-clinical-trial",
    name: "Clinical Trial Data Management",
    industry: ["pharmaceuticals", "life-sciences"],
    description: "Collect, validate, and process clinical trial data from investigator sites, generate safety reports, track enrollment, and manage trial master files.",
    timeSaved: "25 hrs/week per clinical data manager",
    difficulty: "hard",
    integrations: ["sharepoint", "servicenow", "excel"],
    roi: "Data cleaning cycle reduced 60%; database lock accelerated by 30%; query resolution time reduced 50%",
    demoDescription: "The AI team collects case report forms from 24 investigator sites, validates against 1,200 edit checks, generates 87 queries for missing or inconsistent data, tracks query resolution, and updates the trial master file with new documentation."
  },
  // ======================================================================
  // NONPROFIT
  // ======================================================================
  {
    id: "npo-donor-management",
    name: "Donor Management & Stewardship",
    industry: ["nonprofit"],
    description: "Automate donor acknowledgment, receipt generation, pledge tracking, recurring gift processing, and personalized stewardship communications.",
    timeSaved: "12 hrs/week per development associate",
    difficulty: "medium",
    integrations: ["salesforce", "hubspot", "quickbooks"],
    roi: "Donor retention improved 20%; acknowledgment time reduced from 2 weeks to 24 hours; recurring gift revenue up 30%",
    demoDescription: "The AI team processes 145 donations received today, generates IRS-compliant acknowledgment letters for each, updates donor records, identifies 34 recurring gifts for processing, and sends personalized impact reports to 3 major donors."
  },
  {
    id: "npo-grant-reporting",
    name: "Grant Reporting & Compliance",
    industry: ["nonprofit"],
    description: "Track grant deliverables, compile progress reports, monitor budget utilization against award terms, and generate compliance documentation for funders.",
    timeSaved: "14 hrs/week per grants manager",
    difficulty: "hard",
    integrations: ["quickbooks", "sharepoint", "outlook"],
    roi: "Report generation time reduced 70%; grant compliance rate improved to 99%",
    demoDescription: "The AI team reviews 12 active grants, tracks progress against 47 deliverables, calculates budget utilization for each grant, identifies 3 at risk of underspend, compiles quarterly narrative and financial reports, and submits to funders."
  },
];