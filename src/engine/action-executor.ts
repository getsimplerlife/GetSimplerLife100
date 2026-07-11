/**
 * Action Execution Pipeline
 *
 * Resolves integration action names to provider actions, retrieves
 * the user's connection (with token refresh), and executes the
 * action handler. Handles rate limiting, error mapping, and timeouts.
 */

import { registry } from "../integrations/providers";
import { getConnection, listConnectionsByProvider, updateConnectionConfig, type ConnectionConfig } from "../integrations/framework/connection";
import { isTokenExpired } from "../integrations/framework/oauth";
import { refreshToken } from "../integrations/framework/oauth";

// ── Types ────────────────────────────────────────────────────────────────

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  actionName: string;
  provider: string;
  duration: number;
}

export interface ExecutionOptions {
  timeout?: number; // ms, default 30000
  retryOnRefresh?: boolean; // retry once after token refresh, default true
}

// ── Action Handler Registry ──────────────────────────────────────────────

/**
 * In-memory registry mapping full action names (e.g. "searchSalesforceContacts")
 * to their provider ID and handler function.
 */
class ActionHandlerRegistry {
  private handlers = new Map<string, { providerId: string; handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any> }>();
  private providerActions = new Map<string, ActionDefinition[]>();

  /**
   * Register all actions from a provider module
   */
  registerProvider(providerId: string, actions: ActionDefinition[]): void {
    this.providerActions.set(providerId, actions);
    for (const action of actions) {
      this.handlers.set(action.name, {
        providerId,
        handler: action.handler,
      });
    }
  }

  /**
   * Get all registered action names
   */
  listAllActions(): { name: string; providerId: string; description: string; inputSchema: Record<string, any> }[] {
    const result: { name: string; providerId: string; description: string; inputSchema: Record<string, any> }[] = [];
    for (const [providerId, actions] of this.providerActions) {
      for (const action of actions) {
        result.push({
          name: action.name,
          providerId,
          description: action.description,
          inputSchema: action.inputSchema,
        });
      }
    }
    return result;
  }

  /**
   * Get all actions for a specific provider
   */
  getProviderActions(providerId: string): ActionDefinition[] {
    return this.providerActions.get(providerId) || [];
  }

  /**
   * Find which provider an action belongs to
   */
  findProvider(actionName: string): string | null {
    const entry = this.handlers.get(actionName);
    return entry?.providerId || null;
  }

  /**
   * Check if an action is registered
   */
  hasAction(actionName: string): boolean {
    return this.handlers.has(actionName);
  }
}

export const actionRegistry = new ActionHandlerRegistry();

// ── Token Management ────────────────────────────────────────────────────

/**
 * Get a valid access token for a connection, refreshing if needed
 */
async function getValidAccessToken(
  connectionId: string,
  userId: string,
  config: ConnectionConfig,
): Promise<{ config: ConnectionConfig; refreshed: boolean }> {
  // Check if token is expired
  if (config.accessToken && config.refreshToken && config.expiresAt) {
    const expiresAt = config.expiresAt;
    // 5-minute buffer
    if (Date.now() / 1000 >= expiresAt - 300) {
      // Token is expired or about to expire — refresh it
      try {
        // Build OAuth config from connection data
        const oauthConfig = {
          clientId: config._clientId || "",
          clientSecret: config._clientSecret || "",
          redirectUri: config._redirectUri || "",
          scopes: (config.scope || "").split(" "),
          authorizeUrl: config._authorizeUrl || "",
          tokenUrl: config._tokenUrl || "",
          refreshUrl: config._refreshUrl,
          flowType: "authorization_code" as const,
        };

        if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
          // Can't refresh without client credentials — return as-is
          return { config, refreshed: false };
        }

        const newTokens = await refreshToken(oauthConfig, config.refreshToken);

        // Update connection config
        const updatedConfig = {
          ...config,
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken || config.refreshToken,
          expiresAt: newTokens.expiresAt,
        };

        // Persist the updated tokens
        await updateConnectionConfig(connectionId, userId, updatedConfig);

        return { config: updatedConfig, refreshed: true };
      } catch (err) {
        console.error(`[ActionExecutor] Token refresh failed for connection ${connectionId}:`, err);
        return { config, refreshed: false };
      }
    }
  }

  return { config, refreshed: false };
}

// ── Execution ────────────────────────────────────────────────────────────

/**
 * Execute an integration action for a user.
 * Resolves the action, looks up the user's connection for the provider,
 * handles token refresh, and returns the result.
 */
