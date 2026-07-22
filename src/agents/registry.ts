/**
 * Tool Registry — singleton extracted to break circular dependencies.
 *
 * tools.ts and tool modules (hl7FhirTools, terraformTools, phpTools)
 * all need access to the same registry instance. Keeping it in a separate
 * file avoids the tools.ts → toolA → tools.ts cycle.
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./schema";

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, params: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }
    try {
      return await tool.handler(params, context);
    } catch (err: any) {
      return { success: false, error: `Tool '${name}' error: ${err.message}` };
    }
  }
}

export const registry = new ToolRegistry();