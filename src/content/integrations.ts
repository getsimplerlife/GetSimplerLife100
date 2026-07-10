export interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  capabilities: string[];
  industries: string[];
  relatedWorkflows: string[];
}

export const integrations: Integration[] = [
  {
    id: "sap",
    name: "SAP",
    category: "ERP",
    description: "Enterprise resource planning system integration for inventory, supply chain, and financials.",
    capabilities: [
      "Real-time inventory level synchronization",
      "Automatic purchase order creation and processing",
      "Supplier ledger adjustments",
      "Compliance and audit-trail logging"
    ],
    industries: ["manufacturing", "logistics", "energy"],
    relatedWorkflows: ["invoice-automation", "purchase-order-management", "inventory-reconciliation"]
  },
  {
    id: "oracle-netsuite",
    name: "Oracle NetSuite",
    category: "ERP/CRM",
    description: "Cloud ERP integration for mid-market financial and customer operations.",
    capabilities: [
      "Automated bill creation from invoice extraction",
      "Inventory movement tracking",
      "Customer ledger synchronization",
      "Workflow trigger on status changes"
    ],
    industries: ["manufacturing", "retail", "ecommerce", "logistics"],
    relatedWorkflows: ["invoice-automation", "purchase-order-management"]
  }
];
