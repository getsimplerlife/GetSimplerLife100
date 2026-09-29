/**
 * native/assistant/context.ts — SAFE context assembly for assistant drafts.
 *
 * The assistant answers from the tenant's OWN native records, but only as a
 * bounded, metadata-safe summary — never raw row content (row data stays in
 * the gated 1.4 lane where it belongs) and never another tenant's data:
 *
 *   - tables (1.4):      name, description, field names, row count
 *   - dashboards (3.6):  name, description, widget count
 *   - reports (3.6):     name, description
 *   - document buckets (1.2): name, description
 *
 * All reads go through the tenant-keyed stores of the owning slices (zero
 * cross-tenant paths by construction — each store resolves the exact tenant
 * map first). Output is truncated to MAX_CONTEXT_CHARS (fail-closed: a
 * pathological tenant fires no unbounded prompt).
 */
import { MAX_CONTEXT_ITEMS, MAX_CONTEXT_CHARS } from "./types";
import { listTables, countRows } from "../tables/store";
import { listDashboards, listReports } from "../dashboard/store";
import { listBuckets } from "../documents/store";

export interface AssistantContext {
  tables: { id: string; name: string; description: string; fields: string[]; rows: number }[];
  dashboards: { id: string; name: string; description: string; widgets: number }[];
  reports: { id: string; name: string; description: string }[];
  buckets: { id: string; name: string; description: string }[];
}

export function buildTenantContext(dataDir: string, tenantId: string): AssistantContext {
  const tables = (listTables(dataDir, tenantId) ?? [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      fields: (t.fields ?? []).map((f) => {
        if (typeof f === "string") return f;
        const name = (f as { name?: unknown }).name;
        return typeof name === "string" ? name : "";
      }).filter(Boolean),
      rows: safeCount(() => countRows(dataDir, t.tenantId, t.id)),
    }));
  const dashboards = (listDashboards(dataDir, tenantId) ?? [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? "",
      widgets: Array.isArray(d.reportIds) ? d.reportIds.length : 0,
    }));
  const reports = (listReports(dataDir, tenantId) ?? [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((r) => ({ id: r.id, name: r.name, description: r.description ?? "" }));
  const buckets = (listBuckets(dataDir, tenantId) ?? [])
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((b) => ({ id: b.id, name: b.name, description: b.description ?? "" }));
  return { tables, dashboards, reports, buckets };
}

function safeCount(fn: () => number): number {
  try {
    return Number(fn()) || 0;
  } catch {
    return 0; // storage hiccup must never break context assembly
  }
}

/** Serialize the context into a bounded text block for the model prompt. */
export function serializeContext(ctx: AssistantContext): string {
  const out: string[] = [];
  if (ctx.tables.length) {
    out.push("DATA TABLES:");
    for (const t of ctx.tables) {
      out.push(`- ${t.name}${t.description ? `: ${t.description}` : ""} | fields: ${t.fields.join(", ") || "—"} | rows: ${t.rows}`);
    }
  }
  if (ctx.dashboards.length) {
    out.push("DASHBOARDS:");
    for (const d of ctx.dashboards) {
      out.push(`- ${d.name}${d.description ? `: ${d.description}` : ""} (${d.widgets} widget${d.widgets === 1 ? "" : "s"})`);
    }
  }
  if (ctx.reports.length) {
    out.push("REPORTS:");
    for (const r of ctx.reports) {
      out.push(`- ${r.name}${r.description ? `: ${r.description}` : ""}`);
    }
  }
  if (ctx.buckets.length) {
    out.push("DOCUMENT BUCKETS:");
    for (const b of ctx.buckets) {
      out.push(`- ${b.name}${b.description ? `: ${b.description}` : ""}`);
    }
  }
  const text = out.join("\n");
  return text.slice(0, MAX_CONTEXT_CHARS);
}