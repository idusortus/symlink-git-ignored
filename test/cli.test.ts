import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createRepoFixture, gitIn, runCli, type Fixture } from "./helpers/repo.js";
import { readZipEntries } from "./helpers/zip.js";

let fixture: Fixture | undefined;

const describePosix = describe.skipIf(process.platform === "win32");

afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

const isSymlink = async (target: string): Promise<boolean> =>
  (await lstat(target).catch(() => null))?.isSymbolicLink() ?? false;

const linkPath = (relativePath: string): string => path.join(fixture?.worktree ?? "", relativePath);

describePosix("link", () => {
  it("creates relative links for files and directories, then is idempotent", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, []);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("linked");

    expect(await isSymlink(linkPath(".env"))).toBe(true);
    expect(await readlink(linkPath(".env"))).toBe("../primary/.env");
    expect(await readFile(linkPath(".env"), "utf8")).toBe("SECRET=1\n");

    expect(await isSymlink(linkPath(".claude"))).toBe(true);
    expect(await readlink(linkPath(".claude"))).toBe("../primary/.claude");
    expect(await readFile(linkPath(".claude/settings.local.json"), "utf8")).toBe('{"local":true}\n');

    const again = await runCli(fixture, ["link"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("already-linked");
    expect(again.stdout).not.toContain("occupied");
  });

  it("creates nothing during a dry run", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["--dry-run"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("will-link");
    expect(await isSymlink(linkPath(".env"))).toBe(false);
    expect(await isSymlink(linkPath(".claude"))).toBe(false);
  });

  it("leaves an existing destination alone by default", async () => {
    fixture = await createRepoFixture();
    await writeFile(linkPath(".env"), "LOCAL=1\n");

    const result = await runCli(fixture, ["link"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("occupied");
    expect(await readFile(linkPath(".env"), "utf8")).toBe("LOCAL=1\n");
  });

  it("backs up an existing destination when asked", async () => {
    fixture = await createRepoFixture();
    await writeFile(linkPath(".env"), "LOCAL=1\n");

    const result = await runCli(fixture, ["link", "--backup"]);
    expect(result.code).toBe(0);
    expect(await isSymlink(linkPath(".env"))).toBe(true);

    const backups = (await readdir(fixture.worktree)).filter((name) => name.startsWith(".env.bak-"));
    expect(backups).toHaveLength(1);
    expect(await readFile(path.join(fixture.worktree, backups[0] ?? ""), "utf8")).toBe("LOCAL=1\n");
  });

  it("replaces an existing destination with --force", async () => {
    fixture = await createRepoFixture();
    await writeFile(linkPath(".env"), "LOCAL=1\n");

    const result = await runCli(fixture, ["link", "--force"]);
    expect(result.code).toBe(0);
    expect(await isSymlink(linkPath(".env"))).toBe(true);
  });

  it("rejects --force together with --backup", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["link", "--force", "--backup"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cannot be used together");
  });

  it("links the rest of the manifest and exits 1 when a source is missing", async () => {
    fixture = await createRepoFixture({ manifest: ".env\n.claude/\n.notes\n" });
    await unlink(path.join(fixture.primary, ".notes"));

    const result = await runCli(fixture, ["link"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("missing-source");
    expect(await isSymlink(linkPath(".env"))).toBe(true);
    expect(await isSymlink(linkPath(".notes"))).toBe(false);
  });

  it("refuses to run inside the source checkout", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["link"], { cwd: fixture.primary });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("current checkout");
  });

  it("keeps list refusing the source checkout", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["list"], { cwd: fixture.primary });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("current checkout");
  });

  it("fails outside a git working tree", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["link"], { cwd: fixture.home });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Not a git repository");
  });

  it("reports a missing manifest with a hint", async () => {
    fixture = await createRepoFixture({ manifest: null });

    const result = await runCli(fixture, ["link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(".llm-files");
    expect(result.stderr).toContain("select");
  });

  it("links from an explicit --from checkout", async () => {
    fixture = await createRepoFixture();
    const alternate = path.join(fixture.baseDir, "alternate");
    await gitIn(fixture, fixture.primary, ["worktree", "add", alternate, "-b", "alternate"]);
    await writeFile(path.join(alternate, ".env"), "ALT=1\n");
    await mkdir(path.join(alternate, ".claude"), { recursive: true });
    await writeFile(path.join(alternate, ".claude", "settings.local.json"), '{"alt":true}\n');

    const result = await runCli(fixture, ["link", "--from", alternate]);
    expect(result.code).toBe(0);
    expect(await readlink(linkPath(".env"))).toBe("../alternate/.env");
    expect(await readFile(linkPath(".env"), "utf8")).toBe("ALT=1\n");
  });

  it("links a manifest entry even when the denylist would hide it from select", async () => {
    fixture = await createRepoFixture({ manifest: ".env\n.cache/\n" });

    const result = await runCli(fixture, ["link"]);
    expect(result.code).toBe(0);
    expect(await isSymlink(linkPath(".cache"))).toBe(true);
  });

  it("treats an empty manifest as a successful no-op", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["link"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing to link");
  });

  it("emits the documented JSON shape", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["link", "--json"]);
    expect(result.code).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      source: string;
      destination: string;
      entries: { path: string; status: string; target?: string }[];
      summary: { total: number; byStatus: Record<string, number>; failures: number };
    };

    expect(payload.source).toBe(await realpath(fixture.primary));
    expect(payload.destination).toBe(await realpath(fixture.worktree));
    expect(payload.entries.map((entry) => entry.status)).toEqual(["linked", "linked"]);
    expect(payload.entries[0]?.target).toBe("../primary/.env");
    expect(payload.summary).toMatchObject({ total: 2, failures: 0 });
    expect(payload.summary.byStatus.linked).toBe(2);
  });
});

