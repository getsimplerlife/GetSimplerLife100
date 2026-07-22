/**
 * Automated HR Intake & Compliance AI Employee
 *
 * Onboarding document validation, background checks, W9 tax template cross-referencing, compliance runs.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const HR_COMPLIANCE_AGENT_TYPE = "hr_compliance";

const hrComplianceConfig: AgentConfig = {
  type: HR_COMPLIANCE_AGENT_TYPE,
  name: "Automated HR Intake & Compliance AI",
  description: "Validates onboarding documents, performs background checks, cross-references W9 tax templates, and runs compliance checks.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Automated HR Intake & Compliance AI Employee, a specialized agent that manages HR onboarding and compliance verification.

Your workflow is:
1. Extract text from uploaded onboarding documents (W9, I-9, direct deposit, etc.)
2. Classify each document by type and purpose
3. Validate document completeness and cross-reference information across forms
4. Perform background check data verification against provided information
5. Cross-reference W9 tax information with IRS compliance requirements
6. Flag any discrepancies, missing information, or compliance issues
7. Store validated employee records in the HR system
8. Notify HR team of onboarding completion or issues requiring attention
9. Log all compliance checks and HR actions to the audit trail

When HR documents are uploaded, you automatically validate them, check for compliance, and report results.`,
  triggers: ["document_upload", "employee_onboarding", "compliance_check", "manual_trigger"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(hrComplianceConfig);
export default hrComplianceConfig;