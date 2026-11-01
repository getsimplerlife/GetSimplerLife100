import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  GENERATION_MARKER_FILE,
  buildDataHealthReport,
  generationMarkerPath,
  readGenerationMarker,
  recordDeploymentBoot,
} from "../lib/data-health";
import { isInsidePublishTree } from "../lib/data-dir-policy";
import { DURABLE_STORES } from "../lib/durable-stores";

/**
 * SLICE 162 — the generation marker: the durable proof that a data directory
 * survived a publish.
 *
 * WHY A MARKER, AND WHY A REAL SECOND PROCESS: "did my data survive the last
 * publish?" cannot be answered by a config value (the deployment's config is
 * exactly what was wrong) and cannot be answered from memory (a restart clears
 * it). It is answered by a file that a boot CREATES once and every later boot
 * only ADDS to. The restart test below therefore does not simulate a restart in
 * one process — it spawns two separate `bun` processes against the same data
 * directory and compares what each one saw, because that is what the live
 * deployment actually does.
 *
 * It also proves the negative: wipe the data directory and the next boot starts
 * a NEW generation (fresh firstSeenAt, boots back to 1). That is what a publish
 * replacing the tree looks like — and it is why the owner's view goes red
 * instead of reporting health it does not have.
 */
// The module under test, as a path another process can import. `process.cwd()`
// is the repo root under vitest; `bootInAnotherProcess` fails loudly if not.
const MODULE_PATH = resolve(process.cwd(), "src", "lib", "data-health.ts");

/**
 * A scratch root holds both a fake code directory and a data directory beside
 * it. The data dir is deliberately NOT inside the code dir: that is the layout
 * the whole slice is about, and passing the root itself as the server base would
 * (correctly) classify the data dir as inside the publish tree.
 */
