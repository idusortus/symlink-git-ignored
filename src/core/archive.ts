import { createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import yazl from "yazl";

import { createExcludeMatcher } from "./excludes.js";
import { ToolError } from "./errors.js";
import {
  isPathIgnoredByGit,
  listIgnoredEntries,
  listUntrackedEntries,
  type IgnoredEntry,
  type WorktreeInfo,
} from "./git.js";
import type { ArchiveEntry, ArchivePlan, ArchiveProblem, ArchiveProblemStatus } from "./types.js";

export const DEFAULT_ARCHIVE_FILENAME = "llm-workspace.zip";

export interface PlanArchiveOptions {
  checkoutRoot: string;
  worktrees: WorktreeInfo[];
  output?: string;
  includeAll?: boolean;
  exclude?: string[];
  dryRun?: boolean;
  /** Base directory for a relative --output; defaults to process.cwd(). */
  cwd?: string;
}

export interface WriteArchiveOptions {
  force?: boolean;
}

/**
 * Resolve the archive destination. An explicit output path is relative to the
 * working directory; otherwise the archive lands at the checkout root.
 */
export function resolveArchivePath(
  checkoutRoot: string,
  output?: string,
  cwd: string = process.cwd(),
): string {
  const trimmed = output?.trim();
  if (trimmed) {
    return path.resolve(cwd, trimmed);
  }
  return path.resolve(checkoutRoot, DEFAULT_ARCHIVE_FILENAME);
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function isInsideAnyRoot(roots: string[], candidate: string): boolean {
  return roots.some((root) => isPathInside(root, candidate));
}

function normalizeEntryPath(raw: string): string | null {
  if (!raw || raw.startsWith("/") || raw.includes("\0")) {
    return null;
  }
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    return null;
  }
  const segments = raw.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  const normalized = segments.join("/");
  if (normalized === ".git" || normalized.startsWith(".git/")) {
    return null;
  }
  return normalized;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveAllowedRoots(checkoutRoot: string, worktrees: WorktreeInfo[]): Promise<string[]> {
  const roots = new Set<string>();
  const candidates = [checkoutRoot, ...worktrees.filter((worktree) => !worktree.bare).map((worktree) => worktree.path)];
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      const info = await stat(resolved);
      if (info.isDirectory()) {
        roots.add(resolved);
      }
    } catch {
      // Missing or inaccessible worktrees cannot contribute an allowed root.
    }
  }
  return [...roots];
}

async function resolveOutputPath(archivePath: string): Promise<string> {
  try {
    return path.join(await realpath(path.dirname(archivePath)), path.basename(archivePath));
  } catch {
    return path.resolve(archivePath);
  }
}

interface CollectContext {
  archivePath: string;
  archiveRealPath: string;
  allowedRoots: string[];
  matcher: (entryPath: string, isDirectory?: boolean) => boolean;
  entries: ArchiveEntry[];
  problems: ArchiveProblem[];
  seenEntries: Set<string>;
  seenProblems: Set<string>;
}

function addProblem(
  context: CollectContext,
  entryPath: string,
  status: ArchiveProblemStatus,
  message: string,
): void {
  const key = `${entryPath}\0${status}`;
  if (context.seenProblems.has(key)) {
    return;
  }
  context.seenProblems.add(key);
  context.problems.push({ path: entryPath, status, message });
}

function isArchiveOutput(context: CollectContext, absolutePath: string, realPath?: string): boolean {
  const resolved = path.resolve(absolutePath);
  return (
    resolved === context.archivePath ||
    resolved === context.archiveRealPath ||
    (realPath !== undefined && realPath === context.archiveRealPath)
  );
}

