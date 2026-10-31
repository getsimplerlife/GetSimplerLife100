/**
 * native/import/sftp-source.ts — Phase 5.1 (6.4) SFTP FILE SOURCE LANE.
 *
 * Fourth client-optional import source on the shipped 6.1 core (PR #285), the
 * file-shaped twin of the 6.4 OneDrive lane (src/native/import/onedrive-source.ts,
 * PR #288, main 0460572) but for the tenant's OWN SFTP(S) configuration they
 * already store in the Phase 4.1 SECURE TRANSPORT slice
 * (src/native/transport — client-managed SFTP creds: host/port/username/auth,
 * encrypted at rest with AES-256-GCM, NEVER returned by any read lane).
 *
 * Honesty contract — this lane is a CONFIG-METADATA snapshot, NOT a live
 * transfer, and it says so on every run:
 *   - STRICT tenant scoping: it reads ONLY `listConnections(dataDir, tenantId)`
 *     + `listRules(dataDir, tenantId)` from the 4.1 transport store, which is
 *     tenant-keyed by structure — there is no cross-tenant fallback and no
 *     provider API call at all; a tenant with no stored connection fails
 *     honestly (0 rows pulled; nothing fabricated),
 *   - deterministic flattening ONLY (NO LLM): fixed safe scalar field lists
 *     for connections (the same fields the 4.1 publicConnection projection
 *     exposes: id/name/host/port/username/authMode/poolMax/failClosed/audit +
 *     a derived hasSecret boolean) and rules (id/name/connectionId/direction/
 *     remoteDir/localDir/pattern/fileSizeCapMb/audit + derived monitor
 *     booleans). The AES-256-GCM encrypted secret NEVER leaves the store —
 *     rows carry `hasSecret: true`, never the blob,
 *   - the stored credential material IS validated as usable at pull time
 *     (decryptSecret on each connection — an honest auth check), so a corrupt
 *     or missing secret fails the pull with an actionable message instead of
 *     staging rows that can never be acted on,
 *   - bounded snapshot: connections and rules sliced to MAX_PAGE_SIZE (100)
 *     each and the combined rows capped at MAX_STAGING_ROWS (200) + the gate's
 *     512 KiB byte cap (enforced here and by the caller),
 *   - HONEST RUN OUTCOMES: every pull records pulled/mapped/failed; notes say
 *     "no live SFTP connection or file listing was made by this lane — file
 *     content transfer is the follow-up slice", "0 fabricated" and "nothing
 *     imported until you approve" (file CONTENT commit = separate gated-verbs
 *     follow-up, per plan 6.4). No httpStatus is set: NO provider HTTP call
 *     happened (types.ts: absent when no provider call occurred),
 *   - secrets never returned: the credential blob exists only inside the 4.1
 *     store; this reader only ever derives hasSecret,
 *   - fail-closed: absent connection config or unusable credential material →
 *     throw SftpImportSourceError → the import gate records an honest FAILED
 *     run (native.import.failed event) and the pull returns an error.
 */
import { decryptSecret, listConnections, listRules } from "../transport/store";
import type { SftpConnection, TransferRule } from "../transport/types";
import { registerImportSource, type ImportSourceReader } from "./gate";
import { MAX_PAGE_SIZE, MAX_STAGING_ROWS } from "./types";

/** Fixed safe scalar fields for a connection row — the exact fields the 4.1
 *  `publicConnection` projection exposes. NEVER includes secretEncrypted. */
const CONNECTION_FIELDS = [
  "id",
  "name",
  "host",
  "port",
  "username",
  "authMode",
  "poolMax",
  "failClosed",
  "createdAt",
  "updatedAt",
] as const;

/** Fixed safe scalar fields for a rule row (monitor booleans are derived
 *  below — the nested `monitor` object is never staged as-is). */
const RULE_BASE_FIELDS = [
  "id",
  "name",
  "connectionId",
  "direction",
  "remoteDir",
  "localDir",
  "pattern",
  "fileSizeCapMb",
  "createdAt",
  "updatedAt",
] as const;

/** Helper: keep only scalar values (string/number/boolean/null) — skip nested
 *  objects/arrays deterministically so staged rows stay flat and bounded. */
function pickScalars(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = record[f];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[f] = v;
  }
  return out;
}

/** Flatten one stored SFTP connection: safe scalars + a derived `hasSecret`
 *  boolean. The encrypted secret blob itself is NEVER staged. */
