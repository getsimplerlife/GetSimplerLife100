/**
 * Simpler Life 100 - Audit Logging Module
 * Records system events for compliance, security, and monitoring.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { db } from "../db/index";
import { sql } from "drizzle-orm";

// ── Schema ──────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  userEmail: text("email"),
  action: text("action").notNull(),    // e.g. 'login', 'register', 'run_agent', 'upload_file', 'admin_action'
  resource: text("resource"),           // e.g. 'energy_grid_monitoring', 'audit_123'
  details: text("details"),             // JSON string with additional context
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("success"), // 'success' | 'failure' | 'pending'
  severity: text("severity").notNull().default("info"), // 'info' | 'warning' | 'error' | 'critical'
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Table Creation ──────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  details TEXT,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  severity TEXT NOT NULL DEFAULT 'info',
  created_at INTEGER NOT NULL
);
`;

// ── Initialize ──────────────────────────────────────────────────────────

let _initialized = false;

export async function ensureAuditTable(): Promise<void> {
  if (_initialized) return;
  try {
    await db.run(sql.raw(CREATE_TABLE_SQL));
    _initialized = true;
    console.log("[auditLogs] Table initialized");
  } catch (err) {
    console.error("[auditLogs] Failed to initialize table:", err);
  }
}

// ── Log an Event ────────────────────────────────────────────────────────

export interface AuditEvent {
  userId?: string;
  userEmail?: string;
  action: string;
  resource?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  status?: "success" | "failure" | "pending";
  severity?: "info" | "warning" | "error" | "critical";
}

export async function logAuditEvent(event: AuditEvent): Promise<string> {
  await ensureAuditTable();
  const id = crypto.randomUUID();
  try {
    await db.insert(auditLogs).values({
      id,
      userId: event.userId || null,
      userEmail: event.userEmail || null,
      action: event.action,
      resource: event.resource || null,
      details: event.details ? JSON.stringify(event.details) : null,
      ipAddress: event.ipAddress || null,
      status: event.status || "success",
      severity: event.severity || "info",
      createdAt: new Date(),
    });
    return id;
  } catch (err) {
    console.error("[auditLogs] Failed to insert event:", err);
    return "";
  }
}

// ── Query Logs ──────────────────────────────────────────────────────────

export interface AuditLogFilters {
  action?: string;
  userId?: string;
  status?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  startDate?: Date;
  endDate?: Date;
}

export async function queryAuditLogs(filters: AuditLogFilters = {}): Promise<{
  logs: any[];
  total: number;
  stats: {
    totalEvents: number;
    byAction: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    recentErrors: number;
    uniqueUsers: number;
  };
}> {
  await ensureAuditTable();

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.userId) {
    conditions.push("user_id = ?");
    params.push(filters.userId);
  }
  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.severity) {
    conditions.push("severity = ?");
    params.push(filters.severity);
  }
  if (filters.search) {
    conditions.push("(email LIKE ? OR details LIKE ? OR resource LIKE ?)");
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  if (filters.startDate) {
    conditions.push("created_at >= ?");
    params.push(filters.startDate.getTime());
  }
  if (filters.endDate) {
    conditions.push("created_at <= ?");
    params.push(filters.endDate.getTime());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(filters.limit || 50, 500);
  const offset = filters.offset || 0;
  const sortBy = filters.sortBy || "created_at";
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";

  try {
    // Get total count
    const countResult = await (db as any).run(sql.raw(`SELECT COUNT(*) as count FROM audit_logs ${where}`), ...(params as any[]));
    const total = (countResult as any).rows?.[0]?.count || 0;

    // Get paginated logs
    const logsResult = await (db as any).run(sql.raw(
      `SELECT * FROM audit_logs ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`
    ), ...(params as any[]), limit, offset);
    const logs = (logsResult as any).rows || [];

    // Get stats
    const stats: any = { totalEvents: 0, byAction: {}, bySeverity: {}, byStatus: {}, recentErrors: 0, uniqueUsers: 0 };

    try {
      const statsResult = await db.run(sql.raw(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(CASE WHEN severity IN ('error', 'critical') THEN 1 ELSE 0 END) as recent_errors
        FROM audit_logs
        WHERE created_at > ${Date.now() - 7 * 24 * 60 * 60 * 1000}
      `));
      const statsRow = (statsResult as any).rows?.[0];
      if (statsRow) {
        stats.totalEvents = statsRow.total || 0;
        stats.uniqueUsers = statsRow.unique_users || 0;
        stats.recentErrors = statsRow.recent_errors || 0;
      }

      // Events by action
      const actionResult = await db.run(sql.raw(
        `SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY count DESC`
      ));
      for (const row of (actionResult as any).rows || []) {
        stats.byAction[row.action] = row.count;
      }

      // Events by severity
      const severityResult = await db.run(sql.raw(
        `SELECT severity, COUNT(*) as count FROM audit_logs GROUP BY severity ORDER BY count DESC`
      ));
      for (const row of (severityResult as any).rows || []) {
        stats.bySeverity[row.severity] = row.count;
      }

      // Events by status
      const statusResult = await db.run(sql.raw(
        `SELECT status, COUNT(*) as count FROM audit_logs GROUP BY status ORDER BY count DESC`
      ));
      for (const row of (statusResult as any).rows || []) {
        stats.byStatus[row.status] = row.count;
      }
    } catch (e) {
      // Stats are best-effort
    }

    // Parse details for each log
    const parsedLogs = logs.map((log: any) => ({
      ...log,
      details: log.details ? tryParseJSON(log.details) : null,
    }));

    return { logs: parsedLogs, total, stats };
  } catch (err) {
    console.error("[auditLogs] Query error:", err);
    return { logs: [], total: 0, stats: { totalEvents: 0, byAction: {}, bySeverity: {}, byStatus: {}, recentErrors: 0, uniqueUsers: 0 } };
  }
}

// ── Quick Helper to Get Request IP ──────────────────────────────────────

export function getRequestIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

// ── Extract user info from request ──────────────────────────────────────

import { verifySessionToken } from "../db/auth";

export async function getUserFromRequest(req: Request): Promise<{ userId: string; userEmail: string } | null> {
  // Try cookie auth
  const cookieHeader = req.headers.get("Cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === "session") {
        const token = rest.join("=");
        const userId = await verifySessionToken(token);
        if (userId) {
          const user = await db.query.users.findFirst({
            where: sql`id = ${userId}`
          });
          if (user) {
            return { userId: user.id, userEmail: user.email };
          }
        }
      }
    }
  }
  return null;
}

// ── Utility ─────────────────────────────────────────────────────────────

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}