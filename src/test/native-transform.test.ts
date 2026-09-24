/**
 * native-transform.test.ts — Phase 3.5 native data transforms & EDI/X12.
 *
 * Coverage: gated owner ops with lifecycle (draft→active→archived), forged
 * create-ids → 400, cross-tenant/unknown → 404-no-IDOR, validation BEFORE the
 * gate (bad source / unknown paths / template refs outside the field map /
 * caps NEVER queue), run is COMPUTED at queue time + applied deterministically
 * (pure engine — NO LLM), idempotent apply (replay → alreadyApplied, SAME
 * runId), EDI X12/EDIFACT parse+generate round-trips, XML xpath-subset
 * mapping + escaping, artifact download lane, pending-write cap, autonomy
 * auto-apply, audit + typed events, no-leak (foreign runs → 404).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeTransformsAuthed, registerBuiltinNativeTransformEventTypes } from "../native/transform/router";
import { listTransforms, listAudit, listRuns, listPendingWrites } from "../native/transform/store";
import { parseSource, executeTransform } from "../native/transform/engine";
import type { FieldMapping, GenerationConfig } from "../native/transform/types";
import { setAutonomyWorkflow } from "../lib/autonomy";
import { isRegisteredEventType } from "../native/webhooks/registry";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
function authedReq(method: string, pathname: string, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  return new Request(`http://localhost${pathname}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
function route(method: string, pathname: string, body?: unknown, tenant: string = T1): Promise<Response> {
  return handleNativeTransformsAuthed(authedReq(method, pathname, body), { userEmail: tenant, dataDir: dir });
}
const CSV_ARTIFACT = {
  name: "CSV → CSV normalize",
  description: "Trim + coerce a CSV into a clean CSV artifact",
  sourceKind: "csv",
  outputMode: "artifact",
  artifactKind: "csv",
  recordPath: "rows",
  fields: [
    { source: "name", target: "name", coerce: "trim", required: true },
    { source: "amount", target: "amount", coerce: "number", required: true },
  ],
  generation: { envelope: "none", delimiter: ",", hasHeader: true },
};
const CSV_RECORDS = {
  name: "CSV → records",
  description: "CSV rows to mapped rows (1.4-ready)",
  sourceKind: "csv",
  outputMode: "records",
  recordPath: "rows",
  fields: [
    { source: "name", target: "name", coerce: "lower" },
    { source: "qty", target: "qty", coerce: "int" },
  ],
};
const X12_FIELDS: FieldMapping[] = [
  { source: "BEG.3", target: "poNumber", required: true },
  { source: "BEG.5", target: "date", required: false },
  { source: "PO1.2", target: "qty", coerce: "int", required: true },
  { source: "PO1.3", target: "unitPrice" },
  { source: "PO1.4", target: "sku", required: true },
];
const X12_GEN: GenerationConfig = {
  envelope: "x12_850",
  senderId: "SENDER",
  receiverId: "RECVR",
  segments: ["BEG*00*SA*{poNumber}*{date}", "PO1*1*{qty}*{unitPrice}*{sku}"],
};
const X12_DEF = {
  name: "850 PO parser",
  description: "Parse an X12 850 single-line PO",
  sourceKind: "edi_x12",
  outputMode: "artifact",
  artifactKind: "edi_x12",
  recordPath: "transactions.*",
  fields: X12_FIELDS,
  generation: X12_GEN,
};
async function pendingWrite() {
  const ws = listPendingWrites(dir, T1).filter((w) => w.status === "pending");
  return ws[ws.length - 1]!;
}
async function createAndApply(body: Record<string, unknown>): Promise<string> {
  const r = await route("POST", "/api/native/transform", body);
  expect(r.status).toBe(202);
  const ptw = await pendingWrite();
  const a = await route("POST", `/api/native/transform/writes/${ptw.id}/apply`);
  expect(a.status).toBe(200);
  const data = (await a.json()).data as { transformId?: string; status?: string };
  expect(data.status).toBe("applied");
  return data.transformId!;
}
async function activateTransform(transformId: string): Promise<void> {
  const r = await route("POST", `/api/native/transform/${transformId}/activate`);
  expect(r.status).toBe(202);
  const ptw = await pendingWrite();
  const a = await route("POST", `/api/native/transform/writes/${ptw.id}/apply`);
  expect(a.status).toBe(200);
}
async function runTransform(transformId: string, source: string): Promise<{ runId: string }> {
  const r = await route("POST", `/api/native/transform/${transformId}/run`, { source });
  expect(r.status).toBe(202);
  const ptw = await pendingWrite();
  const a = await route("POST", `/api/native/transform/writes/${ptw.id}/apply`);
  expect(a.status).toBe(200);
  const data = (await a.json()).data as { runId?: string; status?: string };
  expect(data.status).toBe("applied");
  return { runId: data.runId! };
}
function isaLine(sender: string, receiver: string, date: string, time: string, ctrl: string): string {
  const el = "*";
  return `ISA${el}00${el}          ${el}00${el}          ${el}ZZ${el}${sender.padEnd(15, " ")}${el}ZZ${el}${receiver.padEnd(15, " ")}${el}${date}${el}${time}${el}U${el}00401${el}${ctrl}${el}0${el}P${el}>~`;
}
const X12_SOURCE = `${isaLine("SENDER", "RECVR", "240901", "1200", "000000001")}GS*PO*SENDER*RECVR*240901*1200*000000001*X*004010~ST*850*0001~BEG*00*SA*PO-1234**20240901~PO1*1*5*12.50*SKU-42~SE*3*0001~GE*1*000000001~IEA*1*000000001~`;
const EDIFACT_SOURCE = `UNA:+.? 'UNB+UNOA:2+SENDER+RECVR+240901:1200+00000000000001'UNH+1+ORDERS:D:96A:UN'LIN+1+SKU-99'QTY+21:7'UNT+3+1'UNZ+1+00000000000001'`;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-transform-"));
  registerBuiltinNativeTransformEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
describe("native transform slice", () => {
  it("create is gated; apply builds a server-id transform (trf_) with audit", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    const t = listTransforms(dir, T1).find((x) => x.id === transformId)!;
    expect(t.status).toBe("draft");
    expect(t.id.startsWith("trf_")).toBe(true);
    expect(t.fields.length).toBe(2);
    expect(t.fields.some((f) => "id" in f)).toBe(false); // server-assigned only
    expect(t.sourceKind).toBe("csv");
    expect(listAudit(dir, T1).some((e) => e.action === "native.transform.created" && e.transformId === transformId)).toBe(true);
    expect(isRegisteredEventType("native.transform.created")).toBe(true);
  });
  it("forged client-supplied transform/field ids → 400, never queued", async () => {
    const r1 = await route("POST", "/api/native/transform", { ...CSV_ARTIFACT, id: "trf_hacked" });
    expect(r1.status).toBe(400);
    const r2 = await route("POST", "/api/native/transform", { ...CSV_ARTIFACT, fields: [{ id: "f_1", source: "name", target: "name" }] });
    expect(r2.status).toBe(400);
    expect(listPendingWrites(dir, T1).length).toBe(0); // never queued
  });
  it("unknown + cross-tenant transform ids → 404 no-IDOR; lists are tenant-scoped", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    const g1 = await route("GET", `/api/native/transform/${transformId}`);
    expect(g1.status).toBe(200);
    const g2 = await route("GET", `/api/native/transform/${transformId}`, undefined, T2);
    expect(g2.status).toBe(404); // foreign → 404
    const g3 = await route("GET", "/api/native/transform/trf_doesnotexist");
    expect(g3.status).toBe(404);
    const listT1 = await route("GET", "/api/native/transform");
    const listT2 = await route("GET", "/api/native/transform", undefined, T2);
    expect(((await listT1.json()).data.transforms as unknown[]).length).toBe(1);
    expect(((await listT2.json()).data.transforms as unknown[]).length).toBe(0);
  });
  it("lifecycle + verbs: draft edits ok, activate → active, archive terminal, delete draft-only", async () => {
    const transformId = await createAndApply(CSV_RECORDS);
    // update in draft
    const u = await route("POST", `/api/native/transform/${transformId}/update`, { ...CSV_RECORDS, name: "CSV → records v2" });
    expect(u.status).toBe(202);
    const ptw = await pendingWrite();
    expect((await route("POST", `/api/native/transform/writes/${ptw.id}/apply`)).status).toBe(200);
    const t = listTransforms(dir, T1).find((x) => x.id === transformId)!;
    expect(t.name).toBe("CSV → records v2");
    expect(t.version).toBe(2);
    // archive before activate → 400
    expect((await route("POST", `/api/native/transform/${transformId}/archive`)).status).toBe(400);
    // delete a fresh draft works
    const c2 = await createAndApply({ ...CSV_RECORDS, name: "CSV delete me" });
    expect((await route("DELETE", `/api/native/transform/${c2}`)).status).toBe(202);
    const ptw2 = await pendingWrite();
    expect((await route("POST", `/api/native/transform/writes/${ptw2.id}/apply`)).status).toBe(200);
    expect(listTransforms(dir, T1).some((x) => x.id === c2)).toBe(false);
    expect(listAudit(dir, T1).some((e) => e.action === "native.transform.deleted" && e.transformId === c2)).toBe(true);
    // activate → run lane opens only when active
    await activateTransform(transformId);
    const runReq = await route("POST", `/api/native/transform/${transformId}/run`, { source: "name,qty\nA,3\n" });
    expect(runReq.status).toBe(202);
    const ptw3 = await pendingWrite();
    await route("POST", `/api/native/transform/writes/${ptw3.id}/apply`);
    expect(listTransforms(dir, T1).find((x) => x.id === transformId)!.status).toBe("active");
    // archive active → ok
    expect((await route("POST", `/api/native/transform/${transformId}/archive`)).status).toBe(202);
  });
  it("run is gated and applies deterministically (artifact CSV) with audit + download", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    await activateTransform(transformId);
    const { runId } = await runTransform(transformId, "name,amount\n  Acme  ,42\nBeta,7.5\n");
    expect(runId.startsWith("trn_")).toBe(true);
    const run = listRuns(dir, T1).find((r) => r.id === runId)!;
    expect(run.status).toBe("applied");
    expect(run.rowCount).toBe(2);
    expect(run.rows?.[0]?.values).toEqual({ name: "Acme", amount: 42 });
    expect(run.artifact?.mime).toBe("text/csv");
    expect(run.artifact?.text).toContain("name,amount");
    expect(run.artifact?.text).toContain("Beta,7.5");
    expect(listAudit(dir, T1).some((e) => e.action === "native.transform.run.applied" && e.runId === runId)).toBe(true);
    // artifact download lane (authed)
    const art = await route("GET", `/api/native/transform/runs/${runId}/artifact`);
    expect(art.status).toBe(200);
    expect(art.headers.get("content-type")).toBe("text/csv");
    expect(await art.text()).toContain("Acme");
    // run history lane
    const hist = await route("GET", `/api/native/transform/${transformId}/runs`);
    expect(((await hist.json()).data.runs as unknown[]).length).toBe(1);
  });
  it("idempotent apply: replaying the SAME approval returns alreadyApplied with the SAME runId", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    await activateTransform(transformId);
    const r = await route("POST", `/api/native/transform/${transformId}/run`, { source: "name,amount\nA,1\n" });
    expect(r.status).toBe(202);
    const ptw = await pendingWrite();
    const a1 = await route("POST", `/api/native/transform/writes/${ptw.id}/apply`);
    const d1 = (await a1.json()).data as { runId?: string };
    const a2 = await route("POST", `/api/native/transform/writes/${ptw.id}/apply`);
    expect(a2.status).toBe(200);
    const d2 = (await a2.json()).data as { runId?: string; alreadyApplied?: boolean };
    expect(d2.runId).toBe(d1.runId);
    expect(d2.alreadyApplied).toBe(true);
    expect(listRuns(dir, T1, transformId)).toHaveLength(1); // no duplicate run
  });
  it("validation BEFORE the gate — bad source / draft run / template refs NEVER queue", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    await activateTransform(transformId);
    // unparseable source → 400, nothing queued
    expect((await route("POST", `/api/native/transform/${transformId}/run`, { source: `name,amount\n"unterminated,1\n` })).status).toBe(400);
    // run on a draft transform → 400 (not active)
    const draftId = await createAndApply({ ...CSV_RECORDS, name: "CSV draft" });
    expect((await route("POST", `/api/native/transform/${draftId}/run`, { source: "a,b\n1,2\n" })).status).toBe(400);
    // template placeholder outside the field map → 400 at create
    expect(
      (await route("POST", "/api/native/transform", { ...X12_DEF, name: "bad template", generation: { ...X12_GEN, segments: ["BEG*00*SA*{nope}*{date}"] } })).status,
    ).toBe(400);
    // malformed placeholder → 400 at create
    expect(
      (await route("POST", "/api/native/transform", { ...X12_DEF, name: "bad placeholder", generation: { ...X12_GEN, segments: ["BEG*00*SA*{poNumber*{date}"] } })).status,
    ).toBe(400);
    // duplicate targets → 400
    expect((await route("POST", "/api/native/transform", { ...CSV_ARTIFACT, name: "dup", fields: [{ source: "name", target: "x" }, { source: "amount", target: "x" }] })).status).toBe(400);
    // x12_850 envelope needs senderId/receiverId → 400
    expect((await route("POST", "/api/native/transform", { ...X12_DEF, name: "no-si", generation: { ...X12_GEN, senderId: undefined, receiverId: undefined } })).status).toBe(400);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0); // none of these queued
  });
  it("X12: parse + generate round-trip; cross-tenant run isolation → 404 no-leak", async () => {
    const parsed = parseSource("edi_x12", X12_SOURCE);
    expect(parsed.kind).toBe("edi_x12");
    if (parsed.kind !== "edi_x12") return;
    expect(parsed.transactions).toHaveLength(1);
    // pure engine execution
    const exec = executeTransform(
      { sourceKind: "edi_x12", recordPath: "transactions.*", fields: X12_FIELDS, outputMode: "artifact", artifactKind: "edi_x12", generation: X12_GEN },
      X12_SOURCE,
      "seed-test",
      new Date("2024-09-01T12:00:00Z"),
    );
    expect(exec.rowCount).toBe(1);
    expect(exec.rows?.[0]?.values).toEqual({ poNumber: "PO-1234", date: "20240901", qty: 5, unitPrice: "12.50", sku: "SKU-42" });
    const out = exec.artifact!.text;
    expect(out.startsWith("ISA*00*")).toBe(true);
    expect(out).toContain("ST*850*");
    expect(out).toContain("BEG*00*SA*PO-1234*20240901");
    expect(out).toContain("PO1*1*5*12.50*SKU-42");
    // parse the GENERATED text again → structural round trip (1 transaction)
    const reparsed = parseSource("edi_x12", out);
    if (reparsed.kind !== "edi_x12") throw new Error("round trip failed");
    expect(reparsed.transactions).toHaveLength(1);
    expect(reparsed.transactions[0]!.segments.map((s) => s.id)).toEqual(["ST", "BEG", "PO1", "SE"]);
    // gated run via the slice; foreign tenant reads → 404 no-leak
    const transformId = await createAndApply(X12_DEF);
    await activateTransform(transformId);
    const { runId } = await runTransform(transformId, X12_SOURCE);
    expect((await route("GET", `/api/native/transform/runs/${runId}`)).status).toBe(200);
    expect((await route("GET", `/api/native/transform/runs/${runId}`, undefined, T2)).status).toBe(404);
    expect((await route("GET", `/api/native/transform/runs/${runId}/artifact`, undefined, T2)).status).toBe(404);
  });
  it("EDIFACT: parse UNB/UNH with composites; generate edifact_orders envelope", async () => {
    const parsed = parseSource("edifact", EDIFACT_SOURCE);
    expect(parsed.kind).toBe("edifact");
    if (parsed.kind !== "edifact") return;
    expect(parsed.transactions).toHaveLength(1);
    const ediFields: FieldMapping[] = [
      { source: "LIN.1", target: "sku", required: true },
      { source: "QTY.1", target: "qty", required: true },
      { source: "UNH.1", target: "ref", required: true },
    ];
    const ediGen: GenerationConfig = { envelope: "edifact_orders", senderId: "SENDER", receiverId: "RECVR", segments: ["LIN+1+{sku}", "QTY+{qty}"] };
    const exec = executeTransform(
      { sourceKind: "edifact", recordPath: "transactions.*", fields: ediFields, outputMode: "artifact", artifactKind: "edifact", generation: ediGen },
      EDIFACT_SOURCE,
      "seed-edifact",
      new Date("2024-09-01T12:00:00Z"),
    );
    expect(exec.rows?.[0]?.values).toEqual({ sku: "SKU-99", qty: "21:7", ref: "1" });
    expect(exec.artifact!.text.startsWith("UNA:+.? '")).toBe(true);
    expect(exec.artifact!.text).toContain("UNH+");
    expect(exec.artifact!.text).toContain("LIN+1+SKU-99");
    expect(exec.artifact!.text).toContain("QTY+21:7");
    const reparsed = parseSource("edifact", exec.artifact!.text);
    if (reparsed.kind !== "edifact") throw new Error("edifact round trip failed");
    expect(reparsed.transactions).toHaveLength(1);
  });
  it("XML xpath-subset mapping + xml artifact escaping; DOCTYPE rejected (XXE guard)", async () => {
    const xml = `<?xml version="1.0"?>
<orders>
  <order id="o1"><customer code="ACME">Acme &amp; Co</customer><amount>125.50</amount><note>rush <![CDATA[<now>]]></note></order>
  <order id="o2"><customer code="ZZZ">Beta Labs</customer><amount>42</amount><note>later</note></order>
</orders>`;
    const xmlFields: FieldMapping[] = [
      { source: "@id", target: "orderId", required: true },
      { source: "customer/text()", target: "customerName", coerce: "trim" },
      { source: "customer/@code", target: "customerCode" },
      { source: "amount/text()", target: "amount", coerce: "number" },
      { source: "note/text()", target: "note" },
    ];
    const xmlGen: GenerationConfig = { envelope: "none", rootTag: "records", rowTag: "row" };
    const exec = executeTransform(
      { sourceKind: "xml", recordPath: "/orders/order", fields: xmlFields, outputMode: "artifact", artifactKind: "xml", generation: xmlGen },
      xml,
      "seed-xml",
      new Date(),
    );
    expect(exec.rowCount).toBe(2);
    expect(exec.rows?.[0]?.values).toEqual({ orderId: "o1", customerName: "Acme & Co", customerCode: "ACME", amount: 125.5, note: "rush <now>" });
    expect(exec.artifact!.text).toContain("<records>");
    expect(exec.artifact!.text).toContain("Acme &amp; Co");
    // DOCTYPE/ENTITY rejected (XXE guard)
    expect(() => parseSource("xml", '<!DOCTYPE foo [<!ENTITY x "y">]><foo/>')).toThrow(/DOCTYPE/);
  });
  it("autonomy allow-list: runTransform auto-applies with audit", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    await activateTransform(transformId);
    setAutonomyWorkflow(T1, "native-transform", { enabled: true, allowList: [{ id: "al-tr-run", action: "runTransform" }] }, dir);
    const r = await route("POST", `/api/native/transform/${transformId}/run`, { source: "name,amount\nA,1\n" });
    expect(r.status).toBe(200); // auto-applied, NOT 202
    const data = (await r.json()).data as { status?: string };
    expect(data.status).toBe("applied");
    expect(listRuns(dir, T1, transformId)).toHaveLength(1);
    expect(listAudit(dir, T1).some((e) => e.action === "native.transform.run.applied")).toBe(true);
  });
  it("pending-write cap: 20 queued runs → the 21st is 400 before the queue", async () => {
    const transformId = await createAndApply(CSV_ARTIFACT);
    await activateTransform(transformId);
    for (let i = 0; i < 20; i += 1) {
      const r = await route("POST", `/api/native/transform/${transformId}/run`, { source: `name,amount\nA,${i}\n` });
      expect(r.status).toBe(202);
    }
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(20);
    const blocked = await route("POST", `/api/native/transform/${transformId}/run`, { source: "name,amount\nA,99\n" });
    expect(blocked.status).toBe(400);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(20);
  });
});