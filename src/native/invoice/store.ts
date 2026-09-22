/**
 * native/invoice/store.ts — durable, tenant-keyed INVOICE store (Phase 2.5).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign invoice id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates on its own.
 * - Every mutation appends an IMMUTABLE native.invoice.* audit entry.
 * - Invoice numbers are a per-tenant monotonic sequence (INV-0001, …) —
 *   server-assigned, never client-supplied, and the record NEVER stores
 *   PDF bytes (docId → Phase 1.2 add-only doc history, exactly like 2.1).
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_INVOICES_KEY,
  NATIVE_INVOICES_AUDIT_KEY,
  MAX_INVOICES_PER_TENANT,
  type InvoiceRecord,
  type InvoiceStatus,
  type PendingInvoiceWrite,
} from "./types";

export interface NativeInvoiceAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.invoice.<create|generate|send|delete|pending>.*
  invoiceId: string;
  detail: string;
}

interface TenantInvoiceState {
  invoices: InvoiceRecord[];
  pendingWrites: PendingInvoiceWrite[];
  /** Per-tenant monotonic invoice-number sequence. */
  invoiceSeq: number;
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantInvoiceState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_INVOICES_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantInvoiceState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantInvoiceState>): void {
  writeJSON(dataPath(dataDir, NATIVE_INVOICES_KEY), state);
}
export function generateInvoiceEntityId(prefix: "inv" | "ipw" | "invli"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
/** Human invoice number: per-tenant monotonic sequence, zero-padded. */
export function nextInvoiceNumber(dataDir: string, tenantId: string): string {
  const state = loadState(dataDir);
  const seq = (state[tenantId]?.invoiceSeq ?? 0) + 1;
  const tenant = state[tenantId] ?? { invoices: [], pendingWrites: [], invoiceSeq: 0 };
  tenant.invoiceSeq = seq;
  state[tenantId] = tenant;
  saveState(dataDir, state);
  return `INV-${String(seq).padStart(4, "0")}`;
}

// ── Invoices ────────────────────────────────────────────────────────────────
export function listInvoices(dataDir: string, tenantId: string): InvoiceRecord[] {
  return loadState(dataDir)[tenantId]?.invoices ?? [];
}
export function getInvoice(dataDir: string, tenantId: string, invoiceId: string): InvoiceRecord | null {
  return listInvoices(dataDir, tenantId).find((i) => i.id === invoiceId) ?? null;
}
export function countInvoices(dataDir: string, tenantId: string): number {
  return listInvoices(dataDir, tenantId).length;
}
export function removeInvoice(dataDir: string, tenantId: string, invoiceId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.invoices.findIndex((i) => i.id === invoiceId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.invoices.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
/** Insert a NEW invoice record (validated upstream; gated executor only). */
export function insertInvoice(dataDir: string, record: InvoiceRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { invoices: [], pendingWrites: [], invoiceSeq: 0 };
  if (tenant.invoices.length >= MAX_INVOICES_PER_TENANT) {
    throw new Error(`Invoice cap reached (${MAX_INVOICES_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.invoices.push(record);
  saveState(dataDir, state);
}

/**
 * Apply an op-specific mutation to an existing invoice (status transition + a
 * newly generated docId). Returns the updated record or null (unknown → 404).
 */
export function applyInvoiceMutation(
  dataDir: string,
  tenantId: string,
  invoiceId: string,
  mutation: {
    status?: InvoiceStatus;
    docId?: string;
  },
  actor: string,
): InvoiceRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.invoices.findIndex((i) => i.id === invoiceId) ?? -1;
  if (!tenant || idx < 0) return null;
  const inv = tenant.invoices[idx];
  const now = new Date().toISOString();
  const updated: InvoiceRecord = {
    ...inv,
    ...(mutation.status === "sent" ? { status: "sent" as const, sentAt: now, sentBy: actor } : {}),
    ...(mutation.docId !== undefined && mutation.docId !== null ? { docId: mutation.docId } : {}),
    version: inv.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.invoices[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingInvoiceWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingInvoiceWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { invoices: [], pendingWrites: [], invoiceSeq: 0 };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingInvoiceWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingInvoiceWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: InvoiceStatus; invoiceId?: string; error?: string },
): void {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const w = tenant?.pendingWrites.find((x) => x.id === id);
  if (!tenant || !w || w.status !== "pending") return; // idempotent
  const now = new Date().toISOString();
  if (status === "applied") {
    w.status = "applied";
    w.appliedAt = now;
    w.appliedBy = actor;
    w.appliedResult = { status: result?.status ?? "draft", invoiceId: result?.invoiceId ?? "" };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeInvoiceAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_INVOICES_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeInvoiceAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeInvoiceAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateInvoiceEntityId("ipw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_INVOICES_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeInvoiceAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}