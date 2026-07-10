export interface CaseStudy {
  id: string;
  companyName: string;
  industry: string;
  headline: string;
  challenge: string;
  solution: string;
  results: { value: string; label: string }[];
  testimonial: {
    quote: string;
    author: string;
    role: string;
  };
  workflowsUsed: string[];
  integrationsUsed: string[];
  timeline: string;
  relatedCaseStudies: string[];
}

export const caseStudies: CaseStudy[] = [
  {
    id: "apex-manufacturing",
    companyName: "Apex Manufacturing",
    industry: "manufacturing",
    headline: "How Apex Manufacturing Saved 1,200 Hours/Month with Invoice Automation",
    challenge: "Apex was handling over 5,000 invoices manually each month across their 3 factories. The AP team was overwhelmed, resulting in typos, duplicate payments, and vendor relationship strain.",
    solution: "We deployed the Invoice Processing Automation workflow integrated with SAP. The AI Agent now monitors their accounts-payable inbox, extracts line items, matches against POs, and posts approved bills directly to SAP.",
    results: [
      { value: "85%", label: "Reduction in Processing Time" },
      { value: "1,200", label: "Hours Saved per Month" },
      { value: "99.7%", label: "Data Extraction Accuracy" },
      { value: "14 Days", label: "Faster Vendor Payments" }
    ],
    testimonial: {
      quote: "The invoice agent completely transformed our finance operations. We went from being constantly behind to paying vendors early, without hiring more headcount.",
      author: "Robert Chen",
      role: "VP of Operations"
    },
    workflowsUsed: ["invoice-automation"],
    integrationsUsed: ["sap"],
    timeline: "2 weeks implementation",
    relatedCaseStudies: []
  }
];
