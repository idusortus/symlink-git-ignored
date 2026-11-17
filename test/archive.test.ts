import { execFile } from "node:child_process";
import { mkdir, readdir, stat, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  archiveCommitWarning,
  assertArchiveDestination,
  planArchive,
  resolveArchivePath,
  writeArchive,
} from "../src/core/archive.js";
import { ToolError } from "../src/core/errors.js";
import { listWorktrees } from "../src/core/git.js";
import { archiveToJson, formatArchive } from "../src/output.js";
import { createRepoFixture, gitIn, type Fixture } from "./helpers/repo.js";
import { readZipEntries } from "./helpers/zip.js";

const execFileAsync = promisify(execFile);
const describePosix = describe.skipIf(process.platform === "win32");

let fixture: Fixture | undefined;

afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

function paths(plan: Awaited<ReturnType<typeof planArchive>>): string[] {
  return plan.entries.map((entry) => entry.path);
}

const WIDE_GITIGNORE = [
  ".env",
  ".notes",
  ".claude/",
  ".cache/",
  "node_modules/",
  "dist/",
  "bin/",
  "obj/",
  ".vs/",
  "TestResults/",
  "*.log",
  "*.zip",
  "",
].join("\n");

describe("resolveArchivePath", () => {
  it("defaults to llm-workspace.zip at the checkout root", () => {
    expect(resolveArchivePath("/repo")).toBe(path.join("/repo", "llm-workspace.zip"));
  });

  it("resolves a relative --output against the working directory", () => {
    expect(resolveArchivePath("/repo", "backups/workspace.zip", "/work")).toBe(
      path.join("/work", "backups", "workspace.zip"),
    );
  });

  it("keeps an absolute --output path", () => {
    expect(resolveArchivePath("/repo", "/tmp/workspace.zip", "/work")).toBe("/tmp/workspace.zip");
  });

  it("ignores blank output values", () => {
    expect(resolveArchivePath("/repo", "   ", "/work")).toBe(path.join("/repo", "llm-workspace.zip"));
  });
});

