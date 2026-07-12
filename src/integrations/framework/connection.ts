/**
 * Connection Management
 *
 * CRUD operations for managing integration connections (OAuth tokens, API keys)
 * stored in the integrations table. Handles encryption of sensitive credentials,
 * connection health checks, and status tracking.
 */

import { db } from "../../db/index";
import { integrations } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || randomBytes(32).toString("hex").slice(0, 32);
const ALGORITHM = "aes-256-gcm";

export interface ConnectionConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  instanceUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  subdomain?: string;
  organizationId?: string;
  [key: string]: any;
}

export interface Connection {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  config: ConnectionConfig;
  status: "active" | "expired" | "error" | "pending";
  healthAt?: Date;
  errorMsg?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Encrypt sensitive connection data
 */
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

/**
 * Decrypt sensitive connection data
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Create a new integration connection
 */
export async function createConnection(
  userId: string,
  provider: string,
  displayName: string,
  config: ConnectionConfig,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const encryptedConfig = encrypt(JSON.stringify(config));

  await db.insert(integrations).values({
    id,
    userId,
    provider,
    displayName,
    config: encryptedConfig,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/**
 * Get a connection by ID (decrypts config)
 */
export async function getConnection(id: string, userId: string): Promise<Connection | null> {
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.userId, userId)),
  });

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    displayName: row.displayName,
    config: JSON.parse(decrypt(row.config)),
    status: row.status as Connection["status"],
    healthAt: row.healthAt ?? undefined,
    errorMsg: row.errorMsg ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all connections for a user
 */
export async function listConnections(userId: string): Promise<Connection[]> {
  const rows = await db.query.integrations.findMany({
    where: eq(integrations.userId, userId),
    orderBy: (integrations, { desc }) => [desc(integrations.updatedAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    displayName: row.displayName,
    config: JSON.parse(decrypt(row.config)),
    status: row.status as Connection["status"],
    healthAt: row.healthAt ?? undefined,
    errorMsg: row.errorMsg ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * List connections by provider
 */
export async function listConnectionsByProvider(
  userId: string,
  provider: string,
): Promise<Connection[]> {
  const rows = await db.query.integrations.findMany({
    where: and(eq(integrations.userId, userId), eq(integrations.provider, provider)),
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    displayName: row.displayName,
    config: JSON.parse(decrypt(row.config)),
    status: row.status as Connection["status"],
    healthAt: row.healthAt ?? undefined,
    errorMsg: row.errorMsg ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Update a connection's config (e.g., after token refresh)
 */
export async function updateConnectionConfig(
  id: string,
  userId: string,
  config: ConnectionConfig,
): Promise<void> {
  const encryptedConfig = encrypt(JSON.stringify(config));
  await db
    .update(integrations)
    .set({
      config: encryptedConfig,
      updatedAt: new Date(),
    })
    .where(and(eq(integrations.id, id), eq(integrations.userId, userId)));
}

/**
 * Update a connection's status
 */
export async function updateConnectionStatus(
  id: string,
  userId: string,
  status: Connection["status"],
  errorMsg?: string,
): Promise<void> {
  const update: any = {
    status,
    updatedAt: new Date(),
  };
  if (status === "active" || status === "error") {
    update.healthAt = new Date();
  }
  if (errorMsg !== undefined) {
    update.errorMsg = errorMsg;
  }

  await db
    .update(integrations)
    .set(update)
    .where(and(eq(integrations.id, id), eq(integrations.userId, userId)));
}

/**
 * Delete a connection
 */
export async function deleteConnection(id: string, userId: string): Promise<void> {
  await db
    .delete(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.userId, userId)));
}

/**
 * Test a connection by making a lightweight API call to verify credentials
 */
export async function testConnection(
  id: string,
  userId: string,
  testFn: (config: ConnectionConfig) => Promise<boolean>,
): Promise<boolean> {
  const conn = await getConnection(id, userId);
  if (!conn) throw new Error("Connection not found");

  try {
    const healthy = await testFn(conn.config);
    await updateConnectionStatus(id, userId, healthy ? "active" : "error", healthy ? undefined : "Health check failed");
    return healthy;
  } catch (err: any) {
    await updateConnectionStatus(id, userId, "error", err.message);
    return false;
  }
}