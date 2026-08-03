import { defineCapabilityContract, type CapabilityContract } from "../../lib/capability-contract";
export const COMMUNICATIONS_EMPLOYEE_ID = "communications";
export const SLACK_PROVIDER_ID = "slack";

/**
 * Communications AI — Slack capability slice (12 contracts).
 *
 * Coverage: channels, channel history, users, user info, message search,
 * message send, ephemeral send, reactions, file upload, and monitoring
 * (mentions + channel activity). Every contract starts `unverified`; status
 * may only become real/partial after the verification evidence framework records
 * live API evidence (scripts/verify-provider.ts --provider slack [--writes]).
 *
 * Slack uses a bot token (xoxb-...) for API access — the OAuth install flow
 * returns the bot token, which is the credential used by the adapter.
 */
export const communicationsCapabilities: ReadonlyArray<CapabilityContract> = [
  // ---------------------------------------------------------------- reads
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-read-channels",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack conversations.list (public/private channels) exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-read-channel-history",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack conversations.history reads recent messages from a channel; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-read-messages",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack channel message read (conversations.history) exists; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-read-users",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack users.list enumerates workspace members; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-read-user-info",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack users.info reads a member profile; authorized tenant read evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-search-messages",
    kind: "understand",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack search.messages finds messages matching a query; authorized tenant read evidence is pending.",
  }),
  // ---------------------------------------------------------------- writes
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-send-message",
    kind: "automate",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Slack chat.postMessage sends a channel message; full write contract (send + delete rollback) evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-send-ephemeral",
    kind: "automate",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Slack chat.postEphemeral sends a message visible only to one user; it is transient by nature (no channel residue, no delete needed), so rollback is inherently satisfied — authorized write evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-add-reaction",
    kind: "automate",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Slack reactions.add adds a reaction to a message; full write contract (add + remove rollback) evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-upload-file",
    kind: "automate",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: true,
    retryPolicy: "bounded",
    rollback: "available",
    evidence: "Slack files.upload posts a file to a channel; full write contract (upload + delete rollback) evidence is pending.",
  }),
  // ---------------------------------------------------------------- monitor
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-monitor-mention",
    kind: "monitor",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack Events API app_mention subscription is defined; live event-receipt evidence is pending.",
  }),
  defineCapabilityContract({
    employeeId: COMMUNICATIONS_EMPLOYEE_ID,
    capabilityId: "slack-monitor-channel-activity",
    kind: "monitor",
    status: "unverified",
    providerId: SLACK_PROVIDER_ID,
    tenantScoped: true,
    authRequired: true,
    auditRequired: true,
    idempotencyRequired: false,
    retryPolicy: "bounded",
    rollback: "not_applicable",
    evidence: "Slack Events API message.channels subscription is defined; live event-receipt evidence is pending.",
  }),
];

export interface CommunicationsAdapter {
  listMessages(tenantId: string): Promise<unknown>;
  sendMessage(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}
export interface CommunicationsExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
function requireTenant(options: CommunicationsExecutionOptions): void {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
}
function boundedAttempts(value?: number): number { return Math.max(1, Math.min(value ?? 2, 3)); }

/** Generic bounded-retry read executor that audits success/failure. */
async function readCapability(
  capabilityId: string,
  run: () => Promise<unknown>,
  options: CommunicationsExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await run();
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded" });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed" });
  throw lastError;
}

/** Generic bounded-retry write executor that requires idempotency and audits. */
async function writeCapability(
  capabilityId: string,
  run: (key: string) => Promise<unknown>,
  idempotencyKey: string,
  options: CommunicationsExecutionOptions,
): Promise<unknown> {
  requireTenant(options);
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < boundedAttempts(options.maxAttempts); attempt++) {
    try {
      const result = await run(idempotencyKey);
      await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "succeeded", idempotencyKey });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({ capabilityId, tenantId: options.tenantId, outcome: "failed", idempotencyKey });
  throw lastError;
}

export async function readMessages(adapter: CommunicationsAdapter, options: CommunicationsExecutionOptions): Promise<unknown> {
  return readCapability("slack-read-messages", () => adapter.listMessages(options.tenantId), options);
}
export async function sendMessage(adapter: CommunicationsAdapter, input: Record<string, unknown>, options: CommunicationsExecutionOptions, idempotencyKey: string): Promise<unknown> {
  return writeCapability("slack-send-message", (key) => adapter.sendMessage(options.tenantId, input, key), idempotencyKey, options);
}

