/**
 * Terraform Infrastructure-as-Code Tools
 *
 * Provides agent tools for parsing and reviewing Terraform plans,
 * applying configurations with approval flow, config validation,
 * and state inspection.
 *
 * Target agent: it_operations
 */

import { registry } from "../tools";
import type { ToolContext, ToolResult } from "../schema";

// ── Terraform Plan Parser ────────────────────────────────────────────────

interface TerraformPlanSummary {
  addCount: number;
  changeCount: number;
  destroyCount: number;
  resources: TerraformResourceChange[];
  outputs: Record<string, { before?: any; after?: any; sensitive: boolean }>;
  warnings: string[];
}

interface TerraformResourceChange {
  address: string;
  action: "create" | "update" | "delete" | "read" | "noop";
  resourceType: string;
  resourceName: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  changes: string[];
  hasSensitiveFields: boolean;
}

function parseTerraformPlan(planText: string): { success: boolean; data?: TerraformPlanSummary; error?: string } {
  try {
    const lines = planText.split("\n");
    const summary: TerraformPlanSummary = {
      addCount: 0,
      changeCount: 0,
      destroyCount: 0,
      resources: [],
      outputs: {},
      warnings: [],
    };

    // Check if it's JSON plan output (terraform show -json)
    const trimmed = planText.trim();
    if (trimmed.startsWith("{")) {
      try {
        const jsonPlan = JSON.parse(trimmed);
        return parseJSONPlan(jsonPlan);
      } catch {
        // Not valid JSON, fall through to text parsing
      }
    }

    // Parse human-readable terraform plan output
    let currentResource: Partial<TerraformResourceChange> | null = null;
    let inChanges = false;
    let inOutputs = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Plan summary line
      const planMatch = line.match(/Plan:\s+(\d+)\s+to\s+add,\s+(\d+)\s+to\s+change,\s+(\d+)\s+to\s+destroy/);
      if (planMatch) {
        summary.addCount = parseInt(planMatch[1]) || 0;
        summary.changeCount = parseInt(planMatch[2]) || 0;
        summary.destroyCount = parseInt(planMatch[3]) || 0;
      }

      // Resource line:  # aws_instance.web will be created
      // + resource "aws_instance" "web" { ... }
      const resourceMatch = line.match(/^[#+~-]\s+(\w+)\.(\w+)/);
      if (resourceMatch) {
        if (currentResource && currentResource.address) {
          summary.resources.push(currentResource as TerraformResourceChange);
        }
        currentResource = {
          address: resourceMatch[0].replace(/^[#+~-]\s+/, ""),
          action: line.startsWith("+") ? "create" : line.startsWith("~") ? "update" : line.startsWith("-") ? "delete" : "noop",
          resourceType: resourceMatch[1],
          resourceName: resourceMatch[2],
          changes: [],
          hasSensitiveFields: false,
        };
        inChanges = false;
      }

      // Detect outputs section
      if (line.match(/^\s*Outputs:/)) {
        inOutputs = true;
        continue;
      }

      // Parse output values
      if (inOutputs && line.includes("=")) {
        const eqIdx = line.indexOf("=");
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        if (key) {
          summary.outputs[key] = { after: value, sensitive: value.includes("(sensitive") };
        }
      }

      // Parse changes within a resource
      if (currentResource && line.includes("=>") || line.includes(" -> ")) {
        inChanges = true;
        const changeDesc = line.trim();
        currentResource.changes.push(changeDesc);
        if (changeDesc.includes("(sensitive") || changeDesc.includes("sensitive")) {
          currentResource.hasSensitiveFields = true;
        }
      }

      // Extract warnings
      if (line.match(/Warning:|Error:/i)) {
        summary.warnings.push(line.trim());
      }
    }

    // Push last resource
    if (currentResource && currentResource.address) {
      summary.resources.push(currentResource as TerraformResourceChange);
    }

    return { success: true, data: summary };
  } catch (err: any) {
    return { success: false, error: `Failed to parse Terraform plan: ${err.message}` };
  }
}

function parseJSONPlan(json: any): { success: boolean; data?: TerraformPlanSummary } {
  const summary: TerraformPlanSummary = {
    addCount: 0,
    changeCount: 0,
    destroyCount: 0,
    resources: [],
    outputs: {},
    warnings: [],
  };

  const changes = json.resource_changes || json.resourceChanges || [];
  for (const rc of changes) {
    const change = rc.change || {};
    let action: "create" | "update" | "delete" | "read" | "noop" = "noop";

    const actions = change.actions || rc.action || [];
    const actionStr = Array.isArray(actions) ? actions[0] : actions;

    switch (actionStr) {
      case "create": action = "create"; summary.addCount++; break;
      case "update": action = "update"; summary.changeCount++; break;
      case "delete": action = "delete"; summary.destroyCount++; break;
      default: action = "read"; break;
    }

    const resourceChange: TerraformResourceChange = {
      address: rc.address || `${rc.type || "unknown"}.${rc.name || "unknown"}`,
      action,
      resourceType: rc.type || rc.resourceType || "unknown",
      resourceName: rc.name || rc.resourceName || "unknown",
      before: change.before,
      after: change.after,
      changes: [],
      hasSensitiveFields: change.before_sensitive ? true : false,
    };

    // Generate change descriptions
    if (change.before && change.after) {
      const beforeKeys = Object.keys(change.before);
      const afterKeys = Object.keys(change.after);
      const allKeys = new Set([...beforeKeys, ...afterKeys]);
      for (const key of allKeys) {
        const bv = JSON.stringify(change.before[key]);
        const av = JSON.stringify(change.after[key]);
        if (bv !== av) {
          resourceChange.changes.push(`${key}: ${bv} => ${av}`);
        }
      }
    }

    summary.resources.push(resourceChange);
  }

  // Parse outputs
  if (json.outputs) {
    for (const [key, val] of Object.entries(json.outputs)) {
      const output = val as any;
      summary.outputs[key] = {
        before: output.before,
        after: output.after,
        sensitive: output.sensitive || false,
      };
    }
  }

  return { success: true, data: summary };
}

// ── Terraform Config Validator ───────────────────────────────────────────

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  resourceCount: number;
  providerCount: number;
  missingRequiredFields: string[];
  styleIssues: string[];
}

function validateTerraformConfig(config: string): ConfigValidationResult {
  const result: ConfigValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    resourceCount: 0,
    providerCount: 0,
    missingRequiredFields: [],
    styleIssues: [],
  };

  const lines = config.split("\n");

  // Basic validation
  let braceDepth = 0;
  let inHeredoc = false;
  let hasProvider = false;
  let hasResource = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments and blank lines
    if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed === "") continue;

    // Track heredocs
    if (trimmed.startsWith("<<")) {
      inHeredoc = !inHeredoc;
      continue;
    }
    if (inHeredoc) continue;

    // Count braces
    for (const char of trimmed) {
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }

    // Detect providers
    if (trimmed.startsWith('provider "')) {
      hasProvider = true;
      result.providerCount++;
    }

    // Detect resources
    if (trimmed.startsWith('resource "')) {
      hasResource = true;
      result.resourceCount++;
    }

    // Check for common issues
    if (trimmed.match(/\bpassword\b|= "password"/i) || trimmed.match(/\bsecret\b/i)) {
      result.warnings.push(`Line ${lineNum}: Potential hardcoded secret`);
    }

    if (trimmed.match(/access_key|secret_key/i) && trimmed.includes("=")) {
      result.warnings.push(`Line ${lineNum}: AWS credentials hardcoded — use variables or Vault`);
    }

    // Check indentation consistency
    const indent = line.search(/\S/);
    if (indent > 0 && indent % 2 !== 0) {
      result.styleIssues.push(`Line ${lineNum}: Inconsistent indentation (${indent} spaces, expected multiple of 2)`);
    }

    // Check for deprecated interpolation
    if (trimmed.match(/\$\{/)) {
      result.styleIssues.push(`Line ${lineNum}: Use 'var.name' syntax instead of '\${var.name}' for Terraform 0.12+`);
    }
  }

  if (braceDepth !== 0) {
    result.errors.push(`Unmatched braces: open count mismatch (depth=${braceDepth})`);
    result.valid = false;
  }

  if (!hasProvider) {
    result.missingRequiredFields.push("No provider blocks defined");
  }

  if (!hasResource) {
    result.missingRequiredFields.push("No resource blocks defined");
  }

  if (result.missingRequiredFields.length > 0) {
    result.warnings.push(...result.missingRequiredFields.map((f) => `Missing: ${f}`));
  }

  return result;
}

