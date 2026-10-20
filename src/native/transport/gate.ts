/**
 * native/transport/gate.ts — GATED WRITE PATH for Phase 4.1 native SECURE
 * TRANSPORT (SFTP connection config + transfer rules + PGP key ring + the
 * approval-gated transfer-run ledger).
 *
 * Mirrors the 3.4–3.8 gates exactly:
 *   - validation BEFORE the gate (bad hosts/ports, unsafe paths, forged
 *     create-ids, unknown in-tenant references, caps, malformed armor NEVER
 *     queue) — fail-closed,
 *   - every mutation rides the Approval Queue verb-first: createSftpConnection
 *     / updateSftpConnection / deleteSftpConnection / createTransferRule /
 *     updateTransferRule / deleteTransferRule / runFileTransfer /
 *     createPgpKey / deletePgpKey — every verb is ALREADY in WRITE_VERB
 *     (classification test locks the fail-open guard),
 *   - server-assigned ids ONLY (client-supplied ids on create → 400),
 *   - credentials + PGP armor are encrypted BEFORE they reach the pending
 *     mirror (plaintext never touches the durable store),
 *   - HONEST OUTCOMES: the run ledger records an approval-gated transfer
 *     REQUEST + pattern-match preview (matched/unmatched names) and an honest
 *     note that live execution requires a configured + live-verified SFTP
 *     endpoint — NEVER a fabricated "transferred"/"signed" claim,
 *   - delete lanes fail closed when a rule/key is still referenced (no
 *     dangling connections in rules, no deleted keys in rules, no runs on a
 *     deleted rule),
 *   - the durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - autonomy (#236): allow-listed actions auto-apply with
 *     recordAutonomyOutcome; destructive delete requires an explicit
 *     allow-list + known id via the shared gate rules.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  MAX_ARMORED_KEY_CHARS,
  MAX_CONNECTION_POOL,
  MAX_DAILY_TRANSFER_RUNS,
  MAX_FILENAMES_PER_RUN,
  MAX_HOST_CHARS,
  MAX_KEY_LABEL,
  MAX_PENDING_TRANSPORT_WRITES,
  MAX_PGP_KEYS_PER_TENANT,
  MAX_REMOTE_PATH_CHARS,
  MAX_LOCAL_PATH_CHARS,
  MAX_SFTP_CONNECTIONS_PER_TENANT,
  MAX_TRANSFER_RULES_PER_TENANT,
  MAX_TRANSFER_RUNS_PER_TENANT,
  MAX_USERNAME_CHARS,
  PGP_KEY_KINDS,
  TRANSPORT_AUTH_MODES,
  TRANSFER_DIRECTIONS,
  NATIVE_TRANSPORT_PROVIDER,
  NATIVE_TRANSPORT_WORKFLOW_ID,
  type PendingTransportWrite,
  type PgpKey,
  type SftpConnection,
  type TransferOp,
  type TransferRule,
  type TransferRun,
} from "./types";
import {
  appendAudit,
  countTodayRuns,
  deleteConnectionRecord,
  deleteKeyRecord,
  deleteRuleRecord,
  encryptSecret,
  fingerprintOf,
  generateTransportEntityId,
  getConnection,
  getKey,
  getPendingWriteByAction,
  getRule,
  listConnections,
  listKeys,
  listPendingWrites,
  listRules,
  listRuns,
  markPendingWrite,
  saveConnection,
  saveKey,
  savePendingWrite,
  saveRule,
  saveRun,
} from "./store";
import { matchFiles, validatePattern } from "./pattern";

const MAX_TRANSPORT_NAME = 200;
const MAX_SECRET_CHARS = 16384;

/** Verb-first action names — every verb ∈ WRITE_VERB (classification test
 *  asserts all nine; this slice's standing fail-open control). */
const ACTION_NAME: Record<TransferOp, string> = {
  createConnection: "createSftpConnection",
  updateConnection: "updateSftpConnection",
  deleteConnection: "deleteSftpConnection",
  createRule: "createTransferRule",
  updateRule: "updateTransferRule",
  deleteRule: "deleteTransferRule",
  runTransfer: "runFileTransfer",
  createKey: "createPgpKey",
  deleteKey: "deletePgpKey",
};

