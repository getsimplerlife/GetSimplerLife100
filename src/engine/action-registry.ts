/**
 * action-registry.ts — the ONE map from an action name to the code that runs it.
 *
 * WHY THIS FILE EXISTS (slice 198):
 *   The map used to live inside `action-executor.ts`, next to the whole provider
 *   + OAuth + connection import graph. The Approval Queue needs to answer one
 *   question at ENQUEUE time — "can anything execute this action?" — and it
 *   cannot import the executor's graph to do it (the executor dynamically
 *   imports the queue, and the provider modules pull in far more than a name
 *   lookup should). So the registry moves here, with no imports of its own, and
 *   `action-executor.ts` re-exports it so every existing `actionRegistry` import
 *   keeps working.
 *
 *   `approval-queue.ts` imports THIS module (plus `src/native/actions.ts`, which
 *   registers the native executors). That is what makes the enqueue-time refusal
 *   honest: the queue and the executor consult the same object, so they cannot
 *   disagree about whether an action is executable.
 */

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: any, params: Record<string, any>) => Promise<any>;
}

/**
 * In-memory registry mapping full action names (e.g. "searchSalesforceContacts")
 * to their provider ID and handler function.
 */
export class ActionHandlerRegistry {
  public handlers = new Map<
    string,
    { providerId: string; handler: (config: any, params: Record<string, any>) => Promise<any>; native?: boolean }
  >();
  private providerActions = new Map<string, ActionDefinition[]>();

  /**
   * Register all actions from a provider module
   * @param native when true the action executes WITHOUT a provider connection:
   * the handler receives a context object `{ tenantId, dataDir }` in place of a
   * ConnectionConfig (used by the NATIVE executors — vault and the native
   * modules; the tenant IS the caller). Authority is still always decided by
   * the Approval Queue gate inside executeAction before the handler runs.
   */
  registerProvider(providerId: string, actions: ActionDefinition[], opts?: { native?: boolean }): void {
    this.providerActions.set(providerId, actions);
    for (const action of actions) {
      this.handlers.set(action.name, {
        providerId,
        handler: action.handler,
        native: opts?.native,
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
