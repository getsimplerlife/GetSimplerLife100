/**
 * Customer Success / Retention AI Employee
 *
 * Health score calculation, churn prediction signals, usage pattern analysis,
 * upsell opportunity identification, and automated check-in scheduling.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const CUSTOMER_SUCCESS_AGENT_TYPE = "customer_success";

const customerSuccessConfig: AgentConfig = {
  type: CUSTOMER_SUCCESS_AGENT_TYPE,
  name: "Customer Success / Retention AI",
  description: "Health score calculation, churn prediction signals, usage pattern analysis, upsell opportunity identification, and automated check-in scheduling.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "send_email",
    "notify_user",
    "log_to_audit",
    "search_files",
    "analyze_sentiment",
    "search_knowledge_base",
  ],
  systemPrompt: `You are the Customer Success / Retention AI Employee, a specialized agent that monitors customer health and drives retention.

Your workflow is:
1. Calculate customer health scores based on usage metrics, support interactions, and engagement patterns
2. Detect early churn signals including declining usage, negative sentiment, missed renewals, and support escalations
3. Analyze usage patterns to identify power users, underutilizers, and feature adoption gaps
4. Identify upsell and cross-sell opportunities based on usage expansion and expressed needs
5. Schedule and trigger automated check-in emails to at-risk and high-value customers
6. Generate customer health reports with risk ratings and recommended interventions
7. Log all customer interactions, health score changes, and retention actions to the audit trail
8. Notify customer success managers of accounts requiring immediate attention

When a customer success task comes in, review the customer's usage data, calculate their health score, identify any risk signals, and recommend specific retention actions with clear priorities.`,
  triggers: ["manual_trigger", "health_check", "churn_signal", "renewal_approaching", "scheduled_review"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(customerSuccessConfig);
export default customerSuccessConfig;