describePosix("list", () => {
  it("reports not-linked before linking and linked afterwards", async () => {
    fixture = await createRepoFixture();

    const before = await runCli(fixture, ["list", "--json"]);
    expect(before.code).toBe(0);
    const beforePayload = JSON.parse(before.stdout) as { entries: { status: string }[] };
    expect(beforePayload.entries.map((entry) => entry.status)).toEqual(["not-linked", "not-linked"]);

    expect((await runCli(fixture, ["link"])).code).toBe(0);

    const after = await runCli(fixture, ["list"]);
    expect(after.code).toBe(0);
    expect(after.stdout).toContain("linked");
    expect(after.stdout).not.toContain("not-linked");
  });
});

describePosix("select", () => {
  it("appends a specific gitignored path", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["select", "--add", ".env"]);
    expect(result.code).toBe(0);
    expect(await readFile(linkPath(".llm-files"), "utf8")).toContain(".env");
  });

  it("adds every candidate while keeping build artifacts out", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["select", "--all"]);
    expect(result.code).toBe(0);

    const text = await readFile(linkPath(".llm-files"), "utf8");
    expect(text).toContain(".env");
    expect(text).toContain(".notes");
    expect(text).toContain(".claude/");
    expect(text).not.toContain("node_modules");
    expect(text).not.toContain("dist");
    expect(text).not.toContain(".cache");

    const again = await runCli(fixture, ["select", "--all"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("No new gitignored candidates");
  });

  it("rejects tracked paths", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["select", "--add", ".llm-files"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not a gitignored candidate");
  });

  it("rejects denylisted paths, unless the denylist is disabled", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const rejected = await runCli(fixture, ["select", "--add", "node_modules"]);
    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toContain("denylist");

    const allowed = await runCli(fixture, ["select", "--add", "node_modules", "--no-default-excludes"]);
    expect(allowed.code).toBe(0);
    expect(await readFile(linkPath(".llm-files"), "utf8")).toContain("node_modules/");
  });

  it("creates the manifest when it does not exist yet", async () => {
    fixture = await createRepoFixture({ manifest: null });

    const result = await runCli(fixture, ["select", "--add", ".env"]);
    expect(result.code).toBe(0);

    const text = await readFile(linkPath(".llm-files"), "utf8");
    expect(text.startsWith("#")).toBe(true);
    expect(text).toContain(".env");
    expect(await readFile(path.join(fixture.primary, ".llm-files"), "utf8").catch(() => null)).toBeNull();

    expect((await runCli(fixture, ["link"])).code).toBe(0);
  });

  it("creates the manifest in the primary checkout with no linked worktree", async () => {
    fixture = await createRepoFixture({ manifest: null, worktree: false });

    const result = await runCli(fixture, ["select", "--add", ".env"], { cwd: fixture.primary });
    expect(result.code).toBe(0);

    const text = await readFile(path.join(fixture.primary, ".llm-files"), "utf8");
    expect(text.startsWith("#")).toBe(true);
    expect(text).toContain(".env");
  });

  it("writes to the primary checkout when run there, even with a linked worktree", async () => {
    fixture = await createRepoFixture({ manifest: null });

    const result = await runCli(fixture, ["select", "--add", ".env"], { cwd: fixture.primary });
    expect(result.code).toBe(0);

    expect(await readFile(path.join(fixture.primary, ".llm-files"), "utf8")).toContain(".env");
    expect(await readFile(linkPath(".llm-files"), "utf8").catch(() => null)).toBeNull();
  });

  it("rejects paths outside the checkout", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["select", "--add", "../outside"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("relative to the checkout root");
  });

  it("can add a single file inside a wholly ignored directory with --expand", async () => {
    fixture = await createRepoFixture({ manifest: "" });

    const result = await runCli(fixture, ["select", "--expand", "--add", ".claude/settings.local.json"]);
    expect(result.code).toBe(0);
    expect(await readFile(linkPath(".llm-files"), "utf8")).toContain(".claude/settings.local.json");
  });

  it("fails with guidance when stdin is not a terminal", async () => {
    fixture = await createRepoFixture();

    const result = await runCli(fixture, ["select"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("interactive terminal");
    expect(result.stderr).toContain("--all");
  });
});

