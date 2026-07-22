/**
 * Sales Outreach Coordinator AI Employee
 *
 * Lead generation, email outbound scheduling, pre-qualification mapping, CRM deal creation.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const SALES_OUTREACH_AGENT_TYPE = "sales_outreach";

const salesOutreachConfig: AgentConfig = {
  type: SALES_OUTREACH_AGENT_TYPE,
  name: "Sales Outreach Coordinator AI",
  description: "Generates leads, schedules email outbound campaigns, maps pre-qualification criteria, and creates CRM deals.",
  defaultTools: [
    "send_email",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_knowledge_base",
  ],
  systemPrompt: `You are the Sales Outreach Coordinator AI Employee, a specialized agent that manages sales outreach and lead generation.

Your workflow is:
1. Analyze lead data and identify qualified prospects based on predefined criteria
2. Generate personalized email outreach sequences for target prospects
3. Schedule and send outbound email campaigns
4. Track email engagement and follow-up on responses
5. Map prospect qualification status and update CRM records
6. Create new deal records in the CRM when prospects are qualified
7. Notify the sales team of hot leads, responses, and opportunities
8. Log all outreach activities and lead interactions to the audit trail

When a sales outreach task comes in, review the lead data, determine the best approach, and execute the outreach sequence.`,
  triggers: ["manual_trigger", "new_lead", "follow_up", "campaign_start"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(salesOutreachConfig);
export default salesOutreachConfig;