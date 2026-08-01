import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal capability claims", () => {
  it("identifies the live production execution path, not the orphaned V2 runtime", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/portal.employees.index.tsx"), "utf8");
    expect(source).toContain("Live path: prod-server.ts → provider-api.ts → agent-processor.ts");
    expect(source).not.toContain("Runtime: src/agents/runtime.ts");
  });
});
