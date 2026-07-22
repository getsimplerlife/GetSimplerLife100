/**
 * Analytics Service — Real dashboard metrics from portal_data
 *
 * Queries the portal_data table for activity, agents, and workflow records
 * and computes executive metrics: tasks completed, hours saved, cost saved,
 * active agents, error rate, uptime, and recent activity.
 */

import { db } from "../db/index";
import { sql } from "drizzle-orm";

export interface DashboardMetrics {
  summary: {
    totalTasksCompleted: number;
    tasksToday: number;
    totalHoursSaved: number;
    totalCostSaved: number;
    activeAgents: number;
    totalAgents: number;
    errorRate: number;
    uptime: number;
    totalWorkflows: number;
    activeWorkflows: number;
  };
  recentActivity: ActivityRecord[];
  errorRate: number;
  uptime: number;
}

export interface ActivityRecord {
  id: string;
  action: string;
  status: string;
  timestamp: number;
  details?: string;
}

const HOURS_PER_TASK = 0.5;
const HOURLY_RATE = 50;

/**
 * Parse a data field that could be a JSON string or already an object.
 */
function parseDataField(raw: any): any {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/**
 * Get today's start timestamp (midnight UTC).
 */
function todayStart(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Fetch all records for a given section belonging to a user.
 */
async function getSectionRecords(userId: string, section: string): Promise<any[]> {
  try {
    const rows = await db.all(
      sql.raw(
        `SELECT id, data, created_at, updated_at FROM portal_data WHERE user_id = '${userId}' AND section = '${section}' ORDER BY created_at DESC`
      )
    );
    return (rows as any[]).map((r: any) => ({
      id: r.id,
      ...parseDataField(r.data),
      _created_at: r.created_at,
      _updated_at: r.updated_at,
    }));
  } catch (err) {
    console.error(`[analytics] Failed to query section '${section}':`, err);
    return [];
  }
}

/**
 * Get the full dashboard metrics for a given user.
 */
export async function getDashboardMetrics(userId: string): Promise<DashboardMetrics> {
  const today = todayStart();

  // Fetch activity records
  const activityRecords = await getSectionRecords(userId, "activity");

  // Count completed tasks
  const completedTasks = activityRecords.filter(
    (r: any) => r.status === "completed" || r.status === "success"
  );
  const totalTasksCompleted = completedTasks.length;

  // Tasks completed today
  const tasksToday = completedTasks.filter(
    (r: any) => (r._created_at || r.timestamp || 0) >= today
  ).length;

  // Total hours / cost saved
  const totalHoursSaved = Math.round(totalTasksCompleted * HOURS_PER_TASK * 10) / 10;
  const totalCostSaved = Math.round(totalHoursSaved * HOURLY_RATE);

  // Fetch agent instances
  const agentRecords = await getSectionRecords(userId, "agents");
  const totalAgents = agentRecords.length;
  const activeAgents = agentRecords.filter(
    (r: any) => r.status === "running" || r.status === "idle"
  ).length;

  // Error rate & uptime from activity records
  const failedTasks = activityRecords.filter(
    (r: any) => r.status === "failed" || r.status === "error"
  ).length;
  const totalTasks = activityRecords.length;
  const errorRate = totalTasks > 0 ? Math.round((failedTasks / totalTasks) * 100 * 10) / 10 : 0;
  const uptime = totalTasks > 0
    ? Math.round(((totalTasks - failedTasks) / totalTasks) * 100 * 10) / 10
    : 100;

  // Fetch workflow records
  const workflowRecords = await getSectionRecords(userId, "workflows");
  const totalWorkflows = workflowRecords.length;
  const activeWorkflows = workflowRecords.filter(
    (r: any) => r.status === "Active" || r.status === "active" || r.status === "running"
  ).length;

  // Recent activity (last 20)
  const recentActivity: ActivityRecord[] = activityRecords.slice(0, 20).map((r: any) => ({
    id: r.id || r._id || "",
    action: r.action || r.name || r.type || "unknown",
    status: r.status || "unknown",
    timestamp: r._created_at || r.timestamp || Date.now(),
    details: r.details ? (typeof r.details === "string" ? r.details : JSON.stringify(r.details)) : undefined,
  }));

  return {
    summary: {
      totalTasksCompleted,
      tasksToday,
      totalHoursSaved,
      totalCostSaved,
      activeAgents,
      totalAgents,
      errorRate,
      uptime,
      totalWorkflows,
      activeWorkflows,
    },
    recentActivity,
    errorRate,
    uptime,
  };
}