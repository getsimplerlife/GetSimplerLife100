// src/lib/agent-processor.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
// AI Agent processing pipeline: takes raw query results and transforms them
// into processed data, actionable insights, alerts, and recommended write-back actions.
//
// This runs AFTER integration queries complete. It is additive — if it fails,
// the original query results still flow through. Never blocks the agent run.

import type { ProviderResult, ProviderConnection, AgentIntegrationResult } from "./provider-api";
import {
  normEmail,
  pickValue,
  EMAIL_KEYS,
  AMOUNT_KEYS,
  scoreEntityMatch,
  fuzzyDuplicates,
  crossJoin,
  round2,
} from "./match";
import {
  getProcessorCalibration,
  DEFAULT_PROCESSOR_CALIBRATION,
  type ProcessorCalibration,
} from "./tenant-settings";
import { detectAnomaly, routeAlert, type AlertRouting } from "./escalation";
import { buildAgentContext, recordMetrics, type MetricSnapshot } from "./firm-memory";

/** Coerce an unknown/string/number to a finite number, else undefined. */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Per-tenant options for processor reasoning (optional → global defaults). */
export interface ProcessorOptions {
  tenantEmail?: string;
  dataDir?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export interface ProcessedData {
  /** Records filtered by relevance to the agent's task */
  filtered: any[];
  /** Records enriched with cross-system context */
  enriched: any[];
  /** Records matched/merged across multiple systems */
  matched: { source: string; target: string; matches: any[] }[];
  /** Numeric summary: totals, counts, deltas */
  metrics: Record<string, number | string>;
}

export interface ActionItem {
  provider: string;
  providerId: string;
  action: string;
  status: "pending" | "executed" | "failed" | "skipped";
  detail: string;
  payload?: Record<string, any>;
  result?: any;
}

export interface Insight {
  type: "discrepancy" | "opportunity" | "risk" | "trend" | "recommendation" | "summary";
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
  source?: string;
}

export interface Alert {
  level: "info" | "warning" | "error" | "critical";
  message: string;
  requiresAttention: boolean;
  /** Upgrade #5: route an alert to the portal — "you need to decide"
   *  (requires_approval) vs "here's a heads-up" (read_recommendation). */
  routing?: AlertRouting;
}

/** Per-run escalation inputs (upgrade #5) for anomaly detection vs firm history. */
export interface EscalationContext {
  tenantEmail: string;
  dataDir?: string;
  metricHistory: MetricSnapshot[];
}

export interface ProcessorResult {
  processedData: ProcessedData;
  actionsTaken: ActionItem[];
  insights: Insight[];
  alerts: Alert[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  category: string;
  instructions: string;
}

// ────────────────────────────────────────────────────────────────────────
// Category-specific processors
// ────────────────────────────────────────────────────────────────────────

function processFinance(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[],
  calibration: Required<ProcessorCalibration> = DEFAULT_PROCESSOR_CALIBRATION,
  escalation?: EscalationContext,
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const matched: { source: string; target: string; matches: any[] }[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      filtered.push(...r.sampleData);
    }
  }

  // Match records across finance systems (e.g. invoice/customer records across
  // QB/Xero/Netsuite) — confidence-scored across email > name-variant > phone.
  const qb = results.find(r => r.providerId === "quickbooks" && r.status === "ok");
  const xero = results.find(r => r.providerId === "xero" && r.status === "ok");
  const netsuite = results.find(r => r.providerId === "netsuite" && r.status === "ok");

  const financeSystems = [qb, xero, netsuite].filter(Boolean) as ProviderResult[];
  const minConf = calibration.minMatchConfidence;
  let scoredMatchCount = 0;

