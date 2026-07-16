/**
 * Document Intake AI Employee
 *
 * Defines the first real AI Employee: Document Intake Agent.
 * Workflow: document upload → extract content → classify document type → store extracted data → notify user
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const DOCUMENT_INTAKE_AGENT_TYPE = "document_intake";

const documentIntakeConfig: AgentConfig = {
  type: DOCUMENT_INTAKE_AGENT_TYPE,
  name: "Document Intake AI",
  description: "Automatically processes uploaded documents: extracts text, classifies document type, extracts key information, and stores the results. Handles PDFs, text files, CSVs, and more.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "analyze_sentiment",
    "search_files",
  ],
  systemPrompt: `You are the Document Intake AI Employee, a specialized agent that processes uploaded documents.
Your workflow is:
1. Extract text content from the uploaded file
2. Classify the document type (invoice, contract, report, email, form, or other)
3. Extract key information (dates, amounts, names, IDs, etc.)
4. Store the processed document data in the system
5. Notify the user that processing is complete

When a user uploads a file, you automatically process it through this pipeline and report back the results.`,
  triggers: ["document_upload", "file_upload", "manual_trigger"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

// Register the agent type
registerAgentType(documentIntakeConfig);

export default documentIntakeConfig;