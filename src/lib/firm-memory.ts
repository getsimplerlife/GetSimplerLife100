/**
 * src/lib/firm-memory.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
 *
 * OPERATIONAL MEMORY PER FIRM (capability upgrade #3): a durable per-tenant
 * memory store so each AI employee behaves smarter "per client" over time.
 *
 * Pattern mirrors the established durable JSON store (data-store.ts) and the
 * tenant-keyed settings file (tenant-settings.ts): a single `firm_memory.json`
 * index keyed by tenant email. Memory is STRICTLY per-tenant — there is no
 * global/blended store and no read path that ever iterates or returns another
 * tenant's memory (isolation hard guarantee).
 *
 * Content per tenant:
 *   - `rules`            — firm rules (explicit + reflected from tenant-settings)
 *   - `recentInsights`   — last N processor results/insights (size-capped)
 *   - `auditTail`        — what ran / what was approved or rejected (size-capped)
 *
 * SAFETY: memory writes are INTERNAL METADATA only — they are never provider
 * writes, never destructive, and never touch the approval queue or a provider.
 * The approval queue remains the ONLY path for any provider write. Reads are
 * additive; a missing/corrupt store falls back to empty defaults.
 */
import { join } from "path";
import { readJSON, writeJSON, resolveDataDir } from "./data-store";
import {
  getTenantSettings,
  getProcessorCalibration,
  type ProcessorCalibration,
} from "./tenant-settings";

export const FIRM_MEMORY_KEY = "firm_memory.json";

/** Size caps — newest-K entries are kept, oldest evicted (append-only, capped). */
export const MAX_RECENT_INSIGHTS = 20;
export const MAX_AUDIT_TAIL = 50;
export const MAX_RULES = 100;

export type MemoryEntryKind = "insight" | "audit";

export interface MemoryEntry {
  ts: number;
  type: MemoryEntryKind;
  /** One-line summary ("Processed 12 POs across 2 systems"). */
  summary: string;
  /** Processor category / agent type that produced it. */
  source?: string;
  /** Audit-specific: the action/provider and whether it was approved/rejected. */
  action?: string;
  provider?: string;
  approved?: boolean;
}

export interface FirmMemory {
  rules: Record<string, string>;
  recentInsights: MemoryEntry[];
  auditTail: MemoryEntry[];
  updatedAt: number;
}

export type FirmMemoryIndex = Record<string, FirmMemory>;

/** Composed per-tenant context handed to each run/chain (buildAgentContext). */
export interface AgentContext {
  tenantEmail: string;
  firmRules: Record<string, string>;
  calibration: Required<ProcessorCalibration>;
  memory: {
    recentInsights: MemoryEntry[];
    auditTail: MemoryEntry[];
    updatedAt: number;
  };
}

// ── Store plumbing ──────────────────────────────────────────────────────────

function defaultDataDir(): string {
  return resolveDataDir(
    process.env.DATA_DIR,
    typeof import.meta?.dir !== "undefined" ? import.meta.dir : process.cwd(),
  );
}

export function firmMemoryPath(dataDir?: string): string {
  return join(dataDir ?? defaultDataDir(), FIRM_MEMORY_KEY);
}

function readIndex(dataDir?: string): FirmMemoryIndex {
  const raw = readJSON(firmMemoryPath(dataDir));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as FirmMemoryIndex;
  return {};
}

function writeIndex(index: FirmMemoryIndex, dataDir?: string): void {
  writeJSON(firmMemoryPath(dataDir), index);
}

const EMPTY_MEMORY = (): FirmMemory => ({ rules: {}, recentInsights: [], auditTail: [], updatedAt: 0 });

function requireTenant(tenantEmail: string): void {
  if (!tenantEmail?.trim()) throw new Error("firm-memory requires a tenantEmail");
}

/**
 * Read a tenant's memory (empty defaults when never written). Strictly keyed by
 * tenantEmail — never returns another tenant's data.
 */