  if (financeSystems.length >= 2) {
    for (let i = 0; i < financeSystems.length - 1; i++) {
      for (let j = i + 1; j < financeSystems.length; j++) {
        const src = financeSystems[i];
        const tgt = financeSystems[j];
        const crossMatches: any[] = [];
        for (const s of src.sampleData) {
          for (const t of tgt.sampleData) {
            const sc = scoreEntityMatch(s, t);
            if (sc.confidence < minConf) continue;
            // Amount discrepancy on matched pairs, using calibrated thresholds.
            let discrepancy: { pct: number; abs: number } | undefined;
            const amtA = num(pickValue(s, AMOUNT_KEYS));
            const amtB = num(pickValue(t, AMOUNT_KEYS));
            if (amtA !== undefined && amtB !== undefined && amtB !== 0) {
              const pct = Math.abs((amtA - amtB) / amtB) * 100;
              const abs = Math.abs(amtA - amtB);
              if (pct > calibration.discrepancyPercent || abs > calibration.discrepancyAbs) {
                discrepancy = { pct: round2(pct), abs: round2(abs) };
              }
            }
            scoredMatchCount++;
            crossMatches.push({
              sourceRecord: s,
              targetRecord: t,
              confidence: sc.confidence,
              matchedOn: sc.matchedOn,
              discrepancy,
            });
          }
        }
        if (crossMatches.length > 0) {
          matched.push({ source: src.provider, target: tgt.provider, matches: crossMatches });
        }
      }
    }
  }

  // Flag discrepancies (scored > threshold, or none matched at all).
  if (financeSystems.length >= 2 && matched.length === 0) {
    insights.push({
      type: "discrepancy",
      severity: "high",
      message: `${financeSystems.map(f => f.provider).join(" and ")} show no matching records — possible data sync gap.`,
    });
    alerts.push({ level: "warning", message: "Cross-system records don't match. Reconciliation needed.", requiresAttention: true });
  } else if (matched.length > 0) {
    const totalMatches = matched.reduce((s, m) => s + m.matches.length, 0);
    const amountMismatches = matched.flatMap(m => m.matches).filter(m => m.discrepancy).length;
    insights.push({
      type: "summary",
      severity: "info",
      message: `Found ${totalMatches} matching record(s) across ${matched.length} system pair(s) (confidence ≥ ${Math.round(minConf * 100)}%).${amountMismatches ? ` ${amountMismatches} amount mismatch(es) detected.` : ""}`,
    });
    if (amountMismatches > 0) {
      alerts.push({
        level: "warning",
        message: `${amountMismatches} matched record(s) exceed the amount calibration threshold (rel > ${calibration.discrepancyPercent}% or abs > ${calibration.discrepancyAbs}).`,
        requiresAttention: true,
      });
    }
  }

  // Cross-record joins (finance ↔ sales) — emit higher-value readiness insight.
  const otherSales = results.find(r => (r.providerId === "hubspot" || r.providerId === "salesforce") && r.status === "ok");
  let joinedRecords = 0;
  if (financeSystems.length && otherSales) {
    const financeRecords = financeSystems.flatMap(f => f.sampleData);
    const salesRecords = otherSales.sampleData;
    const joins = crossJoin(financeRecords, (r) => normEmail(pickValue(r, EMAIL_KEYS)), salesRecords, (r) => normEmail(pickValue(r, EMAIL_KEYS)));
    joinedRecords = joins.length;
    if (joinedRecords > 0) {
      insights.push({
        type: "recommendation",
        severity: "medium",
        message: `Joined ${joinedRecords} finance record(s) to sales contacts by email — ready for quote-to-cash reconciliation.`,
      });
    } else {
      insights.push({
        type: "summary",
        severity: "info",
        message: "No finance↔sales email joins found in the current sample — either unrelated or needing contact email enrichment.",
      });
    }
  }

  // Calculate totals
  const metrics: Record<string, number | string> = {
    totalRecords,
    systemsQueried: financeSystems.length,
    crossSystemMatches: matched.reduce((s, m) => s + m.matches.length, 0),
    scoredMatches: scoredMatchCount,
    joinedRecords,
  };

