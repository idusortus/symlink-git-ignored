import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Manifest, ManifestEntry, ManifestProblem } from "./types.js";
import { ToolError } from "./errors.js";

export const MANIFEST_FILENAME = ".llm-files";
export const MANIFEST_HEADER = "# Paths to link from the source checkout into worktrees. Managed by symlink-git-ignored.";

export interface ValidatedManifest {
  entries: ManifestEntry[];
  linkable: ManifestEntry[];
  problems: ManifestProblem[];
}

export function manifestPath(root: string): string {
  return path.join(root, MANIFEST_FILENAME);
}

export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const isDirectory = /\/+$/.test(trimmed);
    const entryPath = isDirectory ? trimmed.replace(/\/+$/, "") : trimmed;
    if (!entryPath) {
      continue;
    }
    entries.push({
      raw: entryPath,
      path: entryPath,
      isDirectory,
      line: index + 1,
    });
  }

  return entries;
}

export async function readManifest(root: string): Promise<Manifest> {
  try {
    const text = await readFile(manifestPath(root), "utf8");
    return { exists: true, text, entries: parseManifest(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, text: "", entries: [] };
    }
    throw error;
  }
}

export async function requireManifest(root: string): Promise<Manifest> {
  const manifest = await readManifest(root);
  if (!manifest.exists) {
    throw new ToolError(
      "MANIFEST_MISSING",
      `No .llm-files found at ${manifestPath(root)}.`,
      'Run "symlink-git-ignored select" in this checkout to create it.',
    );
  }
  return manifest;
}

/** Normalize a manifest path into a POSIX-style key relative to the checkout root. */
export function normalizeKey(entryPath: string, root: string): string {
  const resolved = path.resolve(root, entryPath);
  const relative = path.relative(path.resolve(root), resolved);
  return relative.split(path.sep).join("/");
}

function isAbsolutePath(entryPath: string): boolean {
  return (
    entryPath.startsWith("/") ||
    entryPath.startsWith("\\\\") ||
    /^[A-Za-z]:[\\/]/.test(entryPath)
  );
}

export function validateManifest(entries: ManifestEntry[], root: string): ValidatedManifest {
  const problems: ManifestProblem[] = [];
  const accepted: { entry: ManifestEntry; key: string }[] = [];
  const seen = new Map<string, ManifestEntry>();
  const rootPath = path.resolve(root);

  for (const entry of entries) {
    if (isAbsolutePath(entry.path)) {
      problems.push({
        line: entry.line,
        path: entry.path,
        status: "invalid",
        message: "Path must be relative to the checkout root.",
      });
      continue;
    }

    if (entry.path.split(/[\\/]/).includes("..")) {
      problems.push({
        line: entry.line,
        path: entry.path,
        status: "invalid",
        message: "Path must not contain a '..' segment.",
      });
      continue;
    }

    const key = normalizeKey(entry.path, rootPath);
    if (
      key === "" ||
      key === ".." ||
      key.startsWith("../") ||
      path.isAbsolute(key)
    ) {
      problems.push({
        line: entry.line,
        path: entry.path,
        status: "invalid",
        message: "Path resolves outside the checkout root.",
      });
      continue;
    }

    if (key === ".git" || key.startsWith(".git/")) {
      problems.push({
        line: entry.line,
        path: entry.path,
        status: "invalid",
        message: "Path must not point at or inside the .git directory.",
      });
      continue;
    }

    const first = seen.get(key);
    if (first) {
      problems.push({
        line: entry.line,
        path: entry.path,
        status: "invalid",
        message: `Duplicate entry (first listed on line ${first.line}).`,
      });
      continue;
    }

    seen.set(key, entry);
    accepted.push({ entry, key });
  }

  const acceptedByDepth = [...accepted].sort(
    (left, right) => left.key.split("/").length - right.key.split("/").length,
  );
  const shadowedLines = new Set<number>();
  for (let index = 0; index < acceptedByDepth.length; index += 1) {
    const candidate = acceptedByDepth[index];
    if (!candidate) {
      continue;
    }
    for (let ancestorIndex = 0; ancestorIndex < index; ancestorIndex += 1) {
      const ancestor = acceptedByDepth[ancestorIndex];
      if (!ancestor) {
        continue;
      }
      if (candidate.key.startsWith(`${ancestor.key}/`)) {
        shadowedLines.add(candidate.entry.line);
        problems.push({
          line: candidate.entry.line,
          path: candidate.entry.path,
          status: "shadowed",
          message: `Already covered by directory entry "${ancestor.entry.path}" on line ${ancestor.entry.line}.`,
        });
        break;
      }
    }
  }

  const problemLines = new Set(problems.map((problem) => problem.line));
  const linkable = entries.filter((entry) => !problemLines.has(entry.line));
  problems.sort((left, right) => left.line - right.line);

  return { entries, linkable, problems };
}

export interface AppendResult {
  added: string[];
  skipped: string[];
}

/** Append new entries to `.llm-files`, writing atomically through a temp file + rename. */
export async function appendEntries(root: string, paths: string[]): Promise<AppendResult> {
  const file = manifestPath(root);
  let existingText = "";
  try {
    existingText = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const existingKeys = new Set(parseManifest(existingText).map((entry) => normalizeKey(entry.path, root)));
  const added: string[] = [];
  const skipped: string[] = [];

  for (const rawPath of paths) {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      continue;
    }
    const isDirectory = /\/+$/.test(trimmed);
    const entryPath = isDirectory ? trimmed.replace(/\/+$/, "") : trimmed;
    if (!entryPath) {
      continue;
    }
    const key = normalizeKey(entryPath, root);
    if (existingKeys.has(key)) {
      skipped.push(entryPath);
      continue;
    }
    existingKeys.add(key);
    added.push(isDirectory ? `${entryPath}/` : entryPath);
  }

  if (added.length === 0) {
    return { added, skipped };
  }

  added.sort((left, right) => left.replace(/\/+$/, "").localeCompare(right.replace(/\/+$/, "")));

  const lines: string[] = [];
  if (existingText.length === 0) {
    lines.push(MANIFEST_HEADER);
  } else {
    const normalized = existingText.endsWith("\n") ? existingText : `${existingText}\n`;
    lines.push(normalized.replace(/\n$/, ""));
  }
  lines.push(added.join("\n"));

  const nextText = `${lines.join("\n")}\n`;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, nextText, { encoding: "utf8", mode: 0o644 });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  return { added, skipped };
}
