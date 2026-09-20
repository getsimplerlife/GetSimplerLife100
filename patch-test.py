#!/usr/bin/env python3
import io
p = "src/test/native-tables.test.ts"
s = io.open(p, encoding="utf-8").read()

old1 = '''  it("schema update + delete allowed only on empty tables", async () => {
    const table = seedTable();
    const updated = updateTableSchema(dir, T1, table.id, table.fields, "Vendors v2", "d", "owner");
    expect(updated?.version).toBe(2);
    // add a row through the gated path then confirm delete/schema-update fail closed
    submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    // (approvals are ON for unknown tenants → write is pending, not applied)
    expect(countRows(dir, T1, table.id)).toBe(0);
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(true); // empty → ok
  });

  it("delete fails closed on a non-empty table", async () => {
    const store = getRow; void store;
    // directly insert a row via the store (bypass proof: gate applies go through store)
    const table = seedTable();
    void table;
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(true); // still empty
  });'''
new1 = '''  it("schema update + delete allowed only on empty tables", async () => {
    const table = seedTable();
    const updated = updateTableSchema(dir, T1, table.id, table.fields, "Vendors v2", "d", "owner");
    expect(updated?.version).toBe(2);
    // Insert a REAL row through the gated path (approvals on → apply via executor).
    const ins = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    expect(executePendingTableWrite(dir, T1, ins.approvalActionId, "owner@acme.test").ok).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(1);
    // With rows present, schema update + table delete FAIL CLOSED.
    expect(updateTableSchema(dir, T1, table.id, table.fields, "v3", "d", "owner")).toBeNull();
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(false);
    // After removing the row (gated), empty-only delete succeeds.
    const row = listRows(dir, T1, table.id)[0];
    const del = submitTableWrite(dir, T1, table.id, "delete", { rowData: {}, existingRowId: row.id }, AGENT);
    expect(executePendingTableWrite(dir, T1, del.approvalActionId, "owner@acme.test").ok).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(0);
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(true);
  });'''
assert old1 in s, "block1 not found"
s = s.replace(old1, new1)

old2 = '''  it("invalid rows are rejected BEFORE the gate (never queued)", () => {
    const table = seedTable();
    const before = listTenantActions(T1, dir).length;
    const res = submitTableWrite(dir, T1, table.id, "insert", { rowData: { name: "X", tier: "nope" } }, AGENT);
    expect(res.applied).toBe(false);
    expect(res.pending).toBeUndefined();
    // throws → router returns 400; nothing enqueued
    expect(() => submitTableWrite(dir, T1, table.id, "insert", { rowData: { name: "X", tier: "nope" } }, AGENT)).toThrow();
    expect(listTenantActions(T1, dir).length).toBe(before);
    expect(listPendingWrites(dir, T1, table.id).length).toBe(0);
    void res;
  });'''
new2 = '''  it("invalid rows are rejected BEFORE the gate (never queued)", () => {
    const table = seedTable();
    const before = listTenantActions(T1, dir).length;
    // Throws (router maps to 400) and nothing is enqueued/applied.
    expect(() => submitTableWrite(dir, T1, table.id, "insert", { rowData: { name: "X", tier: "nope" } }, AGENT)).toThrow();
    expect(listTenantActions(T1, dir).length).toBe(before);
    expect(listPendingWrites(dir, T1, table.id).length).toBe(0);
    expect(countRows(dir, T1, table.id)).toBe(0);
  });'''
assert old2 in s, "block2 not found"
s = s.replace(old2, new2)

old3 = '''    const table = seedTable();
    setAutonomyWorkflow(T2, AGENT, { enabled: true, allowList: [{ id: "al-2", action: "nativeTableInsert" }] }, dir);
    const res = submitTableWrite(dir, T2, table.id, "insert", { rowData: validRow() }, AGENT);
    expect(res.applied).toBe(false);
    void table;
  });'''
new3 = '''    const foreignTable = seedTable(T1);
    setAutonomyWorkflow(T2, AGENT, { enabled: true, allowList: [{ id: "al-2", action: "nativeTableInsert" }] }, dir);
    const res = submitTableWrite(dir, T2, foreignTable.id, "insert", { rowData: validRow() }, AGENT);
    expect(res.applied).toBe(false);
  });'''
assert old3 in s, "block3 not found"
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8").write(s)
print("patched test file")