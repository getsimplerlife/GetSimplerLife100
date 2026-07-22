/**
 * Agent Chain Relationships
 *
 * Defines which AI agents can be chained/linked together in a workflow.
 * Used by the marketplace ("Chains with" badges), workflow builder,
 * and employee detail page (cross-agent integration suggestions).
 */

export interface AgentChainInfo {
  type: string;
  name: string;
  icon: string;
  chainsWith: string[]; // Agent type strings this can chain with
  chainDescriptions: Record<string, string>; // Map of agentType -> description of the chain
}

export const AGENT_CHAIN_MAP: Record<string, AgentChainInfo> = {
  document_intake: {
    type: "document_intake",
    name: "Document Intake AI",
    icon: "📄",
    chainsWith: ["invoice_ledger", "contract_management", "hr_compliance", "audit_logger", "knowledge_assistant"],
    chainDescriptions: {
      invoice_ledger: "📄 → 💸: Auto-extracted invoice data flows directly to Invoice & Ledger AI for processing",
      contract_management: "📄 → 📋: Classified contracts forwarded to Contract Management AI for term extraction",
      hr_compliance: "📄 → 👤: Onboarding documents routed to HR Compliance AI for verification",
      audit_logger: "📄 → ⚙️: Document processing metrics logged to Operations Audit Logger",
      knowledge_assistant: "📄 → 🧠: Documents indexed into Knowledge Assistant's RAG knowledge base",
    },
  },
  healthcare_intake: {
    type: "healthcare_intake",
    name: "Healthcare Intake AI",
    icon: "🏥",
    chainsWith: ["document_intake", "audit_logger", "customer_success", "support_agent"],
    chainDescriptions: {
      document_intake: "🏥 → 📄: Intake forms processed by Document AI for OCR and classification",
      audit_logger: "🏥 → ⚙️: Patient intake metrics logged to Operations Audit Logger",
      customer_success: "🏥 → 🌟: Patient satisfaction data fed to Customer Success AI",
      support_agent: "🏥 → 🎧: Complex patient inquiries escalated to Support Agent",
    },
  },
  invoice_ledger: {
    type: "invoice_ledger",
    name: "Invoice & Ledger AI",
    icon: "💸",
    chainsWith: ["document_intake", "audit_logger", "procurement_vendor", "fp_and_a", "dispatch_logistics"],
    chainDescriptions: {
      document_intake: "💸 → 📄: Invoices sent to Document AI for enhanced OCR when needed",
      audit_logger: "💸 → ⚙️: Invoice processing metrics logged to Operations Audit Logger",
      procurement_vendor: "💸 → 🏗️: PO-matched invoices forwarded to Procurement Vendor AI",
      fp_and_a: "💸 → 📈: Financial transaction data fed to FP&A AI for forecasting",
      dispatch_logistics: "💸 → 📦: Invoice payment status shared with Dispatch Logistics for supply chain",
    },
  },
  sales_outreach: {
    type: "sales_outreach",
    name: "Sales Outreach Coordinator AI",
    icon: "🚀",
    chainsWith: ["customer_success", "document_intake", "audit_logger", "marketing_social"],
    chainDescriptions: {
      customer_success: "🚀 → 🌟: New customer data shared with Customer Success AI for onboarding",
      document_intake: "🚀 → 📄: Lead documents processed by Document AI for enrichment",
      audit_logger: "🚀 → ⚙️: Campaign performance metrics logged to Operations Audit Logger",
      marketing_social: "🚀 → 📱: Outreach insights shared with Marketing Social AI for content alignment",
    },
  },
  hr_compliance: {
    type: "hr_compliance",
    name: "HR Intake & Compliance AI",
    icon: "👤",
    chainsWith: ["document_intake", "audit_logger", "it_operations", "project_management"],
    chainDescriptions: {
      document_intake: "👤 → 📄: Onboarding docs sent to Document AI for classification and storage",
      audit_logger: "👤 → ⚙️: Compliance metrics logged to Operations Audit Logger",
      it_operations: "👤 → 🖥️: New hire data triggers IT access provisioning via IT Operations AI",
      project_management: "👤 → 📊: Onboarding tasks tracked in Project Management AI",
    },
  },
  dispatch_logistics: {
    type: "dispatch_logistics",
    name: "Dispatch Logistics Optimization AI",
    icon: "📦",
    chainsWith: ["audit_logger", "customer_success", "procurement_vendor", "invoice_ledger"],
    chainDescriptions: {
      audit_logger: "📦 → ⚙️: Logistics performance metrics logged to Operations Audit Logger",
      customer_success: "📦 → 🌟: Shipment status updates shared with Customer Success AI",
      procurement_vendor: "📦 → 🏗️: Supply chain data fed to Procurement Vendor AI for vendor coordination",
      invoice_ledger: "📦 → 💸: Delivery confirmation triggers invoice processing via Invoice & Ledger AI",
    },
  },
  audit_logger: {
    type: "audit_logger",
    name: "Operations Audit Logger AI",
    icon: "⚙️",
    chainsWith: ["document_intake", "invoice_ledger", "it_operations", "fp_and_a", "all"],
    chainDescriptions: {
      document_intake: "⚙️ → 📄: Audit data cross-referenced with document processing logs",
      invoice_ledger: "⚙️ → 💸: Financial audit trail shared with Invoice & Ledger AI",
      it_operations: "⚙️ → 🖥️: System health metrics shared with IT Operations AI",
      fp_and_a: "⚙️ → 📈: Operational metrics fed to FP&A AI for financial analysis",
    },
  },
  voice_receptionist: {
    type: "voice_receptionist",
    name: "Voice AI Receptionist",
    icon: "📞",
    chainsWith: ["customer_success", "support_agent", "audit_logger", "sales_outreach"],
    chainDescriptions: {
      customer_success: "📞 → 🌟: Caller sentiment data shared with Customer Success AI",
      support_agent: "📞 → 🎧: Support calls transferred to AI Customer Support Agent for follow-up",
      audit_logger: "📞 → ⚙️: Call metrics logged to Operations Audit Logger",
      sales_outreach: "📞 → 🚀: Sales inquiries forwarded to Sales Outreach Coordinator AI",
    },
  },
  support_agent: {
    type: "support_agent",
    name: "AI Customer Support Agent",
    icon: "🎧",
    chainsWith: ["knowledge_assistant", "customer_success", "audit_logger", "sales_outreach"],
    chainDescriptions: {
      knowledge_assistant: "🎧 → 🧠: Support queries searched against Knowledge Assistant's knowledge base",
      customer_success: "🎧 → 🌟: Support interactions data fed to Customer Success AI for health scoring",
      audit_logger: "🎧 → ⚙️: Support metrics logged to Operations Audit Logger",
      sales_outreach: "🎧 → 🚀: Upsell opportunities identified and forwarded to Sales Outreach AI",
    },
  },
  knowledge_assistant: {
    type: "knowledge_assistant",
    name: "Internal Knowledge Assistant",
    icon: "🧠",
    chainsWith: ["support_agent", "hr_compliance", "document_intake", "all"],
    chainDescriptions: {
      support_agent: "🧠 → 🎧: Knowledge base powers AI Customer Support Agent responses",
      hr_compliance: "🧠 → 👤: Policy documents accessible to HR Compliance AI",
      document_intake: "🧠 → 📄: New documents auto-indexed into knowledge base by Document AI",
    },
  },
  inventory_management: {
    type: "inventory_management",
    name: "Inventory Management AI",
    icon: "📦",
    chainsWith: ["procurement_vendor", "dispatch_logistics", "audit_logger", "fp_and_a", "invoice_ledger"],
    chainDescriptions: {
      procurement_vendor: "📦 → 🏗️: Low-stock alerts trigger purchase orders via Procurement Vendor AI",
      dispatch_logistics: "📦 → 📦: Inventory levels shared with Dispatch Logistics for shipment planning",
      audit_logger: "📦 → ⚙️: Inventory metrics logged to Operations Audit Logger",
      fp_and_a: "📦 → 📈: Inventory valuation data fed to FP&A AI",
      invoice_ledger: "📦 → 💸: Receiving reports trigger invoice matching via Invoice & Ledger AI",
    },
  },
  contract_management: {
    type: "contract_management",
    name: "Contract Management AI",
    icon: "📋",
    chainsWith: ["document_intake", "audit_logger", "procurement_vendor", "fp_and_a"],
    chainDescriptions: {
      document_intake: "📋 → 📄: Contracts pre-processed by Document AI for OCR and classification",
      audit_logger: "📋 → ⚙️: Contract compliance metrics logged to Operations Audit Logger",
      procurement_vendor: "📋 → 🏗️: Contract terms shared with Procurement Vendor AI for vendor management",
      fp_and_a: "📋 → 📈: Contract financial data fed to FP&A AI for budgeting",
    },
  },
  customer_success: {
    type: "customer_success",
    name: "Customer Success / Retention AI",
    icon: "🌟",
    chainsWith: ["support_agent", "sales_outreach", "audit_logger", "marketing_social"],
    chainDescriptions: {
      support_agent: "🌟 → 🎧: At-risk customers trigger enhanced support via AI Support Agent",
      sales_outreach: "🌟 → 🚀: Renewal opportunities forwarded to Sales Outreach Coordinator AI",
      audit_logger: "🌟 → ⚙️: Customer health metrics logged to Operations Audit Logger",
      marketing_social: "🌟 → 📱: Churn insights shared with Marketing Social AI for re-engagement",
    },
  },
  project_management: {
    type: "project_management",
    name: "Project Management AI",
    icon: "📊",
    chainsWith: ["audit_logger", "it_operations", "customer_success", "support_agent"],
    chainDescriptions: {
      audit_logger: "📊 → ⚙️: Project performance metrics logged to Operations Audit Logger",
      it_operations: "📊 → 🖥️: Deployment tasks coordinated with IT Operations AI",
      customer_success: "📊 → 🌟: Project completion triggers customer health update via Customer Success AI",
      support_agent: "📊 → 🎧: Project issues escalated to AI Customer Support Agent",
    },
  },
  procurement_vendor: {
    type: "procurement_vendor",
    name: "Procurement & Vendor Management AI",
    icon: "🏗️",
    chainsWith: ["inventory_management", "contract_management", "invoice_ledger", "audit_logger"],
    chainDescriptions: {
      inventory_management: "🏗️ → 📦: Purchase orders fulfill Inventory Management AI reorder requests",
      contract_management: "🏗️ → 📋: Vendor terms verified against Contract Management AI records",
      invoice_ledger: "🏗️ → 💸: POs matched to invoices via Invoice & Ledger AI",
      audit_logger: "🏗️ → ⚙️: Procurement metrics logged to Operations Audit Logger",
    },
  },
  it_operations: {
    type: "it_operations",
    name: "IT Operations & DevOps AI",
    icon: "🖥️",
    chainsWith: ["audit_logger", "support_agent", "knowledge_assistant", "project_management"],
    chainDescriptions: {
      audit_logger: "🖥️ → ⚙️: Infrastructure metrics logged to Operations Audit Logger",
      support_agent: "🖥️ → 🎧: Technical issues escalated to AI Customer Support Agent",
      knowledge_assistant: "🖥️ → 🧠: Runbooks and docs indexed in Knowledge Assistant",
      project_management: "🖥️ → 📊: Deployments tracked in Project Management AI",
    },
  },
  fp_and_a: {
    type: "fp_and_a",
    name: "Financial Planning & FP&A AI",
    icon: "📈",
    chainsWith: ["invoice_ledger", "audit_logger", "procurement_vendor", "inventory_management"],
    chainDescriptions: {
      invoice_ledger: "📈 → 💸: Financial forecasts informed by Invoice & Ledger AI transaction data",
      audit_logger: "📈 → ⚙️: Financial metrics cross-referenced with Operations Audit Logger",
      procurement_vendor: "📈 → 🏗️: Budget data shared with Procurement Vendor AI for spend control",
      inventory_management: "📈 → 📦: Inventory carrying costs analyzed with Inventory Management AI",
    },
  },
  marketing_social: {
    type: "marketing_social",
    name: "Marketing & Social Media AI",
    icon: "📱",
    chainsWith: ["sales_outreach", "customer_success", "audit_logger", "support_agent"],
    chainDescriptions: {
      sales_outreach: "📱 → 🚀: Content performance insights shared with Sales Outreach Coordinator AI",
      customer_success: "📱 → 🌟: Engagement data fed to Customer Success AI",
      audit_logger: "📱 → ⚙️: Marketing metrics logged to Operations Audit Logger",
      support_agent: "📱 → 🎧: Social media support inquiries forwarded to AI Support Agent",
    },
  },
};

