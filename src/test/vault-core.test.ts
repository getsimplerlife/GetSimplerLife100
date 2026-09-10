/**
 * vault-core.test.ts — Phase 1.5a Document & File Intelligence vault.
 * Coverage: intake validation (allowlist + magic bytes), tenant isolation,
 * content-hash dedupe, versioning add-only, route DSL robustness, auto-folder
 * rules, approval-gated filing (default ON → pending), autonomy allow-list
 * execution, non-destruction (destroy needs gate + exact id; never glob),
 * immutable audit, and the drive-by industryContent.ts balance fix.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createVaultDocument, getVaultDocument, listVaultDocuments, readVaultDocumentBytes, destroyVaultDocument, addVaultDocumentVersion, tenantVaultKey, vaultTenantStats } from "../lib/vault-store";
import { intakeDocument, sanitizeVaultFileName, sniffFileType } from "../lib/vault-intake";
import { canonicalizeRoute, upsertFolderRule, applyAutoRoute, validateRuleTarget } from "../lib/vault-folder";
import { fileDocument, destroyDocument, listVault, searchVault, vaultAudit } from "../lib/vault-filing";
import { appendVaultAudit, listVaultAudit } from "../lib/vault-audit";

let dir: string;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const CSV = new TextEncoder().encode("vendor,amount,date\nAcme,100.00,2026-01-02\n");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vault-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const T1 = "tenant-a@example.com";
const T2 = "tenant-b@example.com";

describe("intake validation (fail-closed type handling)", () => {
  it("accepts a real PDF and rejects a spoofed .pdf (magic bytes)", () => {
    const ok = intakeDocument({ tenantEmail: T1, fileName: "invoice.pdf", bytes: PDF, actor: "u", dataDir: dir });
    expect(ok.ok).toBe(true);
    expect(ok.extension).toBe("pdf");
    const spoof = intakeDocument({ tenantEmail: T1, fileName: "fake.pdf", bytes: new TextEncoder().encode("not a pdf at all"), actor: "u", dataDir: dir });
    expect(spoof.ok).toBe(false);
    expect(spoof.error).toContain("magic bytes");
  });
  it("rejects unsupported extensions and oversized files", () => {
    const exe = intakeDocument({ tenantEmail: T1, fileName: "evil.exe", bytes: new Uint8Array([0x4d, 0x5a]), actor: "u", dataDir: dir });
    expect(exe.ok).toBe(false);
    const big = new Uint8Array(26 * 1024 * 1024);
    big.set(PDF);
    const over = intakeDocument({ tenantEmail: T1, fileName: "huge.pdf", bytes: big, actor: "u", dataDir: dir });
    expect(over.ok).toBe(false);
    expect(over.error).toContain("MiB");
  });
  it("accepts CSV text and rejects binary CSV; sanitizes filenames", () => {
    const ok = intakeDocument({ tenantEmail: T1, fileName: "ledger.csv", bytes: CSV, actor: "u", dataDir: dir });
    expect(ok.ok).toBe(true);
    const weird = intakeDocument({ tenantEmail: T1, fileName: "ledger.csv", bytes: new Uint8Array([0x00, 0x01, 0x02]), actor: "u", dataDir: dir });
    expect(weird.ok).toBe(false);
    expect(sanitizeVaultFileName("../../etc/passwd")).toBe("etc passwd");
    expect(sanitizeVaultFileName("..hidden")).toBe("hidden");
  });
  it("sniffFileType round-trips all allowed types", () => {
    expect(sniffFileType(PNG, "png").ok).toBe(true);
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "jpg").ok).toBe(true);
    expect(sniffFileType(new TextEncoder().encode("GIF89a...."), "gif").ok).toBe(true);
    expect(sniffFileType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "docx").ok).toBe(true);
  });
});

describe("per-tenant isolation (hard guarantee)", () => {
  it("a doc id from tenant A never resolves under tenant B", () => {
    const a = createVaultDocument({ tenantEmail: T1, fileName: "a.pdf", bytes: PDF, mime: "application/pdf", ext: "pdf", actor: "u", dataDir: dir });
    expect(getVaultDocument(dir, T2, a.doc.id)).toBeNull(); // cross-tenant → null
    expect(listVaultDocuments(dir, T2)).toHaveLength(0);
    expect(readVaultDocumentBytes(dir, T2, a.doc.id)).toBeNull();
    expect(destroyVaultDocument(dir, T2, a.doc.id)).toBeNull(); // cannot delete another tenant's doc
    expect(getVaultDocument(dir, T1, a.doc.id)).not.toBeNull(); // origin untouched
  });
  it("blob buckets are tenant-hashed and never shared", () => {
    expect(tenantVaultKey(T1)).not.toBe(tenantVaultKey(T2));
  });
});

describe("dedupe + versioning (non-destruction)", () => {
  it("identical bytes + name → unchanged; identical bytes new name → canonical dedupe (origin doc)", () => {
    const a = intakeDocument({ tenantEmail: T1, fileName: "same.pdf", bytes: PDF, actor: "u", dataDir: dir });
    const b = intakeDocument({ tenantEmail: T1, fileName: "same.pdf", bytes: PDF, actor: "u", dataDir: dir });
    expect(b.unchanged).toBe(true);
    expect(b.documentId).toBe(a.documentId);
    const c = intakeDocument({ tenantEmail: T1, fileName: "renamed.pdf", bytes: PDF, actor: "u", dataDir: dir });
    expect(c.duplicate).toBe(true);
    expect(c.documentId).toBe(a.documentId); // dedupe returns the canonical doc
    expect(readVaultDocumentBytes(dir, T1, c.documentId!)!.bytes.byteLength).toBe(PDF.byteLength);
  });
  it("addVersion creates v2 and never overwrites v1", () => {
    const a = createVaultDocument({ tenantEmail: T1, fileName: "p.pdf", bytes: PDF, mime: "application/pdf", ext: "pdf", actor: "u", dataDir: dir });
    const v2 = addVaultDocumentVersion(dir, T1, a.doc.id, new Uint8Array([...PDF, 0x0a]), "application/pdf", "pdf", "u");
    expect(v2!.version).toBe(2);
    expect(v2!.versions).toHaveLength(2);
    expect(readVaultDocumentBytes(dir, T1, a.doc.id, 1)!.bytes.byteLength).toBe(PDF.byteLength);
  });
});

describe("route DSL (fail-closed canonicalization)", () => {
  it("canonicalizes human routes into safe paths", () => {
    expect(canonicalizeRoute("Customer X / Contracts / 2026")).toBe("Customer X/Contracts/2026");
    expect(canonicalizeRoute("  Acme//Contracts  ")).toBe("Acme/Contracts");
    expect(canonicalizeRoute("A/B/C/D/E/F/G/H/I")).toBeNull(); // > 8 segments
    expect(canonicalizeRoute("A/../../B")).toBeNull(); // traversal
    expect(canonicalizeRoute("A\\B")).toBeNull(); // backslash
    expect(canonicalizeRoute("")).toBeNull();
  });
  it("rejects unknown placeholders in rule targets", () => {
    expect(validateRuleTarget("{customer}/{type}/{YYYY}")).toBeNull();
    expect(validateRuleTarget("{bogus}/x")).toContain("Unsupported");
  });
  it("auto-folder rule predicts a route but never guesses (missing dimensions fail closed)", () => {
    const doc = createVaultDocument({ tenantEmail: T1, fileName: "c.pdf", bytes: PDF, mime: "application/pdf", ext: "pdf", actor: "u", dataDir: dir, customer: "Acme Corp", docType: "Contract" }).doc;
    const r = upsertFolderRule(dir, T1, {
      name: "By customer/type/year", enabled: true,
      dimensions: [{ kind: "customer", source: "doc.customer" }, { kind: "type", source: "doc.docType" }, { kind: "date", source: "doc.createdAt", format: "YYYY" }],
      target: "{customer}/{type}/{YYYY}", priority: 10, createdBy: "u",
    });
    expect(r.ok).toBe(true);
    const suggested = applyAutoRoute(dir, T1, doc);
    expect(suggested!.route).toMatch(/^Acme Corp\/Contract\/\d{4}$/);
    // A doc without customer must NOT get a wildcard route from {customer}:
    const noCust = createVaultDocument({ tenantEmail: T1, fileName: "d.pdf", bytes: PNG, mime: "image/png", ext: "png", actor: "u", dataDir: dir }).doc;
    expect(applyAutoRoute(dir, T1, noCust)).toBeNull();
  });
});

describe("gated filing contract (Approval Queue #164 default ON)", () => {
  it("fileDocument returns pending when approvals are ON, and audit records pending", () => {
    const intake = intakeDocument({ tenantEmail: T1, fileName: "contract.pdf", bytes: PDF, actor: "u", dataDir: dir });
    const out = fileDocument({ tenantId: T1, documentId: intake.documentId!, route: "Acme / Contracts / 2026", actor: "u", dataDir: dir });
    expect(out.pending).toBe(true);
    expect(out.actionId).toBeTruthy();
    expect(out.ok).toBe(false);
    // doc stays in inbox; no route attached
    const doc = getVaultDocument(dir, T1, intake.documentId!)!;
    expect(doc.status).toBe("pending_filing");
    const audit = vaultAudit(dir, T1);
    expect(audit.some((e) => e.action === "writeVaultDocument" && e.outcome === "pending")).toBe(true);
  });
  it("unknown document ids fail closed (no route guessed)", () => {
    const out = fileDocument({ tenantId: T1, documentId: "doc_nobody", route: "X", actor: "u", dataDir: dir });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("not found");
  });
  it("destroy never globs and never deletes without approval", () => {
    const intake = intakeDocument({ tenantEmail: T1, fileName: "keep.pdf", bytes: PDF, actor: "u", dataDir: dir });
    const out = destroyDocument({ tenantId: T1, documentId: intake.documentId!, actor: "u", dataDir: dir });
    expect(out.pending).toBe(true); // approval required first
    expect(getVaultDocument(dir, T1, intake.documentId!)).not.toBeNull(); // still there
    const bogus = destroyDocument({ tenantId: T1, documentId: "doc_unknown", actor: "u", dataDir: dir });
    expect(bogus.ok).toBe(false);
    expect(bogus.error).toContain("not found");
  });
});

describe("autonomy mode (#236): allow-list + known id only", () => {
  it("auto-files ONLY with an explicit allow-list entry matching the action", async () => {
    const { setAutonomyWorkflow } = await import("../lib/autonomy");
    const intake = intakeDocument({ tenantEmail: T1, fileName: "auto.pdf", bytes: PDF, actor: "u", dataDir: dir });
    // Enabled but EMPTY allow-list → still pending (fail-closed).
    setAutonomyWorkflow(T1, "wf", { enabled: true, allowList: [] }, dir);
    const stillPending = fileDocument({ tenantId: T1, documentId: intake.documentId!, route: "Acme/Contracts", actor: "u", agentId: "ag", workflowId: "wf", dataDir: dir });
    expect(stillPending.pending).toBe(true);
    // Explicit allow-list entry for vault.document.file → non-glob + known id.
    setAutonomyWorkflow(T1, "wf", { enabled: true, allowList: [{ id: "al-vault-1", action: "writeVaultDocument", label: "File vault docs" }] }, dir);
    const auto = fileDocument({ tenantId: T1, documentId: intake.documentId!, route: "Acme/Contracts", actor: "u", agentId: "ag", workflowId: "wf", dataDir: dir });
    expect(auto.ok).toBe(true);
    expect(auto.autonomy).toBe(true);
    expect(getVaultDocument(dir, T1, intake.documentId!)!.status).toBe("active");
    const audit = vaultAudit(dir, T1);
    expect(audit.some((e) => e.action === "writeVaultDocument" && e.actor === "system/autonomy")).toBe(true);
  });
});

describe("search + audit immutability", () => {
  it("searches by tag/route/type within the tenant only", () => {
    intakeDocument({ tenantEmail: T1, fileName: "invoice.pdf", bytes: PDF, actor: "u", dataDir: dir, tags: ["invoice"], customer: "Acme" });
    const hits = searchVault(dir, T1, "invoice");
    expect(hits.some((d) => d.name === "invoice.pdf")).toBe(true);
    expect(searchVault(dir, T2, "invoice")).toHaveLength(0);
  });
  it("vault audit is append-only and tenant-scoped", () => {
    appendVaultAudit(dir, T1, { actor: "u", action: "vault.intake", documentId: "d1", outcome: "ok" });
    appendVaultAudit(dir, T2, { actor: "u", action: "vault.intake", documentId: "d9", outcome: "ok" });
    const a1 = listVaultAudit(dir, T1);
    expect(a1).toHaveLength(1);
    expect(a1[0].documentId).toBe("d1");
    expect(listVaultAudit(dir, T2)).toHaveLength(1); // never leaks
  });
});

describe("industryContent drive-by fix (pre-existing main syntax error)", () => {
  it("the content file parses with balanced braces", () => {
    const fs = require("fs") as typeof import("fs");
    const src = fs.readFileSync(join(process.cwd(), "src/content/industryContent.ts"), "utf8");
    const strip = (s: string) =>
      s
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, "``")
        .replace(/\/\/[^\n]*/g, "");
    const cleaned = strip(src);
    expect(cleaned.split("{").length).toBe(cleaned.split("}").length);
    expect(existsSync(join(process.cwd(), "src/content/industryContent.ts"))).toBe(true);
  });
});

