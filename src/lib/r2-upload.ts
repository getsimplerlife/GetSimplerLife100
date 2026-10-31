/**
 * r2-upload.ts — SLICE 145. The off-box copy: S3-compatible uploads to
 * Cloudflare R2, signed with AWS SigV4 using node:crypto ONLY.
 *
 * WHY THIS FILE EXISTS (owner 2026-10-30: "I don't want any data loss. All
 * clients need their data secured."): slices 143/144 built a correct, verified,
 * coverage-checked archive — on the SAME DISK as the data it protects. Losing
 * the host lost everything. This module is the part that leaves the machine.
 *
 * WHAT IT IS NOT: disaster recovery, an uptime promise, or a customer-facing
 * feature. Nothing in public copy may claim "backups" or "disaster recovery".
 *
 * HARD RULES THIS FILE DEFENDS AGAINST
 *   1. NO NEW DEPENDENCY. SigV4 is ~60 lines of HMAC; pulling aws-sdk into a
 *      single-Bun-server app to make one PUT is not a trade worth making. The
 *      signer is a PURE function so a refactor cannot silently break auth — a
 *      broken signer is an upload that fails with 403 at 3am, not a test.
 *   2. NO SECRET EVER LEAVES THIS MODULE. `describeR2Config()` returns booleans
 *      and lengths-of-nothing: never a key, never a bucket credential, never a
 *      signed Authorization header. Errors are scrubbed before they are stored
 *      (`redactSecrets`) because a fetch error body can echo a request.
 *   3. NOTHING IS UPLOADED UNENCRYPTED. This module will happily PUT whatever
 *      bytes it is handed; the *caller* (scripts/lib/r2-backup.ts) is what
 *      guarantees the bytes are the encrypted archive. There is exactly one
 *      caller and its gate is tested.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "./atomic-write";

/** The five values the owner saves. Every one may be absent. */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Key prefix inside the bucket. Defaults to `simplerlife100/backups/`. */
  prefix: string;
  /** SigV4 region. R2 uses `auto`. */
  region: string;
  /** Override for tests/proxies; defaults to the R2 host for `accountId`. */
  endpoint: string;
}

export const DEFAULT_R2_PREFIX = "simplerlife100/backups/";
export const R2_REGION = "auto";
export const R2_PREFIX_ENV = "R2_PREFIX";
/** SLICE 147 — explicit instance discriminator (wins over the persisted id). */
export const R2_INSTANCE_ENV = "R2_INSTANCE";
/** SLICE 147 — opt-out hatch for a deliberate non-production upload. */
export const R2_ALLOW_NONPROD_ENV = "BACKUP_R2_ALLOW_NONPROD";
/**
 * SLICE 147 — the per-deployment identity, persisted in DATA_DIR.
 * Named `_MARKER`, not `_FILE`: it is an identity marker, not a durable store,
 * and the coverage guard derives declared stores from `*_FILE`/`*_STORE` names.
 */
export const INSTANCE_MARKER = "backup_instance.json";

export interface R2ConfigReport {
  configured: boolean;
  /** Which required variables are missing (names only, never values). */
  missing: string[];
  bucket: string | null;
  prefix: string;
  /** SLICE 147: which instance namespace `prefix` points at, and how we know. */
  instance: string | null;
  instanceSource: InstanceSource | null;
  endpointHost: string | null;
}

// ── SLICE 147 — per-instance namespaces ─────────────────────────────────────
//
// WHY (observed live 2026-10-30): the published deployment's scheduler uploaded
// `2026-10-30T22-00-12Z.tar.gz.enc` unattended, and its retention then deleted
// `21-42-55Z`, an object a DIFFERENT run (a hand-run CLI on the dev box) had
// uploaded, because both landed in one flat prefix and `planRetention()` keeps
// only the newest run per UTC day. Two instances sharing one prefix therefore
// silently prune each other's only off-box copy. The fix is namespacing, not a
// cleverer retention rule: an instance can only ever see — and therefore only
// ever delete — objects under its OWN prefix.

export type InstanceSource = "env" | "file" | "created";

