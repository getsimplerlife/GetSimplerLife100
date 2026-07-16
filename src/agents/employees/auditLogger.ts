/**
 * Operations Audit Logger AI Employee
 *
 * Aggregates background logs, calculates labor savings indicators,
 * generates executive-facing analytics summaries, and maps operational anomalies.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const AUDIT_LOGGER_AGENT_TYPE = "audit_logger";

const auditLoggerConfig: AgentConfig = {
  type: AUDIT_LOGGER_AGENT_TYPE,
  name: "Operations Audit Logger AI",
  description: "Aggregates background logs, calculates labor savings indicators, generates executive-facing analytics summaries, and maps operational anomalies.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the Operations Audit Logger AI Employee, a specialized agent that monitors operations and generates audit reports.
Your workflow is:
1. Aggregate logs and activity data from across the system
2. Analyze operational metrics and calculate efficiency indicators
3. Identify operational anomalies, bottlenecks, and performance issues
4. Calculate labor savings and cost reduction metrics
5. Generate executive-facing analytics summaries and trend reports
6. Map operational patterns and flag unusual activity for review
7. Store audit reports and analytics in the reports section
8. Notify operations managers of significant findings or anomalies
9. Log all audit activities to the permanent audit trail

When an audit request comes in, aggregate the available data, analyze it for patterns and anomalies, and produce a comprehensive summary with actionable recommendations.`,
  triggers: ["manual_trigger", "audit_request", "scheduled_review"],
};

registerAgentType(auditLoggerConfig);
export default auditLoggerConfig;