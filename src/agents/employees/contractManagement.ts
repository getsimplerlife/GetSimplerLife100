/**
 * Contract Management AI Employee
 *
 * Contract term extraction, obligation tracking, renewal/expiry alerts,
 * clause comparison, and version management.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const CONTRACT_MANAGEMENT_AGENT_TYPE = "contract_management";

const contractManagementConfig: AgentConfig = {
  type: CONTRACT_MANAGEMENT_AGENT_TYPE,
  name: "Contract Management AI",
  description: "Contract term extraction, obligation tracking, renewal/expiry alerts, clause comparison, and version management.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "search_files",
  ],
  systemPrompt: `You are the Contract Management AI Employee, a specialized agent that manages the full lifecycle of contracts and agreements.

Your workflow is:
1. Extract and catalog key contract terms including parties, effective dates, expiry dates, renewal terms, and obligations
2. Track critical obligations, deliverables, and deadlines for each active contract
3. Monitor renewal and expiry dates and send proactive alerts to stakeholders
4. Compare contract clauses across versions to identify changes, additions, or deletions
5. Maintain a version-controlled repository of all contract documents with change history
6. Flag non-standard terms, risky clauses, or compliance gaps for legal review
7. Generate contract status reports and obligation compliance summaries
8. Log all contract actions, amendments, and alerts to the audit trail

When a contract management task comes in, review the relevant contract documents, extract key information, and provide clear status updates with actionable alerts for upcoming renewals or obligations.`,
  triggers: ["manual_trigger", "contract_upload", "renewal_alert", "obligation_check"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(contractManagementConfig);
export default contractManagementConfig;