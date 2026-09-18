/**
 * vault-folder-taxonomy.test.ts — Phase 1.5d FILING LAYER (structured
 * locations): per-tenant folder CRUD + taxonomy labels + auto-folder rule
 * audit + isolated-stores.
 *
 * Covers the 5d contract (metadata class — parallel to the 5c template
 * catalog, never a vault document):
 *   - createFolder: route-DSL validation (fail-closed), implicit parents,
 *     labels on the leaf, duplicate-path rejection,
 *   - renameFolder / deleteFolder: EXACT id only, non-destructive (refused
 *     when a folder has sub-folders or filed documents — never orphans the
 *     tree), idempotent-by-audit re-delete replay, unknown ids fail closed,
 *   - labels: bounded + sanitized, control chars / slashes / size rejected,
 *   - rule CRUD audit: vault.folder.rule.create/update/delete entries (the
 *     pre-5d gap where rule CRUD left NO immutable trace is closed),
 *   - ensureRouteFolders audits every implicitly created node,
 *   - DATA ISOLATION HARD GUARANTEE (WORKFLOW gate): tenant A's folders /
 *     labels / rules / audit are never visible to tenant B; cross-tenant ids
 *     fail closed on every mutation; the folder store is keyed per-tenant.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  canonicalizeRoute,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderLabels,
  listTenantFolders,
  loadTenantFolders,
  upsertFolderRule,
  deleteFolderRule,
  ensureRouteFolders,
  normalizeFolderLabels,
} from "../lib/vault-folder";
import { appendVaultAudit, listVaultAudit } from "../lib/vault-audit";
import { intakeDocument } from "../lib/vault-intake";
import { fileDocument, vaultAudit } from "../lib/vault-filing";
import { createVaultDocument, attachRouteToDocument } from "../lib/vault-store";

let dir: string;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vault-taxonomy-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const T1 = "filing-a@example.com";
const T2 = "filing-b@example.com";

describe("createFolder — structured locations (route DSL, fail-closed)", () => {
  it("creates a leaf node + implicit parents, labels land on the leaf", () => {
    const out = createFolder(dir, T1, { path: "Acme Corp / Contracts / 2026", labels: ["client", "legal"], actor: "u" });
    expect(out.ok).toBe(true);
    const folders = listTenantFolders(dir, T1);
    expect(folders.map((f) => f.path)).toEqual(["Acme Corp", "Acme Corp/Contracts", "Acme Corp/Contracts/2026"]);
    const leaf = folders.find((f) => f.path === "Acme Corp/Contracts/2026")!;
    expect(leaf.name).toBe("2026");
    expect(leaf.parentPath).toBe("Acme Corp/Contracts");
    expect(leaf.labels).toEqual(["client", "legal"]);
    // Immutable audit: one vault.folder.create per created node.
    const audit = listVaultAudit(dir, T1);
    const creates = audit.filter((a) => a.action === "vault.folder.create");
    expect(creates).toHaveLength(3);
    expect(creates.some((a) => a.detail?.includes("Acme Corp/Contracts/2026") && a.detail?.includes("client,legal"))).toBe(true);
  });

  it("rejects duplicate exact paths, traversal, backslashes and oversized routes", () => {
    expect(createFolder(dir, T1, { path: "A/B", actor: "u" }).ok).toBe(true);
    const dup = createFolder(dir, T1, { path: "A / B", actor: "u" }); // same canonical path
    expect(dup.ok).toBe(false);
    expect(dup.error).toContain("already exists");
    expect(createFolder(dir, T1, { path: "../escape", actor: "u" }).ok).toBe(false);
    expect(createFolder(dir, T1, { path: "a\\b", actor: "u" }).ok).toBe(false);
    expect(createFolder(dir, T1, { path: "A/B/C/D/E/F/G/H/I", actor: "u" }).ok).toBe(false);
    expect(canonicalizeRoute("")).toBeNull();
  });

  it("label validation is bounded and sanitized (never a path, never binary)", () => {
    expect(normalizeFolderLabels(["one", "two"])).toEqual(["one", "two"]);
    expect(normalizeFolderLabels(undefined)).toEqual([]);
    expect(normalizeFolderLabels(["a/b"])).toBeNull(); // labels are tags, not paths
    expect(normalizeFolderLabels(["a\\b"])).toBeNull();
    expect(normalizeFolderLabels([""])).toBeNull();
    expect(normalizeFolderLabels([42])).toBeNull();
    expect(normalizeFolderLabels(new Array(33).fill("x"))).toBeNull(); // > 32 labels
    expect(normalizeFolderLabels(["dup", "dup"])).toEqual(["dup"]); // dedupe
    expect(normalizeFolderLabels(["a".repeat(50)])![0]).toHaveLength(40); // capped, not path
    const out = createFolder(dir, T1, { path: "X", labels: [42], actor: "u" });
    expect(out.ok).toBe(false);
  });
});

describe("renameFolder — exact id, non-destructive, audited", () => {
  it("renames an empty folder's leaf segment and audits it", () => {
    const created = createFolder(dir, T1, { path: "Acme/Contracts", actor: "u" });
    const id = (created.folder as any).id;
    const out = renameFolder(dir, T1, id, "Agreements", "u");
    expect(out.ok).toBe(true);
    expect((out.folder as any).path).toBe("Acme/Agreements");
    const audit = listVaultAudit(dir, T1);
    const renameEntry = audit.find((a) => a.action === "vault.folder.rename");
    expect(renameEntry).toBeDefined();
    expect(renameEntry!.detail).toContain('"Acme/Contracts"');
    expect(renameEntry!.detail).toContain('"Acme/Agreements"');
    expect(renameFolder(dir, T1, id, "Agreements", "u").unchanged).toBe(true);
  });

  it("refuses when the folder has children (never orphans the tree)", () => {
    const parent = createFolder(dir, T1, { path: "Acme", actor: "u" });
    createFolder(dir, T1, { path: "Acme/Contracts", actor: "u" });
    const out = renameFolder(dir, T1, (parent.folder as any).id, "Global", "u");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("sub-folders");
    expect(listTenantFolders(dir, T1).some((f) => f.path === "Acme")).toBe(true); // unchanged
  });

  it("refuses when a document is filed at/under the folder (never orphans a route)", () => {
    const created = createFolder(dir, T1, { path: "Acme/Contracts", actor: "u" });
    const folderId = (created.folder as any).id;
    const intake = intakeDocument({ tenantEmail: T1, fileName: "c.pdf", bytes: PDF, actor: "u", dataDir: dir });
    // Approved-file simulation: store-level attach (the gated execution path).
    attachRouteToDocument(dir, T1, intake.documentId!, "Acme/Contracts/2026");
    const out = renameFolder(dir, T1, folderId, "Agreements", "u");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("filed documents");
  });

  it("unknown ids and invalid names fail closed; duplicate target rejected", () => {
    expect(renameFolder(dir, T1, "fol_never", "X", "u").ok).toBe(false);
    const a = createFolder(dir, T1, { path: "A/B", actor: "u" });
    const id = (a.folder as any).id;
    expect(renameFolder(dir, T1, id, "../x", "u").ok).toBe(false);
    expect(renameFolder(dir, T1, id, "B/C", "u").ok).toBe(false); // multi-segment name
    createFolder(dir, T1, { path: "A/D", actor: "u" });
    const b = createFolder(dir, T1, { path: "A/B2", actor: "u" });
    expect(renameFolder(dir, T1, (b.folder as any).id, "D", "u").ok).toBe(false); // target exists
  });
});

describe("deleteFolder — exact id, empty-only, idempotent-by-audit", () => {
  it("deletes an empty folder and audits it; re-delete of the SAME id is an audited replay", () => {
    const created = createFolder(dir, T1, { path: "Acme/Contracts", actor: "u" });
    const id = (created.folder as any).id;
    expect(deleteFolder(dir, T1, id, "u").ok).toBe(true);
    expect(listTenantFolders(dir, T1).some((f) => f.id === id)).toBe(false);
    const replay = deleteFolder(dir, T1, id, "u"); // idempotent-by-audit
    expect(replay.ok).toBe(true);
    expect(replay.unchanged).toBe(true);
    const audit = listVaultAudit(dir, T1).filter((a) => a.action === "vault.folder.delete" && a.documentId === id);
    expect(audit).toHaveLength(2);
    expect(audit.at(-1)!.detail).toContain("Idempotent replay");
  });

  it("never glob-deletes: refuses non-empty folders (children or filed docs)", () => {
    const parent = createFolder(dir, T1, { path: "Acme", actor: "u" });
    createFolder(dir, T1, { path: "Acme/Contracts", actor: "u" });
    expect(deleteFolder(dir, T1, (parent.folder as any).id, "u").ok).toBe(false);
    const leaf = createFolder(dir, T1, { path: "Only", actor: "u" });
    const intake = intakeDocument({ tenantEmail: T1, fileName: "d.pdf", bytes: PDF, actor: "u", dataDir: dir });
    attachRouteToDocument(dir, T1, intake.documentId!, "Only");
    expect(deleteFolder(dir, T1, (leaf.folder as any).id, "u").ok).toBe(false);
    expect(listTenantFolders(dir, T1)).toHaveLength(3); // nothing removed
  });

  it("an exact id NEVER seen by this tenant fails closed (no fabricated success)", () => {
    const out = deleteFolder(dir, T1, "fol_never_seen", "u");
    expect(out.ok).toBe(false);
    expect(out.error).toContain("not found");
  });
});

describe("setFolderLabels — exact id, audited", () => {
  it("sets labels, idempotent no-op, and audits the change", () => {
    const created = createFolder(dir, T1, { path: "Acme", actor: "u" });
    const id = (created.folder as any).id;
    const out = setFolderLabels(dir, T1, id, ["urgent", "fy2026"], "u");
    expect(out.ok).toBe(true);
    expect(listTenantFolders(dir, T1).find((f) => f.id === id)!.labels).toEqual(["urgent", "fy2026"]);
    expect(listVaultAudit(dir, T1).some((a) => a.action === "vault.folder.labels" && a.documentId === id)).toBe(true);
    expect(setFolderLabels(dir, T1, id, ["urgent", "fy2026"], "u").unchanged).toBe(true);
    expect(setFolderLabels(dir, T1, "fol_never", ["x"], "u").ok).toBe(false);
    expect(setFolderLabels(dir, T1, id, [""], "u").ok).toBe(false);
  });
});

describe("auto-folder rules — every mutation lands an immutable audit entry", () => {
  it("upsert create/update and delete are audited; unknown deletes never fabricate", () => {
    const created = upsertFolderRule(dir, T1, {
      name: "By customer", enabled: true,
      dimensions: [{ kind: "customer", source: "doc.customer" }],
      target: "{customer}/Docs", priority: 10, createdBy: "u",
    });
    expect(created.ok).toBe(true);
    const ruleId = created.rule!.id;
    let audit = listVaultAudit(dir, T1);
    expect(audit.filter((a) => a.action === "vault.folder.rule.create" && a.documentId === ruleId)).toHaveLength(1);

    const updated = upsertFolderRule(dir, T1, {
      id: ruleId, name: "By customer 2", enabled: false,
      dimensions: [{ kind: "customer", source: "doc.customer" }],
      target: "{customer}/Docs/2", priority: 5, createdBy: "u",
    });
    expect(updated.ok).toBe(true);
    audit = listVaultAudit(dir, T1);
    expect(audit.some((a) => a.action === "vault.folder.rule.update" && a.documentId === ruleId)).toBe(true);

    expect(deleteFolderRule(dir, T1, ruleId, "u")).toBe(true);
    audit = listVaultAudit(dir, T1);
    expect(audit.some((a) => a.action === "vault.folder.rule.delete" && a.documentId === ruleId)).toBe(true);
    expect(loadTenantFolders(dir, T1).rules).toHaveLength(0);

    // Unknown rule id → false WITHOUT audit entry (never claim a delete).
    const before = listVaultAudit(dir, T1).length;
    expect(deleteFolderRule(dir, T1, "rule_never", "u")).toBe(false);
    expect(listVaultAudit(dir, T1).length).toBe(before);
  });
});

describe("ensureRouteFolders — implicit nodes are audited", () => {
  it("creates + audits each node of a filed route", () => {
    const created = ensureRouteFolders(dir, T1, "Acme/Contracts/2026", "u");
    expect(created).toHaveLength(3);
    const audit = listVaultAudit(dir, T1).filter((a) => a.action === "vault.folder.create");
    expect(audit).toHaveLength(3);
    expect(audit.every((a) => a.outcome === "ok")).toBe(true);
    // Idempotent: second call creates nothing new and audits nothing new.
    const again = ensureRouteFolders(dir, T1, "Acme/Contracts/2026", "u");
    expect(again).toHaveLength(0);
    expect(listVaultAudit(dir, T1).filter((a) => a.action === "vault.folder.create")).toHaveLength(3);
  });
});

describe("DATA ISOLATION HARD GUARANTEE — filing-layer re-proof", () => {
  it("tenant B can never see or mutate tenant A's folders / labels / rules / audit", () => {
    // Tenant A builds a full taxonomy.
    const aFolder = createFolder(dir, T1, { path: "Acme/Contracts/2026", labels: ["secret-client"], actor: "a" });
    const aFolderId = (aFolder.folder as any).id;
    const aRule = upsertFolderRule(dir, T1, {
      name: "A rule", enabled: true,
      dimensions: [{ kind: "customer", source: "doc.customer" }],
      target: "{customer}/Docs", priority: 1, createdBy: "a",
    });
    // A files a document so the store has A-only state.
    const intake = intakeDocument({ tenantEmail: T1, fileName: "a.pdf", bytes: PDF, actor: "a", dataDir: dir });
    expect(fileDocument({ tenantId: T1, documentId: intake.documentId!, route: "Acme/Contracts/2026", actor: "a", dataDir: dir }).pending).toBe(true);

    // Tenant B sees an EMPTY taxonomy + EMPTY audit — never A's rows.
    expect(listTenantFolders(dir, T2)).toHaveLength(0);
    expect(loadTenantFolders(dir, T2).rules).toHaveLength(0);
    expect(listVaultAudit(dir, T2)).toHaveLength(0);

    // Cross-tenant ids fail closed on EVERY mutation.
    expect(renameFolder(dir, T2, aFolderId, "Hacked", "b").ok).toBe(false);
    expect(deleteFolder(dir, T2, aFolderId, "b").ok).toBe(false);
    expect(setFolderLabels(dir, T2, aFolderId, ["x"], "b").ok).toBe(false);
    expect(deleteFolderRule(dir, T2, aRule.rule!.id, "b")).toBe(false);

    // A's taxonomy is intact and untouched by B's attempts.
    expect(listTenantFolders(dir, T1).map((f) => f.path)).toContain("Acme/Contracts/2026");
    expect(listTenantFolders(dir, T1).find((f) => f.id === aFolderId)!.labels).toEqual(["secret-client"]);
    expect(loadTenantFolders(dir, T1).rules).toHaveLength(1);

    // B can build its OWN taxonomy without touching A (independent keyed store).
    const bFolder = createFolder(dir, T2, { path: "B/Ledger", actor: "b" });
    expect(bFolder.ok).toBe(true);
    expect(listTenantFolders(dir, T1).map((f) => f.path)).not.toContain("B/Ledger");
    expect(listTenantFolders(dir, T2).map((f) => f.path)).toEqual(["B", "B/Ledger"]);
  });

  it("audit entries are append-only and never leak across tenants", () => {
    appendVaultAudit(dir, T1, { actor: "a", action: "vault.folder.create", documentId: "fol_a", outcome: "ok" });
    appendVaultAudit(dir, T2, { actor: "b", action: "vault.folder.create", documentId: "fol_b", outcome: "ok" });
    const a1 = listVaultAudit(dir, T1);
    expect(a1).toHaveLength(1);
    expect(a1[0].documentId).toBe("fol_a");
    expect(listVaultAudit(dir, T2)).toHaveLength(1);
    expect(vaultAudit(dir, T2)[0].documentId).toBe("fol_b");
  });
});

describe("filing with an approved/autonomy write still audits folder provenance", () => {
  it("autonomy auto-file creates + audits the route folders", async () => {
    const { setAutonomyWorkflow } = await import("../lib/autonomy");
    setAutonomyWorkflow(T1, "wf", { enabled: true, allowList: [{ id: "al-1", action: "writeVaultDocument", label: "file" }] }, dir);
    const intake = intakeDocument({ tenantEmail: T1, fileName: "auto.pdf", bytes: PDF, actor: "u", dataDir: dir });
    const out = fileDocument({ tenantId: T1, documentId: intake.documentId!, route: "Auto/Routed/2026", actor: "u", agentId: "ag", workflowId: "wf", dataDir: dir });
    expect(out.ok).toBe(true);
    const audit = listVaultAudit(dir, T1);
    expect(audit.some((a) => a.action === "vault.folder.create" && a.detail?.includes("Auto/Routed"))).toBe(true);
    expect(listTenantFolders(dir, T1).map((f) => f.path)).toEqual(["Auto", "Auto/Routed", "Auto/Routed/2026"]);
  });

  it("vault_store still works standalone (no folder-store coupling)", () => {
    const doc = createVaultDocument({ tenantEmail: T1, fileName: "s.pdf", bytes: PDF, mime: "application/pdf", ext: "pdf", actor: "u", dataDir: dir });
    expect(doc.doc.id).toMatch(/^doc_/);
  });
});