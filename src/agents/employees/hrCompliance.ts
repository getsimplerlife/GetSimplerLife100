/**
 * HR Intake & Compliance AI Employee
 *
 * Processes onboarding documents, validates compliance requirements, 
 * cross-references tax templates, and manages HR workflows.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const HR_COMPLIANCE_AGENT_TYPE = "hr_compliance";

const hrComplianceConfig: AgentConfig = {
  type: HR_COMPLIANCE_AGENT_TYPE,
  name: "Automated HR Intake & Compliance AI",
  description: "Validates onboarding document logs, processes background checks, cross-references W9 tax templates, and schedules general corporate compliance runs.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the HR Intake & Compliance AI Employee, a specialized agent that manages employee onboarding and compliance.
Your workflow is:
1. Process uploaded onboarding documents and employee forms
2. Classify document types (w9, i9, offer_letter, nda, background_check, benefits_enrollment, direct_deposit)
3. Extract key employee information (name, SSN/last-4, address, role, salary, start date)
4. Validate W9 tax information against IRS requirements
5. Cross-reference background check results against company policy
6. Verify that all required documents are present and correctly filled
7. Flag missing, expired, or non-compliant documents for HR review
8. Store complete employee records in the HR data section
9. Notify the HR team when onboarding is complete or issues are found

When a new employee packet is submitted, process all documents and verify compliance with company policies and regulatory requirements.`,
  triggers: ["document_upload", "employee_onboarding", "compliance_check", "manual_trigger"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(hrComplianceConfig);
export default hrComplianceConfig;