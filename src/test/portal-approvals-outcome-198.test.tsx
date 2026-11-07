/**
 * portal-approvals-outcome-198.test.tsx — a failed execution must never wear a
 * success badge (portal sweep 2026-11-06, P1-2).
 *
 * The screenshot: five decided cards showing a green `APPROVED` badge directly
 * above a red failure line, under a header promising "writes execute
 * immediately". The badge read `status`, and `status` records that a HUMAN
 * DECIDED — not that the write ran. This test pins the mapping the page now
 * uses: `decisionState()` is the one place a card's state is derived, and
 * `approved + resultError` is `failed` in red, never `applied` in emerald.
 *
 * It also pins the page to that function at the call site (a source guard that
 * matches the call, not the prose about it), because a unit test on a helper the
 * page stopped calling would pass while the page lied.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decisionState } from "../lazy/portal.approvals.index.page";
import { BADGE_VARIANTS } from "../components/ui";

const PAGE = join(dirname(fileURLToPath(import.meta.url)), "..", "lazy", "portal.approvals.index.page.tsx");

describe("approval card state comes from what happened (198)", () => {
  it("an approved decision whose write failed is `failed`, in red", () => {
    const s = decisionState({ status: "approved", resultError: 'Unknown action: "createProposal"' });
    expect(s.state).toBe("failed");
    expect(s.label).toBe("failed");
    expect(s.variant).toBe("danger");
    // the sweep's actual defect: a failure wearing the success colour
    expect(s.variant).not.toBe("success");
    expect(BADGE_VARIANTS).toContain(s.variant);
  });

  it("an approved decision whose write applied is `applied`, in the one positive badge", () => {
    const s = decisionState({ status: "approved", resultError: undefined });
    expect(s.state).toBe("applied");
    // SLICE 199 renamed the badge token `emerald` -> `success`: emerald meant
    // four different things at once (a CTA, a success status, an "active" row
    // and "all clear"), and `success` is now the single explicit positive. The
    // property this test protects is that an APPLIED write wears that one
    // positive variant — and that the variant is a real one, so a rename that
    // forgets this page fails here instead of rendering an unclassified grey.
    expect(s.variant).toBe("success");
    expect(BADGE_VARIANTS).toContain(s.variant);
  });

  it("a rejected card is rejected, a pending one is pending — neither is a success", () => {
    expect(decisionState({ status: "rejected" }).state).toBe("rejected");
    expect(decisionState({ status: "rejected" }).variant).not.toBe("success");
    expect(decisionState({ status: "pending" }).state).toBe("pending");
    expect(decisionState({ status: "pending" }).variant).not.toBe("success");
    for (const status of ["rejected", "pending"] as const) {
      expect(BADGE_VARIANTS).toContain(decisionState({ status }).variant);
    }
  });

  it("the page renders that mapping (it does not read the decision alone)", () => {
    const src = readFileSync(PAGE, "utf8");
    expect(src).toContain("variant={decisionState(a).variant}");
    expect(src).toContain("{decisionState(a).label}");
    // the exact expression that rendered a green APPROVED over a failure
    expect(src).not.toContain('variant={a.status === "approved"');
    // and the header no longer promises that "auto" executes everything
    expect(src).not.toContain("Auto-approve ON — writes execute immediately");
  });
});
