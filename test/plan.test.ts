import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyPlan, chooseBackupPath } from "../src/core/apply.js";
import { validateManifest } from "../src/core/manifest.js";
import { buildPlan } from "../src/core/plan.js";
import type { BuildPlanOptions, ManifestEntry } from "../src/core/types.js";

let baseDir: string;
let sourceRoot: string;
let destinationRoot: string;

const describePosix = describe.skipIf(process.platform === "win32");

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "sgi-plan-"));
  sourceRoot = path.join(baseDir, "source");
  destinationRoot = path.join(baseDir, "destination");
  await mkdir(path.join(sourceRoot, ".claude"), { recursive: true });
  await mkdir(destinationRoot, { recursive: true });
  await writeFile(path.join(sourceRoot, ".env"), "SECRET=1\n");
  await writeFile(path.join(sourceRoot, ".claude", "settings.json"), "{}\n");
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

function entry(value: string, line = 1): ManifestEntry {
  const isDirectory = value.endsWith("/");
  const clean = value.replace(/\/+$/, "");
  return { raw: clean, path: clean, isDirectory, line };
}

async function makePlan(
  entries: ManifestEntry[],
  overrides: Partial<BuildPlanOptions> = {},
) {
  const validated = validateManifest(entries, destinationRoot);
  return buildPlan({
    entries: validated.entries,
    problems: validated.problems,
    sourceRoot,
    destinationRoot,
    mode: "link",
    ...overrides,
  });
}