/**
 * Get the chain info for a specific agent type
 */
export function getAgentChainInfo(agentType: string): AgentChainInfo | null {
  return AGENT_CHAIN_MAP[agentType] || null;
}

/**
 * Get a human-readable list of chain partners for marketplace display
 */
export function getAgentChainPartners(agentType: string): string[] {
  const info = AGENT_CHAIN_MAP[agentType];
  if (!info) return [];
  return info.chainsWith
    .filter((t) => t !== "all")
    .map((t) => {
      const partnerInfo = AGENT_CHAIN_MAP[t];
      return partnerInfo ? partnerInfo.name : t;
    });
}

/**
 * Get chain description between two agent types
 */
export function getChainDescription(agentType: string, partnerType: string): string | null {
  const info = AGENT_CHAIN_MAP[agentType];
  if (!info) return null;
  if (info.chainsWith.includes("all")) return "⚙️ Can integrate with all agents as a universal logger";
  return info.chainDescriptions[partnerType] || null;
}

/**
 * Get all chain relationships across all agents
 */
export function getAllChainRelationships(): Array<{ from: string; to: string; description: string }> {
  const relationships: Array<{ from: string; to: string; description: string }> = [];
  for (const [agentType, info] of Object.entries(AGENT_CHAIN_MAP)) {
    for (const partnerType of info.chainsWith) {
      if (partnerType === "all") continue;
      const desc = info.chainDescriptions[partnerType];
      if (desc) {
        relationships.push({ from: agentType, to: partnerType, description: desc });
      }
    }
  }
  return relationships;
}
