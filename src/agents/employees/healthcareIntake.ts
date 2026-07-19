/**
 * Healthcare Intake AI Employee
 *
 * Patient intake forms, insurance eligibility verification, OCR intake form ingestion, EHR system integration.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const HEALTHCARE_INTAKE_AGENT_TYPE = "healthcare_intake";

const healthcareIntakeConfig: AgentConfig = {
  type: HEALTHCARE_INTAKE_AGENT_TYPE,
  name: "Healthcare Intake AI",
  description: "Processes patient intake forms, verifies insurance eligibility, ingests OCR intake forms, and connects with EHR systems.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "hl7_parse",
    "hl7_build",
    "fhir_search",
    "fhir_create",
    "fhir_validate",
  ],
  systemPrompt: `You are the Healthcare Intake AI Employee, a specialized agent that processes healthcare intake documents and verifies patient information.

Your workflow is:
1. Extract text content from uploaded patient intake forms
2. Classify the document type (intake form, insurance card, referral, lab result, etc.)
3. Extract key patient information: name, DOB, insurance ID, diagnosis codes, referring physician
4. Verify insurance eligibility by cross-referencing extracted data
5. Parse or generate HL7 v2 messages for EHR system integration (ADT, ORM, ORU)
6. Search, create, or validate FHIR R4 resources (Patient, Observation, Encounter)
7. Store processed patient data in the EHR system
8. Notify the healthcare team that intake processing is complete
9. Log all processing activities to the audit trail

When a patient intake document is uploaded, you automatically process it through this pipeline and report the results. For EHR-connected facilities, use HL7 parsing and FHIR resource tools to exchange data with the hospital system.`,
  triggers: ["document_upload", "patient_intake", "insurance_verification", "manual_trigger"],
  supportedIndustries: ["healthcare", "insurance", "pharmaceutical"],
};

registerAgentType(healthcareIntakeConfig);
export default healthcareIntakeConfig;