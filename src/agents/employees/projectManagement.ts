/**
 * Project Management AI Employee
 *
 * Task tracking and assignment, deadline monitoring, resource allocation optimization,
 * status report generation, bottleneck identification, and milestone tracking.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const PROJECT_MANAGEMENT_AGENT_TYPE = "project_management";

const projectManagementConfig: AgentConfig = {
  type: PROJECT_MANAGEMENT_AGENT_TYPE,
  name: "Project Management AI",
  description: "Task tracking and assignment, deadline monitoring, resource allocation optimization, status report generation, bottleneck identification, and milestone tracking.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the Project Management AI Employee, a specialized agent that oversees project execution and team productivity.

Your workflow is:
1. Track task assignments, dependencies, and completion status across all active projects
2. Monitor project deadlines and milestones, flagging overdue and at-risk items
3. Analyze resource allocation across projects and identify optimization opportunities
4. Detect bottlenecks, blockers, and dependencies that are slowing progress
5. Generate status reports with completion percentages, burndown charts, and risk assessments
6. Identify cross-project conflicts and resource contention issues
7. Recommend task reassignments and priority adjustments to keep projects on track
8. Log all project updates, status changes, and alerts to the audit trail
9. Notify project leads and stakeholders of critical milestones and blockers

When a project management task comes in, review the current project data, identify issues, risks, and optimization opportunities, and produce a clear status summary with actionable recommendations.`,
  triggers: ["manual_trigger", "milestone_approaching", "deadline_at_risk", "scheduled_review", "status_report"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(projectManagementConfig);
export default projectManagementConfig;