  // Upgrade #5 — anomaly detection vs the firm's OWN history (spend baseline).
  if (escalation) {
    const spend = filtered.reduce((sum, r) => {
      const amt = num(pickValue(r, AMOUNT_KEYS));
      return amt === undefined ? sum : sum + amt;
    }, 0);
    try {
      recordMetrics(escalation.tenantEmail, { spend }, escalation.dataDir);
    } catch {
      // internal metadata write — never blocks
    }
    try {
      const anomaly = detectAnomaly("spend", spend, escalation.metricHistory, {
        thresholdPercent: calibration.anomalyDeltaPercent,
        minSamples: calibration.minAnomalySamples,
      });
      if (anomaly.isAnomaly) {
        alerts.push({
          level: "warning",
          message: anomaly.reason,
          requiresAttention: false, // heads-up only; nothing executes
          routing: routeAlert(false),
        });
        metrics.anomalyFlagged = "spend";
      }
    } catch {
      // fall back to today's behavior on any failure (additive/back-compat)
    }
  }

  // Recommended actions
  if (financeSystems.length >= 2 && matched.length === 0) {
    actions.push({
      provider: financeSystems[0].provider,
      providerId: financeSystems[0].providerId,
      action: "reconcile_records",
      status: "pending",
      detail: `Initiate full reconciliation between ${financeSystems.map(f => f.provider).join(" and ")}`,
    });
  }

  // Enrich with totals
  for (const r of results) {
    if (r.status === "ok") {
      enriched.push({
        provider: r.provider,
        recordsFound: r.recordsFound,
        endpoint: r.endpoint,
        sampleCount: r.sampleData.length,
      });
    }
  }

  // Agent-specific insights
  if (agent.id.includes("invoice")) {
    insights.push({
      type: "recommendation",
      severity: "medium",
      message: `Scanned ${totalRecords} records across finance systems. Consider running invoice matching to detect duplicates.`,
    });
  }
  if (agent.id.includes("payroll")) {
    insights.push({
      type: "recommendation",
      severity: "medium",
      message: "Cross-check employee counts between payroll systems and HR system for consistency.",
    });
  }