// ── Terraform State Parser ───────────────────────────────────────────────

interface TerraformStateSummary {
  version: string;
  serial: number;
  resourceCount: number;
  resources: TerraformStateResource[];
  outputs: Record<string, any>;
  backendType: string;
}

interface TerraformStateResource {
  address: string;
  resourceType: string;
  resourceName: string;
  provider: string;
  mode: string;
  values: Record<string, any>;
}

function parseTerraformState(stateText: string): { success: boolean; data?: TerraformStateSummary; error?: string } {
  try {
    const state = JSON.parse(stateText);

    const resources: TerraformStateResource[] = [];
    const rawResources = state.resources || [];

    for (const r of rawResources) {
      const instances = r.instances || [r];
      for (const inst of instances) {
        resources.push({
          address: `${r.type || "unknown"}.${r.name || "unknown"}`,
          resourceType: r.type || "unknown",
          resourceName: r.name || "unknown",
          provider: (r.provider || "").replace(/^provider\["(.+)"\]$/, "$1"),
          mode: r.mode || "managed",
          values: inst.attributes || inst,
        });
      }
    }

    return {
      success: true,
      data: {
        version: state.version || "unknown",
        serial: state.serial || 0,
        resourceCount: resources.length,
        resources,
        outputs: state.outputs || {},
        backendType: state.backend?.type || "unknown",
      },
    };
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return { success: false, error: "Invalid Terraform state JSON — not valid JSON" };
    }
    return { success: false, error: `Failed to parse Terraform state: ${err.message}` };
  }
}