describe("vault stats + file existence", () => {
  it("stats reflect tenant bytes; blob file exists outside publish tree", () => {
    const a = createVaultDocument({ tenantEmail: T1, fileName: "s.pdf", bytes: PDF, mime: "application/pdf", ext: "pdf", actor: "u", dataDir: dir });
    const stats = vaultTenantStats(dir, T1);
    expect(stats.count).toBe(1);
    expect(stats.bytes).toBe(PDF.byteLength);
    // blob dir under <dataDir>/vault, NOT under site tree
    expect(existsSync(join(dir, "vault", "blobs", tenantVaultKey(T1), a.doc.id, "v1.bin"))).toBe(true);
  });
  it("listVault annotates suggested routes", () => {
    intakeDocument({ tenantEmail: T1, fileName: "m.pdf", bytes: PDF, actor: "u", dataDir: dir, customer: "Beta", docType: "Proposal" });
    upsertFolderRule(dir, T1, {
      name: "cust-type", enabled: true,
      dimensions: [{ kind: "customer", source: "doc.customer" }, { kind: "type", source: "doc.docType" }],
      target: "{customer}/{type}", priority: 1, createdBy: "u",
    });
    const docs = listVault(dir, T1);
    expect(docs[0].suggestedRoute).toBe("Beta/Proposal");
  });
});