export interface ResolvedInstance {
  /** Stable, filesystem/key-safe discriminator, e.g. `data-9f3ac1de`. */
  id: string;
  source: InstanceSource;
}

/** A key-safe instance id: lowercase alphanumerics and dashes, bounded length. */
export function sanitizeInstanceId(raw: string): string {
  const cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 48);
}

/** A human-recognisable slug from the data dir name: `/…/site/.data` → `data`. */
export function instanceSlugFor(dataDir: string): string {
  const base = String(dataDir || "")
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop();
  const slug = sanitizeInstanceId(base || "");
  return slug || "data";
}

/** The id persisted for this data dir, or null. Never creates anything. */
export function readInstanceId(dataDir: string): string | null {
  try {
    const file = join(dataDir, INSTANCE_MARKER);
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const id = sanitizeInstanceId(raw?.id);
    return id || null;
  } catch {
    return null;
  }
}

/**
 * The id for this data dir, creating and persisting one on first use.
 *
 * Random rather than derived from the path: two deployments can legitimately run
 * the SAME data-dir path on different machines (this repo's layout is fixed), and
 * a path hash would then collide — which is precisely the failure we are fixing.
 * A random id is stable across restarts because it is written down, and unique
 * across deployments because it is random.
 */
export function ensureInstanceId(dataDir: string, opts: { now?: () => Date; id?: string } = {}): ResolvedInstance {
  const existing = readInstanceId(dataDir);
  if (existing) return { id: existing, source: "file" };
  const id = sanitizeInstanceId(opts.id || `${instanceSlugFor(dataDir)}-${randomBytes(4).toString("hex")}`);
  if (!id) throw new Error("could not derive an instance id");
  const file = join(dataDir, INSTANCE_MARKER);
  atomicWriteSync(
    file,
    JSON.stringify(
      {
        id,
        slug: instanceSlugFor(dataDir),
        dataDir,
        createdAt: (opts.now ?? (() => new Date()))().toISOString(),
        note: "Backup instance identity. Every off-box object this deployment writes lives under this id's prefix, and its retention only ever touches that prefix. Deleting this file makes the deployment a NEW instance (old objects stay reachable for restore but are no longer pruned by it).",
      },
      null,
      2,
    ),
  );
  try {
    chmodSync(file, 0o600);
  } catch {
    /* mode is cosmetic here — the file holds no secret */
  }
  return { id, source: "created" };
}

/** True for a runtime we can identify as dev/test (never a guess about production). */
export function isNonProductionRuntime(env: Record<string, string | undefined>): boolean {
  const nodeEnv = (env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "test" || nodeEnv === "development" || nodeEnv === "dev") return true;
  return !!env.VITEST;
}

export interface ResolvedUploadPrefix {
  /** The bucket-level prefix from configuration (`simplerlife100/backups/`). */
  basePrefix: string;
  /** The prefix this instance actually lists, uploads under and prunes within. */
  prefix: string;
  instance: string | null;
  instanceSource: InstanceSource | null;
  /** R2_PREFIX or R2_INSTANCE was set: the operator said what they wanted. */
  explicitOverride: boolean;
  /** False when this runtime must not upload at all. */
  uploadAllowed: boolean;
  /** Why no upload is allowed. Null when it is. */
  skipReason: string | null;
}

/**
 * Resolve the prefix this process must use. Precedence:
 *   1. `R2_PREFIX` — an explicit operator override always wins, verbatim.
 *   2. `<base><instance>/` — the default: one namespace per deployment.
 *
 * And the dev/test guard: a runtime that identifies as test/development and has
 * set neither override does NOT upload at all. A test archive sitting in the
 * owner's bucket is a restore point someone can mistake for production data.
 *
 * `NODE_ENV` being UNSET is deliberately not treated as non-production: this
 * product's production entry point (`bun run prod-server.ts`) runs with it unset,
 * so guessing "unset ⇒ dev" would silently stop the live off-box copy. An unset
 * runtime still gets its own namespace, so it can never prune another instance.
 */
