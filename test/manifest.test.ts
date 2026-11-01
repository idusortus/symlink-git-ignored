import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendEntries,
  MANIFEST_FILENAME,
  MANIFEST_HEADER,
  manifestPath,
  parseManifest,
  readManifest,
  validateManifest,
} from "../src/core/manifest.js";
import type { ManifestEntry } from "../src/core/types.js";

const temporaryDirectories: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "sgi-manifest-"));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("parseManifest", () => {
  it("skips comments and blank lines, trims, and strips a trailing slash", () => {
    const entries = parseManifest("# comment\n\n  .env  \n.claude/\nfoo#bar\n");

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ path: ".env", isDirectory: false, line: 3 });
    expect(entries[1]).toMatchObject({ path: ".claude", isDirectory: true, line: 4 });
    expect(entries[2]).toMatchObject({ path: "foo#bar", isDirectory: false, line: 5 });
  });

  it("handles CRLF text and indented entries", () => {
    const entries = parseManifest("  .env\r\n\t.claude/\r\n");
    expect(entries.map((entry) => entry.path)).toEqual([".env", ".claude"]);
    expect(entries[1]?.isDirectory).toBe(true);
  });

  it("ignores a bare slash", () => {
    expect(parseManifest("/\n")).toEqual([]);
  });
});

describe("validateManifest", () => {
  const entry = (value: string, line: number, isDirectory = value.endsWith("/")): ManifestEntry => ({
    raw: value.replace(/\/+$/, ""),
    path: value.replace(/\/+$/, ""),
    isDirectory,
    line,
  });

  it("rejects absolute paths, parent segments, and paths inside .git", () => {
    const root = "/tmp/checkout";
    const result = validateManifest(
      [
        entry("/etc/passwd", 1),
        entry("a/../b", 2),
        entry("../outside", 3),
        entry(".git/config", 4),
      ],
      root,
    );

    expect(result.linkable).toEqual([]);
    expect(result.problems.map((problem) => problem.status)).toEqual([
      "invalid",
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(result.problems[0]?.message).toContain("relative");
    expect(result.problems[1]?.message).toContain("..");
    expect(result.problems[3]?.message).toContain(".git");
  });

  it("keeps the first duplicate and marks the later line invalid", () => {
    const result = validateManifest([entry(".env", 1), entry(".env", 2)], "/tmp/checkout");

    expect(result.linkable).toHaveLength(1);
    expect(result.linkable[0]?.line).toBe(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ line: 2, status: "invalid" });
    expect(result.problems[0]?.message).toContain("Duplicate");
  });

  it("shadows nested entries behind their ancestor", () => {
    const result = validateManifest(
      [entry(".claude/", 1), entry(".claude/settings.local.json", 2)],
      "/tmp/checkout",
    );

    expect(result.linkable.map((item) => item.path)).toEqual([".claude"]);
    expect(result.problems[0]).toMatchObject({ line: 2, status: "shadowed" });
    expect(result.problems[0]?.message).toContain(".claude");
  });
});

describe("readManifest", () => {
  it("reports a missing manifest without throwing", async () => {
    const root = await makeRoot();
    const manifest = await readManifest(root);

    expect(manifest).toEqual({ exists: false, text: "", entries: [] });
    expect(manifestPath(root)).toBe(path.join(root, MANIFEST_FILENAME));
  });

  it("parses an existing manifest", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, MANIFEST_FILENAME), ".env\n");
    const manifest = await readManifest(root);

    expect(manifest.exists).toBe(true);
    expect(manifest.entries).toHaveLength(1);
  });
});

describe("appendEntries", () => {
  it("creates the file with a header when it does not exist", async () => {
    const root = await makeRoot();
    const result = await appendEntries(root, [".env"]);

    expect(result.added).toEqual([".env"]);
    const text = await readFile(path.join(root, MANIFEST_FILENAME), "utf8");
    expect(text).toBe(`${MANIFEST_HEADER}\n.env\n`);
  });

  it("preserves comments, skips duplicates, and appends sorted entries", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, MANIFEST_FILENAME), "# keep me\n.env\n");

    const result = await appendEntries(root, [".notes", ".env", ".claude/"]);

    expect(result.added).toEqual([".claude/", ".notes"]);
    expect(result.skipped).toEqual([".env"]);
    expect(await readFile(path.join(root, MANIFEST_FILENAME), "utf8")).toBe(
      "# keep me\n.env\n.claude/\n.notes\n",
    );
  });

  it("writes nothing when every entry is already listed", async () => {
    const root = await makeRoot();
    const manifestFile = path.join(root, MANIFEST_FILENAME);
    await writeFile(manifestFile, ".env\n");
    const before = await readFile(manifestFile, "utf8");

    const result = await appendEntries(root, [".env"]);

    expect(result.added).toEqual([]);
    expect(await readFile(manifestFile, "utf8")).toBe(before);
  });
});
