import { describe, expect, it } from "vitest";
import { documentProcessingCapabilities, readEnvelopes, sendDocument, readTemplates, readBulkEnvelopes, checkSigningStatus, downloadSignedDoc, readRecipients, readEnvelope, voidEnvelope, monitorEnvelopeStatus } from "../agents/capabilities/document-processing";
describe("Document Processing / DocuSign capability slice", () => {
  it("has 10 unverified contracts", () => {
    expect(documentProcessingCapabilities).toHaveLength(10);
    expect(documentProcessingCapabilities.map((c) => c.status)).toEqual(Array(10).fill("unverified"));
  });
  it("has correct capability ids", () => {
    const ids = documentProcessingCapabilities.map((c) => c.capabilityId).sort();
    expect(ids).toEqual([
      "docusign-check-signing-status",
      "docusign-download-signed-doc",
      "docusign-monitor-envelope-status",
      "docusign-read-bulk-envelopes",
      "docusign-read-envelope",
      "docusign-read-envelopes",
      "docusign-read-recipients",
      "docusign-read-templates",
      "docusign-send-document",
      "docusign-void-envelope",
    ]);
  });
  it("has contract kinds: 7 understand, 2 automate, 1 monitor", () => {
    const kinds = documentProcessingCapabilities.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {} as Record<string, number>);
    expect(kinds.understand).toBe(7);
    expect(kinds.automate).toBe(2);
    expect(kinds.monitor).toBe(1);
  });
  it("fails closed without tenant or auth for readEnvelopes", async () => {
    const adapter = { listEnvelopes: async () => [] } as any;
    await expect(readEnvelopes(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readEnvelopes(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("retries bounded reads and audits for readEnvelopes", async () => {
    let calls = 0; const outcomes: string[] = [];
    const result = await readEnvelopes({ listEnvelopes: async (tenantId) => { calls++; expect(tenantId).toBe("t"); if (calls < 2) throw Error("temporary"); return ["envelope"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) });
    expect(result).toEqual(["envelope"]); expect(calls).toBe(2); expect(outcomes).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes for sendDocument", async () => {
    const outcomes: string[] = []; const adapter = { sendDocument: async () => { throw Error("unavailable"); } };
    await expect(sendDocument(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(sendDocument(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });
  it("readTemplates fails closed without tenant or auth", async () => {
    const adapter = { readTemplates: async () => [] } as any;
    await expect(readTemplates(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readTemplates(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("readBulkEnvelopes succeeds with valid adapter", async () => {
    const result = await readBulkEnvelopes({ readBulkEnvelopes: async () => ["e1", "e2"] }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual(["e1", "e2"]);
  });
  it("checkSigningStatus succeeds with valid adapter", async () => {
    const result = await checkSigningStatus({ checkSigningStatus: async () => ({ status: "completed" }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual({ status: "completed" });
  });
  it("downloadSignedDoc succeeds with valid adapter", async () => {
    const result = await downloadSignedDoc({ downloadSignedDoc: async () => ({ documents: [] }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual({ documents: [] });
  });
  it("readRecipients fails closed without tenant or auth", async () => {
    const adapter = { readRecipients: async () => [] } as any;
    await expect(readRecipients(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readRecipients(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("readEnvelope succeeds with valid adapter", async () => {
    const result = await readEnvelope({ readEnvelope: async () => ({ envelopeId: "abc", status: "sent" }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual({ envelopeId: "abc", status: "sent" });
  });
  it("voidEnvelope requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = []; const adapter = { voidEnvelope: async () => { throw Error("unavailable"); } };
    await expect(voidEnvelope(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(voidEnvelope(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });
  it("monitorEnvelopeStatus succeeds with valid adapter", async () => {
    const result = await monitorEnvelopeStatus({ monitorEnvelopeStatus: async () => ({ monitored: 3 }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual({ monitored: 3 });
  });
});
