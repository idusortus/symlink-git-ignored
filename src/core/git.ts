import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { ToolError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  locked: boolean;
}

export interface IgnoredEntry {
  path: string;
  isDirectory: boolean;
}

/** Split NUL-delimited git output, dropping the trailing empty record. */
export function splitNul(output: string): string[] {
  return output.split("\0").filter((value) => value.length > 0);
}

export async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (failure.code === "ENOENT") {
      throw new ToolError("GIT_FAILED", "git is not installed or not available on PATH.");
    }
    const stderr = (failure.stderr ?? "").trim();
    if (/not a git repository/i.test(stderr)) {
      throw new ToolError("NOT_A_REPO", `Not a git repository: ${cwd}`, "Run the command inside a git working tree.");
    }
    if (/this operation must be run in a work tree/i.test(stderr)) {
      throw new ToolError("NOT_A_REPO", `No git working tree at: ${cwd}`, "Run the command inside a git working tree.");
    }
    throw new ToolError("GIT_FAILED", `git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

export async function getCheckoutRoot(cwd: string): Promise<string> {
  const output = await runGit(["rev-parse", "--show-toplevel"], cwd);
  const topLevel = output.trim();
  if (!topLevel) {
    throw new ToolError("NOT_A_REPO", `No git working tree at: ${cwd}`);
  }
  return realpath(topLevel);
}

export function parseWorktrees(output: string): WorktreeInfo[] {
  const blocks = output
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const worktrees: WorktreeInfo[] = [];
  for (const block of blocks) {
    const worktree: WorktreeInfo = { path: "", detached: false, bare: false, locked: false };
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        worktree.path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        worktree.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        worktree.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      } else if (line === "detached") {
        worktree.detached = true;
      } else if (line === "bare") {
        worktree.bare = true;
      } else if (line === "locked" || line.startsWith("locked ")) {
        worktree.locked = true;
      }
    }
    if (worktree.path) {
      worktrees.push(worktree);
    }
  }
  return worktrees;
}

export async function listWorktrees(root: string): Promise<WorktreeInfo[]> {
  const output = await runGit(["worktree", "list", "--porcelain"], root);
  return parseWorktrees(output);
}

export async function listIgnoredEntries(root: string, options: { collapsed: boolean }): Promise<IgnoredEntry[]> {
  const args = ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"];
  if (options.collapsed) {
    args.push("--directory");
  }
  const output = await runGit(args, root);

  const seen = new Set<string>();
  const entries: IgnoredEntry[] = [];
  for (const record of splitNul(output)) {
    const isDirectory = record.endsWith("/");
    const entryPath = isDirectory ? record.replace(/\/+$/, "") : record;
    if (!entryPath || seen.has(entryPath)) {
      continue;
    }
    seen.add(entryPath);
    entries.push({ path: entryPath, isDirectory });
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}
