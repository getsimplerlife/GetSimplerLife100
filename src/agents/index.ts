/**
 * AI Agent Execution Runtime — Main Entry Point
 *
 * Imports and registers all agent types, then exports the public API.
 */

// Import agent types (they self-register on import)
import "./employees/documentIntake";
import "./employees/healthcareIntake";
import "./employees/invoiceLedger";
import "./employees/salesOutreach";
import "./employees/hrCompliance";
import "./employees/dispatchLogistics";
import "./employees/auditLogger";

// Re-export public API
export { runAgent, deployAgent, getAgentStatus, pauseAgent, resumeAgent, registerAgentType, listAgentTypes } from "./runtime";
export { registry } from "./tools";
export type { RunAgentInput } from "./runtime";
export type { AgentInstance, ExecutionResult, ExecutionStep, AgentConfig, ToolContext, ToolResult, ToolDefinition } from "./schema";
export { getAgentInstance, listAgentInstances, getAgentExecution, listAgentExecutions } from "./schema";