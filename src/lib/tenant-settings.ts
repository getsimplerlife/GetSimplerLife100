/**
 * tenant-settings.ts — per-tenant settings in the durable store.
 *
 * Key: tenant_settings.json  (basename → durable store key, so it persists
 * to Neon alongside tenant_integrations.json / tenant_oauth_credentials.json
 * and survives publishes).
 *
 * Shape: { [tenantEmail]: { workspacePreference: 'google'|'microsoft'|'auto' } }
 * — tenant-scoped, keyed by email exactly like client_files.json.
 *
 * The workspace preference decides where AI employees create data files
 * (Google OR Microsoft) when a file-creation request does not name a
 * provider explicitly. Default: 'auto' (route to whichever file workspace
 * the tenant has connected).
 */
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import type { WorkspacePreference } from "./workspace-routing";

export const TENANT_SETTINGS_KEY = "tenant_settings.json";
export const VALID_WORKSPACE_PREFERENCES: readonly WorkspacePreference[] = [
  "google",
  "microsoft",
  "auto",
] as const;

export interface TenantSettings {
  workspacePreference?: WorkspacePreference;
  /** Approval Queue mode: "on" (default — writes await human approval) or
   *  "auto" (explicit per-tenant opt-out: writes execute immediately). */
  approvalMode?: "on" | "auto";
  /** Calibration for deterministic agent-processor reasoning (matching,
   *  dedup, discrepancy thresholds). Optional — defaults apply when unset. */
  processorCalibration?: ProcessorCalibration;
}

/** Per-tenant tuning of deterministic reasoning (all optional → defaults). */
export interface ProcessorCalibration {
  /** Minimum confidence (0–1) for a cross-system match to count. Default 0.6. */
  minMatchConfidence?: number;
  /** Relative amount-discrepancy threshold (percent) to flag. Default 5 (%). */
  discrepancyPercent?: number;
  /** Absolute amount-discrepancy threshold (currency units) to flag. Default 500. */
  discrepancyAbs?: number;
  /** Minimum confidence for a fuzzy duplicate to be reported. Default 0.65. */
  fuzzyDedupeConfidence?: number;
  /** Anomaly detection: |delta %| vs the firm's own history beyond which to WARN. Default 25. */
  anomalyDeltaPercent?: number;
  /** Anomaly detection: minimum prior samples required to establish a baseline. Default 2. */
  minAnomalySamples?: number;
}

export const DEFAULT_PROCESSOR_CALIBRATION: Required<ProcessorCalibration> = {
  minMatchConfidence: 0.6,
  discrepancyPercent: 5,
  discrepancyAbs: 500,
  fuzzyDedupeConfidence: 0.65,
  anomalyDeltaPercent: 25,
  minAnomalySamples: 2,
};

/** A tenant's calibration with all defaults applied (never partial/undefined). */
export function getProcessorCalibration(
  tenantId: string,
  dataDir?: string,
): Required<ProcessorCalibration> {
  const cal = getTenantSettings(tenantId, dataDir).processorCalibration;
  return {
    minMatchConfidence: cal?.minMatchConfidence ?? DEFAULT_PROCESSOR_CALIBRATION.minMatchConfidence,
    discrepancyPercent: cal?.discrepancyPercent ?? DEFAULT_PROCESSOR_CALIBRATION.discrepancyPercent,
    discrepancyAbs: cal?.discrepancyAbs ?? DEFAULT_PROCESSOR_CALIBRATION.discrepancyAbs,
    fuzzyDedupeConfidence: cal?.fuzzyDedupeConfidence ?? DEFAULT_PROCESSOR_CALIBRATION.fuzzyDedupeConfidence,
    anomalyDeltaPercent: cal?.anomalyDeltaPercent ?? DEFAULT_PROCESSOR_CALIBRATION.anomalyDeltaPercent,
    minAnomalySamples: cal?.minAnomalySamples ?? DEFAULT_PROCESSOR_CALIBRATION.minAnomalySamples,
  };
}

/** Set a tenant's processor calibration (merges with existing settings). */
export function setProcessorCalibration(
  tenantId: string,
  calibration: ProcessorCalibration,
  dataDir?: string,
): TenantSettings {
  if (!tenantId?.trim()) throw new Error("setProcessorCalibration requires a tenant id");
  const index = readIndex(dataDir);
  const current = index[tenantId] || {};
  const next: TenantSettings = { ...current, processorCalibration: calibration };
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return next;
}

export type TenantSettingsIndex = Record<string, TenantSettings>;

function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}

export function tenantSettingsPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), TENANT_SETTINGS_KEY);
}

function readIndex(dataDir?: string): TenantSettingsIndex {
  const raw = readJSON(tenantSettingsPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as TenantSettingsIndex;
  return {};
}

function writeIndex(index: TenantSettingsIndex, dataDir?: string): void {
  writeJSON(tenantSettingsPath(dataDir), index);
}

/** A tenant's settings object (empty when never set). */
export function getTenantSettings(tenantId: string, dataDir?: string): TenantSettings {
  if (!tenantId) return {};
  return readIndex(dataDir)[tenantId] || {};
}

/** Workspace preference for a tenant — always a valid value, default 'auto'. */
export function getWorkspacePreference(tenantId: string, dataDir?: string): WorkspacePreference {
  const pref = getTenantSettings(tenantId, dataDir).workspacePreference;
  return VALID_WORKSPACE_PREFERENCES.includes(pref as WorkspacePreference)
    ? (pref as WorkspacePreference)
    : "auto";
}

/** Validate a workspace preference value (throws on anything else). */
export function assertValidWorkspacePreference(value: unknown): asserts value is WorkspacePreference {
  if (typeof value !== "string" || !VALID_WORKSPACE_PREFERENCES.includes(value as WorkspacePreference)) {
    throw new Error(
      `Invalid workspace preference "${String(value)}" — expected one of: ${VALID_WORKSPACE_PREFERENCES.join(", ")}`,
    );
  }
}

/** Set a tenant's workspace preference (validated). Returns the updated settings. */
export function setWorkspacePreference(
  tenantId: string,
  preference: WorkspacePreference,
  dataDir?: string,
): TenantSettings {
  if (!tenantId?.trim()) throw new Error("setWorkspacePreference requires a tenant id");
  assertValidWorkspacePreference(preference);
  const index = readIndex(dataDir);
  const current = index[tenantId] || {};
  const next: TenantSettings = { ...current, workspacePreference: preference };
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return next;
}

export const VALID_APPROVAL_MODES: readonly ("on" | "auto")[] = ["on", "auto"] as const;

/** Set a tenant's Approval Queue mode (validated; "on" is the default). */
export function setApprovalMode(
  tenantId: string,
  mode: "on" | "auto",
  dataDir?: string,
): TenantSettings {
  if (!tenantId?.trim()) throw new Error("setApprovalMode requires a tenant id");
  if (!VALID_APPROVAL_MODES.includes(mode)) {
    throw new Error(`Invalid approval mode "${String(mode)}" — expected "on" or "auto"`);
  }
  const index = readIndex(dataDir);
  const current = index[tenantId] || {};
  const next: TenantSettings = { ...current, approvalMode: mode };
  index[tenantId] = next;
  writeIndex(index, dataDir);
  return next;
}
