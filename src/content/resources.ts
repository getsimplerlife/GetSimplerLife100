export interface ResourceItem {
  id: string;
  type: "template" | "guide" | "calculator" | "whitepaper";
  title: string;
  description: string;
  format: string;
  industry: string[];
  link: string;
  icon?: string;
}

export const resources: ResourceItem[] = [
  {
    id: "ap-automation-calculator",
    type: "calculator",
    title: "AP Automation ROI Calculator",
    description: "Calculate your potential time and cost savings by automating Accounts Payable with our interactive Excel calculator.",
    format: "Excel / Interactive",
    industry: ["manufacturing", "logistics", "construction", "retail"],
    link: "/roi-calculator",
    icon: "📊"
  },
  {
    id: "manufacturing-ai-playbook",
    type: "guide",
    title: "AI Operations Playbook for Manufacturers",
    description: "A comprehensive guide on deploying AI agents for inventory, quality assurance, and supplier communications in manufacturing.",
    format: "PDF Guide",
    industry: ["manufacturing"],
    link: "/resources/guides/manufacturing-playbook",
    icon: "📘"
  },
  {
    id: "invoice-extraction-template",
    type: "template",
    title: "Invoice Extraction Field Mapping Template",
    description: "Use this template to map invoice metadata fields to your ERP system (SAP, NetSuite, QuickBooks) for AI data extraction.",
    format: "Excel Template",
    industry: ["manufacturing", "logistics", "retail", "financial-services"],
    link: "/resources/templates/invoice-mapping",
    icon: "📋"
  }
];