describePosix("planArchive", () => {
  it("collects ignored files, nested rules, and excludes tracked files and build artifacts", async () => {
    fixture = await createRepoFixture({
      manifest: null,
      gitignore: `${WIDE_GITIGNORE}local.env\n`,
      trackedFiles: {
        "local.env": "tracked\n",
        "packages/app/.gitignore": "local.json\n",
      },
      ignoredFiles: {
        "bin/tool": "binary\n",
        "obj/app.dll": "obj\n",
        ".vs/state": "vs\n",
        "TestResults/result.trx": "trx\n",
        "packages/app/local.json": "nested\n",
      },
    });
    await gitIn(fixture, fixture.primary, ["add", "-f", "local.env"]);
    await gitIn(fixture, fixture.primary, ["commit", "-m", "track local.env"]);
    const output = path.join(fixture.baseDir, "out.zip");
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output,
    });

    expect(paths(plan)).toContain(".env");
    expect(paths(plan)).toContain(".notes");
    expect(paths(plan)).toContain(".claude/settings.local.json");
    expect(paths(plan)).toContain("packages/app/local.json");
    expect(paths(plan)).toContain("debug.log");
    expect(paths(plan)).not.toContain("local.env");
    expect(paths(plan).some((entry) => entry.startsWith("node_modules/"))).toBe(false);
    expect(paths(plan).some((entry) => entry.startsWith("dist/"))).toBe(false);
    expect(paths(plan).some((entry) => entry.startsWith("bin/"))).toBe(false);
    expect(paths(plan).some((entry) => entry.startsWith("obj/"))).toBe(false);
    expect(paths(plan).some((entry) => entry.startsWith(".vs/"))).toBe(false);
    expect(paths(plan).some((entry) => entry.startsWith("TestResults/"))).toBe(false);
    expect(plan.problems).toEqual([]);
    expect(plan.exitCode).toBe(0);
  });

  it("can include build artifacts and apply extra exclusions", async () => {
    fixture = await createRepoFixture({ manifest: null, gitignore: WIDE_GITIGNORE });
    const worktrees = await listWorktrees(fixture.primary);
    const output = path.join(fixture.baseDir, "out.zip");

    const all = await planArchive({ checkoutRoot: fixture.primary, worktrees, output, includeAll: true });
    expect(paths(all)).toContain("node_modules/pkg/index.js");
    expect(paths(all)).toContain("dist/bundle.js");
    expect(paths(all)).toContain("debug.log");

    const filtered = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees,
      output,
      exclude: ["*.log"],
    });
    expect(paths(filtered)).not.toContain("debug.log");
    expect(paths(filtered)).toContain(".env");
  });

  it("returns an empty plan when every ignored path is denylisted", async () => {
    fixture = await createRepoFixture({ manifest: null, gitignore: "node_modules/\n" });
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(plan.entries).toEqual([]);
    expect(plan.problems).toEqual([]);
    expect(plan.exitCode).toBe(0);
  });

  it("dereferences file links and expands directory links from a worktree", async () => {
    fixture = await createRepoFixture({ manifest: null });
    await symlink(path.join(fixture.primary, ".env"), path.join(fixture.worktree, ".env"));
    await symlink(path.join(fixture.primary, ".claude"), path.join(fixture.worktree, ".claude"), "dir");

    const plan = await planArchive({
      checkoutRoot: fixture.worktree,
      worktrees: await listWorktrees(fixture.worktree),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(paths(plan)).toContain(".env");
    expect(paths(plan)).toContain(".claude/settings.local.json");
    expect(plan.problems).toEqual([]);
  });

  it("excludes a pre-existing ignored archive from itself", async () => {
    fixture = await createRepoFixture({ manifest: null, gitignore: WIDE_GITIGNORE });
    const archive = path.join(fixture.primary, "llm-workspace.zip");
    await writeFile(archive, "old archive\n");

    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: archive,
    });

    expect(paths(plan)).not.toContain("llm-workspace.zip");
    expect(paths(plan)).toContain(".env");
  });

  it("reports an external symlink as unsafe while keeping safe entries", async () => {
    fixture = await createRepoFixture({ manifest: null });
    await symlink("/etc/passwd", path.join(fixture.worktree, ".env"));
    await symlink(path.join(fixture.primary, ".notes"), path.join(fixture.worktree, ".notes"));

    const plan = await planArchive({
      checkoutRoot: fixture.worktree,
      worktrees: await listWorktrees(fixture.worktree),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(plan.problems.map((problem) => `${problem.path}:${problem.status}`)).toContain(".env:unsafe");
    expect(paths(plan)).toContain(".notes");
    expect(plan.exitCode).toBe(1);
  });

  it("reports a broken symlink as missing-source", async () => {
    fixture = await createRepoFixture({ manifest: null });
    await symlink(path.join(fixture.baseDir, "does-not-exist"), path.join(fixture.worktree, ".env"));

    const plan = await planArchive({
      checkoutRoot: fixture.worktree,
      worktrees: await listWorktrees(fixture.worktree),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(plan.problems.map((problem) => `${problem.path}:${problem.status}`)).toContain(
      ".env:missing-source",
    );
    expect(plan.exitCode).toBe(1);
  });

  it("stops a directory symlink loop as cyclic", async () => {
    fixture = await createRepoFixture({ manifest: null });
    await symlink(".", path.join(fixture.primary, ".claude", "loop"), "dir");
    await symlink(path.join(fixture.primary, ".claude"), path.join(fixture.worktree, ".claude"), "dir");

    const plan = await planArchive({
      checkoutRoot: fixture.worktree,
      worktrees: await listWorktrees(fixture.worktree),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(plan.problems.map((problem) => `${problem.path}:${problem.status}`)).toContain(
      ".claude/loop:cyclic",
    );
    expect(plan.exitCode).toBe(1);
  });

  it("reports a non-regular target as unsupported", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const fifo = path.join(fixture.primary, ".fifo");
    await execFileAsync("mkfifo", [fifo]);
    await symlink(fifo, path.join(fixture.worktree, ".fifo"));

    const plan = await planArchive({
      checkoutRoot: fixture.worktree,
      worktrees: await listWorktrees(fixture.worktree),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    expect(plan.problems.map((problem) => `${problem.path}:${problem.status}`)).toContain(
      ".fifo:unsupported",
    );
    expect(plan.exitCode).toBe(1);
  });

  it("emits only safe POSIX entry names", async () => {
    fixture = await createRepoFixture({ manifest: null, gitignore: WIDE_GITIGNORE });
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: path.join(fixture.baseDir, "out.zip"),
    });

    for (const entry of plan.entries) {
      expect(path.isAbsolute(entry.path)).toBe(false);
      expect(entry.path.startsWith("./")).toBe(false);
      expect(entry.path.split("/")).not.toContain("..");
      expect(entry.path).not.toContain("\\");
    }
  });
});

describePosix("writeArchive", () => {
  it("streams entries to a zip with contents, mtimes, modes, and owner-only permissions", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.baseDir, "nested", "out.zip");
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: archive,
    });

    await writeArchive(plan);

    const info = await stat(archive);
    expect(info.mode & 0o777).toBe(0o600);

    const sourceInfo = await stat(path.join(fixture.primary, ".env"));
    const entries = await readZipEntries(archive);
    const env = entries.find((entry) => entry.path === ".env");
    expect(env?.contents).toBe("SECRET=1\n");
    expect(env?.mode & 0o777).toBe(sourceInfo.mode & 0o777);
    expect(Math.abs((env?.mtime.getTime() ?? 0) - sourceInfo.mtime.getTime())).toBeLessThan(3000);
  });

  it("protects an existing archive unless forced, and leaves no temporary files", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.baseDir, "out.zip");
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: archive,
    });

    await writeArchive(plan);
    await expect(writeArchive(plan)).rejects.toMatchObject({ code: "ARCHIVE_EXISTS" });
    await writeArchive(plan, { force: true });

    const leftovers = (await readdir(fixture.baseDir)).filter((name) => name.includes(".tmp-"));
    expect(leftovers).toEqual([]);
    expect((await readZipEntries(archive)).map((entry) => entry.path)).toContain(".env");
  });

  it("rejects a directory destination", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.baseDir, "archive-dir");
    await mkdir(archive);
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: archive,
    });

    await expect(assertArchiveDestination(archive, true)).rejects.toMatchObject({
      code: "ARCHIVE_EXISTS",
    });
    await expect(writeArchive(plan, { force: true })).rejects.toBeInstanceOf(ToolError);
  });

  it("removes the temporary file and keeps the previous archive when a source disappears", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.baseDir, "out.zip");
    const worktrees = await listWorktrees(fixture.primary);
    const first = await planArchive({ checkoutRoot: fixture.primary, worktrees, output: archive });
    await writeArchive(first);

    const second = await planArchive({ checkoutRoot: fixture.primary, worktrees, output: archive });
    const envSource = second.entries.find((entry) => entry.path === ".env")?.sourcePath;
    expect(envSource).toBeDefined();
    await unlink(envSource as string);

    await expect(writeArchive(second, { force: true })).rejects.toBeDefined();

    const leftovers = (await readdir(fixture.baseDir)).filter((name) => name.includes(".tmp-"));
    expect(leftovers).toEqual([]);
    expect((await readZipEntries(archive)).map((entry) => entry.path)).toContain(".env");
  });
});

