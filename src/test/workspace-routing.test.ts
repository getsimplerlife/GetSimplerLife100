/**
 * workspace-routing.test.ts — unit tests for the cross-workspace file-creation
 * resolver (owner directive 2026-08-13). Covers: both-connected auto,
 * single-connected, none-connected fail-closed, preference override,
 * explicit-request validation, file-type mapping, least-loaded tie-break.
 */
import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceProvider,
  workspaceForProvider,
  providerSupportsType,
  isFileProvider,
  FILE_TYPE_TO_PROVIDERS,
} from "../lib/workspace-routing";

describe("workspaceForProvider", () => {
  it("maps every Google and Microsoft file provider to its workspace", () => {
    expect(workspaceForProvider("google-docs")).toBe("google");
    expect(workspaceForProvider("google-sheets")).toBe("google");
    expect(workspaceForProvider("google-slides")).toBe("google");
    expect(workspaceForProvider("google-drive")).toBe("google");
    expect(workspaceForProvider("microsoft-word")).toBe("microsoft");
    expect(workspaceForProvider("microsoft-excel")).toBe("microsoft");
    expect(workspaceForProvider("microsoft-powerpoint")).toBe("microsoft");
    expect(workspaceForProvider("onedrive")).toBe("microsoft");
  });
  it("returns null for non-file providers (fail closed)", () => {
    expect(workspaceForProvider("salesforce")).toBeNull();
    expect(workspaceForProvider("")).toBeNull();
    expect(workspaceForProvider("google-calendar")).toBeNull();
  });
});

describe("file-type mapping", () => {
  it("maps each file type to one provider per workspace", () => {
    expect(FILE_TYPE_TO_PROVIDERS.doc).toEqual({ google: "google-docs", microsoft: "microsoft-word" });
    expect(FILE_TYPE_TO_PROVIDERS.spreadsheet).toEqual({ google: "google-sheets", microsoft: "microsoft-excel" });
    expect(FILE_TYPE_TO_PROVIDERS.slides).toEqual({ google: "google-slides", microsoft: "microsoft-powerpoint" });
    expect(FILE_TYPE_TO_PROVIDERS.file).toEqual({ google: "google-drive", microsoft: "onedrive" });
  });
  it("providerSupportsType is true only for the mapped provider", () => {
    expect(providerSupportsType("google-sheets", "spreadsheet")).toBe(true);
    expect(providerSupportsType("microsoft-excel", "spreadsheet")).toBe(true);
    expect(providerSupportsType("google-docs", "spreadsheet")).toBe(false);
    expect(providerSupportsType("microsoft-word", "spreadsheet")).toBe(false);
  });
  it("isFileProvider excludes non-file providers", () => {
    expect(isFileProvider("google-sheets")).toBe(true);
    expect(isFileProvider("onedrive")).toBe(true);
    expect(isFileProvider("slack")).toBe(false);
  });
});

describe("resolveWorkspaceProvider — auto mode", () => {
  it("both workspaces connected → least-loaded provider wins (spreadsheet → sheets when fewer sheets files)", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "auto",
      connectedProviderIds: ["google-sheets", "microsoft-excel"],
      fileCounts: { "google-sheets": 5, "microsoft-excel": 2 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provider).toBe("microsoft-excel");
      expect(res.workspace).toBe("microsoft");
    }
  });
  it("both connected and equal load → deterministic tie-break to Google", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "auto",
      connectedProviderIds: ["google-sheets", "microsoft-excel"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provider).toBe("google-sheets");
      expect(res.workspace).toBe("google");
    }
  });
  it("only Google connected → google provider", () => {
    const res = resolveWorkspaceProvider({
      fileType: "doc",
      preference: "auto",
      connectedProviderIds: ["google-docs"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe("google-docs");
  });
  it("only Microsoft connected → microsoft provider", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "auto",
      connectedProviderIds: ["microsoft-excel"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provider).toBe("microsoft-excel");
      expect(res.workspace).toBe("microsoft");
    }
  });
  it("none connected → fail-closed error listing both workspaces to connect", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "auto",
      connectedProviderIds: ["slack", "hubspot"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("No file workspace is connected");
      expect(res.connectHint).toEqual(["google-sheets", "microsoft-excel"]);
    }
  });
  it("connections that are not file providers never count as connected", () => {
    const res = resolveWorkspaceProvider({
      fileType: "file",
      preference: "auto",
      connectedProviderIds: ["google-drive", "hubspot"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe("google-drive");
  });
});

describe("resolveWorkspaceProvider — tenant preference", () => {
  it("preference google + connected → google provider", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "google",
      connectedProviderIds: ["google-sheets", "microsoft-excel"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe("google-sheets");
  });
  it("preference microsoft overrides auto even when Google is connected", () => {
    const res = resolveWorkspaceProvider({
      fileType: "doc",
      preference: "microsoft",
      connectedProviderIds: ["google-docs", "microsoft-word"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provider).toBe("microsoft-word");
      expect(res.workspace).toBe("microsoft");
    }
  });
  it("preference google but google not connected → fail-closed with hint", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      preference: "google",
      connectedProviderIds: ["microsoft-excel"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Google Workspace");
      expect(res.connectHint).toEqual(["google-sheets"]);
    }
  });
  it("preference microsoft but microsoft not connected → fail-closed with hint", () => {
    const res = resolveWorkspaceProvider({
      fileType: "slides",
      preference: "microsoft",
      connectedProviderIds: ["google-slides"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.connectHint).toEqual(["microsoft-powerpoint"]);
  });
});

describe("resolveWorkspaceProvider — explicit request", () => {
  it("requested connected provider wins over preference", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      requestedProvider: "microsoft-excel",
      preference: "google",
      connectedProviderIds: ["google-sheets", "microsoft-excel"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider).toBe("microsoft-excel");
  });
  it("requested provider not connected → fail-closed with clear message", () => {
    const res = resolveWorkspaceProvider({
      fileType: "spreadsheet",
      requestedProvider: "google-sheets",
      preference: "auto",
      connectedProviderIds: ["microsoft-excel"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Google Sheets is not connected");
      expect(res.connectHint).toEqual(["google-sheets"]);
    }
  });
  it("requested provider wrong for the file type → fail-closed", () => {
    const res = resolveWorkspaceProvider({
      fileType: "doc",
      requestedProvider: "google-sheets",
      preference: "auto",
      connectedProviderIds: ["google-sheets"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("cannot create a doc");
  });
  it("requested unknown provider → fail-closed (no guessed URLs)", () => {
    const res = resolveWorkspaceProvider({
      fileType: "file",
      requestedProvider: "mystery-saas",
      preference: "auto",
      connectedProviderIds: ["google-drive"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("not a supported file workspace");
  });
});
