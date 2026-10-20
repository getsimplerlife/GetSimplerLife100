/**
 * native/transport/types.ts — Phase 4.1 native SECURE TRANSPORT slice
 * (SFTP connection config + pattern-matched transfer rules + PGP key ring +
 * a durable, approval-gated transfer-run ledger).
 *
 * Discipline mirrors 1.4/3.4/3.5/3.6/3.7/3.8 exactly:
 *   - tenant-keyed stores + durable pending-write mirror + immutable
 *     native.sftp.* / native.pgp.* audit; server-assigned ids ONLY
 *     (sfc_/tru_/trn_/pgk_/tpw_),
 *   - every user-initiated WRITE rides the Approval Queue verb-first
 *     (createSftpConnection / updateSftpConnection / deleteSftpConnection /
 *     createTransferRule / updateTransferRule / deleteTransferRule /
 *     runFileTransfer / createPgpKey / deletePgpKey — every verb is ALREADY
 *     in WRITE_VERB; the classification test locks the fail-open guard),
 *   - validation BEFORE the gate: bad hosts/ports, forged ids, unsafe paths,
 *     malformed armor, caps and unknown in-tenant references NEVER queue
 *     (fail-closed),
 *   - HONEST OUTCOMES ONLY: this slice manages connection CONFIG, transfer
 *     RULES, PGP KEYS and a durable transfer-run LEDGER. It NEVER claims a
 *     live SFTP transfer happened or that bytes were encrypted/moved — live
 *     execution requires a configured + live-verified endpoint
 *     (provider-connection pause, owner 09-20); runs are recorded as
 *     approval-gated requests with the pattern-match preview, never
 *     fabricated "transferred"/"signed",
 *   - credentials and key material are stored ENCRYPTED AT REST (AES-256-GCM,
 *     key = INTEGRATION_ENCRYPTION_KEY when set, else per-process random —
 *     hermetic in tests) and NEVER returned by any GET lane,
 *   - typed events native.sftp.* / native.pgp.* via the Phase 1.1 registry;
 *     authed-only surface (401 fail-closed); NO public share lane.
 */
export const NATIVE_TRANSPORT_CONNECTIONS_KEY = "transport_connections.json";
export const NATIVE_TRANSPORT_RULES_KEY = "transport_rules.json";
export const NATIVE_TRANSPORT_RUNS_KEY = "transport_runs.json";
export const NATIVE_TRANSPORT_KEYS_KEY = "transport_keys.json";
export const NATIVE_TRANSPORT_PENDING_KEY = "transport_pending.json";
export const NATIVE_TRANSPORT_AUDIT_KEY = "transport_audit.json";
export const NATIVE_TRANSPORT_PROVIDER = "native-transport";
export const NATIVE_TRANSPORT_WORKFLOW_ID = "native-transport";

// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_SFTP_CONNECTIONS_PER_TENANT = 10;
export const MAX_TRANSFER_RULES_PER_TENANT = 50;
export const MAX_TRANSFER_RUNS_PER_TENANT = 200;
export const MAX_PENDING_TRANSPORT_WRITES = 50;
export const MAX_PGP_KEYS_PER_TENANT = 20;
export const MAX_PATTERN_CHARS = 200;
export const MAX_REMOTE_PATH_CHARS = 1000;
export const MAX_LOCAL_PATH_CHARS = 1000;
export const MAX_HOST_CHARS = 253;
export const MAX_USERNAME_CHARS = 128;
export const MAX_KEY_LABEL = 120;
export const MAX_ARMORED_KEY_CHARS = 65536;
export const MAX_CONNECTION_POOL = 20;
export const MAX_FILENAMES_PER_RUN = 200;
export const MAX_FILENAME_CHARS = 255;
export const MAX_DAILY_TRANSFER_RUNS = 50;

export const TRANSPORT_AUTH_MODES = ["password", "key"] as const;
export type TransportAuthMode = (typeof TRANSPORT_AUTH_MODES)[number];
export const TRANSFER_DIRECTIONS = ["upload", "download"] as const;
export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];
export const PGP_KEY_KINDS = ["public", "private", "signing"] as const;
export type PgpKeyKind = (typeof PGP_KEY_KINDS)[number];

/** SFTP connection config. Credentials live ENCRYPTED in `secretEncrypted`
 *  and are NEVER exposed by any read lane. */
export interface SftpConnection {
  id: string; // sfc_<random> — server-assigned
  tenantId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMode: TransportAuthMode;
  /** AES-256-GCM encrypted password OR private key (key = INTEGRATION_ENCRYPTION_KEY). */
  secretEncrypted: string;
  /** Connection pooling bound (1..MAX_CONNECTION_POOL). */
  poolMax: number;
  /** Fail-closed default: true — a non-verified connection is never used. */
  failClosed: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Transfer rule: direction + remote dir + name/extension PATTERN + optional
 *  PGP key id the run should use. File MONITORING flags (newFile/contentChange)
 *  are the trigger surface for selective processing. */
export interface TransferRule {
  id: string; // tru_<random> — server-assigned
  tenantId: string;
  name: string;
  connectionId: string; // must resolve in-tenant (404-no-IDOR otherwise)
  direction: TransferDirection;
  remoteDir: string; // canonical remote path (no .. / backslash / control chars)
  localDir: string; // canonical local path
  pattern: string; // name/extension glob: *.pdf, invoice-*.csv, report?.xlsx
  monitor: { newFile: boolean; contentChange: boolean };
  /** Optional PGP key ring id to encrypt/sign with (in-tenant only). */
  pgpKeyId?: string;
  fileSizeCapMb: number; // 1..1024
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Durable transfer-run ledger entry. NEVER claims live transfer happened —
 *  it records the approval-gated run request + pattern-match preview. */
export interface TransferRun {
  id: string; // trn_<random> — server-assigned
  tenantId: string;
  ruleId: string;
  filenames: string[];
  matchedFiles: string[];
  unmatchedFiles: string[];
  status: "pending" | "applied" | "rejected";
  outcome: "recorded" | "rejected";
  /** Honest note: execution requires a configured + live-verified endpoint. */
  note: string;
  approvalActionId?: string;
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** PGP key ring entry. Armored material stored ENCRYPTED at rest; never
 *  returned by any read lane. Crypto execution is NOT claimed by this slice. */
export interface PgpKey {
  id: string; // pgk_<random> — server-assigned
  tenantId: string;
  label: string;
  kind: PgpKeyKind;
  armoredEncrypted: string; // AES-256-GCM encrypted armor
  fingerprint: string; // sha256 of the armored material (derived server-side)
  createdAt: string;
  createdBy: string;
}

export interface PendingTransportWrite {
  id: string; // tpw_<random> — server-assigned
  tenantId: string;
  op: TransferOp;
  action: string; // approval action name (verb-first)
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: Record<string, unknown>;
  error?: string;
}

export interface NativeTransportAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.sftp.* | native.pgp.*
  entityId?: string;
  detail: string;
}

export type TransferOp =
  | "createConnection"
  | "updateConnection"
  | "deleteConnection"
  | "createRule"
  | "updateRule"
  | "deleteRule"
  | "runTransfer"
  | "createKey"
  | "deleteKey";