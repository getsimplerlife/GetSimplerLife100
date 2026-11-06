// @vitest-environment node
/**
 * native-executors-registry-198.test.ts — the registry side of slice 198.
 *
 * The API test (`native-create-approve-198.test.ts`) proves the portal path
 * works for proposals. This file proves the parts that a single end-to-end case
 * cannot:
 *   1. DRIFT — every action name each of the six gates can enqueue is actually
 *      registered. The names live in `src/native/actions.ts` and in the gates;
 *      this test reads the gates' own exported maps, so the two cannot drift
 *      silently (which is exactly how the original bug survived).
 *   2. EVERY HANDLER REACHES ITS MODULE — invoking any registered native action
 *      with an unknown approval id answers the MODULE's refusal
 *      ("no pending write for this approval action"), never `Unknown action`.
 *   3. ENQUEUE REFUSAL — an action that a queue-executable provider cannot
 *      execute is refused at the write, with no card minted.
 *   4. IDEMPOTENCY — executing one decision twice creates ONE record.
 *   5. TENANT ISOLATION — an approval id from tenant A executed as tenant B
 *      writes nothing.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { actionRegistry } from "../engine/action-registry";
import { executeAction } from "../engine/action-executor";
import { approvalGate, listPendingActions, summarizeAction } from "../lib/approval-queue";
import {
  QUEUE_EXECUTABLE_PROVIDERS,
  nativeExecutorActionNames,
  registerNativeExecutors,
} from "../native/actions";
import { ACTION_NAME as PROPOSAL_ACTIONS, submitProposalWrite } from "../native/proposals/gate";
import { ACTION_NAME as INVOICE_ACTIONS } from "../native/invoice/gate";
import { ACTION_NAME as DEALROOM_ACTIONS } from "../native/dealroom/gate";
import { ACTION_NAME as CHECKLIST_ACTIONS } from "../native/checklists/gate";
import { ACTION_NAME as SURVEY_ACTIONS } from "../native/survey/gate";
import { ACTION_NAME as BOOKING_ACTIONS } from "../native/booking/gate";
import { listProposals } from "../native/proposals/store";

const dataDir = () => mkdtempSync(join(tmpdir(), "sl198-"));

const GATES = [
  { provider: "native-proposals", actions: PROPOSAL_ACTIONS },
  { provider: "native-invoices", actions: INVOICE_ACTIONS },
  { provider: "native-dealrooms", actions: DEALROOM_ACTIONS },
  { provider: "native-checklists", actions: CHECKLIST_ACTIONS },
  { provider: "native-survey", actions: SURVEY_ACTIONS },
  { provider: "native-bookings", actions: BOOKING_ACTIONS },
];

describe("native executors are registered (198)", () => {
  it("every action name a portal module can enqueue has a registered executor", () => {
    registerNativeExecutors(actionRegistry);
    const missing: string[] = [];
    for (const gate of GATES) {
      for (const name of Object.values(gate.actions)) {
        if (!actionRegistry.hasAction(name)) {
          missing.push(`${gate.provider}:${name}`);
          continue;
        }
        // and it must belong to the SAME provider the gate names, or the audit
        // line and the card would describe two different systems
        expect(actionRegistry.findProvider(name)).toBe(gate.provider);
      }
    }
    expect(missing, `actions queued by a gate but not executable: ${missing.join(", ")}`).toEqual([]);
    // assert the count so the test cannot pass by finding nothing
    expect(nativeExecutorActionNames().length).toBe(
      GATES.reduce((n, g) => n + Object.values(g.actions).length, 0),
    );
    expect(nativeExecutorActionNames().length).toBe(37);
  });

  it("every registered native action runs its module's own apply path, not an 'Unknown action'", async () => {
    registerNativeExecutors(actionRegistry);
    const dir = dataDir();
    const tenant = "registry-probe@test.local";
    const failures: string[] = [];
    for (const name of nativeExecutorActionNames()) {
      const out = await executeAction(name, {}, tenant, {
        bypassApproval: true,
        dataDir: dir,
        approvalActionId: "act-never-existed",
      });
      // The module refuses because there is no such pending write. The point is
      // WHO refused: the module's own apply path, not the registry.
      if (out.success !== false) failures.push(`${name}: unexpectedly succeeded`);
      else if (!/no pending write/i.test(out.error || "")) failures.push(`${name}: ${out.error}`);
    }
    expect(failures).toEqual([]);
  });

  it("a native action with no approval id refuses instead of guessing", async () => {
    registerNativeExecutors(actionRegistry);
    const out = await executeAction("createProposal", {}, "registry-probe@test.local", {
      bypassApproval: true,
      dataDir: dataDir(),
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/no approval action id/i);
  });

  it("executing one decision twice creates ONE record (idempotent)", async () => {
    const dir = dataDir();
    const tenant = "idem@test.local";
    const submitted = await submitProposalWrite(
      dir,
      tenant,
      "create",
      { data: { title: "Idempotent quote", clientName: "Acme", lineItems: [{ description: "x", qty: 1, unitPrice: 100 }] } },
      tenant,
    );
    expect(submitted.pending).toBe(true);
    const actionId = (submitted as any).approvalActionId as string;
    expect(actionId).toBeTruthy();

    const first = await executeAction("createProposal", {}, tenant, { bypassApproval: true, dataDir: dir, approvalActionId: actionId });
    expect(first.success, first.error).toBe(true);
    const firstId = first.data?.record?.id;
    expect(typeof firstId).toBe("string");

    const replay = await executeAction("createProposal", {}, tenant, { bypassApproval: true, dataDir: dir, approvalActionId: actionId });
    expect(replay.success, replay.error).toBe(true);
    expect(replay.data?.alreadyApplied).toBe(true);
    expect(replay.data?.record?.id).toBe(firstId);

    expect(listProposals(dir, tenant)).toHaveLength(1);
  });

  it("an approval id from another tenant writes nothing (tenant comes from the caller, not the payload)", async () => {
    const dir = dataDir();
    const tenantA = "iso-a@test.local";
    const tenantB = "iso-b@test.local";
    const submitted = await submitProposalWrite(
      dir,
      tenantA,
      "create",
      { data: { title: "A only", clientName: "Acme", lineItems: [{ description: "x", qty: 1, unitPrice: 100 }] } },
      tenantA,
    );
    expect(submitted.pending).toBe(true);
    const actionIdA = (submitted as any).approvalActionId as string;

    // B supplies A's approval id AND a payload claiming to be A.
    const stolen = await executeAction("createProposal", { tenantId: tenantA, tenantEmail: tenantA }, tenantB, {
      bypassApproval: true,
      dataDir: dir,
      approvalActionId: actionIdA,
    });
    expect(stolen.success).toBe(false);
    expect(stolen.error).toMatch(/no pending write/i);

    expect(listProposals(dir, tenantA)).toHaveLength(0);
    expect(listProposals(dir, tenantB)).toHaveLength(0);
  });
});

describe("the queue refuses an action it cannot execute (198)", () => {
  it("refuses at enqueue instead of carding a write that can only fail", () => {
    const dir = dataDir();
    const tenant = "enqueue-guard@test.local";
    const before = listPendingActions(tenant, dir).length;

    // A name inside a queue-executable provider that nothing registers — the
    // shape of the original bug (a card minted for an unexecutable action).
    const gate = approvalGate(tenant, "createProposalArchive", "native-proposals", { title: "x" }, {
      dataDir: dir,
      workflowId: "native-proposals",
    });

    expect(gate.allowed).toBe(false);
    expect(gate.actionId, "no card may be minted for an unexecutable action").toBeUndefined();
    expect(gate.error).toMatch(/No executor is registered for "createProposalArchive"/);
    expect(listPendingActions(tenant, dir).length).toBe(before);
  });

  it("still queues a registered action (the guard is not a blanket refusal)", () => {
    const dir = dataDir();
    const tenant = "enqueue-allowed@test.local";
    const gate = approvalGate(tenant, "createProposal", "native-proposals", { title: "x" }, {
      dataDir: dir,
      workflowId: "native-proposals",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.actionId).toBeTruthy();
    expect(listPendingActions(tenant, dir)).toHaveLength(1);
  });

  it("declares exactly the providers that ship an executor", () => {
    // The vault is queue-executable but registers in integration-tools, which the
    // server loads lazily — it is deliberately not guarded here (see the note on
    // QUEUE_EXECUTABLE_PROVIDERS), so it must not appear in this list.
    expect([...QUEUE_EXECUTABLE_PROVIDERS].sort()).toEqual(
      ["native-bookings", "native-checklists", "native-dealrooms", "native-invoices", "native-proposals", "native-survey"],
    );
  });
});

describe("the card says who queued it (198)", () => {
  it("does not call a human's own portal write agent-initiated", () => {
    const portal = summarizeAction("createProposal", "native-proposals", { title: "x" }, { requestedBy: "ops@acme.test" });
    expect(portal.why).toBe("Queued by ops@acme.test — nothing is written until it is approved.");
    const share = summarizeAction("approveProposal", "native-proposals", {}, { requestedBy: "public:anon" });
    expect(share.why).toMatch(/public share link/i);
    const unknown = summarizeAction("createProposal", "native-proposals", {});
    expect(unknown.why).not.toMatch(/agent/i);
  });
});
