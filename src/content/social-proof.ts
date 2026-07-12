export interface SocialProofSnippet {
  id: string;
  text: string;
  industry: string[];
  workflow: string[];
  metric: string;
  source?: string;
}

export const socialProofSnippets: SocialProofSnippet[] = [
  // Manufacturing
  { id: "sp-mf-001", text: "A manufacturing client reduced invoice processing time from 11 minutes to 90 seconds per invoice.", industry: ["manufacturing"], workflow: ["invoice-processing", "ap-automation"], metric: "85% reduction in processing time" },
  { id: "sp-mf-002", text: "A mid-market automotive supplier cut PO cycle time from 3 days to 4 hours.", industry: ["manufacturing"], workflow: ["purchase-order-management"], metric: "Cycle time reduced 94%" },
  { id: "sp-mf-003", text: "Inventory reconciliation automation improved accuracy from 84% to 99.7% at a food manufacturer.", industry: ["manufacturing"], workflow: ["inventory-reconciliation"], metric: "Inventory accuracy improved 15.7%" },
  { id: "sp-mf-004", text: "A manufacturer's AP team now processes 340 invoices daily with 90% straight-through processing.", industry: ["manufacturing"], workflow: ["invoice-processing", "ap-automation"], metric: "300+ invoices per day per clerk" },
  { id: "sp-mf-005", text: "ERP data entry automation eliminated 40 hours of manual data entry per week for one manufacturer.", industry: ["manufacturing"], workflow: ["erp-updates", "data-entry"], metric: "40 hrs/week recovered" },
  { id: "sp-mf-006", text: "Quality document automation flagged 4 recurring non-conformances before they reached the customer.", industry: ["manufacturing"], workflow: ["quality-assurance"], metric: "4 systemic issues detected early" },
  { id: "sp-mf-007", text: "Supplier communication automation reduced response time from 3.2 days to 4.1 hours.", industry: ["manufacturing"], workflow: ["supplier-communication"], metric: "Response time improved 94%" },
  { id: "sp-mf-008", text: "A manufacturer achieved 92% touchless PO processing across 3 facilities.", industry: ["manufacturing"], workflow: ["purchase-order-management"], metric: "92% straight-through processing" },

  // Logistics
  { id: "sp-lg-001", text: "A dispatcher using automation now handles twice the shipment volume with better on-time performance.", industry: ["logistics", "transportation"], workflow: ["dispatch-scheduling"], metric: "2.3x dispatcher throughput" },
  { id: "sp-lg-002", text: "Route optimization helped a national fleet cut fuel costs by 12% and eliminate 340,000 excess miles.", industry: ["logistics", "transportation"], workflow: ["route-optimization"], metric: "12% fuel reduction, 340K fewer miles" },
  { id: "sp-lg-003", text: "Freight audit automation recovered 4.2% in carrier overcharges for a regional LTL carrier.", industry: ["logistics", "transportation"], workflow: ["freight-audit"], metric: "4.2% cost recovery" },
  { id: "sp-lg-004", text: "POD collection time dropped from 2.4 days to under 30 minutes after automation.", industry: ["logistics", "transportation"], workflow: ["pod-collection"], metric: "99% faster POD collection" },
  { id: "sp-lg-005", text: "A logistics firm achieved 97% on-time delivery after deploying dispatch optimization.", industry: ["logistics", "transportation"], workflow: ["dispatch-scheduling"], metric: "97% on-time delivery" },
  { id: "sp-lg-006", text: "Carrier coordination automation reduced spot market rates by 8-12% through intelligent tendering.", industry: ["logistics", "transportation"], workflow: ["carrier-coordination"], metric: "8-12% spot rate savings" },
  { id: "sp-lg-007", text: "Warehouse inventory sync maintained 99.8% accuracy and cut stockout incidents by 80%.", industry: ["logistics", "manufacturing"], workflow: ["wms-inventory"], metric: "99.8% inventory accuracy" },

  // Healthcare
  { id: "sp-hc-001", text: "A medical group cut patient check-in time from 12 minutes to 90 seconds.", industry: ["healthcare"], workflow: ["patient-intake"], metric: "Check-in time reduced 87%" },
  { id: "sp-hc-002", text: "Insurance verification automation reduced denial rates from 14% to 3% for a multi-specialty practice.", industry: ["healthcare"], workflow: ["insurance-verification"], metric: "Denial rate reduced 79%" },
  { id: "sp-hc-003", text: "Medical coding automation achieved 97% accuracy and eliminated the coding backlog.", industry: ["healthcare"], workflow: ["medical-coding"], metric: "97% coding accuracy" },
  { id: "sp-hc-004", text: "A hospital's clean claim rate improved from 72% to 95% with automated claims processing.", industry: ["healthcare"], workflow: ["claims-processing"], metric: "Clean claim rate +23%" },
  { id: "sp-hc-005", text: "Days in AR reduced from 45 to 18 after deploying claims denial management automation.", industry: ["healthcare"], workflow: ["claims-processing"], metric: "AR reduced 60%" },
  { id: "sp-hc-006", text: "Appointment scheduling AI cut no-show rates from 18% to 7% using intelligent optimization.", industry: ["healthcare"], workflow: ["appointment-scheduling"], metric: "No-show rate reduced 61%" },
  { id: "sp-hc-007", text: "Compliance monitoring automation reduced audit preparation time by 80% for a regional hospital.", industry: ["healthcare"], workflow: ["compliance-reporting"], metric: "80% faster audit prep" },

  // Construction
  { id: "sp-cn-001", text: "A GC cut submittal review cycles from 21 to 8 days on a $47M hospital project.", industry: ["construction"], workflow: ["submittal-review"], metric: "Review cycle reduced 62%" },
  { id: "sp-cn-002", text: "RFI automation reduced response time from 12 days to 3.5 days on a commercial build.", industry: ["construction"], workflow: ["rfi-processing"], metric: "RFI response time reduced 71%" },
  { id: "sp-cn-003", text: "Certified payroll automation cut processing time 75% and eliminated compliance errors.", industry: ["construction"], workflow: ["payroll-timecards"], metric: "Payroll time reduced 75%" },
  { id: "sp-cn-004", text: "Change order automation reduced approval cycles from 18 to 5 days.", industry: ["construction"], workflow: ["change-orders"], metric: "Change order cycle reduced 72%" },

  // Financial Services
  { id: "sp-fs-001", text: "A regional bank cut invoice processing cost from $12.40 to $0.80 per invoice.", industry: ["financial-services"], workflow: ["ap-automation"], metric: "94% cost reduction per invoice" },
  { id: "sp-fs-002", text: "AR automation reduced DSO from 47 to 28 days for a professional services firm.", industry: ["financial-services", "professional-services"], workflow: ["ar-automation"], metric: "DSO reduced 40%" },
  { id: "sp-fs-003", text: "Expense report processing dropped from 11 minutes to 45 seconds per report.", industry: ["financial-services", "professional-services"], workflow: ["expense-reporting"], metric: "93% faster expense processing" },
  { id: "sp-fs-004", text: "Automated bank reconciliation accelerated month-end close from 8 to 2 days.", industry: ["financial-services"], workflow: ["bank-reconciliation"], metric: "Close time reduced 75%" },
  { id: "sp-fs-005", text: "A finance team reconciled 14 bank accounts across 3 currencies in under 4 hours.", industry: ["financial-services"], workflow: ["bank-reconciliation"], metric: "Multi-currency reconciliation in 4 hrs" },

  // Energy
  { id: "sp-en-001", text: "Well production reporting time dropped from 3 days to 20 minutes for a 47-well operator.", industry: ["energy"], workflow: ["well-reporting"], metric: "Reporting time reduced 99%" },
  { id: "sp-en-002", text: "Environmental compliance monitoring achieved 100% regulatory filing accuracy.", industry: ["energy"], workflow: ["compliance-monitoring"], metric: "100% filing accuracy" },
  { id: "sp-en-003", text: "Royalty processing automation improved payment accuracy from 93% to 99.8%.", industry: ["energy"], workflow: ["invoice-matching"], metric: "Royalty accuracy +6.8%" },

  // Retail
  { id: "sp-rt-001", text: "A multi-channel retailer cut order processing from 8 minutes to 30 seconds per order.", industry: ["retail"], workflow: ["order-entry"], metric: "94% faster order processing" },
  { id: "sp-rt-002", text: "Inventory sync automation reduced stockout incidents by 65% across 12,000 SKUs.", industry: ["retail"], workflow: ["inventory-sync"], metric: "65% fewer stockouts" },
  { id: "sp-rt-003", text: "Abandoned cart recovery improved from 8% to 32% with automated email sequences.", industry: ["retail"], workflow: ["customer-emails"], metric: "Cart recovery rate 4x higher" },
  { id: "sp-rt-004", text: "Returns processing time dropped from 7 days to 24 hours for an e-commerce brand.", industry: ["retail"], workflow: ["returns-processing"], metric: "Returns processed in 24 hrs" },

  // Legal
  { id: "sp-lg-001", text: "A 50-attorney firm cut contract review time by 70% with AI-powered analysis.", industry: ["legal"], workflow: ["contract-review"], metric: "70% faster contract review" },
  { id: "sp-lg-002", text: "Client intake and conflict checking reduced from 2 days to 3 hours for a mid-size firm.", industry: ["legal"], workflow: ["client-intake"], metric: "Intake time reduced 94%" },
  { id: "sp-lg-003", text: "Billable time capture improved from 74% to 94%, generating $40K more revenue per attorney annually.", industry: ["legal"], workflow: ["billable-time"], metric: "20% more billable time captured" },
  { id: "sp-lg-004", text: "Document discovery processing costs reduced 60% for a 500K-document production.", industry: ["legal"], workflow: ["document-discovery"], metric: "60% discovery cost reduction" },

  // Insurance
  { id: "sp-ins-001", text: "Claims intake processing dropped from 4 hours to 15 minutes for a P&C insurer.", industry: ["insurance"], workflow: ["claims-intake"], metric: "FNOW time reduced 94%" },
  { id: "sp-ins-002", text: "Subrogation recovery rates improved from 34% to 52% with automated identification.", industry: ["insurance"], workflow: ["subrogation"], metric: "Recovery rate +53%" },
  { id: "sp-ins-003", text: "Policy administration automation improved renewal retention by 12% through proactive engagement.", industry: ["insurance"], workflow: ["policy-admin"], metric: "12% higher retention" },
  { id: "sp-ins-004", text: "Underwriting productivity improved 40% with automated data gathering and analysis.", industry: ["insurance"], workflow: ["underwriting-support"], metric: "40% productivity gain" },

  // Real Estate
  { id: "sp-re-001", text: "Lease abstraction time dropped 80% for a commercial firm with 1.2M sq ft portfolio.", industry: ["real-estate"], workflow: ["lease-processing"], metric: "80% faster lease abstraction" },
  { id: "sp-re-002", text: "Work order response time cut 60% across 2,400 apartment units.", industry: ["real-estate"], workflow: ["property-management"], metric: "60% faster work orders" },
  { id: "sp-re-003", text: "Rent collection automation reduced delinquency from 9% to 4%.", industry: ["real-estate"], workflow: ["rent-collection"], metric: "Delinquency reduced 56%" },

  // Professional Services
  { id: "sp-ps-001", text: "A consulting firm's billable utilization improved from 62% to 78% with time entry automation.", industry: ["professional-services"], workflow: ["time-entry"], metric: "Utilization +16%" },
  { id: "sp-ps-002", text: "Proposal generation time reduced 65%, improving win rate by 18% for a services firm.", industry: ["professional-services"], workflow: ["proposal-generation"], metric: "65% faster proposals" },
  { id: "sp-ps-003", text: "Resource scheduling automation filled 92% of staffing requests within 4 hours.", industry: ["professional-services"], workflow: ["resource-scheduling"], metric: "92% filled within 4 hours" },

  // Hospitality
  { id: "sp-hosp-001", text: "Reservation automation improved occupancy by 8% and reduced overbooking incidents by 90%.", industry: ["hospitality"], workflow: ["reservations"], metric: "8% occupancy increase" },
  { id: "sp-hosp-002", text: "F&B procurement automation reduced food costs by 8% and waste by 30%.", industry: ["hospitality"], workflow: ["procurement"], metric: "8% food cost reduction" },
  { id: "sp-hosp-003", text: "Guest communication automation improved direct booking volume by 22%.", industry: ["hospitality"], workflow: ["guest-communication"], metric: "22% direct booking growth" },

  // Government & Education
  { id: "sp-gov-001", text: "Grant processing cycle reduced 60% for a state agency handling 200+ applications yearly.", industry: ["government"], workflow: ["grant-management"], metric: "60% faster grant processing" },
  { id: "sp-gov-002", text: "Procurement automation cut cycle time from 90 to 35 days for a municipal government.", industry: ["government"], workflow: ["procurement"], metric: "Procurement cycle reduced 61%" },
  { id: "sp-edu-001", text: "Student enrollment processing reduced 70% for a university handling 5,000+ applications.", industry: ["education"], workflow: ["student-enrollment"], metric: "70% faster enrollment processing" },

  // Telecommunications
  { id: "sp-tel-001", text: "Service provisioning time dropped from 5 days to 8 hours for a regional telecom.", industry: ["telecommunications"], workflow: ["customer-provisioning"], metric: "Provisioning time reduced 93%" },
  { id: "sp-tel-002", text: "Network fault detection and dispatch reduced MTTR by 45% for a fiber provider.", industry: ["telecommunications"], workflow: ["network-fault"], metric: "MTTR reduced 45%" },
  { id: "sp-tel-003", text: "Billing mediation automation achieved 99.95% billing accuracy across 8,500 customer accounts.", industry: ["telecommunications"], workflow: ["billing-mediation"], metric: "99.95% billing accuracy" },

  // Cross-Industry
  { id: "sp-xi-001", text: "Companies using AI Operations Teams report an average 78% reduction in manual processing work.", industry: ["manufacturing", "logistics", "healthcare", "financial-services"], workflow: ["invoice-processing", "data-entry", "ap-automation"], metric: "78% less manual work" },
  { id: "sp-xi-002", text: "The average client sees full ROI within 4 months of deploying their AI Operations Team.", industry: ["manufacturing", "logistics", "healthcare", "financial-services", "retail"], workflow: [], metric: "4-month average ROI" },
  { id: "sp-xi-003", text: "AI Operations Teams handle 94% of routine business communications without human intervention.", industry: ["manufacturing", "logistics", "healthcare"], workflow: ["supplier-communication", "customer-emails"], metric: "94% autonomous handling" },
  { id: "sp-xi-004", text: "Data entry error rates dropped from 8% to 0.4% after deploying automated processing across all document types.", industry: ["manufacturing", "financial-services", "healthcare"], workflow: ["data-entry", "invoice-processing"], metric: "Error rate reduced 95%" },
  { id: "sp-xi-005", text: "83% of employees whose work was partially automated reported higher job satisfaction and lower burnout.", industry: ["manufacturing", "logistics", "financial-services"], workflow: [], metric: "83% higher satisfaction" },
];