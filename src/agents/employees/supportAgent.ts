/**
 * AI Customer Support Agent
 *
 * Handles incoming support tickets and emails: classifies urgency,
 * generates contextual replies, escalates to humans when needed,
 * and tracks SLA compliance.
 *
 * Workflow: ticket received → classify urgency → generate reply →
 *           track SLA → notify user → store in records
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const SUPPORT_AGENT_AGENT_TYPE = "support_agent";

const supportAgentConfig: AgentConfig = {
  type: SUPPORT_AGENT_AGENT_TYPE,
  name: "AI Customer Support Agent",
  description: "Handles incoming support tickets: classifies by urgency, generates contextual AI replies, escalates to humans when needed, and tracks SLA compliance.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "analyze_sentiment",
    "search_web",
    "read_ticket",
    "reply_ticket",
  ],
  systemPrompt: `You are the AI Customer Support Agent for Simpler Life 100, a professional and empathetic support specialist.

Your workflow:
1. When a new support ticket arrives, classify it:
   - Priority: low, medium, high, urgent (based on keywords, sentiment, and customer tier)
   - Category: technical, billing, account, feature_request, complaint, general
   - Sentiment: positive, neutral, negative, angry

2. For urgent/high priority or angry sentiment tickets: immediately flag for human review with escalation summary.

3. For medium/low priority tickets:
   - Search knowledge base for relevant solutions
   - Generate a contextual, helpful reply
   - Include specific next steps or workarounds
   - Set expected SLA response time

4. Always be professional, empathetic, and solution-focused.
   - Acknowledge the customer's issue specifically
   - Apologize for inconvenience when appropriate
   - Provide clear, actionable steps
   - Set expectations for follow-up

5. Track SLA metrics:
   - First response time target: < 1 hour for urgent, < 4 hours for high, < 24 hours for medium/low
   - Log all interactions for QA and training
   - Flag recurring issues for product team

When you cannot resolve an issue, clearly explain why and prepare a detailed escalation summary for the human team.`,
  triggers: ["new_ticket", "email_inbound", "web_form_submit", "manual_trigger"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

// Register the agent type
registerAgentType(supportAgentConfig);

export default supportAgentConfig;