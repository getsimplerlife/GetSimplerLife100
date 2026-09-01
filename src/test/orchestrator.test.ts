/**
 * orchestrator.test.ts — REAL ORCHESTRATION (#1).
 *
 * Covers the multi-employee chain engine (src/agents/orchestrator.ts):
 *  1. Read-only chain executes all steps in order, feeding processor output
 *     from an upstream step into the downstream step's context.
 *  2. CRITICAL SAFETY: a chain step proposing a write lands as a PendingAction
 *     (with chainId recorded) and ZERO provider handler calls fire until a
 *     human approves — no provider write ever executes on proposal.
 *  3. Unknown chain id fails closed (throws), unknown agent type fails closed.
 *  4. Back-compat: static AGENT_CHAIN_MAP still renders (marketplace) and the
 *     existing low-level src/orchestration::executeChain still works.
 * All tests run with zero real providers and LLM off (approval gate default ON).
 */
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The engine's connection lookup is DB-backed. Stub it (no connections exist),
// matching the approval-queue test. The approval GATE runs BEFORE connection
// lookup, so gating is fully exercised without a DB or provider creds.
vi.mock("../integrations/framework/connection", () => ({
  listConnectionsByProvider: vi.fn(async () => []),
  updateConnectionConfig: vi.fn(async () => {}),
}));

import { runChain, CHAINS, listChains, getChain } from "../agents/orchestrator";
import { AGENT_CHAIN_MAP } from "../agents/agentChains";
import { getTenantAction, listPendingActions } from "../lib/approval-queue";
import { executeChain, resolveInput } from "../orchestration/executor";
import type { ProviderResult } from "../lib/provider-api";

// ── fixtures ────────────────────────────────────────────────────────────────
function makeResult(provider: string, recordsFound = 2, sampleData: any[] = []): ProviderResult {
  return { providerId: provider, provider, status: "ok", recordsFound, sampleData };
}

describe("orchestrator runChain", () => {
  let dir: string;
  const tenant = "acme@test.local";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orchestrator-run-"));
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
  });

  it("executes a read-only chain in order, feeding processor output forward", async () => {
    const res = await runChain({
      chainId: "doc-intake-to-contract-review",
      tenantEmail: tenant,
      dataDir: dir,
      stepResults: [
        [makeResult("google_drive", 3, [{ id: "doc1", name: "SLA-2026" }])],
        [makeResult("docusign", 1, [{ id: "env1", status: "completed" }])],
      ],
    });

    expect(res.status).toBe("completed");
    expect(res.steps.map((s) => s.agentType)).toEqual(["document_intake", "contract_management"]);
    // Step 2 (index 1) receives step 1's processed data in its input context.
    expect(res.steps[1]?.input?.["document_intake"]).toBeDefined();
    expect(res.steps[1]?.input?.["step1"]).toBeDefined();
    expect(res.steps[0]?.processed.processedData.metrics).toBeDefined();
    expect(res.pendingActionId).toBeUndefined();
  });

  it("pauses an approval-gated write as awaiting_approval and records chainId on the PendingAction", async () => {
    // Register a SPY handler for exactly the action the chain proposes. If the
    // gate ever let it through, this counter would increment — the safety test
    // asserts it stays 0 until a human approves.
    const { actionRegistry } = await import("../engine/action-executor");
    let createCalls = 0;
    actionRegistry.registerProvider("xero", [
      {
        name: "createXeroInvoice",
        description: "test",
        inputSchema: {},
        handler: async () => {
          createCalls++;
          return { ok: true };
        },
      },
    ]);

    const res = await runChain({
      chainId: "invoice-ingest-to-ledger",
      tenantEmail: tenant,
      dataDir: dir,
      stepResults: [
        [makeResult("google_drive", 2, [{ id: "inv1" }])],
        [makeResult("xero", 1, [{ id: "acc-1", name: "Acme Ltd" }])],
        [],
      ],
    });

    // The chain PAUSED at the write; the provider handler was NEVER called.
    expect(createCalls).toBe(0);
    expect(res.status).toBe("awaiting_approval");
    expect(res.pendingActionId).toBeTruthy();
    expect(res.steps.map((s) => s.agentType)).toEqual(["document_intake", "invoice_ledger"]);
    expect(res.steps[1]?.proposedWrite?.actionName).toBe("createXeroInvoice");
    expect(res.steps[1]?.proposedWrite?.provider).toBe("xero");

    // The PendingAction exists, is pending, and carries the issuing chainId.
    const act = getTenantAction(tenant, res.pendingActionId!, dir);
    expect(act).not.toBeNull();
    expect(act?.status).toBe("pending");
    expect(act?.chainId).toBe("invoice-ingest-to-ledger");
    expect(listPendingActions(tenant, dir).some((a) => a.actionId === res.pendingActionId)).toBe(true);
  });

  it("fails closed on an unknown chain id", async () => {
    await expect(
      runChain({ chainId: "no-such-chain", tenantEmail: tenant, dataDir: dir })
    ).rejects.toThrow(/Unknown chain 'no-such-chain'/);
  });

  it("aborts if a step references an unknown agent type (fail-closed)", async () => {
    const res = await runChain({
      chainId: "bad-agent-type-chain",
      tenantEmail: tenant,
      dataDir: dir,
      chain: {
        chainId: "bad-agent-type-chain",
        name: "bad",
        steps: [
          {
            agentType: "no_such_employee",
            agentName: "Fake",
            category: "operations",
            instructions: "nope",
          },
        ],
      },
    });
    expect(res.status).toBe("failed");
    expect(res.error).toMatch(/not in AGENT_CHAIN_MAP/);
    expect(res.steps).toHaveLength(1);
  });
});

describe("orchestrator registry", () => {
  it("exposes defined chains", () => {
    expect(getChain("invoice-ingest-to-ledger")).toBeDefined();
    expect(getChain("doc-intake-to-contract-review")).toBeDefined();
    expect(listChains().length).toBeGreaterThanOrEqual(2);
    expect(CHAINS["invoice-ingest-to-ledger"]?.steps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("back-compat", () => {
  it("static AGENT_CHAIN_MAP still renders for marketplace badges", () => {
    expect(AGENT_CHAIN_MAP["document_intake"]?.chainsWith).toContain("invoice_ledger");
    expect(AGENT_CHAIN_MAP["document_intake"]?.chainDescriptions?.["invoice_ledger"]).toBeTruthy();
  });

  it("the existing low-level orchestration executor still works unchanged", async () => {
    const chain = {
      id: "q",
      name: "q",
      trigger: { type: "manual" as const },
      steps: [
        { order: 2, employeeId: "b", capabilityId: "b", inputMapping: {} },
        { order: 1, employeeId: "a", capabilityId: "a", inputMapping: {} },
      ],
    };
    const seen: number[] = [];
    const r = await executeChain("q", {
      execute: async (s: { order: number }) => {
        seen.push(s.order);
        return s.order;
      },
    }, chain);
    expect(seen).toEqual([1, 2]);
    expect(r.status).toBe("processed");
    expect(resolveInput({ amount: "$step1.amount" }, { step1: { amount: 42 } })).toEqual({ amount: 42 });
  });
});