export interface ExtendedCapabilityAdapter {
  readChannels?(tenantId: string): Promise<unknown>;
  readChannelHistory?(tenantId: string): Promise<unknown>;
  readUsers?(tenantId: string): Promise<unknown>;
  readUserInfo?(tenantId: string): Promise<unknown>;
  searchMessages?(tenantId: string): Promise<unknown>;
  sendEphemeral?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  addReaction?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  uploadFile?(tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
  monitor?(capabilityId: string, tenantId: string, subscription: Record<string, unknown>): Promise<unknown>;
  read?(capabilityId: string, tenantId: string): Promise<unknown>;
  write?(capabilityId: string, tenantId: string, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}
export interface ExtendedExecutionOptions {
  tenantId: string;
  authToken?: string;
  audit: (event: { capabilityId: string; tenantId: string; outcome: string; idempotencyKey?: string }) => Promise<void> | void;
  maxAttempts?: number;
}
export async function executeExtendedCapability(
  adapter: ExtendedCapabilityAdapter,
  capabilityId: string,
  options: ExtendedExecutionOptions,
  input?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<unknown> {
  if (!options.tenantId.trim()) throw new Error("Tenant scope is required");
  if (!options.authToken?.trim()) throw new Error("Provider authentication is required");
  const write = capabilityId.includes("send-")
    || capabilityId.includes("create-")
    || capabilityId.includes("update-")
    || capabilityId.includes("initiate-")
    || capabilityId.includes("link-")
    || capabilityId.includes("transition-")
    || capabilityId.includes("upload-")
    || capabilityId.includes("add-");
  if (write && !idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const fn = write ? adapter.write : adapter.read;
      if (!fn) throw new Error("Capability adapter method is unavailable");
      const result = write
        ? await fn(capabilityId, options.tenantId, input ?? {}, idempotencyKey!)
        : await fn(capabilityId, options.tenantId);
      await options.audit({
        capabilityId,
        tenantId: options.tenantId,
        outcome: "succeeded",
        ...(write ? { idempotencyKey } : {}),
      });
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  await options.audit({
    capabilityId,
    tenantId: options.tenantId,
    outcome: "failed",
    ...(write ? { idempotencyKey } : {}),
  });
  throw lastError;
}

export async function readChannels(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readChannels) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readChannels!(tenant) }, "slack-read-channels", options);
}
export async function readChannelHistory(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readChannelHistory) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readChannelHistory!(tenant) }, "slack-read-channel-history", options);
}
export async function readUsers(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readUsers) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readUsers!(tenant) }, "slack-read-users", options);
}
export async function readUserInfo(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.readUserInfo) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.readUserInfo!(tenant) }, "slack-read-user-info", options);
}
export async function searchMessages(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions): Promise<unknown> {
  if (!adapter.searchMessages) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.searchMessages!(tenant) }, "slack-search-messages", options);
}
export async function sendEphemeral(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.sendEphemeral) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.sendEphemeral!(tenant, data, key) }, "slack-send-ephemeral", options, input, idempotencyKey);
}
export async function addReaction(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.addReaction) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.addReaction!(tenant, data, key) }, "slack-add-reaction", options, input, idempotencyKey);
}
export async function uploadFile(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, input: Record<string, unknown>, idempotencyKey: string): Promise<unknown> {
  if (!adapter.uploadFile) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ write: (_id, tenant, data, key) => adapter.uploadFile!(tenant, data, key) }, "slack-upload-file", options, input, idempotencyKey);
}
export async function monitorMention(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, subscription: Record<string, unknown>): Promise<unknown> {
  if (!adapter.monitor) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.monitor!("slack-monitor-mention", tenant, subscription) }, "slack-monitor-mention", options);
}
export async function monitorChannelActivity(adapter: ExtendedCapabilityAdapter, options: ExtendedExecutionOptions, subscription: Record<string, unknown>): Promise<unknown> {
  if (!adapter.monitor) throw new Error("Capability adapter method is unavailable");
  return executeExtendedCapability({ read: (_id, tenant) => adapter.monitor!("slack-monitor-channel-activity", tenant, subscription) }, "slack-monitor-channel-activity", options);
}