function flattenConnection(c: SftpConnection): Record<string, unknown> {
  const out = pickScalars(c as unknown as Record<string, unknown>, CONNECTION_FIELDS);
  out.kind = "connection";
  out.hasSecret = typeof c.secretEncrypted === "string" && c.secretEncrypted.length > 0;
  return out;
}

/** Flatten one transfer rule: safe scalars + derived monitor booleans. */
function flattenRule(r: TransferRule): Record<string, unknown> {
  const out = pickScalars(r as unknown as Record<string, unknown>, RULE_BASE_FIELDS);
  out.kind = "rule";
  out.monitorNewFile = Boolean(r.monitor?.newFile);
  out.monitorContentChange = Boolean(r.monitor?.contentChange);
  return out;
}

/** Error for SFTP lane failures. No httpStatus is ever set — this lane makes
 *  no provider HTTP call; the gate still records an honest FAILED run. */
export class SftpImportSourceError extends Error {
  httpStatus?: number;
  constructor(message: string) {
    super(message);
    this.name = "SftpImportSourceError";
  }
}

/** Build the SFTP import source reader (no deps — this lane performs NO live
 *  network I/O; it reads the tenant's own 4.1 transport config store). */
export function makeSftpImportSourceReader(): ImportSourceReader {
  return async (ctx) => {
    const { dataDir, tenantId } = ctx;
    // 1. STRICT tenant-scoped read of the tenant's OWN stored SFTP config.
    //    listConnections/listRules are tenant-keyed by structure — a foreign
    //    tenant's rows can never be reached from here.
    const connections = listConnections(dataDir, tenantId);
    if (connections.length === 0) {
      throw new SftpImportSourceError(
        `No SFTP connection is configured for this tenant — configure your own SFTP server connection in Secure Transport to import (0 rows pulled; nothing fabricated).`,
      );
    }
    // 2. Honest auth-material check: the stored credential must be decryptable
    //    (usable). We never return it — only confirm it exists and decrypts.
    for (const c of connections) {
      if (typeof c.secretEncrypted !== "string" || c.secretEncrypted.length === 0) {
        throw new SftpImportSourceError(
          `SFTP connection "${c.name}" has no stored credential — the client must enter that credential again in Secure Transport (0 rows pulled; nothing fabricated).`,
        );
      }
      try {
        decryptSecret(c.secretEncrypted);
      } catch {
        throw new SftpImportSourceError(
          `SFTP connection "${c.name}" has unusable stored credentials (could not decrypt) — the client must enter that credential again in Secure Transport (0 rows pulled; nothing fabricated).`,
        );
      }
    }
    // 3. Bounded deterministic snapshot of the tenant's own config metadata.
    const rows: Record<string, unknown>[] = [];
    for (const c of connections.slice(0, MAX_PAGE_SIZE)) rows.push(flattenConnection(c));
    for (const r of listRules(dataDir, tenantId).slice(0, MAX_PAGE_SIZE)) rows.push(flattenRule(r));
    const sliced = rows.slice(0, MAX_STAGING_ROWS);
    const byteLength = new TextEncoder().encode(JSON.stringify(sliced)).byteLength;
    if (byteLength > 512 * 1024) {
      throw new SftpImportSourceError("SFTP config snapshot exceeds the 512 KiB staging cap — 0 rows pulled (nothing fabricated).");
    }
    const connCount = sliced.filter((r) => r.kind === "connection").length;
    const ruleCount = sliced.filter((r) => r.kind === "rule").length;
    const noteParts = [
      "SFTP config metadata snapshot from the tenant's own Secure Transport store",
      `${connCount} connection(s), ${ruleCount} rule(s)`,
      sliced.length === 0 ? "0 rows staged — nothing imported until you approve" : `${sliced.length} row(s) staged for review — nothing imported until you approve`,
      "no live SFTP connection or file listing was made by this lane — file content transfer is the follow-up slice",
      "0 fabricated",
    ];
    return { rows: sliced, note: noteParts.join("; ") };
  };
}

/** Register the SFTP lane in the import source registry (idempotent). Called
 *  by prod-server at boot and by tests. One-shot/client-initiated re-runs
 *  only — no webhooks, no write-back, no re-authorisation program (owner 10-20). */
export function registerSftpImportSource(): void {
  registerImportSource("sftp", makeSftpImportSourceReader());
}