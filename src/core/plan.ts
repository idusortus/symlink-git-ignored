import { lstat, readlink, realpath } from "node:fs/promises";
import path from "node:path";

import type { BuildPlanOptions, ManifestEntry, ManifestProblem, Plan, PlanEntry } from "./types.js";

const FAILING_STATUSES = new Set(["missing-source", "invalid", "unsafe"]);

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Walk up to the deepest existing ancestor of `destinationPath` and verify that it
 * really resolves inside `destinationRoot`. Returns the offending real path, or null.
 */
export async function findContainmentViolation(
  destinationPath: string,
  destinationRoot: string,
): Promise<string | null> {
  const rootReal = await realpath(destinationRoot).catch(() => path.resolve(destinationRoot));
  let current = path.dirname(destinationPath);

  for (;;) {
    let exists = false;
    try {
      await lstat(current);
      exists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (exists) {
      let ancestorReal: string;
      try {
        ancestorReal = await realpath(current);
      } catch {
        // A broken symlinked parent would redirect writes somewhere unpredictable.
        return current;
      }
      return isInside(rootReal, ancestorReal) ? null : ancestorReal;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function displayPath(entry: ManifestEntry): string {
  return entry.isDirectory ? `${entry.path}/` : entry.path;
}

function missingSource(entry: ManifestEntry, message: string): PlanEntry {
  return {
    path: displayPath(entry),
    status: "missing-source",
    action: "skip",
    isDirectory: entry.isDirectory,
    message,
  };
}

async function lstatOrNull(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return null;
    }
    throw error;
  }
}

interface EntryContext {
  sourceRoot: string;
  destinationRoot: string;
  mode: BuildPlanOptions["mode"];
  dryRun: boolean;
  force: boolean;
  backup: boolean;
}

async function planEntry(entry: ManifestEntry, context: EntryContext): Promise<PlanEntry> {
  const sourcePath = path.join(context.sourceRoot, entry.path);
  const destinationPath = path.join(context.destinationRoot, entry.path);

  const sourceStat = await lstatOrNull(sourcePath);
  if (!sourceStat) {
    return missingSource(entry, `No such path in the source checkout: ${sourcePath}`);
  }
  if (entry.isDirectory && !sourceStat.isDirectory()) {
    return missingSource(entry, `Manifest entry ends with "/" but the source is not a directory: ${sourcePath}`);
  }

  const isDirectory = sourceStat.isDirectory();
  const sourceReal = await realpath(sourcePath);
  const target = path.relative(path.dirname(destinationPath), sourcePath).split(path.sep).join("/");

  const violation = await findContainmentViolation(destinationPath, context.destinationRoot);
  if (violation) {
    return {
      path: displayPath(entry),
      status: "unsafe",
      action: "skip",
      isDirectory,
      sourcePath,
      message: `Refusing to write through ${violation}, which resolves outside the checkout.`,
    };
  }

  const destinationStat = await lstatOrNull(destinationPath);
  const base = {
    path: displayPath(entry),
    isDirectory,
    sourcePath,
    target,
  };

  if (!destinationStat) {
    if (context.mode === "list") {
      return { ...base, status: "not-linked", action: "skip" };
    }
    return { ...base, status: context.dryRun ? "will-link" : "linked", action: "create" };
  }

  if (destinationStat.isSymbolicLink()) {
    const rawTarget = await readlink(destinationPath);
    const resolvedTarget = path.resolve(path.dirname(destinationPath), rawTarget);
    const existingReal = await realpath(destinationPath).catch(() => null);

    if (resolvedTarget === sourceReal || existingReal === sourceReal) {
      return {
        ...base,
        status: context.mode === "list" ? "linked" : "already-linked",
        action: "none",
      };
    }

    if (existingReal === null) {
      if (context.mode === "list") {
        return { ...base, status: "dangling", action: "skip" };
      }
      return {
        ...base,
        status: context.dryRun ? "will-repair" : "repaired",
        action: "replace",
        message: "dangling link will be replaced",
      };
    }
  }

  if (context.mode === "list") {
    return {
      ...base,
      status: "occupied",
      action: "skip",
      message: "destination is a real file, directory, or a different link",
    };
  }

  if (context.force) {
    return {
      ...base,
      status: context.dryRun ? "will-replace" : "linked",
      action: "replace",
      message: "replaces the existing path",
    };
  }

  if (context.backup) {
    return {
      ...base,
      status: context.dryRun ? "will-backup" : "linked",
      action: "backup",
      message: "moves the existing path aside first",
    };
  }

  return {
    ...base,
    status: "occupied",
    action: "skip",
    message: "destination exists; use --force to replace it or --backup to keep a copy",
  };
}

export async function buildPlan(options: BuildPlanOptions): Promise<Plan> {
  const context: EntryContext = {
    sourceRoot: options.sourceRoot,
    destinationRoot: options.destinationRoot,
    mode: options.mode,
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    backup: Boolean(options.backup),
  };

  const problemByLine = new Map<number, ManifestProblem>();
  for (const problem of options.problems) {
    problemByLine.set(problem.line, problem);
  }

  const entries: PlanEntry[] = [];
  for (const entry of options.entries) {
    const problem = problemByLine.get(entry.line);
    if (problem) {
      entries.push({
        path: displayPath(entry),
        status: problem.status,
        action: "skip",
        isDirectory: entry.isDirectory,
        message: problem.message,
      });
      continue;
    }
    entries.push(await planEntry(entry, context));
  }

  const failures = entries.filter((entry) => FAILING_STATUSES.has(entry.status)).length;

  return {
    sourceRoot: options.sourceRoot,
    destinationRoot: options.destinationRoot,
    entries,
    failures,
    exitCode: failures > 0 ? 1 : 0,
  };
}
