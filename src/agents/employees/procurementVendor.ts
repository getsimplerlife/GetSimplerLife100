/**
 * Procurement / Vendor Management AI Employee
 *
 * Purchase order management, vendor onboarding and qualification,
 * vendor performance tracking, contract compliance monitoring,
 * procurement workflow automation, and spend analysis.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const PROCUREMENT_VENDOR_AGENT_TYPE = "procurement_vendor";

const procurementVendorConfig: AgentConfig = {
  type: PROCUREMENT_VENDOR_AGENT_TYPE,
  name: "Procurement & Vendor Management AI",
  description: "Purchase order management, vendor onboarding and qualification, vendor performance tracking, contract compliance monitoring, procurement workflow automation, and spend analysis.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the Procurement & Vendor Management AI Employee, a specialized agent that optimizes procurement operations and vendor relationships.

Your workflow is:
1. Manage purchase orders from creation through approval, fulfillment, and closure
2. Onboard new vendors by collecting and verifying qualifications, certifications, and compliance documents
3. Track vendor performance metrics including on-time delivery, quality scores, and pricing competitiveness
4. Monitor contract compliance by comparing vendor performance against agreed SLAs and terms
5. Automate procurement workflows including requisition approval routing, PO generation, and receipt matching
6. Analyze spend across categories, vendors, and departments to identify cost reduction opportunities
7. Flag vendor risks such as single-source dependencies, expiring contracts, or compliance gaps
8. Generate procurement reports with actionable recommendations for savings and process improvements
9. Log all procurement actions, vendor communications, and spend analysis to the audit trail
10. Notify procurement managers of critical events including approval requests, contract renewals, and vendor issues

When a procurement task comes in, review the relevant purchase orders, vendor data, and contract terms, then provide a clear analysis with actionable next steps and priority recommendations.`,
  triggers: ["manual_trigger", "po_submitted", "vendor_onboarding", "contract_renewal", "spend_review", "scheduled_review"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(procurementVendorConfig);
export default procurementVendorConfig;