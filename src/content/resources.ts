export interface Resource {
  id: string;
  title: string;
  type: "template" | "guide" | "calculator" | "whitepaper";
  description: string;
  industry: string[];
  format: "PDF" | "Interactive" | "Google Doc";
  route?: string;
}

export const resources: Resource[] = [
  {
    id: "roi-calculator",
    title: "AI Operations ROI Calculator",
    type: "calculator",
    description:
      "Estimate how many hours and dollars your team could save by automating repetitive operations workflows. Enter your current process volumes, headcount, and average handling times to get a personalized ROI projection.",
    industry: [
      "manufacturing",
      "logistics",
      "healthcare",
      "construction",
      "financial-services",
      "energy",
      "retail",
      "legal",
      "insurance",
      "real-estate",
    ],
    format: "Interactive",
    route: "/roi-calculator",
  },
  {
    id: "invoice-automation-template",
    title: "Invoice Processing Automation Plan",
    type: "template",
    description:
      "A structured template for mapping your current invoice processing workflow — from receipt through approval and payment. Identify bottlenecks, data entry points, and automation opportunities specific to your AP operation.",
    industry: ["manufacturing", "logistics", "retail", "construction", "energy"],
    format: "Google Doc",
  },
  {
    id: "patient-intake-workflow-template",
    title: "Patient Intake Optimization Workbook",
    type: "template",
    description:
      "Map your complete patient intake journey — from first contact through registration, insurance verification, and clinical intake. Identify manual touchpoints, data re-entry, and opportunities to digitize with AI agents.",
    industry: ["healthcare"],
    format: "Google Doc",
  },
  {
    id: "compliance-audit-checklist",
    title: "Regulatory Compliance Audit Checklist",
    type: "template",
    description:
      "A comprehensive checklist for assessing your compliance posture against SOC 2, HIPAA, SOX, GDPR, and PCI DSS requirements. Use it to identify gaps in evidence collection, control monitoring, and reporting automation.",
    industry: ["financial-services", "healthcare", "insurance", "energy"],
    format: "Google Doc",
  },
  {
    id: "dispatch-routing-assessment",
    title: "Dispatch & Route Optimization Assessment",
    type: "template",
    description:
      "Evaluate your current dispatch and routing efficiency. This template helps logistics operators map their daily scheduling process, quantify route planning time, and identify fuel savings opportunities through automation.",
    industry: ["logistics"],
    format: "Google Doc",
  },
  {
    id: "contract-review-playbook",
    title: "AI Contract Review Playbook",
    type: "guide",
    description:
      "How legal and procurement teams can use AI to review contracts 10x faster. Covers clause detection, risk flagging, playbook compliance checking, and integration with existing contract management systems.",
    industry: ["legal", "financial-services", "insurance", "real-estate", "construction"],
    format: "PDF",
  },
  {
    id: "claims-automation-guide",
    title: "Claims Processing Automation Guide",
    type: "guide",
    description:
      "A step-by-step guide to automating the insurance claims lifecycle — from first notice of loss through adjudication and settlement. Covers technology requirements, integration points, and expected ROI at each stage.",
    industry: ["insurance", "healthcare"],
    format: "PDF",
  },
  {
    id: "data-entry-automation-framework",
    title: "Data Entry Elimination Framework",
    type: "guide",
    description:
      "A systematic approach to identifying and eliminating manual data entry across your organization. Learn how to audit data flows, prioritize automation opportunities, and implement AI-powered data extraction.",
    industry: [
      "manufacturing",
      "logistics",
      "healthcare",
      "financial-services",
      "retail",
      "insurance",
      "legal",
      "real-estate",
    ],
    format: "PDF",
  },
  {
    id: "erp-integration-blueprint",
    title: "ERP Integration Blueprint for AI Agents",
    type: "guide",
    description:
      "Technical guide for integrating AI agents with SAP, Oracle NetSuite, Microsoft Dynamics 365, and other major ERP systems. Covers API patterns, data mapping strategies, error handling, and security considerations.",
    industry: ["manufacturing", "energy", "logistics", "retail", "financial-services"],
    format: "PDF",
  },
  {
    id: "kyc-aml-automation-guide",
    title: "KYC/AML Automation Best Practices",
    type: "guide",
    description:
      "How financial services firms can automate KYC/AML workflows — from identity verification and document collection through screening and ongoing monitoring. Includes regulatory compliance considerations for each jurisdiction.",
    industry: ["financial-services", "insurance", "real-estate"],
    format: "PDF",
  },
  {
    id: "healthcare-admin-automation-whitepaper",
    title: "The Case for AI in Healthcare Administration",
    type: "whitepaper",
    description:
      "An in-depth analysis of administrative waste in US healthcare — estimated at $265B annually. Explores how AI agents can automate patient intake, scheduling, medical coding, claims processing, and compliance documentation while maintaining HIPAA compliance.",
    industry: ["healthcare"],
    format: "PDF",
  },
  {
    id: "manufacturing-digital-transformation-whitepaper",
    title: "Digital Lean: AI-Driven Operations in Manufacturing",
    type: "whitepaper",
    description:
      "Examines how manufacturers are using AI agents to extend lean manufacturing principles into administrative operations. Covers real-world case studies, implementation frameworks, and ROI data from 50+ manufacturing deployments.",
    industry: ["manufacturing", "energy"],
    format: "PDF",
  },
  {
    id: "supply-chain-automation-whitepaper",
    title: "The Autonomous Supply Chain: AI in Logistics and Distribution",
    type: "whitepaper",
    description:
      "How AI agents are transforming logistics operations — from autonomous dispatch and route optimization to self-reconciling freight audit and carrier management. Includes industry benchmarks and implementation roadmap.",
    industry: ["logistics", "manufacturing", "retail"],
    format: "PDF",
  },
  {
    id: "legal-tech-adoption-guide",
    title: "AI Adoption Guide for Law Firms",
    type: "guide",
    description:
      "Practical guidance for law firms adopting AI agents — covering ethical considerations, client confidentiality, billing model implications, and change management. Includes model AI use policies for firm adoption.",
    industry: ["legal"],
    format: "PDF",
  },
  {
    id: "procurement-efficiency-template",
    title: "Procurement Efficiency Audit Template",
    type: "template",
    description:
      "Audit your procurement operation for automation opportunities — from requisition through PO, receiving, and invoice matching. Identify maverick spend, consolidation opportunities, and cycle time reduction targets.",
    industry: ["manufacturing", "construction", "energy", "retail", "logistics"],
    format: "Google Doc",
  },
  {
    id: "real-estate-agent-productivity-guide",
    title: "The Productive Agent: AI Tools for Real Estate Professionals",
    type: "guide",
    description:
      "How real estate agents can reclaim 20+ hours per week with AI — covering instant lead response, automated showing coordination, contract generation, and pipeline management. Includes step-by-step implementation guides.",
    industry: ["real-estate"],
    format: "PDF",
  },
  {
    id: "vendor-management-playbook",
    title: "Vendor Management Automation Playbook",
    type: "guide",
    description:
      "Strategies for automating vendor onboarding, performance management, contract compliance, and relationship management. Covers vendor portal implementation, automated scorecards, and risk monitoring.",
    industry: ["manufacturing", "logistics", "construction", "retail", "financial-services"],
    format: "PDF",
  },
  {
    id: "financial-reporting-automation-whitepaper",
    title: "Automating Financial Reporting and Close Processes",
    type: "whitepaper",
    description:
      "Explores how AI agents can accelerate the financial close, automate regulatory reporting, and eliminate manual reconciliation. Includes benchmarks from firms that reduced close time from 15 days to 3 days.",
    industry: ["financial-services", "insurance", "manufacturing", "retail"],
    format: "PDF",
  },
  {
    id: "it-service-desk-optimization",
    title: "IT Service Desk Optimization with AI",
    type: "guide",
    description:
      "Guide to reducing IT service desk ticket volume by 40%+ through AI automation. Covers password reset automation, account provisioning, intelligent triage, and knowledge base integration.",
    industry: ["financial-services", "healthcare", "manufacturing", "energy", "insurance"],
    format: "PDF",
  },
  {
    id: "employee-onboarding-checklist",
    title: "Automated Employee Onboarding Playbook",
    type: "template",
    description:
      "End-to-end employee onboarding template covering document collection, account provisioning, training assignments, and compliance checks. Includes an automation opportunity map for each onboarding step.",
    industry: ["financial-services", "healthcare", "manufacturing", "retail", "legal", "insurance"],
    format: "Google Doc",
  },
];