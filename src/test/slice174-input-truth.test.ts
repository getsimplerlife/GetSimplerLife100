/**
 * slice174-input-truth.test.ts — the portal stops lying to the person typing.
 *
 * FOUR DEFECTS, EACH PINNED HERE WITH THE VALUE IT MUST REJECT:
 *  1. Silent truncation. `src/native/tables/validate.ts` sliced the table name to
 *     MAX_TABLE_NAME, sliced the field label to MAX_FIELD_LABEL and never looked
 *     at the description at all; `src/native/forms/router.ts` did the same for
 *     form name / description / field label / step title. A 10,000-character
 *     value came back **200** with 120 (or 500) characters stored. The tests
 *     below fail on the pre-fix code with `expected 200 to be 400`.
 *  2. Impossible dates. `DATE_RE` is a shape check: `2026-02-31` matched it, the
 *     row was stored, and the CSV export wrote it out. Now a real calendar check
 *     (month length, leap years) rejects it before storage.
 *  3. No request-size cap. Every JSON lane read `await req.text()` unbounded, so
 *     a 17 MiB body was buffered whole and answered **200**. Now 413, with the
 *     ceiling in the message, before the body is consumed.
 *  4. Field-level errors — see slice174-field-errors.test.tsx (the UI half).
 *
 * EXPECTED VALUES COME FROM THE SYSTEM OF RECORD. Every limit asserted below is
 * imported from the module that enforces it (MAX_TABLE_NAME, MAX_FORM_NAME, …),
 * never typed as a literal here. If a limit changes, these tests follow it; if a
 * validator disagrees with its own constant, they fail.
 *
 * ALSO PINNED, HONESTLY: checklists and deal rooms were NAMED in the Sweep C
 * brief as truncating, and they are not — `validateChecklistMutation` /
 * `validateDealRoomMutation` already reject an over-length name with a 400 that
 * names the field and the limit (their `.slice(0, 200)` calls are unreachable
 * no-ops behind that check). The pins below keep them that way instead of
 * "fixing" a defect that does not exist.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeTablesAuthed } from "../native/tables/router";
import { listTables, listRows, listPendingWrites } from "../native/tables/store";
import { handleNativeFormsAuthed } from "../native/forms/router";
import { listForms } from "../native/forms/store";
import { handleNativeChecklistsAuthed } from "../native/checklists/router";
import { listChecklists } from "../native/checklists/store";
import { handleNativeDealRoomsAuthed } from "../native/dealroom/router";
import { listDealRooms } from "../native/dealroom/store";
import { insertProposal } from "../native/proposals/store";
import { isRealDate } from "../native/tables/validate";
import { MAX_REQUEST_BODY_BYTES } from "../lib/request-body";
import { MAX_TABLE_NAME, MAX_TABLE_DESCRIPTION, MAX_FIELD_LABEL as MAX_TABLE_FIELD_LABEL } from "../native/tables/types";
import { MAX_FORM_NAME, MAX_FORM_DESCRIPTION, MAX_FIELD_LABEL as MAX_FORM_FIELD_LABEL, MAX_STEP_TITLE } from "../native/forms/types";
import { MAX_CHECKLIST_NAME } from "../native/checklists/types";
import { MAX_DEAL_ROOM_NAME, MAX_CUSTOMER_NAME } from "../native/dealroom/types";

const T1 = "tenant-a@acme.test";
const BIG = "x".repeat(10_000);
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "slice174-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function req(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const tables = (method: string, pathname: string, body?: unknown) =>
  handleNativeTablesAuthed(req(method, pathname, body), { userEmail: T1, dataDir: dir });
const forms = (method: string, pathname: string, body?: unknown) =>
  handleNativeFormsAuthed(req(method, pathname, body), { userEmail: T1, dataDir: dir });
const checklists = (method: string, pathname: string, body?: unknown) =>
  handleNativeChecklistsAuthed(req(method, pathname, body), { userEmail: T1, dataDir: dir });
const dealRooms = (method: string, pathname: string, body?: unknown) =>
  handleNativeDealRoomsAuthed(req(method, pathname, body), { userEmail: T1, dataDir: dir });

// ─────────────────────────────────────────────────────────────────────────
// 1. Over-length values are REFUSED, not silently truncated
// ─────────────────────────────────────────────────────────────────────────
describe("slice 174 — an over-length value is a 400 that names the field and its limit", () => {
  it("tables: a 10,000-char table name is rejected, not sliced to MAX_TABLE_NAME", async () => {
    const res = await tables("POST", "/api/native/tables", {
      name: BIG,
      fields: [{ key: "title", label: "Title", type: "text" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("name");
    expect(body.error).toContain(String(MAX_TABLE_NAME));
    expect(listTables(dir, T1)).toHaveLength(0);
  });

  it("tables: a 10,000-char description is rejected, not sliced to MAX_TABLE_DESCRIPTION", async () => {
    const res = await tables("POST", "/api/native/tables", {
      name: "Ok name",
      description: BIG,
      fields: [{ key: "title", label: "Title", type: "text" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("description");
    expect(body.error).toContain(String(MAX_TABLE_DESCRIPTION));
    expect(listTables(dir, T1)).toHaveLength(0);
  });

  it("tables: a 10,000-char field label is rejected, not sliced to MAX_FIELD_LABEL", async () => {
    const res = await tables("POST", "/api/native/tables", {
      name: "Ok name",
      fields: [{ key: "title", label: BIG, type: "text" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("label");
    expect(body.error).toContain(String(MAX_TABLE_FIELD_LABEL));
  });

  it("tables: a value exactly AT the limit still succeeds (the cap is not narrowed)", async () => {
    const res = await tables("POST", "/api/native/tables", {
      name: "n".repeat(MAX_TABLE_NAME),
      description: "d".repeat(MAX_TABLE_DESCRIPTION),
      fields: [{ key: "title", label: "l".repeat(MAX_TABLE_FIELD_LABEL), type: "text" }],
    });
    expect(res.status).toBe(200);
    const [table] = listTables(dir, T1);
    expect(table.name).toHaveLength(MAX_TABLE_NAME);
    expect(table.description).toHaveLength(MAX_TABLE_DESCRIPTION);
    expect(table.fields[0].label).toHaveLength(MAX_TABLE_FIELD_LABEL);
  });

  it("forms: a 10,000-char form name is rejected, not sliced to MAX_FORM_NAME", async () => {
    const res = await forms("POST", "/api/native/forms", {
      name: BIG,
      steps: [{ id: "s1", title: "Step", fields: [{ key: "q1", label: "Q1", type: "text" }] }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("name");
    expect(body.error).toContain(String(MAX_FORM_NAME));
    expect(listForms(dir, T1)).toHaveLength(0);
  });

  it("forms: a 10,000-char description is rejected, not sliced to MAX_FORM_DESCRIPTION", async () => {
    const res = await forms("POST", "/api/native/forms", {
      name: "Ok form",
      description: BIG,
      steps: [{ id: "s1", title: "Step", fields: [{ key: "q1", label: "Q1", type: "text" }] }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("description");
    expect(body.error).toContain(String(MAX_FORM_DESCRIPTION));
  });

  it("forms: a 10,000-char field label is rejected, not sliced to MAX_FIELD_LABEL", async () => {
    const res = await forms("POST", "/api/native/forms", {
      name: "Ok form",
      steps: [{ id: "s1", title: "Step", fields: [{ key: "q1", label: BIG, type: "text" }] }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("label");
    expect(body.error).toContain(String(MAX_FORM_FIELD_LABEL));
  });

  it("forms: an over-length step title is rejected, not sliced to a bare 200", async () => {
    const res = await forms("POST", "/api/native/forms", {
      name: "Ok form",
      steps: [{ id: "s1", title: "t".repeat(MAX_STEP_TITLE + 1), fields: [{ key: "q1", label: "Q1", type: "text" }] }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("title");
    expect(body.error).toContain(String(MAX_STEP_TITLE));
  });

  // ── the two named sites that were ALREADY correct: keep them that way ──
  it("checklists: an over-length name is refused with the field and the limit (pin)", async () => {
    const res = await checklists("POST", "/api/native/checklists", {
      name: BIG,
      description: "d",
      kind: "delivery",
      items: [{ title: "one", status: "todo" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("name");
    expect(body.error).toContain(String(MAX_CHECKLIST_NAME));
    expect(listChecklists(dir, T1)).toHaveLength(0);
  });

  it("deal rooms: an over-length name and customer name are refused (pin)", async () => {
    const now = new Date().toISOString();
    insertProposal(dir, {
      id: "prop_pin0001",
      tenantId: T1,
      title: "Retainer",
      clientName: "Acme",
      clientEmail: "ops@acme.test",
      clientCompany: "Acme",
      lineItems: [{ id: "li_x", description: "Setup", qty: 1, unitPrice: 5000 }],
      currency: "USD",
      terms: "",
      validityDays: 30,
      status: "approved",
      shareSlug: null,
      docId: null,
      version: 1,
      createdAt: now,
      createdBy: T1,
      updatedAt: now,
      updatedBy: T1,
      signatures: [],
    } as never);

    const byName = await dealRooms("POST", "/api/native/dealroom", {
      name: BIG,
      customerName: "Acme",
      customerEmail: "ops@acme.test",
      linkedProposalId: "prop_pin0001",
    });
    expect(byName.status).toBe(400);
    expect(((await byName.json()) as { error: string }).error).toContain(String(MAX_DEAL_ROOM_NAME));

    const byCustomer = await dealRooms("POST", "/api/native/dealroom", {
      name: "Ok room",
      customerName: BIG,
      customerEmail: "ops@acme.test",
      linkedProposalId: "prop_pin0001",
    });
    expect(byCustomer.status).toBe(400);
    expect(((await byCustomer.json()) as { error: string }).error).toContain(String(MAX_CUSTOMER_NAME));
    expect(listDealRooms(dir, T1)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. A date that does not exist never reaches storage or an export
// ─────────────────────────────────────────────────────────────────────────
describe("slice 174 — an impossible date is refused before storage", () => {
  async function dateTable(): Promise<string> {
    const res = await tables("POST", "/api/native/tables", {
      name: "Dated",
      fields: [{ key: "due", label: "Due", type: "date" }],
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: { id: string } }).data.id;
  }

  it("isRealDate accepts real days and rejects the impossible ones", () => {
    expect(isRealDate("2024-02-29")).toBe(true); // leap year
    expect(isRealDate("2000-02-29")).toBe(true); // 400-year rule
    expect(isRealDate("2025-02-29")).toBe(false); // not a leap year
    expect(isRealDate("1900-02-29")).toBe(false); // 100-year rule
    expect(isRealDate("2026-02-31")).toBe(false); // 31st of February
    expect(isRealDate("2026-04-31")).toBe(false); // 31st of a 30-day month
    expect(isRealDate("2026-13-01")).toBe(false); // month 13
    expect(isRealDate("2026-00-10")).toBe(false); // month 0
    expect(isRealDate("2026-01-00")).toBe(false); // day 0
    expect(isRealDate("2026-1-1")).toBe(false); // shape
    expect(isRealDate("2026-12-31")).toBe(true);
  });

  it("rejects 2026-02-31 with a 400 that names the field, and stores nothing", async () => {
    const tableId = await dateTable();
    const res = await tables("POST", `/api/native/tables/${tableId}/rows`, { data: { due: "2026-02-31" } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("due");
    expect(body.error).toContain("2026-02-31");
    expect(listRows(dir, T1, tableId)).toHaveLength(0);
    // …and it never even reached the approval queue.
    expect(listPendingWrites(dir, T1, tableId)).toHaveLength(0);
    const csv = await (await tables("GET", `/api/native/tables/${tableId}/export?format=csv`)).text();
    expect(csv).not.toContain("2026-02-31");
  });

  it("rejects the other impossible shapes too (31 April, 29 Feb in a common year)", async () => {
    const tableId = await dateTable();
    for (const bad of ["2026-04-31", "2025-02-29", "2026-13-01", "2026-00-10"]) {
      const res = await tables("POST", `/api/native/tables/${tableId}/rows`, { data: { due: bad } });
      expect(res.status, `date ${bad} must be refused`).toBe(400);
    }
    expect(listRows(dir, T1, tableId)).toHaveLength(0);
  });

  it("still accepts a real leap day, and the export writes exactly what was stored", async () => {
    const tableId = await dateTable();
    const res = await tables("POST", `/api/native/tables/${tableId}/rows`, { data: { due: "2024-02-29" } });
    expect(res.status).toBe(202);
    const pending = listPendingWrites(dir, T1, tableId).find((w) => w.status === "pending");
    expect(pending).toBeTruthy();
    const applied = await tables("POST", `/api/native/tables/writes/${pending!.id}/apply`);
    expect(applied.status).toBe(200);
    const rows = listRows(dir, T1, tableId);
    expect(rows).toHaveLength(1);
    expect(rows[0].data.due).toBe("2024-02-29");
    const csv = await (await tables("GET", `/api/native/tables/${tableId}/export?format=csv`)).text();
    expect(csv).toContain("2024-02-29");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. A body over the ceiling is a 413 before it is buffered
// ─────────────────────────────────────────────────────────────────────────
describe("slice 174 — request bodies are bounded", () => {
  it("refuses a declared body over the ceiling with a 413 that states the number", async () => {
    const huge = "x".repeat(MAX_REQUEST_BODY_BYTES + 1024);
    const res = await tables("POST", "/api/native/tables", {
      name: huge,
      fields: [{ key: "a", label: "A", type: "text" }],
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain(String(MAX_REQUEST_BODY_BYTES));
    expect(body.error).toContain("16 MiB");
  });

  it("refuses a CHUNKED body with no Content-Length once it crosses the ceiling", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(120); // 1 MiB
    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent >= 20) {
          controller.close();
          return;
        }
        sent++;
        controller.enqueue(chunk);
      },
    });
    const chunked = new Request("http://native.test/api/native/tables", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(chunked.headers.get("content-length")).toBeNull(); // the header path cannot save us here
    const capped = await handleNativeTablesAuthed(chunked, { userEmail: T1, dataDir: dir });
    expect(capped.status).toBe(413);
    expect(((await capped.json()) as { error: string }).error).toContain(String(MAX_REQUEST_BODY_BYTES));
    expect(sent).toBeLessThan(20); // the reader stopped instead of draining the whole body
  });

  it("still accepts a large-but-legitimate body (the cap does not break real work)", async () => {
    const res = await tables("POST", "/api/native/tables", {
      name: "Big but legal",
      fields: [{ key: "title", label: "Title", type: "text" }],
      pad: "x".repeat(1024 * 1024), // 1 MiB of unknown key — ignored by the schema validator
    });
    expect(res.status).toBe(200);
  });
});
