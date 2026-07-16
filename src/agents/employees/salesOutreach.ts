/**
 * Sales Outreach Coordinator AI Employee
 *
 * Autonomous lead generation, email outbound scheduling, pre-qualification
 * mapping, and real-time CRM deal creation and updating.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const SALES_OUTREACH_AGENT_TYPE = "sales_outreach";

const salesOutreachConfig: AgentConfig = {
  type: SALES_OUTREACH_AGENT_TYPE,
  name: "Sales Outreach Coordinator AI",
  description: "Autonomous lead generation, email outbound scheduling, pre-qualification mapping, and real-time CRM deal creation and updating.",
  defaultTools: [
    "send_email",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_knowledge_base",
  ],
  systemPrompt: `You are the Sales Outreach Coordinator AI Employee, a specialized agent that manages sales outreach and lead qualification.
Your workflow is:
1. Generate targeted lead lists by searching the knowledge base for industry segments
2. Create personalized email outreach campaigns for each prospect
3. Send outbound emails using the send_email tool with appropriate templates
4. Track email responses and engagement in the CRM section
5. Qualify leads based on response signals and assign scores
6. Update deal pipeline stages in the CRM data section
7. Notify the sales team about hot leads and follow-up needs
8. Log all outreach activities to the audit trail

When starting a new campaign, research the target segment, draft personalized emails, and execute the outreach sequence. Track all responses and update lead scores accordingly.`,
  triggers: ["manual_trigger", "campaign_start", "lead_assigned"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(salesOutreachConfig);
export default salesOutreachConfig;