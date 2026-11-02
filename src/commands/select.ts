import path from "node:path";

import { createExcludeMatcher } from "../core/excludes.js";
import { ToolError } from "../core/errors.js";
import { getCheckoutRoot, listIgnoredEntries, listWorktrees, type IgnoredEntry } from "../core/git.js";
import {
  appendEntries,
  MANIFEST_FILENAME,
  manifestPath,
  normalizeKey,
  readManifest,
} from "../core/manifest.js";
import { resolveSource } from "../core/source.js";
import type { SelectOptions } from "../core/types.js";
import { confirmSelection, pickCandidates } from "../ui/picker.js";

function displayCandidate(candidate: IgnoredEntry): string {
  return candidate.isDirectory ? `${candidate.path}/` : candidate.path;
}

interface AddResult {
  status: "existing" | "added";
  path: string;
}

function resolveAdd(
  raw: string,
  candidates: IgnoredEntry[],
  existingKeys: Set<string>,
  matcher: (entryPath: string, isDirectory?: boolean) => boolean,
  destinationRoot: string,
): AddResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ToolError("USAGE", "--add received an empty path.");
  }

  const isDirectory = /\/+$/.test(trimmed);
  const entryPath = isDirectory ? trimmed.replace(/\/+$/, "") : trimmed;
  if (!entryPath) {
    throw new ToolError("USAGE", "--add received an empty path.");
  }

  const key = normalizeKey(entryPath, destinationRoot);
  if (key === "" || key === ".." || key.startsWith("../") || path.isAbsolute(key)) {
    throw new ToolError("INVALID_ARGUMENT", `"${raw}" must be relative to the checkout root.`);
  }
  if (key === ".git" || key.startsWith(".git/")) {
    throw new ToolError("INVALID_ARGUMENT", `"${raw}" points at the .git directory.`);
  }
  if (existingKeys.has(key)) {
    return { status: "existing", path: entryPath };
  }
  if (matcher(entryPath, isDirectory)) {
    throw new ToolError(
      "INVALID_ARGUMENT",
      `"${entryPath}" is excluded by the build-artifact denylist.`,
      "Pass --no-default-excludes to disable the built-in list, or --exclude to adjust it.",
    );
  }

  const candidate = candidates.find(
    (item) => item.path === entryPath || normalizeKey(item.path, destinationRoot) === key,
  );
  if (!candidate) {
    throw new ToolError(
      "INVALID_ARGUMENT",
      `"${entryPath}" is not a gitignored candidate in the source checkout.`,
      "It may be tracked by git, not ignored, or outside the checkout.",
    );
  }

  return { status: "added", path: displayCandidate(candidate) };
}

export async function runSelect(options: SelectOptions): Promise<number> {
  if (options.all && options.add && options.add.length > 0) {
    throw new ToolError("USAGE", "--all and --add cannot be used together.");
  }

  const destinationRoot = await getCheckoutRoot(process.cwd());
  const manifest = await readManifest(destinationRoot);
  const worktrees = await listWorktrees(destinationRoot);
  const sourceRoot = await resolveSource({
    from: options.from,
    destinationRoot,
    worktrees,
    allowSameRoot: true,
  });

  const matcher = createExcludeMatcher({
    useDefaults: options.useDefaultExcludes !== false,
    extraPatterns: options.exclude ?? [],
  });

  const ignored = await listIgnoredEntries(sourceRoot, { collapsed: !options.expand });
  const existingKeys = new Set(
    manifest.entries.map((entry) => normalizeKey(entry.path, destinationRoot)),
  );
  const manifestKey = normalizeKey(MANIFEST_FILENAME, destinationRoot);

  const candidates = ignored
    .filter((candidate) => {
      const key = normalizeKey(candidate.path, destinationRoot);
      return key !== manifestKey && !existingKeys.has(key) && !matcher(candidate.path, candidate.isDirectory);
    })
    .sort(
      (left, right) =>
        Number(right.isDirectory) - Number(left.isDirectory) || left.path.localeCompare(right.path),
    );

  const chosen: string[] = [];
  const alreadyListed: string[] = [];

  if (options.all) {
    chosen.push(...candidates.map(displayCandidate));
  } else if (options.add && options.add.length > 0) {
    for (const raw of options.add) {
      const result = resolveAdd(raw, candidates, existingKeys, matcher, destinationRoot);
      if (result.status === "existing") {
        alreadyListed.push(result.path);
        continue;
      }
      chosen.push(result.path);
      existingKeys.add(normalizeKey(result.path, destinationRoot));
    }
  } else {
    if (!process.stdin.isTTY) {
      throw new ToolError(
        "SELECT_NON_INTERACTIVE",
        "select needs an interactive terminal.",
        'Use "symlink-git-ignored select --all" or "symlink-git-ignored select --add <path>...".',
      );
    }
    if (candidates.length === 0) {
      process.stdout.write(`No new gitignored candidates in ${sourceRoot}.\n`);
      return 0;
    }

    const picked = await pickCandidates(candidates);
    if (picked.length === 0) {
      process.stdout.write("Nothing selected.\n");
      return 0;
    }

    const confirmed = await confirmSelection(picked.length);
    if (!confirmed) {
      process.stdout.write("Nothing selected.\n");
      return 130;
    }

    for (const pickedPath of picked) {
      const candidate = candidates.find((item) => item.path === pickedPath);
      chosen.push(candidate ? displayCandidate(candidate) : pickedPath);
    }
  }

  if (chosen.length === 0) {
    if (alreadyListed.length > 0) {
      process.stdout.write(`Nothing new to add; already listed: ${[...new Set(alreadyListed)].join(", ")}\n`);
    } else {
      process.stdout.write(`No new gitignored candidates in ${sourceRoot}.\n`);
    }
    return 0;
  }

  const result = await appendEntries(destinationRoot, chosen);
  process.stdout.write(
    `Added ${result.added.length} ${result.added.length === 1 ? "entry" : "entries"} to ${manifestPath(destinationRoot)}:\n`,
  );
  for (const added of result.added) {
    process.stdout.write(`  + ${added}\n`);
  }
  if (alreadyListed.length > 0) {
    process.stdout.write(`Already listed: ${[...new Set(alreadyListed)].join(", ")}\n`);
  }
  if (result.skipped.length > 0) {
    process.stdout.write(`Skipped (already in the manifest): ${[...new Set(result.skipped)].join(", ")}\n`);
  }
  process.stdout.write(
    "The manifest is tracked by git: commit it so other worktrees pick these entries up.\n",
  );

  return 0;
}
