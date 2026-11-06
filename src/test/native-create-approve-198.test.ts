// @vitest-environment node
/**
 * native-create-approve-198.test.ts — "an approved write must actually happen".
 *
 * WHY (portal sweep 2026-11-06, finding P1-1): with approvals ON — the default —
 * every native create is queued, and approving it in `/portal/approvals` answered
 * HTTP 200 with
 *
 *     data.execution = { success: false, error: 'Unknown action: "createProposal"' }
 *
 * The card then left the queue and the write stayed `pending` forever. The six
 * native modules had never registered an executor in the engine Action Registry
 * (only the vault had — `src/test/vault-approval-execution.test.ts` is the same
 * bug, found once before). The product could not create one record through its
 * own portal.
 *
 * This test drives the sweep's own four-step reproduction over real HTTP:
 *   1. POST the create            → 202 pending + approvalActionId
 *   2. POST the approval          → 200 AND execution.success === true
 *   3. GET the list               → the record is there
 *   4. GET the pending writes     → the write is `applied`, not `pending`
 *
 * RED at e3c6ad0: step 2 returns success:false "Unknown action: createProposal".
 * It asserts nothing the component supplies — the expected state comes from the
 * module's own store, read back through the API.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { ensureTestServer, testBaseUrl } from "./test-env";

const BASE_URL = testBaseUrl();

async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; json: any; cookie?: string }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["cookie"] = opts.cookie;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method: opts.method || "GET", headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, cookie: res.headers.get("set-cookie") || undefined };
}

async function register(email: string): Promise<string> {
  const r = await api("/api/register", { method: "POST", body: { email, password: "NativeExecPass2026" } });
  expect(r.status).toBe(200);
  const cookie = (r.cookie || "").split(";")[0];
  expect(cookie).toMatch(/^session=/);
  return cookie;
}

const proposalBody = (title: string) => ({
  title,
  clientName: "Acme Consulting",
  clientEmail: "ap@acme.test",
  lineItems: [{ description: "Discovery workshop", qty: 2, unitPrice: 1500 }],
});

describe("an approved native create executes (198)", () => {
  beforeAll(async () => {
    await ensureTestServer();
  });

  it("proposal: create → approve in the portal → the proposal exists", async () => {
    const cookie = await register(`native-exec-a-${Date.now()}@test.local`);

    // 1. create with approvals ON (the default) → queued, not applied
    const created = await api("/api/native/proposals", { method: "POST", cookie, body: proposalBody("Slice 198 quote") });
    expect(created.status).toBe(202);
    expect(created.json.data.status).toBe("pending");
    const actionId: string = created.json.data.approvalActionId;
    expect(typeof actionId).toBe("string");
    expect(actionId.length).toBeGreaterThan(0);

    // the card exists and says who queued it — a human in the portal, no agent
    const queue = await api("/api/portal/approvals", { cookie });
    const card = (queue.json.data.pending || []).find((a: any) => a.actionId === actionId);
    expect(card, "the approval card must be in the queue").toBeTruthy();
    expect(card.actionType).toBe("createProposal");
    expect(card.summary.why).not.toMatch(/agent-initiated/i);
    expect(card.summary.why).toMatch(/nothing is written until it is approved/i);

    // 2. approve → the write must EXECUTE (regression: was "Unknown action")
    const approve = await api("/api/portal/approvals", { method: "POST", cookie, body: { actionId, decision: "approve" } });
    expect(approve.status).toBe(200);
    expect(approve.json.data.execution?.success, JSON.stringify(approve.json.data.execution)).toBe(true);
    const createdId = approve.json.data.execution?.result?.record?.id;
    expect(typeof createdId).toBe("string");

    // 3. the record exists in the module's own list
    const list = await api("/api/native/proposals", { cookie });
    expect(list.status).toBe(200);
    const rows = list.json.data;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(createdId);
    expect(rows[0].title).toBe("Slice 198 quote");
    expect(rows[0].status).toBe("draft");

    // 4. the pending-write mirror is applied, not stuck pending
    const writes = await api("/api/native/proposals/writes", { cookie });
    const mirror = (writes.json.data || []).find((w: any) => w.approvalActionId === actionId);
    expect(mirror, "the pending write for this card must exist").toBeTruthy();
    expect(mirror.status).toBe("applied");
    // NOTE: `proposalId` on this row is the write's TARGET (null for a create —
    // there was no proposal when the card was minted). The record it created is
    // in the mirror's appliedResult, which this listing does not expose; step 3
    // above is what proves the record exists.

    // the decided card reports what happened, and carries the outcome
    const after = await api("/api/portal/approvals", { cookie });
    const decided = (after.json.data.decided || []).find((a: any) => a.actionId === actionId);
    expect(decided?.status).toBe("approved");
    expect(decided?.resultError).toBeUndefined();
  });

  it("a cross-tenant approval id cannot write into another tenant", async () => {
    const cookieA = await register(`native-iso-a-${Date.now()}@test.local`);
    const cookieB = await register(`native-iso-b-${Date.now()}@test.local`);

    const created = await api("/api/native/proposals", { method: "POST", cookie: cookieA, body: proposalBody("Tenant A only") });
    expect(created.status).toBe(202);
    const actionIdA: string = created.json.data.approvalActionId;

    // B tries to approve A's card
    const steal = await api("/api/portal/approvals", { method: "POST", cookie: cookieB, body: { actionId: actionIdA, decision: "approve" } });
    expect(steal.status).toBe(404);

    // A's write was not executed and B has nothing
    const listA = await api("/api/native/proposals", { cookie: cookieA });
    expect(listA.json.data).toHaveLength(0);
    const listB = await api("/api/native/proposals", { cookie: cookieB });
    expect(listB.json.data).toHaveLength(0);
    const writesA = await api("/api/native/proposals/writes", { cookie: cookieA });
    expect(writesA.json.data.find((w: any) => w.approvalActionId === actionIdA).status).toBe("pending");
  });
});
