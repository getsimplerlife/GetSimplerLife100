import { describe, expect, it } from "vitest";
import {
  microsoftProductivityCapabilities,
} from "../agents/capabilities/productivity-microsoft";
import { PRODUCTIVITY_EMPLOYEE_ID } from "../agents/capabilities/productivity";
import {
  createMicrosoftWordDoc,
  createMicrosoftExcelWorkbook,
  writeMicrosoftExcelRange,
  createMicrosoftPowerPoint,
  uploadMicrosoftOneDriveFile,
  type MicrosoftProductivityAdapter,
  type MicrosoftProductivityExecutionOptions,
} from "../agents/capabilities/productivity-microsoft";

describe("Microsoft Productivity capability contracts", () => {
  it("declares understand/monitor/automate slices for all four Microsoft providers", () => {
    const providers = new Set(microsoftProductivityCapabilities.map((c) => c.providerId));
    expect(providers).toEqual(new Set(["onedrive", "microsoft-word", "microsoft-excel", "microsoft-powerpoint"]));
    const kinds = microsoftProductivityCapabilities.map((c) => c.kind);
    expect(kinds).toContain("understand");
    expect(kinds).toContain("monitor");
    expect(kinds).toContain("automate");
    for (const c of microsoftProductivityCapabilities) {
      expect(c.employeeId).toBe(PRODUCTIVITY_EMPLOYEE_ID);
      expect(c.status).toBe("unverified");
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.evidence.length).toBeGreaterThan(10);
    }
  });

  it("automate contracts enforce idempotency + bounded retry + rollback", () => {
    const automate = microsoftProductivityCapabilities.filter((c) => c.kind === "automate");
    expect(automate.length).toBeGreaterThanOrEqual(4);
    for (const c of automate) {
      expect(c.idempotencyRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
      expect(c.rollback).not.toBe("not_applicable");
    }
  });

  it("executors succeed with audit and pass the idempotency key through", async () => {
    const auditEvents: Array<{ capabilityId: string; outcome: string; idempotencyKey?: string }> = [];
    const adapter: MicrosoftProductivityAdapter = {
      createWordDoc: async (_input, key) => {
        expect(key).toBe("ik-1");
        return { id: "doc-1" };
      },
      createExcelWorkbook: async () => ({ id: "wb-1" }),
      writeExcelRange: async () => ({ ok: true }),
      createPowerPoint: async () => ({ id: "deck-1" }),
      uploadOneDriveFile: async () => ({ id: "file-1" }),
      deleteOneDriveFile: async () => ({ deleted: true }),
    };
    const options: MicrosoftProductivityExecutionOptions = {
      tenantId: "acme",
      authToken: "tok",
      audit: async (e) => auditEvents.push(e),
    };
    const r = await createMicrosoftWordDoc(adapter, { name: "Report", paragraphs: ["x"] }, options, "ik-1");
    expect(r).toEqual({ id: "doc-1" });
    expect(auditEvents).toEqual([{ capabilityId: "microsoft-word-create-document", tenantId: "acme", outcome: "succeeded", idempotencyKey: "ik-1" }]);
  });

  it("executors require tenant + auth token (fail closed)", async () => {
    const adapter: MicrosoftProductivityAdapter = {
      createWordDoc: async () => ({ id: "x" }),
      createExcelWorkbook: async () => ({ id: "x" }),
      writeExcelRange: async () => ({ ok: true }),
      createPowerPoint: async () => ({ id: "x" }),
      uploadOneDriveFile: async () => ({ id: "x" }),
      deleteOneDriveFile: async () => ({ deleted: true }),
    };
    const base = { tenantId: "acme", authToken: "tok", audit: async () => {} };
    await expect(createMicrosoftWordDoc(adapter, { name: "R", paragraphs: [] }, { ...base, tenantId: "  " } as never, "ik")).rejects.toThrow(/Tenant scope/);
    await expect(createMicrosoftExcelWorkbook(adapter, { name: "R", rows: [] }, { ...base, authToken: "" } as never, "ik")).rejects.toThrow(/authentication/);
    await expect(uploadMicrosoftOneDriveFile(adapter, { path: "x", content: "y" }, base as never, "")).rejects.toThrow(/Idempotency key/);
  });

  it("executors retry bounded (max 3) then audit a failure", async () => {
    const auditEvents: string[] = [];
    const adapter: MicrosoftProductivityAdapter = {
      createWordDoc: async () => {
        throw new Error("boom");
      },
      createExcelWorkbook: async () => ({ id: "x" }),
      writeExcelRange: async () => ({ ok: true }),
      createPowerPoint: async () => ({ id: "x" }),
      uploadOneDriveFile: async () => ({ id: "x" }),
      deleteOneDriveFile: async () => ({ deleted: true }),
    };
    await expect(
      createMicrosoftWordDoc(adapter, { name: "R", paragraphs: [] }, { tenantId: "acme", authToken: "tok", audit: async (e) => auditEvents.push(e.outcome) } as never, "ik"),
    ).rejects.toThrow("boom");
    expect(auditEvents).toEqual(["failed"]);
  });
});
