import { describe, expect, it } from "vitest";
import { createDocuSignClient } from "../integrations/providers/docusign/client";
import { docusignWebhookHandlers, docusignEventLog, clearDocusignEventLog } from "../integrations/providers/docusign/webhooks";

function makeClient() {
  return createDocuSignClient({ accessToken: "tok", accountId: "acct-1" } as never);
}

describe("DocuSign client full capability surface", () => {
  it("hits the right account-scoped paths for read methods", async () => {
    const c = makeClient();
    const calls: Array<{ method: string; path: string }> = [];
    (c as any).client.get = async (path: string) => { calls.push({ method: "get", path }); return { data: { users: [{ userId: "u1" }], brands: [], folders: [], signingGroups: [], auditEvents: [] } }; };
    await c.getAccountInfo();
    await c.listUsers();
    await c.listBrands();
    await c.getBrand("b1");
    await c.getTemplate("t1");
    await c.getEnvelopeAudit("e1");
    await c.listFolders();
    await c.getFolder("f1");
    await c.getEnvelopeCustomFields("e1");
    await c.listSigningGroups();
    const paths = calls.map((x) => x.path);
    expect(paths).toContain("/users");
    expect(paths).toContain("/brands/b1");
    expect(paths).toContain("/templates/t1");
    expect(paths).toContain("/envelopes/e1/audit_events");
    expect(paths).toContain("/folders/f1");
    expect(paths).toContain("/envelopes/e1/custom_fields");
    expect(paths).toContain("/signing_groups");
  });

  it("monitor: listEnvelopeStatusChanges encodes date/status/folder filters", async () => {
    const c = makeClient();
    let seen = "";
    (c as any).client.get = async (path: string) => { seen = path; return { data: { envelopes: [{ envelopeId: "e1" }] } }; };
    const out = await c.listEnvelopeStatusChanges({ fromDate: "2026-01-01", toDate: "2026-02-01", status: "completed", folderIds: ["f1", "f2"] });
    expect(out.length).toBe(1);
    expect(seen).toContain("from_date=2026-01-01");
    expect(seen).toContain("to_date=2026-02-01");
    expect(seen).toContain("status=completed");
    expect(seen).toContain("folder_ids=f1%2Cf2");
  });

  it("write: createEnvelopeFromTemplate posts templateId + templateRoles with status sent", async () => {
    const c = makeClient();
    let posted: any = null;
    (c as any).client.post = async (_path: string, body: any) => { posted = body; return { data: { envelopeId: "new-1" } }; };
    const out = await c.createEnvelopeFromTemplate({ templateId: "tpl-9", templateRoles: [{ email: "a@x.com", roleName: "Signer" }], emailSubject: "Sign this" });
    expect(out.envelopeId).toBe("new-1");
    expect(posted.templateId).toBe("tpl-9");
    expect(posted.status).toBe("sent");
    expect(posted.templateRoles[0].email).toBe("a@x.com");
  });

  it("write: sendEnvelopeFromUrl builds documents, signers and carbon copies", async () => {
    const c = makeClient();
    let posted: any = null;
    (c as any).client.post = async (_path: string, body: any) => { posted = body; return { data: {} }; };
    await c.sendEnvelopeFromUrl({
      emailSubject: "Contract",
      documents: [{ name: "contract.pdf", remoteUrl: "https://example.com/c.pdf" }],
      recipients: [{ email: "s@x.com", name: "Signer", roleName: "Signer", tabs: [{ signHereTabs: [{ xPosition: "100", yPosition: "100", documentId: "1", pageNumber: "1" }] }] }],
      carbonCopies: [{ email: "cc@x.com", name: "CC" }],
    });
    expect(posted.status).toBe("sent");
    expect(posted.documents[0].remoteUrl).toBe("https://example.com/c.pdf");
    expect(posted.recipients.signers[0].email).toBe("s@x.com");
    expect(posted.recipients.signers[0].tabs.length).toBe(1);
    expect(posted.recipients.carbonCopies[0].email).toBe("cc@x.com");
  });

  it("write: updateEnvelope, updateRecipients, createTemplate use PUT/POST with correct payloads", async () => {
    const c = makeClient();
    const puts: any[] = [];
    const posts: any[] = [];
    (c as any).client.put = async (path: string, body: any) => { puts.push({ path, body }); return { data: {} }; };
    (c as any).client.post = async (path: string, body: any) => { posts.push({ path, body }); return { data: {} }; };
    await c.updateEnvelope("e1", { status: "sent" });
    await c.updateRecipients("e1", [{ email: "x@x.com" }]);
    await c.createTemplate({ name: "tpl" });
    expect(puts.some((p) => p.path === "/envelopes/e1" && p.body.status === "sent")).toBe(true);
    expect(puts.some((p) => p.path === "/envelopes/e1/recipients")).toBe(true);
    expect(posts.some((p) => p.path === "/templates")).toBe(true);
  });

  it("read/write: document endpoints and enhanced envelope fetch", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => { calls.push(path); return { data: { documents: [{ documentId: "d1" }], signers: [{ email: "a@x.com" }], auditEvents: [] } }; };
    await c.downloadDocument("e1", "d1");
    await c.getCombinedDocument("e1");
    await c.getEnvelopeEnhanced("e1");
    expect(calls).toContain("/envelopes/e1/documents/d1");
    expect(calls).toContain("/envelopes/e1/documents/combined");
    expect(calls.filter((p) => p.startsWith("/envelopes/e1")).length).toBeGreaterThanOrEqual(5);
  });
});

describe("DocuSign webhook handlers (monitor)", () => {
  it("registers all six Connect event types", () => {
    const events = docusignWebhookHandlers.map((h) => h.eventType);
    expect(events).toEqual(expect.arrayContaining([
      "docusign.envelope-sent", "docusign.envelope-completed", "docusign.envelope-declined",
      "docusign.envelope-voided", "docusign.recipient-signed", "docusign.recipient-declined",
    ]));
  });

  it("records normalized events into the log", async () => {
    clearDocusignEventLog();
    const sent = docusignWebhookHandlers.find((h) => h.eventType === "docusign.envelope-sent")!;
    await sent.handler({ envelopeId: "env-1", status: "sent" });
    expect(docusignEventLog.length).toBe(1);
    expect(docusignEventLog[0].envelopeId).toBe("env-1");
    expect(docusignEventLog[0].eventType).toBe("docusign.envelope-sent");
  });

  it("handles Connect v2 payload shape", async () => {
    clearDocusignEventLog();
    const completed = docusignWebhookHandlers.find((h) => h.eventType === "docusign.envelope-completed")!;
    await completed.handler({ event: "envelope-completed", data: { envelopeId: "env-2", envelopeSummary: { status: "completed" } } });
    expect(docusignEventLog[0].envelopeId).toBe("env-2");
  });

  it("fails closed when no envelopeId is present", async () => {
    clearDocusignEventLog();
    const declined = docusignWebhookHandlers.find((h) => h.eventType === "docusign.envelope-declined")!;
    await expect(declined.handler({ event: "envelope-declined", data: {} })).rejects.toThrow("missing envelopeId");
    expect(docusignEventLog.length).toBe(0);
  });
});
