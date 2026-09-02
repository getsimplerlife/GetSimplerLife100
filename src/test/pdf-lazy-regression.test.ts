import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * PDF-lazy regression guard (owner code-split guardrail).
 *
 * The landing page must NEVER modulepreload the PDF vendor chunk
 * (jspdf + html2canvas, ~576K raw / ~167K gzipped). PDF rendering only
 * matters on three lazy routes (ROI calculator, assessment, tools
 * assessment) and the portal file preview — none of which are part of the
 * initial client graph.
 *
 * Two invariants are guarded here:
 *  1. SOURCE invariant — no client-rendered file under src/lazy|components|routes
 *     may STATICALLY import jspdf/html2canvas or the pdf-co client machinery.
 *     (Dynamic `await import("jspdf")` is correct and preserves code-splitting.)
 *  2. BUILD invariant — when a built dist/index.html is present, its initial
 *     <link rel="modulepreload"> set must NOT reference the vendor-pdf chunk.
 *     This catches regressions at build time (e.g. `vite/preload-helper` being
 *     hoisted into the PDF chunk makes the entry statically pull vendor-pdf).
 */
const CLIENT_DIRS = ["src/lazy", "src/components", "src/routes", "src/lib"];
const FORBIDDEN_STATIC = [
  { pattern: /from\s+["']jspdf["']/, label: "static jspdf import" },
  { pattern: /from\s+["']html2canvas["']/, label: "static html2canvas import" },
  { pattern: /from\s+["'].*providers\/pdf-co["']/, label: "static pdf-co import" },
  { pattern: /from\s+["'].*engine\/integration-tools["']/, label: "static integration-tools import (server-only)" },
];

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFilesRecursive(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("PDF vendor chunk stays off the landing critical path", () => {
  it("no client-rendered file statically imports jspdf/html2canvas/pdf-co", () => {
    const violations: string[] = [];
    for (const dir of CLIENT_DIRS) {
      const files = listFilesRecursive(join(process.cwd(), dir));
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const { pattern, label } of FORBIDDEN_STATIC) {
          if (pattern.test(content)) {
            violations.push(`${file}: ${label}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("built dist/index.html does NOT modulepreload vendor-pdf", () => {
    const indexPath = join(process.cwd(), "dist", "index.html");
    if (!existsSync(indexPath)) {
      // No build artifact in this workspace — skip (build invariant is
      // verified by the canonical build gate before merge).
      expect(true).toBe(true);
      return;
    }
    const html = readFileSync(indexPath, "utf8");
    const preloads = html.match(/<link\s+rel="modulepreload"[^>]*href="([^"]+)"/g) || [];
    const preloaded = preloads.map((l) => (l.match(/href="([^"]+)"/) || [])[1] || "");
    const pdfPreloads = preloaded.filter((href) => href.includes("vendor-pdf"));
    expect(pdfPreloads).toEqual([]);
    // Sanity: we still preload the eager react-vendor chunk.
    const reactPreloads = preloaded.filter((href) => href.includes("react-vendor"));
    expect(reactPreloads.length).toBeGreaterThan(0);
  });
});