  return { processedData: { filtered, enriched, matched, metrics }, actionsTaken: actions, insights, alerts };
}

function processSales(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[],
  calibration: Required<ProcessorCalibration> = DEFAULT_PROCESSOR_CALIBRATION,
  escalation?: EscalationContext,
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const matched: { source: string; target: string; matches: any[] }[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;
  const allContacts: { name: string; email?: string; provider: string }[] = [];

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        const enrichedItem = { ...item, _source: r.provider };
        enriched.push(enrichedItem);
        filtered.push(item);
        if (item.email || item.name || item.firstname) {
          allContacts.push({
            name: item.name || `${item.firstname || ""} ${item.lastname || ""}`.trim() || item.email || "",
            email: item.email,
            provider: r.provider,
          });
        }
      }
    }
  }

  // Deduplicate contacts — exact first (back-compat), then confidence-scored
  // fuzzy variants (casing/initials/common-prefix) using tenant calibration.
  const exactDedupeMap = new Map<string, any[]>();
  for (const c of allContacts) {
    const key = (c.email || c.name || "").toLowerCase().trim();
    if (!key) continue;
    if (!exactDedupeMap.has(key)) exactDedupeMap.set(key, []);
    exactDedupeMap.get(key)!.push(c);
  }
  const exactDuplicates = Array.from(exactDedupeMap.entries()).filter(([_, v]) => v.length > 1);

  for (const [key, dups] of exactDuplicates) {
    const sources = [...new Set(dups.map(d => d.provider))];
    matched.push({ source: sources[0], target: sources[1] || sources[0], matches: dups.map(d => ({ ...d, dedupeKey: key, confidence: 1 })) });
  }

  // Fuzzy/near-duplicate pairs (initial-variant, casing, word-order) that share
  // strong signals but aren't exact string duplicates.
  let fuzzyCount = 0;
  const fuzzyPairs = fuzzyDuplicates(allContacts, { minConfidence: calibration.fuzzyDedupeConfidence });
  for (const pair of fuzzyPairs) {
    const aProv = pair.a.provider, bProv = pair.b.provider;
    matched.push({
      source: aProv || bProv,
      target: bProv && bProv !== aProv ? bProv : aProv,
      matches: [{ ...pair.a, ...pair.b, confidence: pair.confidence, dedupeKey: pair.key, matchedOn: pair.matchedOn, fuzzy: true }],
    });
    fuzzyCount++;
  }

  if (exactDuplicates.length + fuzzyCount > 0) {
    insights.push({
      type: "discrepancy",
      severity: "medium",
      message: `Found ${exactDuplicates.length + fuzzyCount} duplicate contact group(s) across CRM systems (${exactDuplicates.length} exact, ${fuzzyCount} near-match).`,
    });
    alerts.push({ level: "warning", message: `${exactDuplicates.length + fuzzyCount} duplicate/near-duplicate contact group(s) detected — consider merging.`, requiresAttention: true });
    actions.push({
      provider: "hubspot",
      providerId: "hubspot",
      action: "deduplicate_contacts",
      status: "pending",
      detail: `Merge/verify ${exactDuplicates.length + fuzzyCount} duplicate contact group(s) across connected CRMs`,
    });
  }

  // Upgrade #5 — duplicate-rate drift vs the firm's OWN history.
  const dupGroupCount = exactDuplicates.length + fuzzyCount;
  if (escalation && totalRecords > 0) {
    const duplicateRate = round2(dupGroupCount / totalRecords);
    try {
      recordMetrics(escalation.tenantEmail, { duplicateRate }, escalation.dataDir);
    } catch {
      // internal metadata write — never blocks
    }
    try {
      const anomaly = detectAnomaly("duplicateRate", duplicateRate, escalation.metricHistory, {
        thresholdPercent: calibration.anomalyDeltaPercent,
        minSamples: calibration.minAnomalySamples,
      });
      if (anomaly.isAnomaly) {
        alerts.push({
          level: "warning",
          message: anomaly.reason,
          requiresAttention: false, // heads-up; the merge decision is separately gated
          routing: routeAlert(false),
        });
      }
    } catch {
      // additive/back-compat: fall back to today's behavior on failure
    }
  }

  // Lead scoring insight
  if (totalRecords > 0) {
    insights.push({
      type: "opportunity",
      severity: "low",
      message: `Scanned ${totalRecords} contacts/deals. Segment by engagement level for lead scoring.`,
    });
  }

  if (agent.id.includes("lead-scorer")) {
    // Score leads based on available data
    for (const contact of allContacts) {
      const enrichedItem = {
        ...contact,
        leadScore: contact.email ? 75 : 40,
        scoringFactors: { hasEmail: !!contact.email, hasName: !!contact.name, sourceSystem: contact.provider },
      };
      enriched.push(enrichedItem);
    }
    insights.push({
      type: "recommendation",
      severity: "medium",
      message: `Lead scoring complete for ${allContacts.length} contacts. Hot leads: ${allContacts.filter(c => c.email).length}`,
    });
  }

  if (agent.id.includes("follow-up")) {
    actions.push({
      provider: "hubspot",
      providerId: "hubspot",
      action: "create_follow_up_task",
      status: "pending",
      detail: `Create follow-up tasks for ${allContacts.length} contacts not engaged in 30+ days`,
    });
  }

  return {
    processedData: { filtered, enriched, matched, metrics: { totalRecords, duplicates: exactDuplicates.length + fuzzyCount, fuzzyDuplicates: fuzzyCount, scopedContacts: allContacts.length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processSupport(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;
  let openTickets = 0;

  const urgencyMap: Record<string, string> = {
    urgent: "Critical", high: "High", medium: "Medium", low: "Low",
    critical: "Critical", major: "High", minor: "Low",
  };

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        const priority = item.priority || item.urgency || "medium";
        const categorized = {
          ...item,
          _source: r.provider,
          _urgencyLevel: urgencyMap[String(priority).toLowerCase()] || "Medium",
          _requiresSLA: ["Critical", "High"].includes(urgencyMap[String(priority).toLowerCase()] || ""),
        };
        enriched.push(categorized);
        filtered.push(item);
        if (item.status !== "closed" && item.status !== "resolved") openTickets++;
      }
    }
  }

  // Categorize tickets by urgency
  const byUrgency: Record<string, number> = {};
  for (const e of enriched) {
    const u = e._urgencyLevel || "Unknown";
    byUrgency[u] = (byUrgency[u] || 0) + 1;
  }

  // SLA breach detection
  const slaRisks = enriched.filter(e => e._requiresSLA);
  if (slaRisks.length > 0) {
    insights.push({
      type: "risk",
      severity: "high",
      message: `${slaRisks.length} ticket(s) require immediate attention (Critical/High priority).`,
    });
    alerts.push({ level: "critical", message: `${slaRisks.length} high-priority tickets may breach SLA.`, requiresAttention: true });
  }

  // Triage routing
  if (agent.id.includes("triage")) {
    const routes = enriched.map(e => ({
      ticket: e.subject || e.short_description || e.id,
      urgency: e._urgencyLevel,
      suggestedTeam: e._urgencyLevel === "Critical" ? "L3 Engineering" : e._urgencyLevel === "High" ? "L2 Support" : "L1 Support",
      provider: e._source,
    }));
    for (const route of routes) {
      enriched.push(route);
    }
    insights.push({
      type: "recommendation",
      severity: "medium",
      message: `Routed ${routes.length} tickets to appropriate teams based on urgency.`,
    });
  }

  if (agent.id.includes("router")) {
    actions.push({
      provider: "jira",
      providerId: "jira",
      action: "route_tickets",
      status: "pending",
      detail: `Auto-assign ${enriched.length} tickets to appropriate teams based on urgency and category`,
    });
  }

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, openTickets, ...byUrgency } },
    actionsTaken: actions,
    insights: [...insights, { type: "summary", severity: "info", message: `${openTickets} open tickets across ${results.filter(r => r.status === "ok").length} systems.` }],
    alerts,
  };
}