describePosix("archive", () => {
  it("writes the default zip without a manifest, from a subdirectory, and refuses outside git", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.primary, "llm-workspace.zip");

    const result = await runCli(fixture, ["archive"], { cwd: fixture.primary });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("checkout:");
    expect(result.stdout).toContain("archive:");

    const entries = await readZipEntries(archive);
    const entryPaths = entries.map((entry) => entry.path);
    expect(entryPaths).toContain(".env");
    expect(entryPaths).toContain(".claude/settings.local.json");
    expect(entryPaths.some((entryPath) => entryPath.startsWith("node_modules/"))).toBe(false);
    expect(entryPaths.some((entryPath) => entryPath.startsWith("dist/"))).toBe(false);

    await mkdir(path.join(fixture.primary, "packages", "app"), { recursive: true });
    const nested = await runCli(fixture, ["archive", "--force"], {
      cwd: path.join(fixture.primary, "packages", "app"),
    });
    expect(nested.code).toBe(0);
    expect(await readZipEntries(archive)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ".env" })]),
    );

    const outside = await runCli(fixture, ["archive"], { cwd: fixture.home });
    expect(outside.code).toBe(1);
    expect(outside.stderr).toContain("Not a git repository");
  });

  it("supports custom output, overwrite protection, force, dry run, and JSON", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const output = path.join(fixture.baseDir, "custom.zip");

    const first = await runCli(fixture, ["archive", "--output", output], { cwd: fixture.primary });
    expect(first.code).toBe(0);
    expect((await readZipEntries(output)).map((entry) => entry.path)).toContain(".env");

    const refused = await runCli(fixture, ["archive", "--output", output], { cwd: fixture.primary });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("already exists");

    const forced = await runCli(fixture, ["archive", "--output", output, "--force"], {
      cwd: fixture.primary,
    });
    expect(forced.code).toBe(0);

    const dryOutput = path.join(fixture.baseDir, "dry.zip");
    const dry = await runCli(fixture, ["archive", "--output", dryOutput, "--dry-run"], {
      cwd: fixture.primary,
    });
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("dry run:");
    expect(await lstat(dryOutput).catch(() => null)).toBeNull();

    const jsonOutput = path.join(fixture.baseDir, "json.zip");
    const json = await runCli(fixture, ["archive", "--output", jsonOutput, "--json"], {
      cwd: fixture.primary,
    });
    expect(json.code).toBe(0);
    const payload = JSON.parse(json.stdout) as {
      checkout: string;
      archive: string;
      dryRun: boolean;
      entries: { path: string; size: number; status: string }[];
      problems: unknown[];
      summary: { total: number; bytes: number; problems: number };
      exitCode: number;
    };
    expect(payload).toMatchObject({
      archive: jsonOutput,
      dryRun: false,
      exitCode: 0,
    });
    expect(payload.entries.map((entry) => entry.path)).toContain(".env");
    expect(payload.problems).toEqual([]);
  });

  it("supports include-all, extra exclusions, empty results, and worktree links", async () => {
    fixture = await createRepoFixture({ manifest: null });

    const allOutput = path.join(fixture.baseDir, "all.zip");
    const all = await runCli(fixture, ["archive", "--include-all", "--output", allOutput], {
      cwd: fixture.primary,
    });
    expect(all.code).toBe(0);
    expect((await readZipEntries(allOutput)).map((entry) => entry.path)).toContain(
      "node_modules/pkg/index.js",
    );

    const filteredOutput = path.join(fixture.baseDir, "filtered.zip");
    const filtered = await runCli(
      fixture,
      ["archive", "--exclude", "*.log", "--output", filteredOutput],
      { cwd: fixture.primary },
    );
    expect(filtered.code).toBe(0);
    expect((await readZipEntries(filteredOutput)).map((entry) => entry.path)).not.toContain(
      "debug.log",
    );

    await fixture.cleanup();
    fixture = await createRepoFixture({ manifest: null, gitignore: "node_modules/\n" });
    const emptyOutput = path.join(fixture.baseDir, "empty.zip");
    const empty = await runCli(fixture, ["archive", "--output", emptyOutput], {
      cwd: fixture.primary,
    });
    expect(empty.code).toBe(0);
    expect(empty.stdout).toContain("Nothing to archive");
    expect(await lstat(emptyOutput).catch(() => null)).toBeNull();

    await symlink(path.join(fixture.primary, ".claude"), path.join(fixture.worktree, ".claude"), "dir");
    await symlink(path.join(fixture.primary, ".env"), path.join(fixture.worktree, ".env"));
    const worktreeOutput = path.join(fixture.baseDir, "worktree.zip");
    const worktree = await runCli(fixture, ["archive", "--output", worktreeOutput], {
      cwd: fixture.worktree,
    });
    expect(worktree.code).toBe(0);
    const worktreeEntries = await readZipEntries(worktreeOutput);
    expect(worktreeEntries.map((entry) => entry.path)).toContain(".claude/settings.local.json");
    expect(worktreeEntries.find((entry) => entry.path === ".env")?.contents).toBe("SECRET=1\n");
  });

  it("writes an owner-only zip and warns only when the archive is committable", async () => {
    fixture = await createRepoFixture({ manifest: null });
    const archive = path.join(fixture.primary, "llm-workspace.zip");

    const result = await runCli(fixture, ["archive"], { cwd: fixture.primary });
    expect(result.code).toBe(0);
    expect((await stat(archive)).mode & 0o777).toBe(0o600);
    expect(result.stderr).toContain("not gitignored");
    expect(result.stdout).not.toContain("not gitignored");

    await writeFile(path.join(fixture.primary, ".gitignore"), `${await readFile(path.join(fixture.primary, ".gitignore"), "utf8")}llm-workspace.zip\n`);
    const ignored = await runCli(fixture, ["archive", "--force"], { cwd: fixture.primary });
    expect(ignored.code).toBe(0);
    expect(ignored.stderr).not.toContain("not gitignored");

    const json = await runCli(fixture, ["archive", "--json", "--force"], { cwd: fixture.primary });
    expect(json.code).toBe(0);
    expect(() => JSON.parse(json.stdout)).not.toThrow();
    expect(json.stdout).not.toContain("warning:");
  });
});
