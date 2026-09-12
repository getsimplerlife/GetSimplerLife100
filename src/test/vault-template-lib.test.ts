// @vitest-environment node
/**
 * vault-template-lib.test.ts — Phase 1.5c purity tests (no HTTP).
 *
 * Covers the SECURITY HARD BAR for slice 5c at the unit level:
 *   - PDF renderer emits a magic-byte-valid, escaped, bounded PDF — the
 *     output is a BINARY container; content is escaped (parens/backslash)
 *     inside Tj strings, so no PDF operator injection is possible and no
 *     markup/script is ever interpreted (no HTML surface),
 *   - template interpolation is fail-closed (unknown fields rejected,
 *     leftover {{ placeholders never guessed, required fields enforced),
 *   - catalog is add-only + per-tenant (unknown/other-tenant ids → null/
 *     error; version history never overwrites in place; exact-id delete is
 *     idempotent-by-audit; unknown delete ids fail closed),
 *   - import sniffing + caps (extension + content checks, 1 MiB cap,
 *     64 KiB body cap, binary text rejected).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { renderVaultPdf, renderTemplateBody, bodyToBlocks, validateFieldValues, renderTemplateDocument, CREATION_VALUE_MAX } from "../lib/vault-creation";
import {
  createVaultTemplate,
  updateVaultTemplate,
  deleteVaultTemplate,
  getVaultTemplate,
  listVaultTemplates,
  importVaultTemplate,
  TEMPLATE_MAX_IMPORT_BYTES,
  type VaultTemplate,
} from "../lib/vault-template";

let dataDir = "";

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "vault-5c-lib-"));
});
afterEach(() => {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

function sampleTemplate(overrides: Partial<any> = {}): any {
  return {
    tenantEmail: "lib-a@test.local",
    actor: "lib-a@test.local",
    dataDir,
    name: "Proposal",
    description: "Standard engagement proposal",
    body: "# {{customer}}\n\n## Scope\n\n- {{scope}}\n\n{{notes}}",
    fields: [
      { key: "customer", label: "Customer", type: "text", required: true },
      { key: "scope", label: "Scope", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<any> = {}): VaultTemplate {
  const out = createVaultTemplate(sampleTemplate(overrides));
  if (!out.ok || !out.template) throw new Error("fixture template failed: " + (out as any).error);
  return out.template;
}

describe("PDF renderer (safe minimal builder)", () => {
  it("emits a magic-byte-valid PDF with title + escaped content", () => {
    const pdf = renderVaultPdf("Engagement (Proposal)", [
      { kind: "p", text: "Parentheses (and) backslash \\ are escaped" },
      { kind: "li", text: "item one" },
    ]);
    const ascii = new TextDecoder().decode(pdf);
    expect(ascii.startsWith("%PDF-1.4")).toBe(true);
    expect(ascii.trimEnd().endsWith("%%EOF")).toBe(true);
    // title appears escaped inside a Tj string
    expect(ascii).toContain("(Engagement \\(Proposal\\))");
    // parens/backslash in body escaped → cannot break out of the Tj string
    expect(ascii).toContain("\\(and\\)");
    expect(ascii).toContain("\\\\ are escaped");
  });

  it("renders a multi-line body into blocks without HTML interpretation", () => {
    const blocks = bodyToBlocks("# Title\n## Sub\nplain line\n- bullet\n* bullet2");
    expect(blocks).toEqual([
      { kind: "h1", text: "Title" },
      { kind: "h2", text: "Sub" },
      { kind: "p", text: "plain line" },
      { kind: "li", text: "bullet" },
      { kind: "li", text: "bullet2" },
    ]);
    const pdf = renderVaultPdf("T", blocks);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });

  it("bounded: the rendered PDF stays well under the vault 25 MiB cap", () => {
    const big = Array.from({ length: 300 }, () => "line of text with some words in it").join("\n");
    expect(Buffer.byteLength(big, "utf8")).toBeLessThan(64 * 1024);
    const pdf = renderVaultPdf("Big", bodyToBlocks(big));
    expect(pdf.byteLength).toBeLessThan(25 * 1024 * 1024);
  });
});

describe("field validation + interpolation (fail-closed)", () => {
  it("rejects unknown field keys, non-string values, missing required fields", () => {
    const tpl = makeTemplate();
    expect(validateFieldValues(tpl, { customer: "Acme", scope: "x", notes: "y", hacked: "z" }).ok).toBe(false);
    expect(validateFieldValues(tpl, { customer: 42 } as any).ok).toBe(false);
    expect(validateFieldValues(tpl, {} as any).ok).toBe(false); // required customer missing
    expect(validateFieldValues(tpl, { customer: "Acme" }).ok).toBe(true);
  });

  it("interpolates declared keys and rejects leftover placeholders (never guesses)", () => {
    const tpl = makeTemplate();
    const out = renderTemplateBody(tpl, { customer: "Acme", scope: "Audit", notes: "Due Friday" });
    expect(out).toContain("Acme");
    expect(out).toContain("Due Friday");
    expect(out).not.toContain("{{");
    // A field value that would smuggle a placeholder → the guard fails closed.
    expect(() => renderTemplateBody(tpl, { customer: "Acme", scope: "{{evil}} leaked", notes: "" })).toThrow(/unresolved placeholder/);
    // Template body itself having an undeclared token → fails closed.
    const badTpl = makeTemplate({ body: "Hello {{notdeclared}}" });
    expect(() => renderTemplateBody(badTpl, { customer: "Acme" })).toThrow(/unresolved placeholder/);
  });

  it("markup in field values is inert: output stays a valid PDF binary, content escaped", () => {
    const tpl = makeTemplate();
    const rendered = renderTemplateDocument(tpl, "prop.pdf", { customer: "</script><evil>", scope: "x", notes: "y" });
    const ascii = new TextDecoder().decode(rendered.pdf);
    expect(ascii.startsWith("%PDF-")).toBe(true);
    // The value is present ONLY as inert text inside an escaped Tj string —
    // it never changes the PDF structure (parens are escaped, no operator
    // injection possible), and the vault stores it as a binary PDF (no HTML).
    expect(ascii).toContain("(</script><evil>)");
  });

  it("caps values and names", () => {
    const tpl = makeTemplate();
    const long = "x".repeat(CREATION_VALUE_MAX + 100);
    const ok = validateFieldValues(tpl, { customer: long, scope: "s", notes: "n" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.values.customer.length).toBe(CREATION_VALUE_MAX);
  });
});

describe("catalog: add-only versioning + per-tenant isolation + exact-id delete", () => {
  it("create → list → update bumps version, history keeps v1, no in-place overwrite", () => {
    const t = makeTemplate();
    expect(t.version).toBe(1);
    expect(getVaultTemplate("lib-a@test.local", t.id, dataDir)!.body).toContain("{{customer}}");

    const up = updateVaultTemplate({ tenantEmail: "lib-a@test.local", templateId: t.id, actor: "lib-a@test.local", dataDir, body: "# New Body\n{{customer}}" });
    expect(up.ok).toBe(true);
    const u = (up as any).template as VaultTemplate;
    expect(u.version).toBe(2);
    expect(u.body).toContain("New Body");
    expect(u.history.length).toBe(1);
    expect(u.history[0].version).toBe(1);
    expect(u.history[0].body).toContain("## Scope"); // v1 preserved verbatim

    const listed = listVaultTemplates("lib-a@test.local", dataDir);
    expect(listed.templates).toHaveLength(1);
    expect(listed.templates[0].version).toBe(2);
  });

  it("unknown + other-tenant template ids fail closed (no cross-tenant read)", () => {
    const t = makeTemplate();
    expect(getVaultTemplate("other@test.local", t.id, dataDir)).toBeNull();
    const upd = updateVaultTemplate({ tenantEmail: "other@test.local", templateId: t.id, actor: "other", dataDir, body: "x" });
    expect(upd.ok).toBe(false);
    expect((upd as any).error).toBe("Template not found");
    expect(listVaultTemplates("other@test.local", dataDir).templates).toHaveLength(0);
    expect(getVaultTemplate("lib-a@test.local", "tpl_never", dataDir)).toBeNull();
  });

  it("delete is exact-id + idempotent-by-audit; unknown delete ids fail closed", () => {
    const t = makeTemplate();
    const del = deleteVaultTemplate("lib-a@test.local", t.id, dataDir);
    expect(del.ok).toBe(true);
    expect(getVaultTemplate("lib-a@test.local", t.id, dataDir)).toBeNull();
    // Re-delete SAME exact id → audited no-op (provable from the audit trail).
    const del2 = deleteVaultTemplate("lib-a@test.local", t.id, dataDir);
    expect(del2.ok).toBe(true);
    expect((del2 as any).unchanged).toBe(true);
    // Unknown id → fail closed.
    const never = deleteVaultTemplate("lib-a@test.local", "tpl_never_existed", dataDir);
    expect(never.ok).toBe(false);
    expect((never as any).error).toBe("Template not found");
  });

  it("rejects malformed templates (bad field keys, duplicate keys, empty name)", () => {
    expect(createVaultTemplate(sampleTemplate({ fields: [{ key: "bad key!", label: "x" }] })).ok).toBe(false);
    expect(createVaultTemplate(sampleTemplate({ fields: [{ key: "dup", label: "1" }, { key: "dup", label: "2" }] })).ok).toBe(false);
    expect(createVaultTemplate(sampleTemplate({ name: "  " })).ok).toBe(false);
    expect(createVaultTemplate(sampleTemplate({ body: "" })).ok).toBe(false);
  });
});

describe("import: sniffing + caps (mirrors vault-intake)", () => {
  it("imports a valid .json template and a .txt body template", () => {
    const json = new TextEncoder().encode(JSON.stringify({ name: "Imported JSON", description: "d", body: "# {{x}}", fields: [{ key: "x", label: "X" }] }));
    const r1 = importVaultTemplate({ tenantEmail: "lib-a@test.local", actor: "a", dataDir, fileName: "tpl.json", bytes: json });
    expect(r1.ok).toBe(true);
    expect((r1 as any).template.source).toBe("upload");

    const txt = new TextEncoder().encode("# Hello\nplain body text");
    const r2 = importVaultTemplate({ tenantEmail: "lib-a@test.local", actor: "a", dataDir, fileName: "notes.md", bytes: txt });
    expect(r2.ok).toBe(true);
    expect((r2 as any).template.source).toBe("upload");
    expect(listVaultTemplates("lib-a@test.local", dataDir).templates).toHaveLength(2);
  });

  it("rejects oversized, bad-extension, binary, and non-JSON-content imports (fail-closed)", () => {
    const big = new Uint8Array(TEMPLATE_MAX_IMPORT_BYTES + 1);
    expect(importVaultTemplate({ tenantEmail: "a", actor: "a", dataDir, fileName: "big.json", bytes: big }).ok).toBe(false);

    const exe = new TextEncoder().encode("MZ this is a fake exe");
    expect(importVaultTemplate({ tenantEmail: "a", actor: "a", dataDir, fileName: "evil.exe", bytes: exe }).ok).toBe(false);

    // .json whose content is not JSON → content check fails.
    const notJson = new TextEncoder().encode("# just markdown but named json");
    expect(importVaultTemplate({ tenantEmail: "a", actor: "a", dataDir, fileName: "x.json", bytes: notJson }).ok).toBe(false);

    // .txt containing binary control bytes → printable-text check fails.
    const binTxt = new Uint8Array([0x48, 0x00, 0x49]); // includes NUL
    expect(importVaultTemplate({ tenantEmail: "a", actor: "a", dataDir, fileName: "x.txt", bytes: binTxt }).ok).toBe(false);
  });
});