describePosix("buildPlan", () => {
  it("plans relative links for fresh destinations", async () => {
    const plan = await makePlan([entry(".env"), entry(".claude/", 2)]);

    expect(plan.entries.map((item) => item.status)).toEqual(["linked", "linked"]);
    expect(plan.entries.map((item) => item.action)).toEqual(["create", "create"]);
    expect(plan.entries[0]?.target).toBe("../source/.env");
    expect(plan.entries[1]?.target).toBe("../source/.claude");
    expect(plan.entries[1]?.isDirectory).toBe(true);
    expect(plan.exitCode).toBe(0);
  });

  it("reports not-linked in list mode", async () => {
    const plan = await makePlan([entry(".env")], { mode: "list" });

    expect(plan.entries[0]?.status).toBe("not-linked");
    expect(plan.entries[0]?.action).toBe("skip");
  });

  it("reports already-linked after the plan is applied, and linked in list mode", async () => {
    const first = await makePlan([entry(".env")]);
    await applyPlan(first);

    const second = await makePlan([entry(".env")]);
    expect(second.entries[0]?.status).toBe("already-linked");
    expect(second.entries[0]?.action).toBe("none");

    const listed = await makePlan([entry(".env")], { mode: "list" });
    expect(listed.entries[0]?.status).toBe("linked");
  });

  it("protects an existing destination by default", async () => {
    await writeFile(path.join(destinationRoot, ".env"), "LOCAL=1\n");

    const plan = await makePlan([entry(".env")]);
    expect(plan.entries[0]?.status).toBe("occupied");
    expect(plan.entries[0]?.action).toBe("skip");
    expect(plan.exitCode).toBe(0);

    await applyPlan(plan);
    expect(await readFile(path.join(destinationRoot, ".env"), "utf8")).toBe("LOCAL=1\n");
  });

  it("replaces an existing destination with force", async () => {
    await writeFile(path.join(destinationRoot, ".env"), "LOCAL=1\n");

    const plan = await makePlan([entry(".env")], { force: true });
    expect(plan.entries[0]?.status).toBe("linked");
    expect(plan.entries[0]?.action).toBe("replace");

    await applyPlan(plan);
    const stat = await lstat(path.join(destinationRoot, ".env"));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("backs up an existing destination before linking", async () => {
    await writeFile(path.join(destinationRoot, ".env"), "LOCAL=1\n");

    const plan = await makePlan([entry(".env")], { backup: true });
    expect(plan.entries[0]?.status).toBe("linked");
    expect(plan.entries[0]?.action).toBe("backup");

    await applyPlan(plan);
    expect((await lstat(path.join(destinationRoot, ".env"))).isSymbolicLink()).toBe(true);

    const backups = (await readdir(destinationRoot)).filter((name) => name.startsWith(".env.bak-"));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(destinationRoot, backups[0] ?? ""), "utf8")).toBe("LOCAL=1\n");
  });

  it("repairs a dangling symlink without requiring force", async () => {
    await symlink("../source/gone", path.join(destinationRoot, ".env"));

    const plan = await makePlan([entry(".env")]);
    expect(plan.entries[0]?.status).toBe("repaired");
    expect(plan.entries[0]?.action).toBe("replace");

    await applyPlan(plan);
    expect((await lstat(path.join(destinationRoot, ".env"))).isSymbolicLink()).toBe(true);
  });

  it("reports a dangling symlink in list mode", async () => {
    await symlink("../source/gone", path.join(destinationRoot, ".env"));

    const plan = await makePlan([entry(".env")], { mode: "list" });
    expect(plan.entries[0]?.status).toBe("dangling");
  });

  it("reports missing sources and fails the run", async () => {
    const plan = await makePlan([entry(".missing")]);

    expect(plan.entries[0]?.status).toBe("missing-source");
    expect(plan.failures).toBe(1);
    expect(plan.exitCode).toBe(1);
  });

  it("rejects a directory entry whose source is a file", async () => {
    const plan = await makePlan([entry(".env/")]);
    expect(plan.entries[0]?.status).toBe("missing-source");
    expect(plan.entries[0]?.message).toContain("not a directory");
  });

  it("marks entries unsafe when a parent symlink escapes the checkout", async () => {
    const outside = path.join(baseDir, "outside");
    await mkdir(path.join(outside, ".claude"), { recursive: true });
    await writeFile(path.join(outside, ".claude", "settings.json"), "{}\n");
    await symlink(path.join(outside, ".claude"), path.join(destinationRoot, ".claude"));

    const plan = await makePlan([entry(".claude/settings.json")]);
    expect(plan.entries[0]?.status).toBe("unsafe");
    expect(plan.entries[0]?.action).toBe("skip");
    expect(plan.exitCode).toBe(1);
  });

  it("uses dry-run statuses without touching the filesystem", async () => {
    await writeFile(path.join(sourceRoot, ".other"), "other\n");
    await writeFile(path.join(destinationRoot, ".other"), "x\n");

    const plan = await makePlan([entry(".env"), entry(".other")], { dryRun: true, force: true });
    expect(plan.entries[0]?.status).toBe("will-link");
    expect(plan.entries[1]?.status).toBe("will-replace");
    expect((await readdir(destinationRoot)).sort()).toEqual([".other"]);
  });

  it("carries manifest problems into the plan", async () => {
    const plan = await makePlan([entry(".claude/"), entry(".claude/settings.json", 2), entry("../escape", 3)]);

    expect(plan.entries.map((item) => item.status)).toEqual(["linked", "shadowed", "invalid"]);
    expect(plan.failures).toBe(1);
    expect(plan.exitCode).toBe(1);
  });

  it("keeps processing when one entry cannot be created", async () => {
    await mkdir(path.join(sourceRoot, "blocked"));
    await writeFile(path.join(sourceRoot, "blocked", "file"), "x\n");
    await writeFile(path.join(destinationRoot, "blocked"), "not a directory\n");

    const plan = await makePlan([entry(".env"), entry("blocked/file", 2)]);
    await applyPlan(plan);

    expect((await lstat(path.join(destinationRoot, ".env"))).isSymbolicLink()).toBe(true);
    expect(plan.entries[1]?.message).toContain("failed:");
    expect(plan.exitCode).toBe(1);
  });

  it("records a permission failure on one entry without aborting the rest", async () => {
    if (process.getuid?.() === 0) {
      return;
    }

    await mkdir(path.join(sourceRoot, "readonly"));
    await writeFile(path.join(sourceRoot, "readonly", "file"), "x\n");
    const readonlyDestination = path.join(destinationRoot, "readonly");
    await mkdir(readonlyDestination);
    await chmod(readonlyDestination, 0o555);

    try {
      const plan = await makePlan([entry(".env"), entry("readonly/file", 2)]);
      await applyPlan(plan);

      expect((await lstat(path.join(destinationRoot, ".env"))).isSymbolicLink()).toBe(true);
      expect(plan.entries[1]?.message).toMatch(/failed:.*EACCES/);
      expect(plan.exitCode).toBe(1);
    } finally {
      await chmod(readonlyDestination, 0o755);
    }
  });
});

describe("chooseBackupPath", () => {
  it("adds a numeric suffix when the timestamped backup already exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05"));

    try {
      const destination = path.join(destinationRoot, ".env");
      const first = await chooseBackupPath(destination);
      expect(first.endsWith(".env.bak-20260102030405")).toBe(true);
      await writeFile(first, "taken\n");

      const second = await chooseBackupPath(destination);
      expect(second).toBe(`${first}-1`);
    } finally {
      vi.useRealTimers();
    }
  });
});