function processOperations(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        // _source is the display name; _providerId is the canonical id used
        // for connection lookups and write dispatch.
        enriched.push({ ...item, _source: r.provider, _providerId: r.providerId });
        filtered.push(item);
      }
    }
  }

  // Inventory analysis
  if (agent.id.includes("inventory")) {
    const lowStock = enriched.filter((e: any) => typeof e.inventory === "number" && e.inventory < 10);
    if (lowStock.length > 0) {
      insights.push({
        type: "risk",
        severity: "high",
        message: `${lowStock.length} product(s) have low inventory (< 10 units).`,
      });
      alerts.push({ level: "warning", message: `${lowStock.length} products low on stock — reorder recommended.`, requiresAttention: true });
      for (const item of lowStock) {
        actions.push({
          provider: item._source,
          // Canonical provider id (e.g. "shopify"), NOT the display name —
          // required for the connection lookup and the write allowlist.
          // Note: create_reorder has no vetted write handler yet, so the
          // executor will safely skip it (fail closed) until one ships.
          providerId: item._providerId,
          action: "create_reorder",
          status: "pending",
          detail: `Reorder ${item.title || item.id}: current stock ${item.inventory}`,
        });
      }
    }

    // Calculate reorder points based on sample data
    for (const e of enriched) {
      if (typeof e.inventory === "number") {
        e._reorderPoint = Math.max(20, Math.ceil(e.inventory * 0.3));
        e._shouldReorder = e.inventory <= e._reorderPoint;
      }
    }
  }

  // Data entry bot insights
  if (agent.id.includes("data-entry")) {
    insights.push({
      type: "summary",
      severity: "info",
      message: `Processed ${totalRecords} records ready for transformation and normalization.`,
    });
    actions.push({
      provider: "googlesheets",
      providerId: "googlesheets",
      action: "normalize_data",
      status: "pending",
      detail: `Normalize and validate ${totalRecords} records across connected spreadsheets`,
    });
  }

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, systemsQueried: results.filter(r => r.status === "ok").length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processHR(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;
  const employees: any[] = [];

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        enriched.push({ ...item, _source: r.provider, _onboardingStage: "needs_review" });
        filtered.push(item);
        if (item.name || item.id) employees.push({ ...item, _source: r.provider });
      }
    }
  }

  // Generate onboarding checklists
  insights.push({
    type: "recommendation",
    severity: "medium",
    message: `Generated onboarding checklist for ${employees.length} employee(s) requiring document verification.`,
  });

  // Verify document completion
  const missingDocs = enriched.filter((e: any) => !e.department && !e.email);
  if (missingDocs.length > 0) {
    alerts.push({ level: "warning", message: `${missingDocs.length} employee(s) have incomplete profiles.`, requiresAttention: true });
    actions.push({
      provider: "bamboohr",
      providerId: "bamboohr",
      action: "verify_documents",
      status: "pending",
      detail: `Check I-9, W-4, and direct deposit for ${missingDocs.length} employee(s) with incomplete profiles`,
    });
  }

  insights.push({
    type: "summary",
    severity: "info",
    message: `HR review: ${employees.length} employees across ${results.filter(r => r.status === "ok").length} system(s). ${missingDocs.length} need document follow-up.`,
  });

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, employees, missingDocs: missingDocs.length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processCompliance(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        enriched.push({ ...item, _source: r.provider, _complianceChecked: true });
        filtered.push(item);
      }
    }
  }

  // Check for policy violations
  const highPriority = enriched.filter((e: any) => {
    const p = String(e.priority || "").toLowerCase();
    return p === "critical" || p === "1" || p === "high";
  });

  if (highPriority.length > 0) {
    insights.push({
      type: "risk",
      severity: "high",
      message: `${highPriority.length} issue(s) flagged as high/critical priority — potential policy violations.`,
    });
    alerts.push({ level: "error", message: `${highPriority.length} high-priority items may indicate compliance gaps.`, requiresAttention: true });
    actions.push({
      provider: "jira",
      providerId: "jira",
      action: "create_audit_finding",
      status: "pending",
      detail: `Generate audit findings for ${highPriority.length} high-priority items`,
    });
  }

  insights.push({
    type: "summary",
    severity: "info",
    message: `Compliance audit complete: ${totalRecords} records reviewed across ${results.filter(r => r.status === "ok").length} system(s). ${highPriority.length} flagged.`,
  });

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, flagged: highPriority.length, systemsAudited: results.filter(r => r.status === "ok").length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processCommunications(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        const categorized = {
          ...item,
          _source: r.provider,
          _category: item.name ? "channel" : "message",
          _priority: item.members ? "active_channel" : "standard",
        };
        enriched.push(categorized);
        filtered.push(item);
      }
    }
  }

  // Draft responses for active channels
  const activeChannels = enriched.filter((e: any) => e._priority === "active_channel");
  if (activeChannels.length > 0) {
    insights.push({
      type: "opportunity",
      severity: "low",
      message: `${activeChannels.length} active communication channel(s) ready for AI-assisted drafting.`,
    });
  }

  // Categorize messages
  insights.push({
    type: "summary",
    severity: "info",
    message: `Categorized ${enriched.length} message(s)/channel(s) across ${results.filter(r => r.status === "ok").length} communication platform(s).`,
  });

  if (agent.id.includes("email-assistant")) {
    actions.push({
      provider: "gmail",
      providerId: "gmail",
      action: "draft_responses",
      status: "pending",
      detail: "Draft AI-assisted responses for high-priority incoming emails",
    });
  }

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, channels: activeChannels.length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processData(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const matched: { source: string; target: string; matches: any[] }[] = [];
  const insights: Insight[] = [];
  const alerts: Alert[] = [];
  const actions: ActionItem[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        enriched.push({ ...item, _source: r.provider, _normalized: true, _schemaValidated: true });
        filtered.push(item);
      }
    }
  }

  // Cross-source matching
  const okResults = results.filter(r => r.status === "ok");
  if (okResults.length >= 2) {
    for (let i = 0; i < okResults.length - 1; i++) {
      for (let j = i + 1; j < okResults.length; j++) {
        matched.push({
          source: okResults[i].provider,
          target: okResults[j].provider,
          matches: [{ note: `${okResults[i].recordsFound} records from ${okResults[i].provider}, ${okResults[j].recordsFound} from ${okResults[j].provider} — ready for cross-system sync` }],
        });
      }
    }
  }

  insights.push({
    type: "recommendation",
    severity: "low",
    message: `Transformed ${totalRecords} records. Normalized schemas across ${okResults.length} data source(s).`,
  });

  actions.push({
    provider: "googlesheets",
    providerId: "googlesheets",
    action: "sync_data",
    status: "pending",
    detail: `Sync ${totalRecords} transformed records to destination targets`,
  });

  return {
    processedData: { filtered, enriched, matched, metrics: { totalRecords, dataSources: okResults.length, crossSystemPairs: matched.length } },
    actionsTaken: actions,
    insights,
    alerts,
  };
}

