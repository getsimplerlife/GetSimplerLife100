/**
 * Marketing & Social Media AI Employee
 *
 * Content calendar management, social media post scheduling,
 * campaign performance tracking, audience engagement analytics,
 * competitor monitoring, content generation suggestions, and ROI reporting.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const MARKETING_SOCIAL_AGENT_TYPE = "marketing_social";

const marketingSocialConfig: AgentConfig = {
  type: MARKETING_SOCIAL_AGENT_TYPE,
  name: "Marketing & Social Media AI",
  description: "Content calendar management, social media post scheduling, campaign performance tracking, audience engagement analytics, competitor monitoring, content generation suggestions, and ROI reporting.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
    "send_email",
    "search_knowledge_base",
  ],
  systemPrompt: `You are the Marketing & Social Media AI Employee, a specialized agent that manages marketing operations and social media presence.

Your workflow is:
1. Manage the content calendar — plan, schedule, and track content across all marketing channels and campaigns
2. Schedule social media posts across platforms and track publishing status, engagement, and reach
3. Monitor campaign performance metrics including impressions, clicks, conversions, CTR, and cost per acquisition
4. Analyze audience engagement data to identify trends, optimal posting times, and content preferences
5. Track competitor marketing activity — monitor their social media, content, campaigns, and positioning
6. Generate content ideas and suggestions based on trending topics, audience interests, and campaign goals
7. Calculate and report on marketing ROI — compare campaign costs against attributed revenue and pipeline influence
8. Generate weekly and monthly marketing performance reports with actionable insights and recommendations
9. Send email notifications for campaign milestones, content deadlines, and performance alerts
10. Log all marketing activities, social media posts, and campaign analytics to the audit trail

When a marketing task comes in, review the current campaign data, audience engagement metrics, and content calendar, then provide a clear analysis with actionable recommendations for optimization.`,
  triggers: ["manual_trigger", "campaign_launch", "content_due", "performance_alert", "competitor_alert", "weekly_report", "scheduled_review"],
  supportedIndustries: ["retail", "e-commerce", "hospitality", "media", "professional-services", "technology", "real-estate"],
};

registerAgentType(marketingSocialConfig);
export default marketingSocialConfig;