export async function executeAction(
  actionName: string,
  params: Record<string, any>,
  userId: string,
  options?: ExecutionOptions,
): Promise<ActionResult> {
  const startTime = Date.now();
  const timeout = options?.timeout || 30000;
  const retryOnRefresh = options?.retryOnRefresh !== false;

  try {
    // 1. Resolve the action
    const entry = actionRegistry.handlers.get(actionName);
    if (!entry) {
      return {
        success: false,
        error: `Unknown action: "${actionName}". Available actions: ${Array.from(actionRegistry.handlers.keys()).slice(0, 20).join(", ")}...`,
        actionName,
        provider: "unknown",
        duration: Date.now() - startTime,
      };
    }

    const { providerId, handler } = entry;

    // 2. Find the user's connection for this provider
    const connections = await listConnectionsByProvider(userId, providerId);
    if (connections.length === 0) {
      return {
        success: false,
        error: `No connection found for ${providerId}. Please connect your ${providerId} account first.`,
        actionName,
        provider: providerId,
        duration: Date.now() - startTime,
      };
    }

    // Use the most recently updated active connection
    const connection = connections.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];

    // 3. Get valid access token (refresh if needed)
    const { config } = await getValidAccessToken(connection.id, userId, connection.config);

    // 4. Execute the action handler with a timeout
    const result = await Promise.race([
      handler(config, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Action "${actionName}" timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    return {
      success: true,
      data: result,
      actionName,
      provider: providerId,
      duration: Date.now() - startTime,
    };
  } catch (err: any) {
    // If the error is auth-related and we haven't tried refresh, try once more
    if (retryOnRefresh && (err.message?.includes("401") || err.message?.includes("unauthorized") || err.message?.includes("expired"))) {
      // Re-lookup connection and force refresh before retry
      try {
        const connections = await listConnectionsByProvider(userId, actionRegistry.findProvider(actionName) || "");
        if (connections.length > 0) {
          const conn = connections[0];
          if (conn.config.refreshToken) {
            const oauthConfig = {
              clientId: conn.config._clientId || "",
              clientSecret: conn.config._clientSecret || "",
              redirectUri: conn.config._redirectUri || "",
              scopes: (conn.config.scope || "").split(" "),
              authorizeUrl: conn.config._authorizeUrl || "",
              tokenUrl: conn.config._tokenUrl || "",
              flowType: "authorization_code" as const,
            };
            const newTokens = await refreshToken(oauthConfig, conn.config.refreshToken);
            const updatedConfig = { ...conn.config, accessToken: newTokens.accessToken };
            await updateConnectionConfig(conn.id, userId, updatedConfig);

            // Retry with new token
            const entry = actionRegistry.handlers.get(actionName);
            if (entry) {
              const retryResult = await entry.handler(updatedConfig, params);
              return {
                success: true,
                data: retryResult,
                actionName,
                provider: entry.providerId,
                duration: Date.now() - startTime,
              };
            }
          }
        }
      } catch (retryErr) {
        // Fall through to the error below
      }
    }

    return {
      success: false,
      error: err.message || "Unknown error during action execution",
      actionName,
      provider: actionRegistry.findProvider(actionName) || "unknown",
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple actions in sequence, passing outputs between them.
 * Each step can reference outputs from previous steps via `$step{N}.field`.
 */
export async function executeActionChain(
  steps: { actionName: string; params: Record<string, any>; label?: string }[],
  userId: string,
): Promise<{ results: ActionResult[]; chainError?: string }> {
  const results: ActionResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let resolvedParams = { ...step.params };

    // Resolve references to previous step outputs (e.g. "$step0.id")
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (typeof value === "string" && value.startsWith("$step")) {
        const match = value.match(/^\$step(\d+)\.(.+)$/);
        if (match) {
          const stepIdx = parseInt(match[1], 10);
          const fieldPath = match[2];
          const prevResult = results[stepIdx];
          if (prevResult?.success && prevResult.data) {
            resolvedParams[key] = prevResult.data[fieldPath];
          } else {
            return {
              results,
              chainError: `Step ${i + 1} ("${step.actionName}"): Cannot reference $step${stepIdx}.${fieldPath} — that step failed or has no data`,
            };
          }
        }
      }
    }

    const result = await executeAction(step.actionName, resolvedParams, userId);
    results.push(result);

    if (!result.success) {
      return {
        results,
        chainError: `Step ${i + 1} ("${step.actionName}") failed: ${result.error}`,
      };
    }
  }

  return { results };
}

/**
 * Get provider display name from registry
 */
export function getProviderDisplayName(providerId: string): string {
  const provider = registry.get(providerId);
  return provider?.name || providerId;
}

/**
 * List all available actions grouped by provider
 */
export function listAvailableActions(): { provider: string; providerName: string; actions: { name: string; description: string; inputSchema: Record<string, any> }[] }[] {
  const providers = registry.listAll();
  return providers.map(p => ({
    provider: p.id,
    providerName: p.name,
    actions: p.actions,
  }));
}