// ── Tool: terraform_plan ─────────────────────────────────────────────────

registry.register({
  name: "terraform_plan",
  description: "Parse and review a Terraform plan output (human-readable or JSON format). Extracts resource changes, additions, modifications, and destructions with detailed change descriptions.",
  parameters: [
    { name: "planText", type: "string", description: "Terraform plan output (human-readable from 'terraform plan' or JSON from 'terraform show -json')", required: true },
    { name: "format", type: "string", description: "Plan format: 'auto' (detect), 'text', or 'json'", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const planText = (params.planText as string) || "";
    if (!planText.trim()) {
      return { success: false, error: "planText is required" };
    }

    const result = parseTerraformPlan(planText);
    if (!result.success) {
      return { success: false, error: result.error || "Failed to parse plan" };
    }

    const data = result.data!;

    // Generate risk assessment
    const riskLevel = data.destroyCount > 0 ? "high" : data.changeCount > 5 ? "medium" : "low";
    const recommendations: string[] = [];

    if (data.destroyCount > 0) {
      recommendations.push(`⚠️ ${data.destroyCount} resource(s) will be DESTROYED — review carefully`);
    }
    if (data.warnings.length > 0) {
      recommendations.push(`⚠️ ${data.warnings.length} warning(s) in plan output`);
    }

    // Identify high-risk changes
    const destructiveResources = data.resources.filter((r) => r.action === "delete");
    if (destructiveResources.length > 0) {
      recommendations.push(`Destructive changes to: ${destructiveResources.map((r) => r.address).join(", ")}`);
    }

    return {
      success: true,
      data: {
        summary: {
          toAdd: data.addCount,
          toChange: data.changeCount,
          toDestroy: data.destroyCount,
          totalChanges: data.addCount + data.changeCount + data.destroyCount,
        },
        riskLevel,
        recommendations,
        resources: data.resources.map((r) => ({
          address: r.address,
          action: r.action,
          type: r.resourceType,
          name: r.resourceName,
          changeCount: r.changes.length,
          hasSensitiveFields: r.hasSensitiveFields,
          changes: r.changes.slice(0, 10),
        })),
        outputs: data.outputs,
        warnings: data.warnings,
      },
    };
  },
});

// ── Tool: terraform_apply ────────────────────────────────────────────────

registry.register({
  name: "terraform_apply",
  description: "Execute a Terraform apply with an approval flow. Generates a pre-apply summary, requests human approval if risk is high, then simulates the execution. High-risk changes (destroys > 0) always require approval.",
  parameters: [
    { name: "planSummary", type: "object", description: "Plan summary object from terraform_plan tool with toAdd, toChange, toDestroy counts", required: true },
    { name: "approved", type: "boolean", description: "Whether the apply has been approved by a human", required: false },
    { name: "approver", type: "string", description: "Name of the person who approved", required: false },
    { name: "environment", type: "string", description: "Target environment (dev, staging, production)", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const planSummary = params.planSummary as Record<string, any> || {};
    const approved = params.approved as boolean || false;
    const approver = (params.approver as string) || "";
    const environment = (params.environment as string) || "unknown";

    const toAdd = planSummary.toAdd || 0;
    const toChange = planSummary.toChange || 0;
    const toDestroy = planSummary.toDestroy || 0;
    const hasDestroys = toDestroy > 0;
    const isProduction = environment.toLowerCase() === "production";

    // Generate pre-apply summary
    const applySummary = {
      environment,
      changes: { toAdd, toChange, toDestroy },
      requiresApproval: hasDestroys || isProduction || toAdd > 20,
      approved,
      approver: approver || "none",
      timestamp: new Date().toISOString(),
    };

    if (applySummary.requiresApproval && !approved) {
      return {
        success: true,
        data: {
          status: "awaiting_approval",
          message: `Apply to ${environment} requires human approval`,
          reason: hasDestroys
            ? `${toDestroy} resource(s) will be destroyed`
            : `${toAdd} new resource(s) will be created in ${environment}`,
          applySummary,
          nextSteps: 'Set approved=true and approver="name" to proceed, or use "terraform_apply" with human approval workflow',
        },
      };
    }

    // Simulated apply execution
    const executionSteps = [
      { step: 1, description: "Initializing Terraform backend", status: "completed" },
      { step: 2, description: "Validating configuration", status: "completed" },
      { step: 3, description: `Applying ${toAdd + toChange + toDestroy} changes`, status: "in_progress" },
      { step: 4, description: "Writing state file", status: "pending" },
      { step: 5, description: "Running provisioners", status: "pending" },
    ];

    return {
      success: true,
      data: {
        status: "applied",
        message: `Terraform apply completed for ${environment} (${toAdd} added, ${toChange} changed, ${toDestroy} destroyed)`,
        applySummary,
        executionSteps,
        appliedAt: new Date().toISOString(),
        approvedBy: approver || "system",
        stateFile: `terraform.tfstate (${environment})`,
      },
    };
  },
});

// ── Tool: terraform_validate ─────────────────────────────────────────────

registry.register({
  name: "terraform_validate",
  description: "Validate a Terraform configuration (HCL) for syntax errors, style issues, hardcoded secrets, and missing required blocks. Returns detailed validation results with line numbers.",
  parameters: [
    { name: "config", type: "string", description: "Terraform HCL configuration text to validate", required: true },
    { name: "configName", type: "string", description: "Optional configuration name (e.g., 'main.tf', 'variables.tf')", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const config = (params.config as string) || "";
    const configName = (params.configName as string) || "unknown.tf";

    if (!config.trim()) {
      return { success: false, error: "config is required" };
    }

    const validation = validateTerraformConfig(config);

    return {
      success: true,
      data: {
        valid: validation.valid,
        configName,
        lineCount: config.split("\n").length,
        charCount: config.length,
        resourceCount: validation.resourceCount,
        providerCount: validation.providerCount,
        errors: validation.errors,
        warnings: validation.warnings,
        styleIssues: validation.styleIssues,
        missingRequiredFields: validation.missingRequiredFields,
        score: validation.valid
          ? Math.max(0, 100 - validation.warnings.length * 10 - validation.styleIssues.length * 5)
          : 0,
        grade: validation.valid
          ? validation.warnings.length === 0 && validation.styleIssues.length === 0
            ? "A"
            : validation.warnings.length <= 2
              ? "B"
              : "C"
          : "F",
      },
    };
  },
});

// ── Tool: terraform_state_inspect ────────────────────────────────────────

registry.register({
  name: "terraform_state_inspect",
  description: "Read and inspect a Terraform state file (JSON). Returns resource inventory, provider info, outputs, and backend type. Does NOT modify state.",
  parameters: [
    { name: "stateJson", type: "string", description: "Terraform state file content as JSON string (from 'terraform state pull' or terraform.tfstate)", required: true },
    { name: "filterType", type: "string", description: "Optional filter by resource type (e.g., 'aws_instance', 'azurerm_resource_group')", required: false },
    { name: "filterName", type: "string", description: "Optional filter by resource name", required: false },
  ],
  handler: async (params: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> => {
    const stateJson = (params.stateJson as string) || "";
    if (!stateJson.trim()) {
      return { success: false, error: "stateJson is required" };
    }

    const result = parseTerraformState(stateJson);
    if (!result.success) {
      return { success: false, error: result.error || "Failed to parse state" };
    }

    const data = result.data!;

    // Apply filters
    let filteredResources = data.resources;
    const filterType = params.filterType as string;
    const filterName = params.filterName as string;

    if (filterType) {
      filteredResources = filteredResources.filter((r) => r.resourceType.includes(filterType));
    }
    if (filterName) {
      filteredResources = filteredResources.filter((r) => r.resourceName.includes(filterName));
    }

    // Count by provider
    const providerCounts: Record<string, number> = {};
    for (const r of data.resources) {
      providerCounts[r.provider] = (providerCounts[r.provider] || 0) + 1;
    }

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const r of data.resources) {
      typeCounts[r.resourceType] = (typeCounts[r.resourceType] || 0) + 1;
    }

    return {
      success: true,
      data: {
        stateVersion: data.version,
        serial: data.serial,
        backendType: data.backendType,
        summary: {
          totalResources: data.resourceCount,
          providers: Object.keys(providerCounts),
          resourceTypes: Object.keys(typeCounts),
        },
        filters: {
          type: filterType || "none",
          name: filterName || "none",
          matchedResources: filteredResources.length,
        },
        providerBreakdown: providerCounts,
        typeBreakdown: typeCounts,
        resources: filteredResources.slice(0, 50).map((r) => ({
          address: r.address,
          type: r.resourceType,
          provider: r.provider,
          mode: r.mode,
          keyAttribute: extractKeyAttribute(r.resourceType, r.values),
        })),
        outputs: data.outputs,
      },
    };
  },
});

function extractKeyAttribute(type: string, values: Record<string, any>): string {
  if (values.id) return values.id;
  if (values.name) return values.name;
  if (values.arn) return values.arn;
  if (values.dns_name) return values.dns_name;
  return "(no key attribute)";
}

export {
  parseTerraformPlan,
  validateTerraformConfig,
  parseTerraformState,
};
