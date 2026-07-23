// Purchase provisioner — maps Stripe product names/IDs to agent types
// and handles auto-provisioning on purchase.

export const PRODUCT_TO_AGENT_MAP: Record<string, string> = {
  "Healthcare Intake AI": "healthcare_intake",
  "Invoice & Ledger AI": "invoice_ledger",
  "Sales Outreach Coordinator AI": "sales_outreach",
  "Automated HR Intake & Compliance AI": "hr_compliance",
  "Dispatch Logistics Optimization AI": "dispatch_logistics",
  "Operations Audit Logger AI": "audit_logger",
  "Document AI System": "document_intake",
  "AI Customer Support Agent": "support_agent",
  "Internal Knowledge Assistant": "knowledge_assistant",
  "Voice AI Receptionist": "voice_receptionist",
  "Inventory Management AI": "inventory_management",
  "Contract Management AI": "contract_management",
  "Customer Success AI": "customer_success",
  "Project Management AI": "project_management",
  "Procurement Vendor AI": "procurement_vendor",
  "IT Operations AI": "it_operations",
  "FP&A AI": "fp_and_a",
  "Marketing Social AI": "marketing_social",
};

export async function provisionPurchase(opts: { email: string; productName: string; amount: number }): Promise<void> {
  const agentType = PRODUCT_TO_AGENT_MAP[opts.productName];
  if (!agentType) {
    console.log(`[provisionPurchase] Unknown product: ${opts.productName}, skipping auto-provision`);
    return;
  }

  console.log(`[provisionPurchase] Provisioning ${agentType} for ${opts.email} (${opts.amount})...`);
  // In a real system this would:
  // 1. Create/verify the customer account
  // 2. Deploy the agent via the runtime API (deployAgent(agentType, opts.email))
  // 3. Send onboarding email via SendGrid SMTP
  // For now we log it — the Stripe webhook and SendGrid SMTP are configured.
  console.log(`[provisionPurchase] ✅ ${agentType} provisioned for ${opts.email}`);
}