async function collectPath(
  context: CollectContext,
  entryPath: string,
  absolutePath: string,
  stack: Set<string>,
): Promise<void> {
  const safePath = normalizeEntryPath(entryPath);
  if (!safePath) {
    addProblem(context, entryPath, "unsafe", "Path is not a safe archive entry.");
    return;
  }

  if (isArchiveOutput(context, absolutePath)) {
    return;
  }

  let target: string;
  try {
    target = await realpath(absolutePath);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      addProblem(context, safePath, "missing-source", "The path does not exist.");
    } else if (code === "ELOOP") {
      addProblem(context, safePath, "cyclic", "The symlink chain loops.");
    } else {
      addProblem(context, safePath, "unsupported", `Cannot resolve the path: ${describeError(error)}`);
    }
    return;
  }

  if (!isInsideAnyRoot(context.allowedRoots, target)) {
    addProblem(context, safePath, "unsafe", `Resolves outside the checkout and its registered worktrees: ${target}`);
    return;
  }

  if (isArchiveOutput(context, absolutePath, target)) {
    return;
  }

  let info;
  try {
    info = await stat(target);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      addProblem(context, safePath, "missing-source", "The path does not exist.");
    } else {
      addProblem(context, safePath, "unsupported", `Cannot read the path: ${describeError(error)}`);
    }
    return;
  }

  if (info.isFile()) {
    if (context.seenEntries.has(safePath)) {
      return;
    }
    context.seenEntries.add(safePath);
    context.entries.push({
      path: safePath,
      sourcePath: target,
      size: info.size,
      mtime: info.mtime,
      mode: info.mode,
    });
    return;
  }

  if (!info.isDirectory()) {
    addProblem(context, safePath, "unsupported", "The path is not a regular file or directory.");
    return;
  }

  if (stack.has(target)) {
    addProblem(context, safePath, "cyclic", "Directory traversal revisits an ancestor.");
    return;
  }

  let children;
  try {
    children = await readdir(target, { withFileTypes: true });
  } catch (error) {
    addProblem(context, safePath, "unsupported", `Cannot read the directory: ${describeError(error)}`);
    return;
  }

  stack.add(target);
  try {
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const childPath = `${safePath}/${child.name}`;
      if (context.matcher(childPath, child.isDirectory())) {
        continue;
      }
      await collectPath(context, childPath, path.join(target, child.name), stack);
    }
  } finally {
    stack.delete(target);
  }
}

async function collectCandidate(context: CollectContext, candidate: IgnoredEntry, checkoutRoot: string): Promise<void> {
  const safePath = normalizeEntryPath(candidate.path);
  if (!safePath) {
    return;
  }
  if (context.matcher(safePath, candidate.isDirectory)) {
    return;
  }
  const absolutePath = path.join(checkoutRoot, safePath);
  if (isArchiveOutput(context, absolutePath)) {
    return;
  }
  await collectPath(context, safePath, absolutePath, new Set());
}

/** Build the archive plan without writing anything. */
export async function planArchive(options: PlanArchiveOptions): Promise<ArchivePlan> {
  const checkoutRoot = path.resolve(options.checkoutRoot);
  const archivePath = resolveArchivePath(checkoutRoot, options.output, options.cwd);
  const archiveRealPath = await resolveOutputPath(archivePath);
  const allowedRoots = await resolveAllowedRoots(checkoutRoot, options.worktrees);
  const matcher = createExcludeMatcher({
    useDefaults: options.includeAll !== true,
    extraPatterns: options.exclude ?? [],
  });

  const candidates = new Map<string, IgnoredEntry>();
  for (const entry of await listIgnoredEntries(checkoutRoot, { collapsed: false })) {
    const safePath = normalizeEntryPath(entry.path);
    if (safePath) {
      candidates.set(safePath, { ...entry, path: safePath });
    }
  }

  for (const entry of await listUntrackedEntries(checkoutRoot)) {
    const safePath = normalizeEntryPath(entry.path);
    if (!safePath || candidates.has(safePath)) {
      continue;
    }
    const absolutePath = path.join(checkoutRoot, safePath);
    let linkInfo;
    try {
      linkInfo = await lstat(absolutePath);
    } catch {
      continue;
    }
    if (!linkInfo.isSymbolicLink()) {
      continue;
    }
    let target: string;
    try {
      target = await realpath(absolutePath);
    } catch {
      continue;
    }
    if (!isInsideAnyRoot(allowedRoots, target)) {
      continue;
    }
    candidates.set(safePath, { path: safePath, isDirectory: false });
  }

  const context: CollectContext = {
    archivePath,
    archiveRealPath,
    allowedRoots,
    matcher,
    entries: [],
    problems: [],
    seenEntries: new Set(),
    seenProblems: new Set(),
  };

  for (const candidate of [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path))) {
    await collectCandidate(context, candidate, checkoutRoot);
  }

  context.entries.sort((left, right) => left.path.localeCompare(right.path));
  context.problems.sort(
    (left, right) => left.path.localeCompare(right.path) || left.status.localeCompare(right.status),
  );

  return {
    checkoutRoot,
    archivePath,
    dryRun: options.dryRun === true,
    entries: context.entries,
    problems: context.problems,
    totalBytes: context.entries.reduce((total, entry) => total + entry.size, 0),
    exitCode: context.problems.length > 0 ? 1 : 0,
  };
}

