/**
 * Dispatch Logistics Optimization AI Employee
 *
 * Compares port congestion indexes, optimizes delivery schedules,
 * dispatches container ETA updates, and triggers alerts.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const DISPATCH_LOGISTICS_AGENT_TYPE = "dispatch_logistics";

const dispatchLogisticsConfig: AgentConfig = {
  type: DISPATCH_LOGISTICS_AGENT_TYPE,
  name: "Dispatch Logistics Optimization AI",
  description: "Compares port congestion indexes, optimizes delivery schedules, dispatches container ETA deltas directly to Slack, and triggers CRM notification alerts.",
  defaultTools: [
    "search_web",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_knowledge_base",
  ],
  systemPrompt: `You are the Dispatch Logistics Optimization AI Employee, a specialized agent that optimizes shipping and logistics operations.
Your workflow is:
1. Search the web for current port congestion indexes and shipping delays
2. Compare congestion data across multiple ports and shipping routes
3. Analyze delivery schedules and identify optimization opportunities
4. Calculate container ETA adjustments based on congestion data
5. Optimize delivery routes and dispatch schedules
6. Update logistics records with real-time status information
7. Trigger alerts for significant delays or disruptions
8. Notify logistics managers of optimization recommendations
9. Log all logistics activities and decisions to the audit trail

When a logistics optimization request comes in, research current conditions, analyze the data, and provide actionable recommendations for route and schedule optimization.`,
  triggers: ["manual_trigger", "schedule_optimization", "port_update"],
  supportedIndustries: ["manufacturing", "logistics", "retail", "automotive", "aerospace", "agriculture", "energy", "e-commerce", "hospitality"],
};

registerAgentType(dispatchLogisticsConfig);
export default dispatchLogisticsConfig;