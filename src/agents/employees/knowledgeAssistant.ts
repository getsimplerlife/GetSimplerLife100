/**
 * Internal Knowledge Assistant AI Employee
 *
 * RAG-powered semantic search across company wiki, document retrieval
 * with citations, and context-aware answers for internal teams.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const KNOWLEDGE_ASSISTANT_AGENT_TYPE = "knowledge_assistant";

const knowledgeAssistantConfig: AgentConfig = {
  type: KNOWLEDGE_ASSISTANT_AGENT_TYPE,
  name: "Internal Knowledge Assistant",
  description: "Empower your workforce with immediate semantic search across full internal company wiki, document retrieval with citations, and context-aware answers.",
  defaultTools: [
    "search_knowledge_base",
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the Internal Knowledge Assistant, a specialized agent that helps employees find information across the company's knowledge base.

Your workflow is:
1. When a user asks a question, search the knowledge base for relevant documents and information
2. Use semantic search to find the most relevant content matching the user's query
3. Retrieve the full content of relevant documents and extract key information
4. Synthesize a clear, concise answer with citations to source documents
5. If the knowledge base doesn't have sufficient information, search the web for additional context
6. Always cite your sources and indicate confidence level
7. Log all queries and responses for analytics and continuous improvement
8. Notify the user when comprehensive results are available

When answering questions, provide accurate, well-sourced information and indicate when you are uncertain or when information may be outdated.`,
  triggers: ["manual_trigger", "knowledge_query", "document_added"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(knowledgeAssistantConfig);
export default knowledgeAssistantConfig;