/** Refuse to clobber an existing archive unless the caller asked for it. */
export async function assertArchiveDestination(archivePath: string, force: boolean): Promise<void> {
  let info;
  try {
    info = await lstat(archivePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return;
    }
    throw new ToolError("ARCHIVE_EXISTS", `Cannot inspect archive destination: ${archivePath}`, describeError(error));
  }
  if (info.isDirectory()) {
    throw new ToolError(
      "ARCHIVE_EXISTS",
      `Cannot write the archive because ${archivePath} is a directory.`,
      "Pass --output <path> pointing at a file.",
    );
  }
  if (!force) {
    throw new ToolError(
      "ARCHIVE_EXISTS",
      `Archive already exists: ${archivePath}`,
      "Pass --force to replace it, or --output <path> to write elsewhere.",
    );
  }
}

/** Stream the planned entries into a zip, then move it into place. */
export async function writeArchive(plan: ArchivePlan, options: WriteArchiveOptions = {}): Promise<void> {
  const force = options.force === true;
  await assertArchiveDestination(plan.archivePath, force);

  const directory = path.dirname(plan.archivePath);
  await mkdir(directory, { recursive: true });
  const temporary = `${plan.archivePath}.tmp-${process.pid}-${Date.now()}`;

  try {
    const zip = new yazl.ZipFile();
    const output = createWriteStream(temporary, { mode: 0o600 });
    const finished = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        (zip.outputStream as Readable).destroy(error);
        output.destroy(error);
        reject(error);
      };
      zip.once("error", fail);
      zip.outputStream.once("error", fail);
      output.once("error", fail);
      pipeline(zip.outputStream, output).then(
        () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        },
        (error: Error) => fail(error),
      );
    });

    for (const entry of plan.entries) {
      zip.addFile(entry.sourcePath, entry.path, {
        mtime: entry.mtime,
        mode: entry.mode,
        compress: true,
      });
    }
    zip.end();
    await finished;

    if (process.platform !== "win32") {
      await chmod(temporary, 0o600);
    }
    try {
      await rename(temporary, plan.archivePath);
    } catch (error) {
      if (process.platform === "win32" && force) {
        await rm(plan.archivePath, { force: true });
        await rename(temporary, plan.archivePath);
      } else {
        throw error;
      }
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Warn when the archive is inside the checkout but git would let it be committed. */
export async function archiveCommitWarning(plan: ArchivePlan): Promise<string | null> {
  if (plan.entries.length === 0) {
    return null;
  }
  const relative = path.relative(plan.checkoutRoot, plan.archivePath);
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    return null;
  }
  const relativePosix = relative.split(path.sep).join("/");
  try {
    if (await isPathIgnoredByGit(plan.checkoutRoot, relativePosix)) {
      return null;
    }
  } catch {
    // The warning is best-effort; never fail a completed archive because of it.
    return null;
  }
  return `warning: ${plan.archivePath} is inside the checkout but not gitignored; it may contain credentials and can be committed accidentally.`;
}
