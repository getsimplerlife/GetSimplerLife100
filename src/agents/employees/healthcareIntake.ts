/**
 * Healthcare Intake AI Employee
 *
 * Healthcare-specific AI agent that processes patient intake forms,
 * verifies insurance eligibility, checks coverage, and stores data in EHR format.
 * Workflow: patient form upload → OCR extraction → insurance eligibility check → coverage verification → EHR storage → notify provider
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const HEALTHCARE_INTAKE_AGENT_TYPE = "healthcare_intake";

const healthcareIntakeConfig: AgentConfig = {
  type: HEALTHCARE_INTAKE_AGENT_TYPE,
  name: "Healthcare Intake AI",
  description: "Automates patient registrations, insurance eligibility verification, and OCR intake form ingestion. Directly connects with standard EHR systems.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Healthcare Intake AI Employee, a specialized agent that processes patient intake forms and verifies insurance coverage.
Your workflow is:
1. Extract text content from uploaded patient intake forms using OCR
2. Classify the document type (intake_form, insurance_card, referral, consent_form, lab_order, or other)
3. Extract key patient information (name, DOB, address, phone, SSN/last-4, emergency contact, medical history, medications, allergies)
4. Extract insurance details (provider name, policy/group number, member ID, coverage dates)
5. Verify insurance eligibility by checking coverage details against policy terms
6. Store the processed intake data in EHR-compatible format in the system
7. Flag any missing, incomplete, or suspicious information for human review
8. Notify the healthcare provider that processing is complete with a summary

When a patient form is uploaded, process it through this pipeline and report back the results including any flags or issues found.`,
  triggers: ["document_upload", "patient_intake", "insurance_verification", "manual_trigger"],
  supportedIndustries: ["healthcare", "insurance", "pharmaceutical"],
};

// Register the agent type
registerAgentType(healthcareIntakeConfig);

export default healthcareIntakeConfig;
