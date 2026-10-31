/**
 * Approval-gate classification guard (slice 153).
 *
 * THE BUG CLASS: `approvalGate` decides whether a write needs human approval by
 * VERB PREFIX — `isWriteAction(name)` (src/lib/approval-queue.ts). A name that
 * matches neither WRITE_VERB nor READ_VERB is treated as a READ:
 *
 *     if (!isWriteAction(actionName)) return { allowed: true };   // FAILS OPEN
 *
 * Slice 152 found two live instances: `revokeInvoiceShare` and `rotateInvoiceShare`
 * were unclassified, so revoking or reissuing an invoice share link (a bearer
 * credential) would have skipped the Approval Queue entirely. They were fixed by
 * adding `revoke`/`rotate` to WRITE_VERB — but nothing stopped the NEXT action
 * name from being unclassified.
 *
 * THIS TEST closes that hole: it enumerates every action name that can reach the
 * gate's second argument (see ./helpers/approval-gate-enum.ts — it follows const
 * initialisers, object tables like VAULT_ACTIONS, table lookups, helper returns
 * and one level of parameter pass-through) and requires each to classify as a
 * WRITE, unless it is on the explicit, commented READ_ALLOWLIST below.
 *
 * Adding an action name whose verb is not in WRITE_VERB now fails the build.
 */
import { describe, it, expect } from "vitest";
import { isWriteAction } from "../lib/approval-queue";
import { enumerateApprovalGateActions } from "./helpers/approval-gate-enum";

/**
 * Action names that are genuinely READS and are expected to pass straight
 * through the gate. Every entry needs a reason; the test fails if an entry is
 * not actually a read, or is not in the enumeration at all (a stale exemption).
 *
 * EMPTY on purpose: as of slice 153 every one of the enumerated names is a
 * write, so the gate has no legitimate read traffic to exempt. If you add a
 * name here, you are asserting that skipping human approval for it is correct.
 */
const READ_ALLOWLIST: Readonly<Record<string, string>> = {};

/**
 * Call sites whose action name the enumerator cannot follow statically. Each one
 * is declared with its reason and is asserted to exist, so a NEW unresolvable
 * call site fails the build instead of quietly escaping the guard.
 */
const DYNAMIC_SITES: { file: string; expr: string; reason: string }[] = [
  {
    file: "src/engine/action-executor.ts",
    expr: "actionName",
    // The engine relays whatever name is in `actionRegistry.handlers`, which is
    // populated at runtime from the provider modules under
    // src/integrations/providers/** (179 providers). Enumerating those tables
    // statically is a larger job than this slice; declaring it here keeps the
    // hole visible instead of pretending it is covered.
    reason: "action-registry pass-through (runtime keys of actionRegistry.handlers)",
  },
];

const enumeration = enumerateApprovalGateActions();
const allNames = [...enumeration.names.keys()].sort();

describe("approvalGate action-name classification", () => {
  it("actually walks the source tree and finds call sites", () => {
    // Guards against a resolver that silently degrades to nothing and passes.
    expect(enumeration.filesScanned).toBeGreaterThan(500);
    expect(enumeration.sites.length).toBeGreaterThanOrEqual(20);
    expect(allNames.length).toBeGreaterThanOrEqual(100);
  });

  it("resolves constant tables, not just inline literals", () => {
    // Proof the enumeration is the real set: these names come from four
    // different resolution shapes.
    expect(allNames, "opVerb(op) returns").toContain("createTableRow");
    expect(allNames, "VAULT_ACTIONS.*").toContain("writeVaultDocument");
    expect(allNames, "FILE_IMPORT_ACTION.*").toContain("commitFileImport");
    expect(allNames, "literal argument").toContain("askAssistant");
    // Router ternaries reached through a parameter pass-through:
    expect(allNames, "dashboard router op").toContain("updateDashboard");
    expect(allNames, "automation router op").toContain("archiveRule");
  });

  it("every action name passed to approvalGate classifies as a WRITE", () => {
    const misclassified = allNames
      .filter((name) => !isWriteAction(name))
      .filter((name) => !(name in READ_ALLOWLIST))
      .map((name) => `  ${name}  ← ${(enumeration.names.get(name) ?? []).join(", ")}`);
    expect(
      misclassified,
      "These action names reach approvalGate but are NOT classified as writes, so they " +
        "would bypass the Approval Queue (fail-open). Either add the verb to WRITE_VERB in " +
        "src/lib/approval-queue.ts, or — only if it is genuinely a read — add it to " +
        `READ_ALLOWLIST with a reason:\n${misclassified.join("\n")}`,
    ).toEqual([]);
  });

  it("the READ_ALLOWLIST is honest and has no stale entries", () => {
    for (const [name, reason] of Object.entries(READ_ALLOWLIST)) {
      expect(reason.trim().length, `${name} needs a written reason`).toBeGreaterThan(10);
      expect(isWriteAction(name), `${name} is a write — it does not belong on the read allowlist`).toBe(false);
      expect(allNames, `${name} is exempted but never passed to approvalGate (stale entry)`).toContain(name);
    }
  });

  it("every call site resolves, or is a declared dynamic pass-through", () => {
    const declared = new Set(DYNAMIC_SITES.map((d) => `${d.file}|${d.expr}`));
    const undeclared = enumeration.unresolved
      .filter((u) => !declared.has(`${u.file}|${u.expr}`))
      .map((u) => `  ${u.file}:${u.line}  ${u.expr} — ${u.why}`);
    expect(
      undeclared,
      "New approvalGate call sites the enumerator cannot follow. Make the action name " +
        "statically resolvable (a literal, a table value, or a helper with literal returns), " +
        `or declare it in DYNAMIC_SITES with a reason:\n${undeclared.join("\n")}`,
    ).toEqual([]);

    // And every declared dynamic site must still exist, so the list cannot rot.
    for (const d of DYNAMIC_SITES) {
      const stillThere =
        enumeration.unresolved.some((u) => u.file === d.file && u.expr === d.expr) ||
        enumeration.sites.some((s) => s.file === d.file && s.expr === d.expr);
      expect(stillThere, `${d.file} no longer passes "${d.expr}" to approvalGate — drop the declaration`).toBe(true);
      expect(d.reason.trim().length, `${d.file} needs a written reason`).toBeGreaterThan(10);
    }
  });

  it("keeps slice 152's share-link verbs classified (the fail-open that started this)", () => {
    for (const name of ["revokeInvoiceShare", "rotateInvoiceShare"]) {
      expect(allNames, `${name} is no longer passed to approvalGate`).toContain(name);
      expect(isWriteAction(name), `${name} must be a write`).toBe(true);
    }
  });

  it("keeps the assistant ask gated (src/test/native-assistant.test.ts contract)", () => {
    expect(allNames).toContain("askAssistant");
    expect(isWriteAction("askAssistant")).toBe(true);
  });

  it("demonstrates the fail-open the guard exists to prevent", () => {
    // An action name whose verb is in neither list is treated as a READ.
    expect(isWriteAction("frobnicateWidget")).toBe(false);
    expect(isWriteAction("")).toBe(false);
  });
});