export function readFirmMemory(tenantEmail: string, dataDir?: string): FirmMemory {
  if (!tenantEmail?.trim()) return EMPTY_MEMORY();
  const mem = readIndex(dataDir)[tenantEmail];
  if (!mem || typeof mem !== "object") return EMPTY_MEMORY();
  // Fail-soft: normalize any missing shape to empty defaults.
  return {
    rules: mem.rules && typeof mem.rules === "object" && !Array.isArray(mem.rules) ? mem.rules : {},
    recentInsights: Array.isArray(mem.recentInsights) ? mem.recentInsights : [],
    auditTail: Array.isArray(mem.auditTail) ? mem.auditTail : [],
    updatedAt: typeof mem.updatedAt === "number" ? mem.updatedAt : 0,
  };
}

/** Read-modify-write a tenant's memory (never clobbers a field it didn't set). */
function mutateMemory(
  tenantEmail: string,
  dataDir: string | undefined,
  fn: (mem: FirmMemory) => FirmMemory,
): void {
  requireTenant(tenantEmail);
  const index = readIndex(dataDir);
  const current = readFirmMemory(tenantEmail, dataDir);
  const next = fn(current);
  index[tenantEmail] = { ...next, updatedAt: Date.now() };
  writeIndex(index, dataDir);
}

// ── Writers (internal metadata only — never provider writes) ────────────────

/** Record a processor result/insight to the tenant's recent tail (size-capped). */
export function recordInsight(
  tenantEmail: string,
  entry: Omit<MemoryEntry, "ts" | "type"> & { type?: "insight" },
  dataDir?: string,
): void {
  mutateMemory(tenantEmail, dataDir, (mem) => ({
    ...mem,
    recentInsights: [...mem.recentInsights, { ...entry, type: "insight" as const, ts: Date.now() }]
      .slice(-MAX_RECENT_INSIGHTS),
  }));
}

/** Record an audit event (ran / approved / rejected) to the tenant's tail. */
export function recordAudit(
  tenantEmail: string,
  entry: Omit<MemoryEntry, "ts" | "type"> & { type?: "audit" },
  dataDir?: string,
): void {
  mutateMemory(tenantEmail, dataDir, (mem) => ({
    ...mem,
    auditTail: [...mem.auditTail, { ...entry, type: "audit" as const, ts: Date.now() }]
      .slice(-MAX_AUDIT_TAIL),
  }));
}

/** Set/refine an explicit firm rule (e.g. "vendor-x.reconciled" -> "true"). */
export function setFirmRule(
  tenantEmail: string,
  key: string,
  value: string,
  dataDir?: string,
): void {
  requireTenant(tenantEmail);
  if (!key?.trim()) throw new Error("setFirmRule requires a rule key");
  mutateMemory(tenantEmail, dataDir, (mem) => {
    const next = { ...mem.rules };
    if (Object.keys(next).length >= MAX_RULES && !(key in next)) {
      // Size-cap: drop the oldest rule to make room (FIFO).
      const oldestKey = Object.keys(next)[0];
      delete next[oldestKey];
    }
    next[key] = String(value);
    return { ...mem, rules: next };
  });
}

// ── Composed context ────────────────────────────────────────────────────────

/**
 * Compose a tenant's operational context for a run/chain: firm rules (explicit
 * + reflected from tenant-settings), the tenant's processor calibration, and the
 * recent memory (insights + audit tail). Strictly per-tenant; safe when the
 * tenant has no memory yet (defaults).
 *
 * `dataDir` isolates the store in tests; production uses the default data dir.
 */
export function buildAgentContext(tenantEmail: string, dataDir?: string): AgentContext {
  if (!tenantEmail?.trim()) {
    throw new Error("buildAgentContext requires a tenantEmail");
  }
  const mem = readFirmMemory(tenantEmail, dataDir);
  const settings = getTenantSettings(tenantEmail, dataDir);
  const calibration = getProcessorCalibration(tenantEmail, dataDir);

  const firmRules: Record<string, string> = {
    ...mem.rules,
    workspacePreference: settings.workspacePreference || "auto",
    approvalMode: settings.approvalMode || "on",
  };

  return {
    tenantEmail,
    firmRules,
    calibration,
    memory: {
      recentInsights: mem.recentInsights,
      auditTail: mem.auditTail,
      updatedAt: mem.updatedAt,
    },
  };
}
