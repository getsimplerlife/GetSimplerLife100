import { createJiraClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const jiraActions: ActionDefinition[] = [
  { name: "searchJiraIssues", description: "Search Jira issues via JQL", inputSchema: { type: "object", properties: { jql: { type: "string" }, maxResults: { type: "number" } }, required: ["jql"] }, handler: async (config, params) => { const c = createJiraClient(config); return c.searchIssues(params.jql, params.maxResults); } },
  { name: "createJiraIssue", description: "Create Jira issue", inputSchema: { type: "object", properties: { project: { type: "object" }, summary: { type: "string" }, issuetype: { type: "object" }, description: { type: "string" } }, required: ["project", "summary", "issuetype"] }, handler: async (config, params) => { const c = createJiraClient(config); return c.createIssue(params); } },
  { name: "listJiraProjects", description: "List Jira projects", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createJiraClient(config); return c.listProjects(); } },
  { name: "jiraHealthCheck", description: "Check Jira connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createJiraClient(config); return { healthy: await c.healthCheck(), provider: "jira" }; } },
];