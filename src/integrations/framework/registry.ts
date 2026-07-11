/**
 * Integration Provider Registry
 *
 * Central registry of all supported integration providers, their metadata,
 * and available actions/triggers. Used by the Agent Runtime to discover
 * and invoke integration capabilities.
 */

export type AuthType = "oauth2" | "api_key" | "basic" | "jwt";

export interface ProviderAction {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
}

export interface ProviderTrigger {
  name: string;
  description: string;
  eventType: string;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  description: string;
  category: ProviderCategory;
  authType: AuthType;
  docsUrl: string;
  logoUrl?: string;
  actions: ProviderAction[];
  triggers: ProviderTrigger[];
  configSchema: Record<string, any>;
  status: "active" | "beta" | "deprecated";
}

export type ProviderCategory =
  | "crm"
  | "erp"
  | "accounting"
  | "email"
  | "communication"
  | "storage"
  | "project-management"
  | "hr"
  | "support"
  | "marketing"
  | "ecommerce"
  | "payments"
  | "analytics"
  | "other";

class ProviderRegistry {
  private providers = new Map<string, ProviderMetadata>();

  register(metadata: ProviderMetadata): void {
    if (this.providers.has(metadata.id)) {
      console.warn(`[Registry] Provider '${metadata.id}' already registered — overwriting`);
    }
    this.providers.set(metadata.id, metadata);
  }

  get(id: string): ProviderMetadata | undefined {
    return this.providers.get(id);
  }

  listByCategory(category: ProviderCategory): ProviderMetadata[] {
    return Array.from(this.providers.values()).filter((p) => p.category === category);
  }

  listAll(): ProviderMetadata[] {
    return Array.from(this.providers.values());
  }

  getActions(providerId: string): ProviderAction[] {
    return this.providers.get(providerId)?.actions ?? [];
  }

  getTriggers(providerId: string): ProviderTrigger[] {
    return this.providers.get(providerId)?.triggers ?? [];
  }
}

export const registry = new ProviderRegistry();