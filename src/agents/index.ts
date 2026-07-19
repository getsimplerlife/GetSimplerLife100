/**
 * AI Agent Execution Runtime — Main Entry Point
 *
 * Imports and registers all agent types, then exports the public API.
 */

// Import agent types (they self-register on import)
import "./employees/documentIntake";
import "./employees/contractManagement";
import "./employees/customerSuccess";
import "./employees/inventoryManagement";
import "./employees/projectManagement";
import "./employees/procurementVendor";
import "./employees/itOperations";
import "./employees/fpAndA";
import "./employees/marketingSocial";

// Re-export public API
export { runAgent, deployAgent, getAgentStatus, pauseAgent, resumeAgent, registerAgentType, listAgentTypes } from "./runtime";
export { registry } from "./tools";
export type { RunAgentInput } from "./runtime";
export type { AgentInstance, ExecutionResult, ExecutionStep, AgentConfig, ToolContext, ToolResult, ToolDefinition } from "./schema";
export { getAgentInstance, listAgentInstances, getAgentExecution, listAgentExecutions } from "./schema";