describePosix("archiveCommitWarning", () => {
  it("warns for an archive inside the checkout that git does not ignore", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const plan = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees: await listWorktrees(fixture.primary),
      output: path.join(fixture.primary, "llm-workspace.zip"),
    });

    expect(await archiveCommitWarning(plan)).toContain("not gitignored");
  });

  it("does not warn for an ignored archive or a destination outside the checkout", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const worktrees = await listWorktrees(fixture.primary);

    const ignored = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees,
      output: path.join(fixture.primary, "dist", "out.zip"),
    });
    expect(await archiveCommitWarning(ignored)).toBeNull();

    const outside = await planArchive({
      checkoutRoot: fixture.primary,
      worktrees,
      output: path.join(fixture.baseDir, "out.zip"),
    });
    expect(await archiveCommitWarning(outside)).toBeNull();
  });
});

describe("archive output", () => {
  const plan = {
    checkoutRoot: "/repo",
    archivePath: "/repo/llm-workspace.zip",
    dryRun: false,
    entries: [
      {
        path: ".env",
        sourcePath: "/repo/.env",
        size: 9,
        mtime: new Date(0),
        mode: 0o100644,
      },
    ],
    problems: [
      {
        path: ".external",
        status: "unsafe" as const,
        message: "outside",
      },
    ],
    totalBytes: 9,
    exitCode: 1,
  };

  it("serializes the documented JSON shape with problems separate from entries", () => {
    const payload = JSON.parse(archiveToJson(plan)) as {
      checkout: string;
      archive: string;
      dryRun: boolean;
      entries: { path: string; size: number; status: string }[];
      problems: { path: string; status: string }[];
      summary: { total: number; bytes: number; problems: number };
      exitCode: number;
    };

    expect(payload).toMatchObject({
      checkout: "/repo",
      archive: "/repo/llm-workspace.zip",
      dryRun: false,
      entries: [{ path: ".env", size: 9, status: "archived" }],
      problems: [{ path: ".external", status: "unsafe" }],
      summary: { total: 1, bytes: 9, problems: 1 },
      exitCode: 1,
    });
  });

  it("marks entries as would-archive during a dry run", () => {
    const payload = JSON.parse(archiveToJson({ ...plan, dryRun: true })) as {
      entries: { status: string }[];
    };
    expect(payload.entries[0]?.status).toBe("would-archive");
  });

  it("lists entries, problems, and a summary in human output", () => {
    const text = formatArchive(plan);
    expect(text).toContain("checkout: /repo");
    expect(text).toContain("archive:  /repo/llm-workspace.zip");
    expect(text).toContain("+ .env");
    expect(text).toContain("! .external  unsafe");
    expect(text).toContain("1 file (9 B), 1 problem");
  });
});
