/**
 * data-health-164.test.ts — SLICE 164. The page must not promise what the
 * deployment cannot deliver.
 *
 * On the live deployment `/home/engine/.data` is outside the publish tree and is
 * still recreated by every publish, because the whole filesystem is. "Your data
 * is outside anything a publish can replace" was therefore TRUE about the path
 * and FALSE about the data. These tests pin the three honest statements the
 * report can now make — the disk holds it, the archive restored it, or nothing
 * does — and pin that machine identity never travels between deployments.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDataHealthReport } from "~/lib/data-health";
import { describeDurability, type BootRestoreReport } from "~/lib/boot-restore";
import { MACHINE_IDENTITY_FILES, migrateLegacyData } from "~/lib/data-store";

const tmpDirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

const PROCESS_START = new Date("2026-11-01T08:37:26.830Z");

function marker(dir: string, firstSeenAt: string): void {
  writeFileSync(
    join(dir, "deployment-generation.json"),
    JSON.stringify({ version: 1, firstSeenAt, lastBootAt: firstSeenAt, boots: 2, buildsSeen: [{ id: "sha256:x", firstBootAt: firstSeenAt }] }),
  );
}

function restoreReport(patch: Partial<BootRestoreReport> = {}): BootRestoreReport {
  return {
    version: 1,
    at: "2026-11-01T08:37:30.000Z",
    attempted: true,
    ok: true,
    skippedReason: null,
    error: null,
    namespacePrefix: "simplerlife100/backups/live/",
    instance: "live",
    key: "simplerlife100/backups/live/2026-11-01T09-00-00Z.tar.gz.enc",
    runId: "2026-11-01T09-00-00Z",
    files: 12,
    bytes: 4096,
    excluded: ["deployment-generation.json"],
    durationMs: 900,
    ...patch,
  };
}

describe("slice 164 — describeDurability says what actually protects the data", () => {
  it("the disk, when the directory predates this process and the build", () => {
    const d = describeDurability({ survivedProcessStart: true, survivedRunningBuild: true, restore: null, dataDir: "/home/team/shared/.data" });
    expect(d.mode).toBe("disk");
    expect(d.plainWords).toContain("outlived the last publish");
  });

  it("the archive, when the disk was recreated but an archive was restored at boot", () => {
    const d = describeDurability({ survivedProcessStart: false, survivedRunningBuild: false, restore: restoreReport(), dataDir: "/home/engine/.data" });
    expect(d.mode).toBe("archive-restore");
    expect(d.plainWords).toContain("does not keep its disk");
    expect(d.plainWords).toContain("restored into that directory at boot");
    expect(d.plainWords).toContain("/home/engine/.data");
  });

  it("NOTHING, when the disk was recreated and no archive was restored", () => {
    const d = describeDurability({
      survivedProcessStart: false,
      survivedRunningBuild: false,
      restore: restoreReport({ ok: false, attempted: true, error: "R2 GET failed: HTTP 403" }),
      dataDir: "/home/engine/.data",
    });
    expect(d.mode).toBe("none");
    expect(d.plainWords).toContain("will NOT survive the next publish");
    expect(d.plainWords).toContain("R2 GET failed: HTTP 403");
  });
});

describe("slice 164 — the report carries the honest statement, not just a verdict", () => {
  it("a fresh directory with no restore is RED and says the data is unprotected", () => {
    const dataDir = tmp("sl-dh-fresh-");
    marker(dataDir, PROCESS_START.toISOString()); // created by this boot
    const report = buildDataHealthReport({
      dataDir,
      serverBase: tmp("sl-dh-base-"),
      processStartedAt: PROCESS_START,
      restore: null,
      now: PROCESS_START,
    });
    expect(report.verdict).toBe("red");
    expect(report.durability.mode).toBe("none");
    expect(report.reasons.join(" ")).toContain("will NOT survive the next publish");
  });

  it("a fresh directory that restored an archive reports the mechanism, and what was left out", () => {
    const dataDir = tmp("sl-dh-restored-");
    marker(dataDir, PROCESS_START.toISOString());
    const report = buildDataHealthReport({
      dataDir,
      serverBase: tmp("sl-dh-base-"),
      processStartedAt: PROCESS_START,
      restore: restoreReport(),
      now: PROCESS_START,
    });
    expect(report.durability.mode).toBe("archive-restore");
    expect(report.restore?.runId).toBe("2026-11-01T09-00-00Z");
    const joined = report.reasons.join(" ");
    expect(joined).toContain("Restored at");
    expect(joined).toContain("Not restored from the archive");
    // the disk verdict is still honest: this directory did NOT survive
    expect(report.survivedProcessStart).toBe(false);
  });

  it("a directory that predates this boot keeps the disk verdict", () => {
    const dataDir = tmp("sl-dh-old-");
    marker(dataDir, "2026-10-30T22:00:00.000Z");
    const report = buildDataHealthReport({
      dataDir,
      serverBase: tmp("sl-dh-base-"),
      processStartedAt: PROCESS_START,
      restore: null,
      now: PROCESS_START,
    });
    expect(report.durability.mode).toBe("disk");
    expect(report.reasons.join(" ")).toContain("outlived the last publish");
  });
});

describe("slice 164 — machine identity never travels with a migrated data directory", () => {
  it("copies data but not the previous machine's backup state, namespace or survival proof", () => {
    const legacy = tmp("sl-legacy-");
    const target = tmp("sl-target-");
    rmSync(target, { recursive: true, force: true }); // the migration wants an absent dir
    writeFileSync(join(legacy, "users.json"), '{"real":"data"}');
    writeFileSync(join(legacy, "backup_status.json"), '{"lastBackupOkAt":"2026-10-31T06:25:50.939Z"}');
    writeFileSync(join(legacy, "backup_instance.json"), '{"id":"data-b2e7f21a"}');
    writeFileSync(join(legacy, "deployment-generation.json"), '{"firstSeenAt":"2026-10-01T00:00:00.000Z"}');
    writeFileSync(join(legacy, "boot_restore.json"), '{"ok":true}');

    const result = migrateLegacyData(target, [legacy]);
    expect(result.legacyDir).toBe(legacy);
    expect(readFileSync(join(target, "users.json"), "utf8")).toBe('{"real":"data"}');
    for (const name of MACHINE_IDENTITY_FILES) {
      expect(readFileSync(join(legacy, name), "utf8")).toBeTruthy(); // it exists at the source
      expect(() => readFileSync(join(target, name), "utf8")).toThrow(); // and was not copied
    }
    // exactly one file was copied
    expect(result.migrated).toBe(1);
  });
});