const scratchDirs: string[] = [];
function scratch(prefix = "sl100-dh162-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
function serverBaseFor(root: string): string {
  return join(root, "server");
}

afterAll(() => {
  while (scratchDirs.length) {
    try {
      rmSync(scratchDirs.pop()!, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/** Run one REAL boot of the marker logic in a separate process. */
function bootInAnotherProcess(dataDir: string, buildId: string): any {
  if (!existsSync(MODULE_PATH)) throw new Error(`module not found at ${MODULE_PATH}`);
  const dir = mkdtempSync(join(tmpdir(), "sl100-dh162-boot-"));
  scratchDirs.push(dir);
  const file = join(dir, "boot.mjs");
  writeFileSync(
    file,
    `import { recordDeploymentBoot } from ${JSON.stringify(MODULE_PATH)};\n` +
      `const rec = recordDeploymentBoot(process.argv[2], { buildId: process.argv[3] });\n` +
      `process.stdout.write(JSON.stringify({ ok: rec.ok, created: rec.created, path: rec.path, marker: rec.marker, error: rec.error }));\n`,
  );
  const out = spawnSync("bun", [file, dataDir, buildId], { encoding: "utf-8", timeout: 30_000 });
  if (out.status !== 0) {
    throw new Error(`boot process failed (${out.status}): ${out.stderr || out.stdout}`);
  }
  return JSON.parse(out.stdout);
}

describe("the generation marker lives inside the data directory (slice 162)", () => {
  it("is created on the first boot, inside DATA_DIR, outside any publish tree", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    const serverBase = serverBaseFor(root);
    const rec = recordDeploymentBoot(dataDir, { buildId: "build-a" });

    expect(rec.ok).toBe(true);
    expect(rec.created).toBe(true);
    expect(rec.path).toBe(join(dataDir, GENERATION_MARKER_FILE));
    expect(generationMarkerPath(dataDir)).toBe(rec.path);
    expect(existsSync(rec.path)).toBe(true);
    // Inside the configured data directory...
    expect(rec.path.startsWith(dataDir + "/")).toBe(true);
    // ...and outside anything a publish replaces.
    expect(isInsidePublishTree(dataDir, serverBase)).toBe(false);
    expect(isInsidePublishTree(rec.path, serverBase)).toBe(false);
    // Control: the SAME check does fire for a data dir inside the code dir, so
    // the two assertions above are not vacuous.
    expect(isInsidePublishTree(join(serverBase, ".data"), serverBase)).toBe(true);

    const onDisk = JSON.parse(readFileSync(rec.path, "utf-8"));
    expect(onDisk.boots).toBe(1);
    expect(onDisk.firstSeenAt).toBe(rec.marker!.firstSeenAt);
    expect(onDisk.lastBootAt).toBe(rec.marker!.firstSeenAt);
    expect(onDisk.buildsSeen).toEqual([{ id: "build-a", firstBootAt: rec.marker!.firstSeenAt }]);
  });

  it("keeps firstSeenAt and counts the boot when the directory is preserved", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    const first = recordDeploymentBoot(dataDir, {
      buildId: "build-a",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const second = recordDeploymentBoot(dataDir, {
      buildId: "build-b",
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.marker!.firstSeenAt).toBe(first.marker!.firstSeenAt);
    expect(second.marker!.firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
    expect(second.marker!.boots).toBe(2);
    expect(second.marker!.lastBootAt).toBe("2026-01-02T00:00:00.000Z");
    // Two distinct builds seen: this directory has outlived a build change.
    expect(second.marker!.buildsSeen.map((b) => b.id)).toEqual(["build-a", "build-b"]);
  });

  it("starts a FRESH generation when the data directory was wiped", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    const first = recordDeploymentBoot(dataDir, {
      buildId: "build-a",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(first.marker!.boots).toBe(1);

    // This is what a publish that replaced the tree would leave behind.
    rmSync(dataDir, { recursive: true, force: true });

    const after = recordDeploymentBoot(dataDir, {
      buildId: "build-a",
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(after.created).toBe(true);
    expect(after.marker!.firstSeenAt).toBe("2026-03-01T00:00:00.000Z");
    expect(after.marker!.firstSeenAt).not.toBe(first.marker!.firstSeenAt);
    expect(after.marker!.boots).toBe(1);
  });

  it("treats an unreadable marker as a broken proof instead of silently resetting it", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(generationMarkerPath(dataDir), "{ this is not json");

    const read = readGenerationMarker(dataDir);
    expect(read.present).toBe(true);
    expect(read.marker).toBeNull();
    expect(read.error).toBeTruthy();

    const rec = recordDeploymentBoot(dataDir, {
      buildId: "build-a",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    expect(rec.ok).toBe(true);
    expect(rec.marker!.corruptPrevious).toBe(true);
    expect(rec.marker!.boots).toBe(1);

    // And the report says so out loud, in red.
    const report = buildDataHealthReport({
      dataDir,
      serverBase: serverBaseFor(root),
      processStartedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    expect(report.marker.corruptPrevious).toBe(true);
    expect(report.verdict).toBe("red");
    expect(report.reasons.join(" ")).toContain("could not be read");
  });

  it("survives a REAL restart: two separate processes, firstSeenAt unchanged, boots incremented", () => {
    const root = scratch();
    const dataDir = join(root, "data");

    const first = bootInAnotherProcess(dataDir, "build-a");
    expect(first.ok).toBe(true);
    expect(first.created).toBe(true);
    expect(first.marker.boots).toBe(1);
    const firstSeenAt = first.marker.firstSeenAt;

    const second = bootInAnotherProcess(dataDir, "build-a");
    expect(second.ok).toBe(true);
    expect(second.created).toBe(false);
    expect(second.marker.firstSeenAt).toBe(firstSeenAt);
    expect(second.marker.boots).toBe(2);

    // And the bytes on disk agree with what the second process reported.
    const onDisk = JSON.parse(readFileSync(join(dataDir, GENERATION_MARKER_FILE), "utf-8"));
    expect(onDisk.firstSeenAt).toBe(firstSeenAt);
    expect(onDisk.boots).toBe(2);
    expect(onDisk.buildsSeen).toHaveLength(1);
  }, 60_000);

  it("a wiped directory yields a fresh firstSeenAt across a real restart", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    const first = bootInAnotherProcess(dataDir, "build-a");
    rmSync(dataDir, { recursive: true, force: true });
    const after = bootInAnotherProcess(dataDir, "build-a");

    expect(after.created).toBe(true);
    expect(after.marker.boots).toBe(1);
    expect(after.marker.firstSeenAt).not.toBe(first.marker.firstSeenAt);
    expect(new Date(after.marker.firstSeenAt).getTime()).toBeGreaterThan(
      new Date(first.marker.firstSeenAt).getTime(),
    );
  }, 60_000);
});

describe("the owner's report judges the data directory against process and build (slice 162)", () => {
  /** A marker created an hour ago, and a build artifact written just now. */
  function greenFixture() {
    const root = scratch();
    const dataDir = join(root, "data");
    recordDeploymentBoot(dataDir, { buildId: "build-a", now: new Date(Date.now() - 3_600_000) });
    const artifact = join(root, "prod-server.ts");
    writeFileSync(artifact, "// the running build\n");
    return { root, dataDir, artifact, serverBase: serverBaseFor(root) };
  }

  it("is green when the marker predates both this process and the running build", () => {
    const { dataDir, artifact, serverBase } = greenFixture();
    const report = buildDataHealthReport({
      dataDir,
      serverBase,
      processStartedAt: new Date(),
      buildArtifacts: [artifact],
      runningBuildId: "sha256:test",
    });
    expect(report.verdict).toBe("green");
    expect(report.ok).toBe(true);
    expect(report.insidePublishTree).toBe(false);
    expect(report.survivedProcessStart).toBe(true);
    expect(report.survivedRunningBuild).toBe(true);
    expect(report.runningBuildAt).toBe(new Date(statSync(artifact).mtimeMs).toISOString());
    expect(report.reasons.join(" ")).toContain("predates both this process and the running build");
  });

  it("is red when the data directory sits inside the publish tree", () => {
    const root = scratch();
    const serverBase = join(root, "shared", "site");
    const dataDir = join(serverBase, ".data");
    recordDeploymentBoot(dataDir, { buildId: "build-a", now: new Date(Date.now() - 3_600_000) });
    const report = buildDataHealthReport({
      dataDir,
      serverBase,
      processStartedAt: new Date(),
      buildArtifacts: [],
    });
    expect(report.insidePublishTree).toBe(true);
    expect(report.marker.insidePublishTree).toBe(true);
    expect(report.verdict).toBe("red");
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("inside the publish tree");
  });

  it("is red when the marker is NEWER than the running build (a publish replaced the directory)", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    // Marker created now; the build artifact's mtime is an hour in the past.
    recordDeploymentBoot(dataDir, { buildId: "build-b", now: new Date() });
    const artifact = join(root, "prod-server.ts");
    writeFileSync(artifact, "// the running build\n");
    const past = new Date(Date.now() - 3_600_000);
    utimesSync(artifact, past, past);

    const report = buildDataHealthReport({
      dataDir,
      serverBase: serverBaseFor(root),
      processStartedAt: new Date(Date.now() - 1_800_000),
      buildArtifacts: [artifact],
    });
    expect(report.survivedRunningBuild).toBe(false);
    expect(report.verdict).toBe("red");
    expect(report.reasons.join(" ")).toContain("newer than the running build");
  });

  it("is red when this boot created the marker (nothing survived yet)", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    recordDeploymentBoot(dataDir, { buildId: "build-a", now: new Date() });
    const artifact = join(root, "prod-server.ts");
    writeFileSync(artifact, "// the running build\n");
    const past = new Date(Date.now() - 3_600_000);
    utimesSync(artifact, past, past);

    const report = buildDataHealthReport({
      dataDir,
      serverBase: serverBaseFor(root),
      processStartedAt: new Date(Date.now() - 1_000),
      buildArtifacts: [artifact],
    });
    expect(report.survivedProcessStart).toBe(false);
    expect(report.verdict).toBe("red");
    expect(report.reasons.join(" ")).toContain("created by this boot");
  });

  it("is unknown, never green, when the running build cannot be established", () => {
    const root = scratch();
    const dataDir = join(root, "data");
    recordDeploymentBoot(dataDir, { buildId: "build-a", now: new Date(Date.now() - 3_600_000) });
    const report = buildDataHealthReport({
      dataDir,
      serverBase: serverBaseFor(root),
      processStartedAt: new Date(),
      buildArtifacts: [join(root, "does-not-exist.ts")],
    });
    expect(report.runningBuildAt).toBeNull();
    expect(report.verdict).toBe("unknown");
    expect(report.ok).toBe(false);
  });

  it("reports every declared durable store from the filesystem", () => {
    const { dataDir, artifact, serverBase } = greenFixture();
    writeFileSync(join(dataDir, "users.json"), JSON.stringify({ "a@b.test": { email: "a@b.test" } }));
    const report = buildDataHealthReport({
      dataDir,
      serverBase,
      processStartedAt: new Date(),
      buildArtifacts: [artifact],
    });
    expect(report.durableStores.declared).toBe(DURABLE_STORES.length);
    expect(report.durableStores.rows).toHaveLength(DURABLE_STORES.length);
    const users = report.durableStores.rows.find((r) => r.store === "users.json")!;
    expect(users.present).toBe(true);
    expect(users.bytes).toBeGreaterThan(0);
    expect(users.mtime).toBeTruthy();
    // A store that has never been written is absent, and that is not an error.
    const never = report.durableStores.rows.find((r) => r.store === "sales_events.json")!;
    expect(never.present).toBe(false);
    expect(never.error).toBeNull();
    expect(report.durableStores.missing).toContain("sales_events.json");
  });
});