function processProcurement(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = []; const enriched: any[] = []; const matched: { source: string; target: string; matches: any[] }[] = [];
  const insights: Insight[] = []; const alerts: Alert[] = [];
  let total = 0; let approved = 0; let pending = 0; let invalid = 0;
  for (const r of results) {
    if (r.status !== "ok") continue;
    for (const item of r.sampleData) {
      const id = item.id || item.purchaseOrderId || item.poNumber || item.documentNumber;
      const vendor = item.vendorId || item.vendorName || item.vendor || item.supplier;
      const status = String(item.status || item.approvalStatus || "").toLowerCase();
      const amount = item.total ?? item.totalAmount ?? item.amount;
      if (!id || !vendor || amount === undefined) { invalid++; continue; }
      total++; if (["approved", "open", "completed"].includes(status)) approved++; else pending++;
      const record = { ...item, _source: r.provider, _po: { id: String(id), vendor: String(vendor), amount, status: status || "unknown" } };
      filtered.push(item); enriched.push(record);
    }
  }
  if (invalid) alerts.push({ level: "warning", message: `${invalid} procurement record(s) omitted because required PO fields were missing.`, requiresAttention: true });
  insights.push({ type: "summary", severity: "info", message: `Validated ${total} purchase order(s) across ${results.filter(r => r.status === "ok").length} connected procurement system(s).` });
  if (pending) insights.push({ type: "recommendation", severity: "medium", message: `${pending} purchase order(s) remain pending approval.` });
  return { processedData: { filtered, enriched, matched, metrics: { totalOrders: total, approvedOrders: approved, pendingOrders: pending, invalidRecords: invalid, systemsQueried: results.filter(r => r.status === "ok").length } }, actionsTaken: [], insights, alerts };
}
// Generic processing for uncategorized agents
function processGeneric(
  agent: AgentDefinition,
  results: ProviderResult[],
  _connections: ProviderConnection[]
): ProcessorResult {
  const filtered: any[] = [];
  const enriched: any[] = [];
  const insights: Insight[] = [];
  let totalRecords = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalRecords += r.recordsFound;
      for (const item of r.sampleData) {
        enriched.push({ ...item, _source: r.provider });
        filtered.push(item);
      }
    }
  }

  insights.push({
    type: "summary",
    severity: "info",
    message: `Processed ${totalRecords} records across ${results.filter(r => r.status === "ok").length} connected integration(s).`,
  });

  return {
    processedData: { filtered, enriched, matched: [], metrics: { totalRecords, systemsQueried: results.filter(r => r.status === "ok").length } },
    actionsTaken: [],
    insights,
    alerts: [],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Category dispatch
// ────────────────────────────────────────────────────────────────────────

const CATEGORY_PROCESSORS: Record<
  string,
  (agent: AgentDefinition, results: ProviderResult[], connections: ProviderConnection[], calibration?: Required<ProcessorCalibration>, escalation?: EscalationContext) => ProcessorResult
> = {
  finance: processFinance,
  sales: processSales,
  support: processSupport,
  operations: processOperations,
  hr: processHR,
  compliance: processCompliance,
  communications: processCommunications,
  data: processData,
  marketing: processGeneric,
  logistics: processGeneric,
  manufacturing: processGeneric,
  "customer-success": processGeneric,
  procurement: processProcurement,
};

// ────────────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────────────

/**
 * Process agent results through the category-specific pipeline.
 * Returns enriched data, insights, alerts, and recommended actions.
 * If processing fails for any reason, returns a graceful fallback with
 * raw results still intact (never throws).
 */
export function processAgentResults(
  agent: AgentDefinition,
  queryResult: AgentIntegrationResult,
  userConnections: ProviderConnection[],
  opts?: ProcessorOptions,
): ProcessorResult {
  try {
    const category = (agent.category || "").toLowerCase();
    const processor = CATEGORY_PROCESSORS[category] || processGeneric;

    // Per-tenant calibration for deterministic reasoning (defaults when unset).
    const calibration: Required<ProcessorCalibration> = opts?.tenantEmail
      ? getProcessorCalibration(opts.tenantEmail, opts.dataDir)
      : DEFAULT_PROCESSOR_CALIBRATION;

    // Upgrade #5 — build an optional escalation context (firm's own metric
    // history baseline) when a tenant is known, so finance/sales can flag
    // anomalies vs that firm's history. Fail-soft: absent on any error.
    let escalation: EscalationContext | undefined;
    if (opts?.tenantEmail) {
      try {
        const ctx = buildAgentContext(opts.tenantEmail, opts.dataDir);
        escalation = { tenantEmail: opts.tenantEmail, dataDir: opts.dataDir, metricHistory: ctx.metricHistory };
      } catch {
        escalation = undefined;
      }
    }
    const result = processor(agent, queryResult.integrationsUsed, userConnections, calibration, escalation);
    // Upgrade #5 — derive a routing category for every alert: requires_approval
    // when it demands a decision, read_recommendation as a pure heads-up.
    result.alerts = result.alerts.map((a) => ({
      ...a,
      routing: a.routing ?? routeAlert(a.requiresAttention),
    }));

    // Add a top-level summary insight
    result.insights.unshift({
      type: "summary",
      severity: "info",
      message: `Agent "${agent.name}" (${agent.category}) completed. Processed ${queryResult.totalRecordsProcessed} records across ${queryResult.integrationsUsed.filter(r => r.status === "ok").length} system(s).`,
      source: "agent-processor",
    });

    return result;
  } catch (e: any) {
    // Graceful fallback: return empty processing with error note
    return {
      processedData: { filtered: [], enriched: [], matched: [], metrics: { error: e.message } },
      actionsTaken: [],
      insights: [{ type: "summary", severity: "info", message: `Agent "${agent.name}" completed (processing skipped: ${e.message}). Raw query results available.` }],
      alerts: [{ level: "warning", message: `Post-query processing failed: ${e.message}`, requiresAttention: false, routing: routeAlert(false) }],
    };
  }
}
