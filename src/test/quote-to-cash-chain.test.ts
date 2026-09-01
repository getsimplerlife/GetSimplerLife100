/**
 * quote-to-cash-chain.test.ts — capability upgrade #6.
 *
 * Strengthens the QUOTE-TO-CASH demo spine (proposal → DocuSign e-sign →
 * HubSpot deal/contact → Xero invoice draft → Slack notify → Google Drive file)
 * on VERIFIED integrations ONLY — no QuickBooks/QBO claims.
 *
 * Invariants held:
 *  - Every provider write is declared on `write` and routes through the
 *    unchanged approval gate (fail-closed default ON): running the chain
 *    pauses `awaiting_approval` at the FIRST gated write, records `chainId`
 *    on the PendingAction, and ZERO provider/connection calls fire.
 *  - Contract test: every quoted write action is a REAL registered provider
 *    action, all 5 route to `pendingApproval` with an actionId (no creds), and
 *    none is a QuickBooks/QBO provider.
 *  - Back-compat: the two pre-existing chains still register without regression.
 *
 * All tests: LLM off, zero real providers, fail-closed default ON.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The engine's connection lookup is DB-backed. Stub it (no connections exist),
// matching the existing orchestrator/approval-queue tests. The approval GATE
// runs BEFORE connection lookup, so gating is fully exercised without creds.
vi.mock("../integrations/framework/connection", () => ({
  listConnectionsByProvider: vi.fn(async () => []),
  updateConnectionConfig: vi.fn(async () => {}),
}));

import {
  QUOTE_TO_CASH,
  runChain,
  CHAINS,
  listChains,
  getChain,
  INVOICE_INGEST_TO_LEDGER,
  DOC_INTAKE_TO_CONTRACT_REVIEW,
} from "../agents/orchestrator";
import { listPendingActions } from "../lib/approval-queue";
import { executeAction, actionRegistry } from "../engine/action-executor";
// Registers all provider action handlers (matches production startup + the
// existing approval-queue test). Required so executeAction routes quoted
// writes through the approval gate instead of returning "unknown action".
import "../engine/integration-tools";
import { listConnectionsByProvider } from "../integrations/framework/connection";
import type { ProviderResult } from "../lib/provider-api";

function makeResult(provider: string, recordsFound = 2, sampleData: any[] = []): ProviderResult {
  return { providerId: provider, provider, status: "ok", recordsFound, sampleData };
}

/** Providers verified live (per plan §Verified Provider Contracts). QBO intentionally absent. */
const VERIFIED_WRITE_PROVIDERS = new Set(["docusign", "hubspot", "xero", "slack", "google-drive", "onedrive"]);

const QUOTE_WRITES = QUOTE_TO_CASH.steps
  .map((s) => s.write)
  .filter((w): w is NonNullable<typeof w> => !!w);

describe("quote-to-cash chain (capability #6)", () => {
  let dir: string;
  const tenant = "q2c@test.local";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "q2c-"));
    vi.mocked(listConnectionsByProvider).mockClear();
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
  });

  it("registers the quote-to-cash chain (and back-compat chains still exist)", () => {
    expect(getChain("quote-to-cash")).toBeDefined();
    expect(listChains().map((c) => c.chainId)).toContain("quote-to-cash");
    expect(QUOTE_TO_CASH.steps.length).toBe(6);
    // Back-compat: the two pre-existing chains are untouched.
    expect(CHAINS[INVOICE_INGEST_TO_LEDGER.chainId]).toBeDefined();
    expect(CHAINS[DOC_INTAKE_TO_CONTRACT_REVIEW.chainId]).toBeDefined();
  });

  it("spans the full quote-to-cash spine in order", () => {
    expect(QUOTE_TO_CASH.steps.map((s) => s.agentType)).toEqual([
      "sales_outreach",   // proposal
      "document_intake",  // e-sign (DocuSign)
      "sales_outreach",   // HubSpot deal
      "invoice_ledger",   // Xero invoice draft
      "audit_logger",     // Slack notify
      "document_intake",  // file to Google Drive
    ]);
    expect(QUOTE_TO_CASH.steps.map((s) => s.write?.actionName)).toEqual([
      undefined,
      "sendDocuSignEnvelope",
      "createHubSpotDeal",
      "createXeroInvoice",
      "postSlackMessage",
      "uploadGDriveFile",
    ]);
  });

  it("pauses awaiting_approval at the first gated write with zero provider calls", async () => {
    const res = await runChain({
      chainId: "quote-to-cash",
      tenantEmail: tenant,
      dataDir: dir,
      stepResults: [
        [makeResult("hubspot", 2)],
        [makeResult("docusign", 1)],
        [],
        [],
        [],
        [],
      ],
    });

    expect(res.status).toBe("awaiting_approval");
    expect(res.pendingActionId).toBeTruthy();
    expect(res.steps.map((s) => s.agentType)).toEqual(["sales_outreach", "document_intake"]);

    // The gated write carries the chainId on its PendingAction.
    const pending = await listPendingActions(tenant, dir);
    const action = pending.find((a) => a.actionId === res.pendingActionId);
    expect(action).toBeTruthy();
    expect(action!.provider).toBe("docusign");
    expect(action!.chainId).toBe("quote-to-cash");
    expect(action!.status).toBe("pending");

    // Zero provider calls: the approval gate runs BEFORE connection lookup, so
    // the DB-backed connection lookup is never invoked on a gated write.
    expect(vi.mocked(listConnectionsByProvider)).not.toHaveBeenCalled();
  });

  it("contract: every quoted write is a real registered action gated to pendingApproval (no QBO)", async () => {
    expect(QUOTE_WRITES.length).toBe(5);
    for (const w of QUOTE_WRITES) {
      // Action is registered under its expected verified provider.
      expect(actionRegistry.findProvider(w.actionName)).toBe(w.provider);
      // No QuickBooks/QBO anywhere on the quote-to-cash spine.
      expect(VERIFIED_WRITE_PROVIDERS.has(w.provider)).toBe(true);
      expect(w.provider.toLowerCase()).not.toMatch(/quickbooks|qbo|intuit/);
      // Writing routes to the approval gate (pendingApproval) with an id,
      // even with zero creds — and no provider/connection call fires.
      const r = await executeAction(w.actionName, w.params, tenant, {
        agentId: w.provider,
        chainId: "quote-to-cash",
        dataDir: dir,
      });
      expect(r.pendingApproval).toBe(true);
      expect(r.actionId).toBeTruthy();
      expect(r.success).toBe(false); // never executed
    }
    // timeout-style executions must remain non-executing: no connection lookup.
    // (The gate returns before connection lookup, so it stays untouched.)
    expect(vi.mocked(listConnectionsByProvider)).not.toHaveBeenCalled();
  });

  it("is strictly per-tenant: another tenant never sees this run's pending action", async () => {
    await runChain({
      chainId: "quote-to-cash",
      tenantEmail: tenant,
      dataDir: dir,
      stepResults: [[makeResult("hubspot", 2)], [makeResult("docusign", 1)]],
    });
    const other = await listPendingActions("other@test.local", dir);
    expect(other.length).toBe(0);
  });
});
