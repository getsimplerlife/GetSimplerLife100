/**
 * IT Operations / DevOps AI Employee
 *
 * Infrastructure monitoring, incident response triage, deployment pipeline tracking,
 * server health checks, log analysis, automated remediation suggestions, and SLA compliance tracking.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const IT_OPERATIONS_AGENT_TYPE = "it_operations";

const itOperationsConfig: AgentConfig = {
  type: IT_OPERATIONS_AGENT_TYPE,
  name: "IT Operations & DevOps AI",
  description: "Infrastructure monitoring, incident response triage, deployment pipeline tracking, server health checks, log analysis, automated remediation suggestions, and SLA compliance tracking.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the IT Operations & DevOps AI Employee, a specialized agent that monitors infrastructure and manages IT operations.

Your workflow is:
1. Monitor infrastructure health including server uptime, resource utilization, and service availability across all environments
2. Triage incidents by priority, impact, and urgency — classify and route to the appropriate response team
3. Track deployment pipeline status from commit through build, test, staging, and production
4. Run server health checks and analyze system metrics to detect anomalies before they become incidents
5. Analyze application and system logs to identify error patterns, root causes, and recurring issues
6. Suggest automated remediation steps for common issues including restarting services, clearing caches, and scaling resources
7. Track SLA compliance for incident response times, resolution times, and uptime commitments
8. Generate daily operational status reports with key metrics, incidents, and trends
9. Log all monitoring events, incidents, and remediation actions to the audit trail
10. Notify IT leadership of critical incidents, SLA breaches, and infrastructure risks

When an IT operations task comes in, review the current system status, analyze recent events and logs, and provide a clear assessment with prioritized remediation recommendations.`,
  triggers: ["manual_trigger", "incident_alert", "deployment_event", "health_check_failure", "sla_breach", "scheduled_review"],
  supportedIndustries: ["technology", "e-commerce", "financial-services", "telecommunications", "healthcare", "media", "professional-services"],
};

registerAgentType(itOperationsConfig);
export default itOperationsConfig;