export function resolveUploadPrefix(opts: {
  env: Record<string, string | undefined>;
  dataDir: string;
  /** Create + persist an instance id when none exists (write path only). */
  create?: boolean;
  now?: () => Date;
}): ResolvedUploadPrefix {
  const env = opts.env;
  const explicitPrefix = (env[R2_PREFIX_ENV] || "").trim();
  const explicitInstance = sanitizeInstanceId(env[R2_INSTANCE_ENV] || "");
  const explicitOverride = !!explicitPrefix || !!explicitInstance;
  const nonProd = isNonProductionRuntime(env);
  const allowed = !!env[R2_ALLOW_NONPROD_ENV] && (env[R2_ALLOW_NONPROD_ENV] || "").trim() !== "0";

  let instance: ResolvedInstance | null = null;
  if (explicitInstance) instance = { id: explicitInstance, source: "env" };
  else if (opts.create) instance = ensureInstanceId(opts.dataDir, { now: opts.now });
  else {
    const existing = readInstanceId(opts.dataDir);
    instance = existing ? { id: existing, source: "file" } : null;
  }

  if (explicitPrefix) {
    const base = explicitPrefix.endsWith("/") ? explicitPrefix : explicitPrefix + "/";
    return {
      basePrefix: base,
      prefix: base,
      instance: instance?.id ?? null,
      instanceSource: instance?.source ?? null,
      explicitOverride: true,
      uploadAllowed: !nonProd || allowed || explicitOverride,
      skipReason:
        !nonProd || allowed || explicitOverride
          ? null
          : `non-production runtime (NODE_ENV=${env.NODE_ENV ?? "<unset>"}) with no explicit R2_PREFIX/R2_INSTANCE — refusing to write into a production namespace`,
    };
  }

  const basePrefix = DEFAULT_R2_PREFIX;
  const prefix = instance ? `${basePrefix}${instance.id}/` : basePrefix;
  return {
    basePrefix,
    prefix,
    instance: instance?.id ?? null,
    instanceSource: instance?.source ?? null,
    explicitOverride,
    uploadAllowed: !nonProd || allowed || explicitOverride,
    skipReason:
      !nonProd || allowed || explicitOverride
        ? null
        : `non-production runtime (NODE_ENV=${env.NODE_ENV ?? "<unset>"}) with no explicit R2_PREFIX/R2_INSTANCE — refusing to write into a production namespace`,
  };
}

/** The prefix any process would use for a data dir, without creating anything. */
export function peekUploadPrefix(env: Record<string, string | undefined>, dataDir: string): ResolvedUploadPrefix {
  return resolveUploadPrefix({ env, dataDir, create: false });
}

/**
 * Read the R2 configuration out of an environment object.
 *
 * Returns `null` when any required value is missing — the product then behaves
 * exactly as it did before this slice: same-host archive, no off-box copy, and
 * `r2.configured: false` in the status so the gap is visible rather than
 * assumed covered. Never throws, never logs a value.
 */
