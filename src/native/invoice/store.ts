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
  NATIVE_INVOICE_SLUGS_KEY,
  MAX_INVOICES_PER_TENANT,
  type InvoiceDeliveryAttempt,
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
/** Randomized, unguessable public share slug (no tenant data inside it). */
export function generateInvoiceShareSlug(): string {
  return `si_${Date.now().toString(36)}${randomBytes(9).toString("base64url")}`;
}

// ── Public share-slug index (slug → tenantId ONLY) ─────────────────────────
// Same discipline as native forms (1.3) / proposals (2.1): the global index
// carries nothing but the tenant pointer, so a public lookup can never be
// turned into a listing. A slug that is not in the index → 404 (fail-closed).
function loadSlugs(dataDir: string): Record<string, string> {
  const raw = readJSON(dataPath(dataDir, NATIVE_INVOICE_SLUGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
function saveSlugs(dataDir: string, slugs: Record<string, string>): void {
  writeJSON(dataPath(dataDir, NATIVE_INVOICE_SLUGS_KEY), slugs);
}
export function lookupInvoiceShareTenant(dataDir: string, slug: string): string | null {
  if (!/^si_[A-Za-z0-9_-]+$/.test(slug)) return null;
  const t = loadSlugs(dataDir)[slug];
  return typeof t === "string" && t.length > 0 ? t : null;
}
export function registerInvoiceSlug(dataDir: string, slug: string, tenantId: string): void {
  const slugs = loadSlugs(dataDir);
  slugs[slug] = tenantId;
  saveSlugs(dataDir, slugs);
}
/** Remove ONE slug (never a glob, never a bulk sweep). */
export function unregisterInvoiceSlug(dataDir: string, slug: string): void {
  const slugs = loadSlugs(dataDir);
  if (!(slug in slugs)) return;
  delete slugs[slug];
  saveSlugs(dataDir, slugs);
}
export function getInvoiceBySlug(dataDir: string, tenantId: string, slug: string): InvoiceRecord | null {
  return listInvoices(dataDir, tenantId).find((i) => i.shareSlug === slug) ?? null;
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
 * Apply an op-specific mutation to an existing invoice (status transition,
 * newly generated docId, minted share slug, delivery attempt). Returns the
 * updated record or null (unknown → 404). `sentAt`/`sentBy` are stamped ONLY
 * on a transition to "sent" — the one status that claims delivery happened.
 */
export function applyInvoiceMutation(
  dataDir: string,
  tenantId: string,
  invoiceId: string,
  mutation: {
    status?: InvoiceStatus;
    docId?: string;
    /** `null` RETIRES the public link (slice 152 revoke) — the record then
     *  carries no slug at all, exactly as before it was minted. */
    shareSlug?: string | null;
    /** Stamped when a tenant revokes the public link (slice 152). */
    shareRevokedAt?: string;
    customerEmail?: string;
    lastAttempt?: InvoiceDeliveryAttempt;
    /** Truthful "a payment was STARTED" stamp — never a "paid" claim. */
    paymentStartedAt?: string;
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
    ...(mutation.status !== undefined
      ? { status: mutation.status, ...(mutation.status === "sent" ? { sentAt: now, sentBy: actor } : {}) }
      : {}),
    ...(mutation.docId !== undefined && mutation.docId !== null ? { docId: mutation.docId } : {}),
    ...(mutation.shareSlug !== undefined ? { shareSlug: mutation.shareSlug } : {}),
    ...(mutation.shareRevokedAt !== undefined ? { shareRevokedAt: mutation.shareRevokedAt } : {}),
    ...(mutation.customerEmail !== undefined ? { customerEmail: mutation.customerEmail } : {}),
    ...(mutation.lastAttempt !== undefined ? { lastAttempt: mutation.lastAttempt } : {}),
    ...(mutation.paymentStartedAt !== undefined ? { paymentStartedAt: mutation.paymentStartedAt } : {}),
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