export type TransportWriteResult =
  | { applied: true; pending: false; op: TransferOp; id?: string; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: TransferOp }
  | { applied: false; pending: false; error: string };

// ── validation helpers (fail-closed, BEFORE the gate) ────────────────────────
function assertName(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("name is required");
  const name = v.trim();
  if (name.length > MAX_TRANSPORT_NAME) throw new Error(`name must be ≤${MAX_TRANSPORT_NAME} characters`);
  return name;
}
function assertHost(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("host is required");
  const host = v.trim();
  if (host.length > MAX_HOST_CHARS) throw new Error(`host must be ≤${MAX_HOST_CHARS} characters`);
  if (/\s/.test(host)) throw new Error("host may not contain whitespace");
  if (host.includes("://") || host.includes("/") || host.includes("\\")) throw new Error("host must be a bare hostname (no scheme or path)");
  if (host.startsWith("-")) throw new Error("invalid host");
  return host;
}
function assertPort(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("port must be an integer 1..65535");
  return n;
}
function assertUsername(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("username is required");
  const u = v.trim();
  if (u.length > MAX_USERNAME_CHARS) throw new Error(`username must be ≤${MAX_USERNAME_CHARS} characters`);
  return u;
}
function assertPoolMax(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CONNECTION_POOL) throw new Error(`poolMax must be an integer 1..${MAX_CONNECTION_POOL}`);
  return n;
}
function assertBool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${field} must be a boolean`);
  return v;
}
/** Canonical remote/local path: strip trailing slashes; reject traversal,
 *  backslashes and control chars (the 3.3–3.8 upload-safety discipline). */
function assertDirPath(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error(`${field} is required`);
  const p = v.trim().replace(/\/+$/, "");
  if (p.length > MAX_REMOTE_PATH_CHARS && p.length > MAX_LOCAL_PATH_CHARS) throw new Error(`${field} is too long`);
  if (/[\\\x00-\x1f]/.test(p)) throw new Error(`${field} may not contain backslashes or control characters`);
  const segs = p.split("/").filter(Boolean);
  if (segs.some((s) => s === ".." || s === ".")) throw new Error(`${field} may not contain '..' or '.' path segments`);
  if (!p.startsWith("/")) throw new Error(`${field} must be an absolute path starting with /`);
  return p;
}
function assertSecret(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error("password or private key is required");
  if (v.length > MAX_SECRET_CHARS) throw new Error(`secret must be ≤${MAX_SECRET_CHARS} characters`);
  return v;
}
function assertKeyLabel(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("label is required");
  const l = v.trim();
  if (l.length > MAX_KEY_LABEL) throw new Error(`label must be ≤${MAX_KEY_LABEL} characters`);
  return l;
}
function assertArmored(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("armored key material is required");
  const a = v.trim();
  if (a.length > MAX_ARMORED_KEY_CHARS) throw new Error(`key material must be ≤${MAX_ARMORED_KEY_CHARS} characters`);
  if (!a.startsWith("-----BEGIN PGP") || !a.includes("END PGP") || !a.trimEnd().endsWith("-----")) {
    throw new Error("key material must be ASCII-armored PGP (BEGIN PGP … END PGP)");
  }
  return a;
}
function assertFileNames(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_FILENAMES_PER_RUN) {
    throw new Error(`filenames must be an array of 1..${MAX_FILENAMES_PER_RUN} names`);
  }
  for (const f of v) {
    if (typeof f !== "string" || f.length === 0 || f.length > 255) throw new Error("each filename must be 1..255 characters");
    if (f.includes("/") || f.includes("\\") || /[\x00-\x1f]/.test(f)) throw new Error("filenames must be bare names (no paths)");
  }
  return v as string[];
}

/** Validate a connection write request; returns the values to persist
 *  (secret ALWAYS encrypted here — plaintext never hits the mirror/store). */
function isEncryptedBlob(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const parts = v.split(":");
  return parts.length === 3 && parts.every((x) => x.length > 0 && /^[0-9a-f]+$/i.test(x));
}
function validateConnection(
  payload: Record<string, unknown>,
): { name: string; host: string; port: number; username: string; authMode: SftpConnection["authMode"]; secretEncrypted: string; poolMax: number; failClosed: boolean } {
  if (payload.id !== undefined) throw new Error("client-supplied connection ids are not accepted"); // forged create-id → 400
  const name = assertName(payload.name);
  const host = assertHost(payload.host);
  const port = assertPort(payload.port);
  const username = assertUsername(payload.username);
  const authMode = payload.authMode as SftpConnection["authMode"];
  if (!TRANSPORT_AUTH_MODES.includes(authMode)) throw new Error("authMode must be password|key");
  const poolMax = assertPoolMax(payload.poolMax ?? 4);
  const failClosed = assertBool(payload.failClosed ?? true, "failClosed");
  // Apply-time revalidation of the durable mirror carries the ALREADY-encrypted
  // secret (plaintext never rests in the mirror). A well-formed encrypted blob
  // is accepted as-is; otherwise a raw secret is validated + encrypted now.
  const rawSecret = payload.secret ?? payload.password ?? payload.privateKey;
  const secretEncrypted =
    rawSecret === undefined && isEncryptedBlob(payload.secretEncrypted)
      ? (payload.secretEncrypted as string)
      : encryptSecret(assertSecret(rawSecret));
  return { name, host, port, username, authMode, secretEncrypted, poolMax, failClosed };
}

/** Validate a rule write request; connection/pgp references MUST resolve
 *  in-tenant (else 404-no-IDOR). */
function validateRule(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  mode: "create" | "update",
): { name: string; connectionId: string; direction: TransferRule["direction"]; remoteDir: string; localDir: string; pattern: string; monitor: { newFile: boolean; contentChange: boolean }; pgpKeyId?: string; fileSizeCapMb: number } {
  if (body.id !== undefined) throw new Error("client-supplied rule ids are not accepted");
  const name = assertName(body.name);
  if (typeof body.connectionId !== "string" || body.connectionId.length === 0) throw new Error("connectionId is required");
  if (!getConnection(dataDir, tenantId, body.connectionId)) throw new Error("connection not found"); // foreign/stranger → 400 (no IDOR)
  const direction = body.direction as TransferRule["direction"];
  if (!TRANSFER_DIRECTIONS.includes(direction)) throw new Error("direction must be upload|download");
  const remoteDir = assertDirPath(body.remoteDir, "remoteDir");
  const localDir = assertDirPath(body.localDir, "localDir");
  const pattern = (typeof body.pattern === "string" ? body.pattern : "").trim();
  validatePattern(pattern); // throws on separators / traversal / control chars
  const monitor = body.monitor as { newFile?: unknown; contentChange?: unknown } | undefined;
  const newFile = assertBool(monitor?.newFile ?? false, "monitor.newFile");
  const contentChange = assertBool(monitor?.contentChange ?? false, "monitor.contentChange");
  if (!newFile && !contentChange) throw new Error("at least one monitor trigger must be enabled (newFile or contentChange)");
  const fileSizeCapMb = Number(body.fileSizeCapMb ?? 100);
  if (!Number.isInteger(fileSizeCapMb) || fileSizeCapMb < 1 || fileSizeCapMb > 1024) throw new Error("fileSizeCapMb must be an integer 1..1024");
  let pgpKeyId: string | undefined;
  if (body.pgpKeyId !== undefined && body.pgpKeyId !== null && body.pgpKeyId !== "") {
    if (typeof body.pgpKeyId !== "string" || !getKey(dataDir, tenantId, body.pgpKeyId)) {
      throw new Error("pgp key not found"); // foreign/stranger → 400 (no IDOR)
    }
    pgpKeyId = body.pgpKeyId;
  }
  void mode;
  return { name, connectionId: body.connectionId, direction, remoteDir, localDir, pattern, monitor: { newFile, contentChange }, pgpKeyId, fileSizeCapMb };
}

/** Validate a PGP key write; armor structure checked + fingerprint derived
 *  server-side (plaintext NEVER stored). */
function validateKey(payload: Record<string, unknown>): { label: string; kind: PgpKey["kind"]; armoredEncrypted: string; fingerprint: string } {
  if (payload.id !== undefined) throw new Error("client-supplied key ids are not accepted");
  const label = assertKeyLabel(payload.label);
  const kind = payload.kind as PgpKey["kind"];
  if (!PGP_KEY_KINDS.includes(kind)) throw new Error("key kind must be public|private|signing");
  // Apply-time revalidation of the mirror: armored is already encrypted at rest.
  if (payload.armored === undefined && isEncryptedBlob(payload.armoredEncrypted)) {
    return { label, kind, armoredEncrypted: payload.armoredEncrypted as string, fingerprint: payload.fingerprint as string };
  }
  const armored = assertArmored(payload.armored);
  return { label, kind, armoredEncrypted: encryptSecret(armored), fingerprint: fingerprintOf(armored) };
}

/** Validate the transfer-run request; pattern-match preview computed HERE
 *  (deterministic) and stored with the run. */
function validateRun(
  dataDir: string,
  tenantId: string,
  payload: Record<string, unknown>,
): { rule: TransferRule; filenames: string[]; matched: string[]; unmatched: string[] } {
  if (typeof payload.ruleId !== "string" || payload.ruleId.length === 0) throw new Error("ruleId is required");
  const rule = getRule(dataDir, tenantId, payload.ruleId);
  if (!rule) throw new Error("rule not found"); // foreign/stranger → 400 (no IDOR)
  const filenames = assertFileNames(payload.filenames);
  const { matched, unmatched } = matchFiles(rule.pattern, filenames);
  return { rule, filenames, matched, unmatched };
}

export interface TransportWriteRequest {
  payload: Record<string, unknown>;
  via?: string;
}

/**
 * Submit a gated secure-transport write. Validation FIRST — bad writes 400
 * before the queue. Returns applied / pending / error.
 */
export function submitTransportWrite(
  dataDir: string,
  tenantId: string,
  op: TransferOp,
  req: TransportWriteRequest,
  actor: string,
): TransportWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];

  // 1. Fail-closed validation BEFORE the gate + cap pre-checks.
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, op, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }

  // 2. Gate (verb-first, every verb ALREADY in WRITE_VERB).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_TRANSPORT_PROVIDER, { op, via: req.via ?? "portal" }, { dataDir, workflowId: NATIVE_TRANSPORT_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, NATIVE_TRANSPORT_WORKFLOW_ID, action, NATIVE_TRANSPORT_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }

  // 3. Queue: cap the pending mirror, then persist the durable card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_TRANSPORT_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_TRANSPORT_WRITES}) — approve or reject before more` };
  }
  const tpw: PendingTransportWrite = {
    id: generateTransportEntityId("tpw"),
    tenantId,
    op,
    action,
    payload: prepared,
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, tpw);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(op, "pending"), entityId: tpw.id, detail: `Queued ${action} for approval (${tpw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(op, "pending"), { op, tpwId: tpw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Validate + normalize the payload into what applyNow persists. Secrets are
 *  encrypted HERE so plaintext never reaches the pending mirror or store. */
function prepareWrite(dataDir: string, tenantId: string, op: TransferOp, payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  switch (op) {
    case "createConnection": {
      if (listConnections(dataDir, tenantId).length >= MAX_SFTP_CONNECTIONS_PER_TENANT) {
        throw new Error(`connection cap reached (${MAX_SFTP_CONNECTIONS_PER_TENANT})`);
      }
      return validateConnection(payload) as unknown as Record<string, unknown>;
    }
    case "updateConnection": {
      if (typeof payload.connectionId !== "string" || !getConnection(dataDir, tenantId, payload.connectionId)) throw new Error("connection not found");
      if (payload.id !== undefined) throw new Error("client-supplied connection ids are not accepted");
      // Secret optional on update: only re-encrypt when a NEW secret is provided.
      const base = getConnection(dataDir, tenantId, payload.connectionId)!;
      const merged: Record<string, unknown> = { ...payload, connectionId: base.id };
      if (payload.secret !== undefined || payload.password !== undefined || payload.privateKey !== undefined) {
        const s = assertSecret(payload.secret ?? payload.password ?? payload.privateKey);
        merged.secretEncrypted = encryptSecret(s);
      } else {
        merged.secretEncrypted = base.secretEncrypted;
      }
      delete merged.secret;
      delete merged.password;
      delete merged.privateKey;
      const v = validateConnection({ ...merged, id: undefined });
      return { ...v, connectionId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteConnection": {
      if (typeof payload.connectionId !== "string" || !getConnection(dataDir, tenantId, payload.connectionId)) throw new Error("connection not found");
      if (listRules(dataDir, tenantId).some((r) => r.connectionId === payload.connectionId)) {
        throw new Error("cannot delete a connection that transfer rules still reference");
      }
      return { connectionId: payload.connectionId } as Record<string, unknown>;
    }
    case "createRule": {
      if (listRules(dataDir, tenantId).length >= MAX_TRANSFER_RULES_PER_TENANT) {
        throw new Error(`rule cap reached (${MAX_TRANSFER_RULES_PER_TENANT})`);
      }
      return validateRule(dataDir, tenantId, payload, "create") as unknown as Record<string, unknown>;
    }
    case "updateRule": {
      if (typeof payload.ruleId !== "string" || !getRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      const base = getRule(dataDir, tenantId, payload.ruleId)!;
      const merged: Record<string, unknown> = {
        connectionId: base.connectionId,
        direction: base.direction,
        remoteDir: base.remoteDir,
        localDir: base.localDir,
        pattern: base.pattern,
        monitor: base.monitor,
        pgpKeyId: base.pgpKeyId,
        fileSizeCapMb: base.fileSizeCapMb,
        name: base.name,
        ...payload,
        id: undefined,
        ruleId: undefined,
      };
      const v = validateRule(dataDir, tenantId, merged, "update");
      return { ...v, ruleId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteRule": {
      if (typeof payload.ruleId !== "string" || !getRule(dataDir, tenantId, payload.ruleId)) throw new Error("rule not found");
      if (listRuns(dataDir, tenantId).some((r) => r.ruleId === payload.ruleId)) {
        throw new Error("cannot delete a rule that has transfer runs");
      }
      return { ruleId: payload.ruleId } as Record<string, unknown>;
    }
    case "runTransfer": {
      if (countTodayRuns(dataDir, tenantId) >= MAX_DAILY_TRANSFER_RUNS) {
        throw new Error(`daily transfer-run cap (${MAX_DAILY_TRANSFER_RUNS}) reached`);
      }
      if (listRuns(dataDir, tenantId).length >= MAX_TRANSFER_RUNS_PER_TENANT) {
        throw new Error(`transfer-run ledger cap (${MAX_TRANSFER_RUNS_PER_TENANT}) reached`);
      }
      const { rule, filenames, matched, unmatched } = validateRun(dataDir, tenantId, payload);
      return { ruleId: rule.id, filenames, matched, unmatched } as Record<string, unknown>;
    }
    case "createKey": {
      if (listKeys(dataDir, tenantId).length >= MAX_PGP_KEYS_PER_TENANT) {
        throw new Error(`PGP key cap reached (${MAX_PGP_KEYS_PER_TENANT})`);
      }
      return validateKey(payload) as unknown as Record<string, unknown>;
    }
    case "deleteKey": {
      if (typeof payload.keyId !== "string" || !getKey(dataDir, tenantId, payload.keyId)) throw new Error("key not found");
      if (listRules(dataDir, tenantId).some((r) => r.pgpKeyId === payload.keyId)) {
        throw new Error("cannot delete a key that transfer rules still reference");
      }
      return { keyId: payload.keyId } as Record<string, unknown>;
    }
    default:
      throw new Error("unknown transport op");
  }
}

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: TransferOp,
  p: Record<string, unknown>,
  actor: string,
  autonomy: boolean,
): { ok: true; id?: string } | { ok: false; error: string } {
  const now = new Date().toISOString();
  const auditActor = autonomy ? "system/autonomy" : actor;
  const suffix = autonomy ? " (autonomy)" : "";
  try {
    if (op === "createConnection") {
      const c: SftpConnection = {
        id: generateTransportEntityId("sfc"),
        tenantId,
        name: p.name as string,
        host: p.host as string,
        port: p.port as number,
        username: p.username as string,
        authMode: p.authMode as SftpConnection["authMode"],
        secretEncrypted: p.secretEncrypted as string,
        poolMax: p.poolMax as number,
        failClosed: p.failClosed as boolean,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveConnection(dataDir, c);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.connection.created", entityId: c.id, detail: `Created SFTP connection "${c.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.connection.created", { connectionId: c.id, name: c.name });
      return { ok: true, id: c.id };
    }
    if (op === "updateConnection") {
      const base = getConnection(dataDir, tenantId, p.connectionId as string);
      if (!base) return { ok: false, error: "connection not found" };
      const next: SftpConnection = {
        ...base,
        name: p.name as string,
        host: p.host as string,
        port: p.port as number,
        username: p.username as string,
        authMode: p.authMode as SftpConnection["authMode"],
        secretEncrypted: p.secretEncrypted as string,
        poolMax: p.poolMax as number,
        failClosed: p.failClosed as boolean,
        updatedAt: now,
        updatedBy: actor,
      };
      saveConnection(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.connection.updated", entityId: base.id, detail: `Updated SFTP connection "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.connection.updated", { connectionId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteConnection") {
      deleteConnectionRecord(dataDir, tenantId, p.connectionId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.connection.deleted", entityId: p.connectionId as string, detail: `Deleted SFTP connection${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.connection.deleted", { connectionId: p.connectionId });
      return { ok: true, id: p.connectionId as string };
    }
    if (op === "createRule") {
      const r: TransferRule = {
        id: generateTransportEntityId("tru"),
        tenantId,
        name: p.name as string,
        connectionId: p.connectionId as string,
        direction: p.direction as TransferRule["direction"],
        remoteDir: p.remoteDir as string,
        localDir: p.localDir as string,
        pattern: p.pattern as string,
        monitor: p.monitor as { newFile: boolean; contentChange: boolean },
        pgpKeyId: p.pgpKeyId as string | undefined,
        fileSizeCapMb: p.fileSizeCapMb as number,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      };
      saveRule(dataDir, r);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.rule.created", entityId: r.id, detail: `Created transfer rule "${r.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.rule.created", { ruleId: r.id, name: r.name });
      return { ok: true, id: r.id };
    }
    if (op === "updateRule") {
      const base = getRule(dataDir, tenantId, p.ruleId as string);
      if (!base) return { ok: false, error: "rule not found" };
      const next: TransferRule = { ...base, name: p.name as string, connectionId: p.connectionId as string, direction: p.direction as TransferRule["direction"], remoteDir: p.remoteDir as string, localDir: p.localDir as string, pattern: p.pattern as string, monitor: p.monitor as { newFile: boolean; contentChange: boolean }, pgpKeyId: p.pgpKeyId as string | undefined, fileSizeCapMb: p.fileSizeCapMb as number, updatedAt: now, updatedBy: actor };
      saveRule(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.rule.updated", entityId: base.id, detail: `Updated transfer rule "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.rule.updated", { ruleId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteRule") {
      deleteRuleRecord(dataDir, tenantId, p.ruleId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.rule.deleted", entityId: p.ruleId as string, detail: `Deleted transfer rule${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.rule.deleted", { ruleId: p.ruleId });
      return { ok: true, id: p.ruleId as string };
    }
    if (op === "runTransfer") {
      const run: TransferRun = {
        id: generateTransportEntityId("trn"),
        tenantId,
        ruleId: p.ruleId as string,
        filenames: p.filenames as string[],
        matchedFiles: p.matched as string[],
        unmatchedFiles: p.unmatched as string[],
        status: "applied",
        outcome: "recorded",
        note: "Recorded as an approval-gated transfer request. Live execution requires a configured + live-verified SFTP endpoint (provider-connection pause) — no file was moved or encrypted by this slice.",
        createdAt: now,
        createdBy: actor,
        decidedAt: autonomy ? now : undefined,
        decidedBy: autonomy ? "system/autonomy" : undefined,
      };
      saveRun(dataDir, run);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.sftp.run.recorded", entityId: run.id, detail: `Recorded transfer run for rule ${run.ruleId} (${run.matchedFiles.length} matched of ${run.filenames.length})${suffix}` });
      publishEvent(dataDir, tenantId, "native.sftp.run.recorded", { runId: run.id, ruleId: run.ruleId, matched: run.matchedFiles.length, total: run.filenames.length });
      return { ok: true, id: run.id };
    }
    if (op === "createKey") {
      const k: PgpKey = {
        id: generateTransportEntityId("pgk"),
        tenantId,
        label: p.label as string,
        kind: p.kind as PgpKey["kind"],
        armoredEncrypted: p.armoredEncrypted as string,
        fingerprint: p.fingerprint as string,
        createdAt: now,
        createdBy: actor,
      };
      saveKey(dataDir, k);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.pgp.key.created", entityId: k.id, detail: `Created ${k.kind} PGP key "${k.label}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.pgp.key.created", { keyId: k.id, label: k.label, kind: k.kind });
      return { ok: true, id: k.id };
    }
    if (op === "deleteKey") {
      deleteKeyRecord(dataDir, tenantId, p.keyId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.pgp.key.deleted", entityId: p.keyId as string, detail: `Deleted PGP key${suffix}` });
      publishEvent(dataDir, tenantId, "native.pgp.key.deleted", { keyId: p.keyId });
      return { ok: true, id: p.keyId as string };
    }
    return { ok: false, error: "unknown transport op" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingTransportWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; id?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: (ptw.appliedResult?.id as string) ?? undefined, ptwId: ptw.id };
  }
  // Re-validate at apply time (authority does not bypass the contract).
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, ptw.op, ptw.payload as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const out = applyNow(dataDir, tenantId, ptw.op, prepared, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", { appliedResult: { id: out.id } });
  return { ok: true, id: out.id, ptwId: ptw.id };
}

/** REJECT path — the card is discarded; nothing is written. */
export function rejectTransportWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: "rejected by owner" });
  markRejected(tenantId, ptw.approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(ptw.op, "rejected"), entityId: ptw.id, detail: `Rejected ${ptw.action} (${ptw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(ptw.op, "rejected"), { op: ptw.op, tpwId: ptw.id });
  return { ok: true };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingTransportWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", id: res.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) },
      dataDir,
    );
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: "rejected by owner" });
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Audit action name for an op+phase (native.sftp.* / native.pgp.*). */
function auditActionFor(op: TransferOp, phase: "pending" | "applied" | "rejected"): string {
  if (op === "createKey" || op === "deleteKey") {
    return op === "createKey" ? "native.pgp.key.pending" : "native.pgp.key.rejected";
  }
  const map: Record<string, string> = {
    createConnection: "native.sftp.connection.pending",
    updateConnection: "native.sftp.connection.pending",
    deleteConnection: "native.sftp.connection.pending",
    createRule: "native.sftp.rule.pending",
    updateRule: "native.sftp.rule.pending",
    deleteRule: "native.sftp.rule.pending",
    runTransfer: "native.sftp.run.pending",
  };
  return phase === "rejected" ? map[op] ?? "native.sftp.pending" : map[op] ?? "native.sftp.pending";
}
function eventTypeFor(op: TransferOp, phase: "pending" | "applied" | "rejected"): string {
  if (phase === "pending") {
    return op === "createKey" || op === "deleteKey" ? "native.pgp.key.pending" : "native.sftp.pending";
  }
  if (phase === "rejected") {
    return op === "createKey" || op === "deleteKey" ? "native.pgp.key.rejected" : "native.sftp.rejected";
  }
  return op === "createKey" || op === "deleteKey" ? "native.pgp.key.applied" : "native.sftp.applied";
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_TRANSPORT_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

/** Safe GET projection for a connection — NEVER exposes secretEncrypted. */
export function publicConnection(c: SftpConnection): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    authMode: c.authMode,
    hasSecret: c.secretEncrypted.length > 0,
    poolMax: c.poolMax,
    failClosed: c.failClosed,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
/** Safe GET projection for a PGP key — NEVER exposes armoredEncrypted. */
export function publicKey(k: PgpKey): Record<string, unknown> {
  return { id: k.id, label: k.label, kind: k.kind, fingerprint: k.fingerprint, createdAt: k.createdAt, createdBy: k.createdBy };
}
export function publicRun(r: TransferRun): TransferRun {
  return { ...r };
}
export function publicRule(r: TransferRule): TransferRule {
  return { ...r };
}
export function getActionName(op: TransferOp): string {
  return ACTION_NAME[op];
}