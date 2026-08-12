import { describe, expect, it } from "vitest";
import { productivityCapabilities, PRODUCTIVITY_EMPLOYEE_ID } from "../agents/capabilities/productivity";
import { createGoogleDoc, createGoogleDocFromTemplate, createGoogleSheet, writeGoogleSheetRange, createGoogleSlides } from "../agents/capabilities/productivity";

describe("Productivity capability contracts", () => {
  it("declares understand/monitor/automate slices for all four Google providers", () => {
    const providers = new Set(productivityCapabilities.map((c) => c.providerId));
    expect(providers).toEqual(new Set(["google-drive", "google-docs", "google-sheets", "google-slides"]));
    const kinds = productivityCapabilities.map((c) => c.kind);
    expect(kinds).toContain("understand");
    expect(kinds).toContain("monitor");
    expect(kinds).toContain("automate");
    for (const c of productivityCapabilities) {
      expect(c.employeeId).toBe(PRODUCTIVITY_EMPLOYEE_ID);
      expect(c.status).toBe("unverified");
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.evidence.length).toBeGreaterThan(10);
    }
  });

  it("automate contracts enforce idempotency + bounded retry (contract system validation)", () => {
    const automate = productivityCapabilities.filter((c) => c.kind === "automate");
    expect(automate.length).toBeGreaterThanOrEqual(4);
    for (const c of automate) {
      expect(c.idempotencyRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
      expect(c.rollback).not.toBe("not_applicable");
    }
  });

  it("monitor contracts enforce bounded retry + audit", () => {
    const monitor = productivityCapabilities.filter((c) => c.kind === "monitor");
    expect(monitor.length).toBe(1);
    expect(monitor[0].capabilityId).toBe("google-drive-monitor-folder-changes");
    expect(monitor[0].retryPolicy).toBe("bounded");
  });
});

describe("Productivity executors (bounded retry + audit + idempotency)", () => {
  const auditEvents: any[] = [];
  const baseOptions = {
    tenantId: "tenant-1",
    authToken: "tok-1",
    audit: (e: any) => {
      auditEvents.push(e);
    },
  };

  it("createGoogleDoc succeeds and audits", async () => {
    auditEvents.length = 0;
    const adapter = { createDoc: async () => ({ id: "doc-1" }) } as never;
    const result = await createGoogleDoc(adapter, { title: "T" }, baseOptions, "idem-1");
    expect(result).toEqual({ id: "doc-1" });
    expect(auditEvents).toEqual([
      { capabilityId: "google-docs-create-from-template", tenantId: "tenant-1", outcome: "succeeded", idempotencyKey: "idem-1" },
    ]);
  });

  it("createGoogleDoc requires an idempotency key", async () => {
    const adapter = { createDoc: async () => ({}) } as never;
    await expect(createGoogleDoc(adapter, { title: "T" }, baseOptions, "  ")).rejects.toThrow("Idempotency key is required");
  });

  it("retries bounded times then fails with audit", async () => {
    auditEvents.length = 0;
    let attempts = 0;
    const adapter = {
      createSheet: async () => {
        attempts++;
        throw new Error("boom");
      },
    } as never;
    await expect(createGoogleSheet(adapter, { title: "S" }, { ...baseOptions, maxAttempts: 3 }, "idem-2")).rejects.toThrow("boom");
    expect(attempts).toBe(3);
    expect(auditEvents.filter((e) => e.outcome === "failed").length).toBe(1);
  });

  it("requires tenant + auth (fail closed)", async () => {
    const adapter = { createDoc: async () => ({}) } as never;
    await expect(createGoogleDocFromTemplate(adapter, { templateId: "t", title: "T" }, { ...baseOptions, tenantId: " " }, "k")).rejects.toThrow("Tenant scope is required");
    await expect(writeGoogleSheetRange(adapter, { spreadsheetId: "s", range: "A1", values: [] }, { ...baseOptions, authToken: "" }, "k")).rejects.toThrow("Provider authentication is required");
  });

  it("createGoogleSlides passes through and audits", async () => {
    auditEvents.length = 0;
    const adapter = { createSlides: async () => ({ presentationId: "p-1" }) } as never;
    const result = await createGoogleSlides(adapter, { title: "Deck", slides: [{ title: "S1" }] }, baseOptions, "idem-3");
    expect(result).toEqual({ presentationId: "p-1" });
    expect(auditEvents[0].idempotencyKey).toBe("idem-3");
  });
});
