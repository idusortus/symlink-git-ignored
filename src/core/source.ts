import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { ToolError } from "./errors.js";
import type { WorktreeInfo } from "./git.js";

export interface ResolveSourceOptions {
  from?: string;
  destinationRoot: string;
  worktrees: WorktreeInfo[];
  /** Allow the current checkout to also be the source (used by `select`). */
  allowSameRoot?: boolean;
}

export async function resolveSource(options: ResolveSourceOptions): Promise<string> {
  let candidate: string;

  if (options.from) {
    candidate = path.resolve(options.from);
  } else {
    const primary = options.worktrees[0];
    if (!primary) {
      throw new ToolError(
        "SOURCE_MISSING",
        "No git worktrees were found for this repository.",
        "Pass --from <path> to choose the checkout that holds the real files.",
      );
    }
    if (primary.bare) {
      throw new ToolError(
        "SOURCE_BARE",
        "The primary git worktree is a bare repository, so it has no files to link.",
        "Pass --from <path> pointing at a non-bare checkout.",
      );
    }
    candidate = primary.path;
  }

  let resolved: string;
  try {
    resolved = await realpath(candidate);
  } catch {
    throw new ToolError(
      "SOURCE_MISSING",
      `Source checkout not found: ${candidate}`,
      "Pass --from <path> to choose the checkout that holds the real files.",
    );
  }

  const sourceStat = await stat(resolved).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new ToolError(
      "SOURCE_MISSING",
      `Source checkout is not a directory: ${candidate}`,
      "Pass --from <path> to choose the checkout that holds the real files.",
    );
  }

  const matchingWorktree = options.worktrees.find((worktree) => path.resolve(worktree.path) === path.resolve(candidate));
  const bareWorktree = options.worktrees.find((worktree) => worktree.bare && resolved === path.resolve(worktree.path));
  if (matchingWorktree?.bare || bareWorktree) {
    throw new ToolError(
      "SOURCE_BARE",
      "The selected source checkout is a bare repository, so it has no files to link.",
      "Pass --from <path> pointing at a non-bare checkout.",
    );
  }

  const destinationReal = await realpath(options.destinationRoot).catch(() => path.resolve(options.destinationRoot));
  if (resolved === destinationReal && !options.allowSameRoot) {
    throw new ToolError(
      "SOURCE_IS_DESTINATION",
      "The source checkout is the current checkout, so there is nothing to link.",
      "Run this command inside a linked worktree, or pass --from <path> pointing at another checkout.",
    );
  }

  return resolved;
}
