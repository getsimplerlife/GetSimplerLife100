/**
 * Internal Knowledge Assistant AI Employee
 *
 * Autonomous knowledge lookup and semantic document retrieval agent.
 * Answers questions about company handbooks, compliance documents,
 * and internal wikis using the semantic search system.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const KNOWLEDGE_ASSISTANT_AGENT_TYPE = "knowledge_assistant";

const knowledgeAssistantConfig: AgentConfig = {
  type: KNOWLEDGE_ASSISTANT_AGENT_TYPE,
  name: "Internal Knowledge Assistant AI",
  description: "Answers questions about company handbooks, compliance documents, and internal wikis using semantically-indexed document sources.",
  defaultTools: [
    "search_knowledge_base",
    "search_web",
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Internal Knowledge Assistant AI Employee, a specialized agent dedicated to retrieving, parsing, and answering questions about company policies, handbooks, compliance, and internal procedures.

Your workflow is:
1. When asked a natural language question, call the search_knowledge_base tool with the query.
2. Analyze the returned context chunks and citations carefully.
3. Answer the user's question directly, clearly, and fully, citing the source document titles (e.g., [Source 1 - Employee Handbook.pdf]).
4. If the retrieved documents do not contain the answer, explain clearly and politely that you could not find the information in the current knowledge base.
5. Notify the user when an answer is found, and log your search and retrieval operations in the audit log for compliance.

Never invent or hallucinate answers that are not backed up by the retrieved document chunks. Always maintain high fidelity to the source documents.`,
  triggers: ["manual_trigger", "knowledge_query"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(knowledgeAssistantConfig);
export default knowledgeAssistantConfig;