export function r2ConfigFromEnv(
  env: Record<string, string | undefined>,
  opts: { dataDir?: string; create?: boolean; now?: () => Date } = {},
): R2Config | null {
  const accountId = (env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (env.R2_BUCKET || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  // SLICE 147: with a data dir the prefix is this instance's namespace; without
  // one (pure config inspection, tests) it stays the base prefix.
  const prefix = opts.dataDir
    ? resolveUploadPrefix({ env, dataDir: opts.dataDir, create: opts.create, now: opts.now }).prefix
    : normalizePrefix((env[R2_PREFIX_ENV] || "").trim());
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    prefix,
    region: R2_REGION,
    endpoint: r2Endpoint(accountId),
  };
}

function normalizePrefix(raw: string): string {
  return raw ? (raw.endsWith("/") ? raw : raw + "/") : DEFAULT_R2_PREFIX;
}

export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** Honest report for the status file: names of missing variables, no values. */
export function describeR2Config(
  env: Record<string, string | undefined>,
  opts: { dataDir?: string } = {},
): R2ConfigReport {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
  const missing = required.filter((name) => !(env[name] || "").trim());
  const cfg = r2ConfigFromEnv(env, { dataDir: opts.dataDir });
  const prefix = cfg ? cfg.prefix : normalizePrefix((env[R2_PREFIX_ENV] || "").trim());
  const resolved = opts.dataDir ? resolveUploadPrefix({ env, dataDir: opts.dataDir, create: false }) : null;
  return {
    configured: !!cfg,
    missing,
    bucket: cfg ? cfg.bucket : null,
    prefix,
    instance: resolved?.instance ?? null,
    instanceSource: resolved?.instanceSource ?? null,
    endpointHost: cfg ? new URL(cfg.endpoint).host : null,
  };
}

/**
 * Remove anything that looks like a credential from a message we are about to
 * persist. A 403 body or a thrown fetch error can quote the request; the status
 * file is read by `/api/admin/datadir` and must never carry a secret.
 */
export function redactSecrets(message: string, secrets: readonly string[] = []): string {
  let out = String(message ?? "");
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join("[redacted]");
  }
  // Authorization / signature shapes, even if the value is not in `secrets`.
  out = out.replace(/AWS4-HMAC-SHA256[^"',\s]*/g, "[redacted]");
  out = out.replace(/Signature=[0-9a-f]{16,}/gi, "Signature=[redacted]");
  out = out.replace(/Credential=[^,\s"']+/gi, "Credential=[redacted]");
  return out.length > 600 ? out.slice(0, 600) + "…" : out;
}

// ── SigV4 ───────────────────────────────────────────────────────────────────

export interface SignInput {
  method: string;
  /** Path only, e.g. `/my-bucket/simplerlife100/backups/run.tar.gz.enc`. */
  path: string;
  /** Query pairs (unencoded). */
  query?: Record<string, string>;
  /** Must include `host`. All entries are signed. */
  headers: Record<string, string>;
  /** Hex sha256 of the request body (or of the empty string for GET/DELETE). */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** `YYYYMMDDTHHMMSSZ` */
  amzDate: string;
}

export interface SignOutput {
  /** The `Authorization` header value. */
  authorization: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
  signedHeaders: string;
}

/** RFC 3986 encode, the way SigV4 requires (everything except A-Za-z0-9-_.~). */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of Buffer.from(value, "utf8")) {
    const c = String.fromCharCode(ch);
    if (/[A-Za-z0-9\-_.~]/.test(c)) out += c;
    else if (c === "/" && !encodeSlash) out += "/";
    else out += "%" + ch.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const EMPTY_PAYLOAD_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * THE SIGNER. Pure: same input ⇒ same signature, no clock, no env, no I/O.
 *
 * A unit test pins it against AWS's own published SigV4 example so that a
 * refactor which "looks right" cannot quietly produce a 403 in production.
 */
export function signAwsV4(input: SignInput): SignOutput {
  const service = input.service ?? "s3";
  const amzDate = input.amzDate;
  const dateStamp = amzDate.slice(0, 8);

  const query = input.query ?? {};
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const headerNames = Object.keys(input.headers).map((h) => h.toLowerCase());
  const canonicalHeaderEntries = Object.keys(input.headers)
    .map((name) => [name.toLowerCase(), String(input.headers[name]).trim().replace(/\s+/g, " ")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalHeaders = canonicalHeaderEntries.map(([n, v]) => `${n}:${v}\n`).join("");
  const signedHeaders = headerNames.sort().join(";");

  // The path is encoded per segment; an already-encoded `%2F` stays intact.
  const canonicalUri = input.path
    .split("/")
    .map((seg) => uriEncode(decodeURIComponent(seg)))
    .join("/") || "/";

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + input.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    canonicalRequest,
    stringToSign,
    signature,
    signedHeaders,
  };
}

/** `YYYYMMDDTHHMMSSZ` from a Date (UTC). */
export function amzDateOf(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ── Object keys ─────────────────────────────────────────────────────────────

/** `simplerlife100/backups/2026-10-30T20-11-58Z.tar.gz.enc` */
export function objectKeyForRun(prefix: string, runId: string, archiveName = `${runId}.tar.gz.enc`): string {
  return `${prefix}${archiveName}`;
}

/** The run id inside a key, or null when the key is not one of ours. */
export function runIdFromKey(key: string, prefix: string): string | null {
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\./.exec(rest);
  return m ? m[1] : null;
}

/**
 * SLICE 147: the run id inside a key at ANY depth — `…/2026-10-30T22-00-12Z.tar.gz.enc`
 * and `…/data-9f3a/2026-10-30T22-00-12Z.tar.gz.enc` both yield the run id. Used by
 * the restore path, which lists the BASE prefix so it can still find objects
 * written before per-instance namespaces existed.
 */
export function runIdFromObjectKey(key: string): string | null {
  const m = /(?:^|\/)(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.(?:tar\.gz\.enc|enc)$/.exec(key);
  return m ? m[1] : null;
}

/** The instance namespace a key sits in, relative to `basePrefix` (`""` = flat). */
export function instanceOfKey(key: string, basePrefix: string): string | null {
  if (!key.startsWith(basePrefix)) return null;
  const rest = key.slice(basePrefix.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? "" : rest.slice(0, slash);
}

/**
 * Remote retention. The keep-set is computed by the SAME function the local
 * archive uses (`planRetention` in scripts/lib/backup-core.ts) so the two
 * policies cannot drift: 7 daily runs + 4 weekly runs, newest first.
 *
 * SLICE 147 — ATTRIBUTION. Two rules, in this order:
 *   1. A key that sits in a DEEPER namespace than `prefix` (i.e. its remainder
 *      still contains a `/`) belongs to ANOTHER instance. It is never pruned and
 *      never counted against our retention budget — it is reported in `foreign`
 *      so the operator can see it. This is the rule that stops a dev listener
 *      from deleting the live deployment's archive, and stops this build from
 *      deleting a namespace it does not own.
 *   2. Inside our own namespace, an object that does not parse as one of our run
 *      ids is garbage we put there (or accepted there) — it is pruned, because
 *      leaving unbounded unknown bytes in our own prefix is how a bucket quietly
 *      fills up.
 */
export function planRemoteRetention(
  keys: string[],
  opts: { prefix: string; daily?: number; weekly?: number },
): { keep: string[]; prune: string[]; foreign: string[] } {
  const byRun = new Map<string, string>();
  const unknown: string[] = [];
  const foreign: string[] = [];
  for (const key of keys) {
    if (!key.startsWith(opts.prefix)) {
      foreign.push(key);
      continue;
    }
    const rest = key.slice(opts.prefix.length);
    if (rest.includes("/")) {
      // Another instance's namespace: not ours to keep, not ours to delete.
      foreign.push(key);
      continue;
    }
    const runId = runIdFromKey(key, opts.prefix);
    if (runId) byRun.set(runId, key);
    else unknown.push(key);
  }
  const plan = planRetention([...byRun.keys()], { daily: opts.daily, weekly: opts.weekly });
  return {
    keep: plan.keep.map((runId) => byRun.get(runId)!).filter(Boolean),
    prune: [...plan.prune.map((runId) => byRun.get(runId)!).filter(Boolean), ...unknown],
    foreign,
  };
}

// ── The HTTP client (fetch-injectable so tests never touch the network) ─────

export interface R2FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  /**
   * Binary-safe read. `text()` decodes as UTF-8 and would CORRUPT a ciphertext
   * body on the way back down; every download path must use this.
   */
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type R2Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: Uint8Array },
) => Promise<R2FetchResponse>;

export interface R2ClientOptions {
  config: R2Config;
  fetchImpl?: R2Fetch;
  now?: () => Date;
  log?: (msg: string) => void;
}

export interface R2ObjectSummary {
  key: string;
  size: number;
  etag: string | null;
  lastModified: string | null;
}

function objectPath(config: R2Config, key: string): string {
  return `/${config.bucket}/${key}`;
}

export function createR2Client(opts: R2ClientOptions) {
  const { config } = opts;
  const doFetch: R2Fetch = opts.fetchImpl ?? ((url, init) => fetch(url, init as any) as any);
  const now = opts.now ?? (() => new Date());

  function signedRequest(method: string, path: string, query: Record<string, string>, body?: Uint8Array, contentType?: string) {
    const date = now();
    const amzDate = amzDateOf(date);
    const payloadHash = body ? sha256Hex(Buffer.from(body)) : EMPTY_PAYLOAD_SHA256;
    const host = new URL(config.endpoint).host;
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;
    const signed = signAwsV4({
      method,
      path,
      query,
      headers,
      payloadHash,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      amzDate,
    });
    const queryString = Object.keys(query)
      .sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
      .join("&");
    const url = `${config.endpoint}${path}${queryString ? "?" + queryString : ""}`;
    const outHeaders: Record<string, string> = {
      ...headers,
      Authorization: signed.authorization,
    };
    // `host` is set by fetch itself; sending it again is legal but pointless.
    delete outHeaders.host;
    return { url, headers: outHeaders, payloadHash };
  }

  async function putObject(key: string, body: Uint8Array): Promise<{ etag: string | null; bytes: number }> {
    const { url, headers } = signedRequest("PUT", objectPath(config, key), {}, body, "application/octet-stream");
    const res = await doFetch(url, { method: "PUT", headers, body });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 PUT ${key} failed: HTTP ${res.status} ${redactSecrets(detail, [config.accessKeyId, config.secretAccessKey])}`);
    }
    const etagRaw = res.headers.get("etag");
    return { etag: etagRaw ? etagRaw.replace(/"/g, "") : null, bytes: body.length };
  }

  async function listObjects(prefix: string): Promise<R2ObjectSummary[]> {
    const out: R2ObjectSummary[] = [];
    let token: string | null = null;
    for (let page = 0; page < 20; page++) {
      const query: Record<string, string> = { "list-type": "2", prefix };
      if (token) query["continuation-token"] = token;
      const { url, headers } = signedRequest("GET", `/${config.bucket}`, query);
      const res = await doFetch(url, { method: "GET", headers });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`R2 LIST failed: HTTP ${res.status} ${redactSecrets(detail, [config.accessKeyId, config.secretAccessKey])}`);
      }
      const xml = await res.text();
      for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || []) {
        const key = xmlText(block, "Key");
        if (!key) continue;
        out.push({
          key,
          size: Number(xmlText(block, "Size") || 0),
          etag: xmlText(block, "ETag")?.replace(/&quot;|"/g, "") || null,
          lastModified: xmlText(block, "LastModified"),
        });
      }
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      const next = xmlText(xml, "NextContinuationToken");
      if (!truncated || !next) break;
      token = next;
    }
    return out;
  }

  async function deleteObject(key: string): Promise<void> {
    const { url, headers } = signedRequest("DELETE", objectPath(config, key), {});
    const res = await doFetch(url, { method: "DELETE", headers });
    // S3 semantics: deleting a missing object is a success. R2 matches.
    if (!res.ok && res.status !== 404) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 DELETE ${key} failed: HTTP ${res.status} ${redactSecrets(detail, [config.accessKeyId, config.secretAccessKey])}`);
    }
  }

  async function getObject(key: string): Promise<{ bytes: Uint8Array; etag: string | null }> {
    const { url, headers } = signedRequest("GET", objectPath(config, key), {});
    const res = await doFetch(url, { method: "GET", headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 GET ${key} failed: HTTP ${res.status} ${redactSecrets(detail, [config.accessKeyId, config.secretAccessKey])}`);
    }
    const buf = await res.arrayBuffer();
    const etagRaw = res.headers.get("etag");
    return { bytes: new Uint8Array(buf), etag: etagRaw ? etagRaw.replace(/"/g, "") : null };
  }

  return { putObject, listObjects, deleteObject, getObject, config };
}

function xmlText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

// Imported last on purpose: this module is the leaf, backup-core is the tree.
import { planRetention } from "../../scripts/lib/backup-core";
