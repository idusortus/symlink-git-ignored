# Architecture

`symlink-git-ignored` is a small ESM CLI. This page explains how a command flows through the code, which module owns each step, and which invariants must not be broken. The behavioral contracts live in [`openspec/specs/`](../openspec/specs/): [`llm-file-manifest`](../openspec/specs/llm-file-manifest/spec.md), [`worktree-link`](../openspec/specs/worktree-link/spec.md), [`workspace-archive`](../openspec/specs/workspace-archive/spec.md), and [`npm-release`](../openspec/specs/npm-release/spec.md). Link to those for requirements; this page is the implementation map.

## Runtime flow

```text
argv
 └─ src/cli.ts                       commander: default "link", "select", "list", "archive"
     │                               execute() maps ToolError → stderr + exit code
     ├─ link (default) ── src/commands/link.ts
     │    ├─ getCheckoutRoot()        git rev-parse --show-toplevel (realpath)
     │    ├─ requireManifest()        .llm-files at the destination root
     │    ├─ listWorktrees()          git worktree list --porcelain
     │    ├─ resolveSource()          --from → primary worktree; reject bare/self
     │    ├─ validateManifest()       syntax, escapes, duplicates, shadowing
     │    ├─ buildPlan()              per entry: source stat, containment, dest lstat
     │    ├─ applyPlan()              mkdir -p, create/replace/backup symlink
     │    └─ formatPlan() / planToJson()
     │
     ├─ list ── src/commands/list.ts
     │    └─ same resolution + buildPlan({ mode: "list" }); never applies
     │
     ├─ select ── src/commands/select.ts
     │    ├─ getCheckoutRoot() + listWorktrees() + resolveSource()  (allowSameRoot)
     │    ├─ listIgnoredEntries()     git ls-files --others --ignored ...
     │    ├─ createExcludeMatcher()   built-in denylist + --exclude patterns
     │    ├─ pickCandidates()         prompts autocompleteMultiselect
     │    │  or --add / --all
     │    └─ appendEntries()          atomic temp file + rename
     │
     └─ archive ── src/commands/archive.ts
          ├─ getCheckoutRoot() + listWorktrees()
          ├─ listIgnoredEntries() + listUntrackedEntries()  ignored files + worktree links
          ├─ planArchive()            denylist, symlink expansion, containment, problems
          ├─ writeArchive()           yazl stream → temp file → rename
          └─ formatArchive() / archiveToJson()
```

## Module map

| Module | Responsibility |
| --- | --- |
| `src/cli.ts` | Command definitions, default-subcommand behavior, `execute()` error mapping, exit code |
| `src/commands/link.ts` | Destination/source resolution, manifest validation, plan, apply, output |
| `src/commands/list.ts` | Same pipeline in `list` mode, no mutation |
| `src/commands/select.ts` | Candidate discovery, filtering, non-interactive paths, manifest append |
| `src/commands/archive.ts` | Checkout/worktree resolution, archive plan, write, warning, output |
| `src/core/archive.ts` | `planArchive`, symlink dereferencing and containment, `writeArchive`, output checks |
| `src/core/git.ts` | `execFile("git", ["-C", cwd, ...])`, NUL splitting, porcelain parser, ignored/untracked entries, `check-ignore` |
| `src/core/manifest.ts` | `parseManifest`, `readManifest`/`requireManifest`, `validateManifest`, `appendEntries` |
| `src/core/source.ts` | `resolveSource` precedence and rejection rules |
| `src/core/plan.ts` | `buildPlan`, `findContainmentViolation`, per-entry status/action |
| `src/core/apply.ts` | `applyPlan`, `chooseBackupPath`; failure isolation per entry |
| `src/core/excludes.ts` | `DEFAULT_EXCLUDED_DIRS`/`EXTENSIONS`, `createExcludeMatcher` |
| `src/core/errors.ts` | `ToolError`, `isToolError`, `formatError`, `exitCodeFor` |
| `src/core/types.ts` | `EntryStatus`, `DryRunStatus`, `PlanEntry`, `Plan`, manifest types |
| `src/output.ts` | Status symbols, human summary, `planToJson`, colour rules |
| `src/ui/picker.ts` | `pickCandidates`, `confirmSelection`, cancellation → `ToolError("CANCELLED")` |
| `src/version.ts` | Version read from `package.json` relative to `import.meta.url` |

## Data model

`ManifestEntry` is one parsed line: `raw`, `path` (no trailing slash), `isDirectory`, and `line` for diagnostics. `validateManifest` returns the same entries plus `problems` (each with a `status` of `invalid` or `shadowed` and a message).

`PlanEntry` is what the planner decided for one line:

```ts
interface PlanEntry {
  path: string;
  status: PlanStatus;      // entry status or dry-run status
  action: "create" | "replace" | "backup" | "none" | "skip";
  isDirectory: boolean;
  sourcePath?: string;
  target?: string;         // relative symlink target
  message?: string;
}
```

`Plan` adds `sourceRoot`, `destinationRoot`, `failures`, and `exitCode`. `applyPlan` only touches entries whose action is `create`, `replace`, or `backup`.

`ArchivePlan` is separate from the link plan:

```ts
interface ArchiveEntry {
  path: string;        // POSIX, checkout-relative
  sourcePath: string;  // absolute path to read
  size: number;
  mtime: Date;
  mode: number;
}

interface ArchivePlan {
  checkoutRoot: string;
  archivePath: string;
  dryRun: boolean;
  entries: ArchiveEntry[];
  problems: ArchiveProblem[];
  totalBytes: number;
  exitCode: number;
}
```

### Status vocabulary

| Status | Meaning |
| --- | --- |
| `linked` | Link exists (list) or was created (link) |
| `already-linked` | Existing link already resolves to the source (link mode) |
| `not-linked` | Destination is missing (list mode) |
| `occupied` | Real path or foreign link; skipped without `--force`/`--backup` |
| `dangling` | Symlink whose target does not resolve (list mode) |
| `repaired` | Dangling symlink replaced (link mode) |
| `missing-source` | Source checkout lacks the path |
| `shadowed` | Covered by an ancestor entry |
| `invalid` | Absolute, `..`, escape, `.git`, or duplicate |
| `unsafe` | A parent resolves outside the destination checkout |

Dry-run replaces the outcome with `will-link`, `will-repair`, `will-replace`, or `will-backup`. Only `missing-source`, `invalid`, and `unsafe` count as failures.

Archive entries are reported as `archived` or, during a dry run, `would-archive`. Archive problems use `missing-source`, `unsafe`, `cyclic`, or `unsupported`.

## Git boundary

All version-control knowledge is delegated to `git`; nothing reimplements gitignore matching.

| Call | Used for |
| --- | --- |
| `git rev-parse --show-toplevel` | Destination root, so nested directories behave the same |
| `git worktree list --porcelain` | Primary source worktree and bare/detached detection |
| `git ls-files --others --ignored --exclude-standard -z [--directory]` | `select` candidates and `archive` ignored entries, with nested `.gitignore`, `.git/info/exclude`, and global excludes applied by git |
| `git ls-files --others --exclude-standard -z` | `archive` untracked symlinks, which catch worktree links that trailing-slash ignore rules do not classify as ignored |
| `git check-ignore -q -- <path>` | `archive` warning when the destination would be committable |

`runGit` uses `execFile` with `-C <cwd>`, UTF-8 output, and a 64 MB buffer. Failures are translated into `ToolError` codes (`NOT_A_REPO`, `GIT_FAILED`).

## Filesystem safety

1. **Manifest validation** rejects absolute paths, `..`, anything resolving outside the destination root, and anything at or under `.git` before any filesystem call.
2. **Containment** (`findContainmentViolation`) walks up to the deepest existing ancestor of the destination and requires its `realpath` to remain inside the destination root. A pre-existing symlinked parent that escapes produces `unsafe`. `applyPlan` re-checks immediately before writing.
3. **Symlink targets are relative** (`path.relative` from the link's parent) with POSIX separators, so moving the whole tree does not break links.
4. **Skip by default**: `occupied` destinations are untouched; `--force` removes, `--backup` renames first.
5. **No state file**: every run derives status from `lstat`/`readlink` and source existence, so there is no hidden metadata to drift or commit.
6. **Archive containment**: symlink targets must resolve inside the current checkout or a registered worktree. Traversal keeps a real-path stack to stop cycles, and entry names are normalized POSIX paths with no `..`.
7. **Archive output**: the zip is streamed to a temporary file, chmodded `0600` on POSIX, and renamed into place. The destination is never archived into itself.

## Output contract

`--json` prints exactly one object to stdout and nothing else; diagnostics go to stderr. Human output uses fixed status words, a symbol per status, and a summary line. Exit codes: `0` all good or skipped, `1` failures/usage, `130` picker cancelled.

## Design choices

- **Delegate ignore semantics to git** rather than the `ignore` package: one source of truth, no reimplementation of precedence/negation.
- **Source = first `git worktree list` entry.** That is the checkout `git worktree add` was run from; `--from` overrides it.
- **`select` may use its own checkout as the source.** It only reads ignored paths and writes the manifest, so it opts out of the source-equals-destination guard; `link` and `list` still reject that case.
- **No ledger.** The tool cannot distinguish its own links from identical ones, but both satisfy the intent.
- **Tracked manifest.** `select` edits a committed file; the change appears on the current branch by design.
- **Archive discovery adds untracked symlinks.** Git does not consider a worktree's `.claude` symlink ignored when the rule is `.claude/`, so `archive` also considers untracked symlinks whose targets are inside known worktrees.
- **Archive planning precedes writing.** Symlinks, directory expansion, filtering, and problems are resolved before the zip stream starts, so the output can be atomic and complete problem reporting is possible.

## Extending

- **New command**: add `src/commands/<name>.ts`, register it in `src/cli.ts`, update README, and add a command-level test in `test/cli.test.ts`.
- **New status**: extend `EntryStatus`/`DryRunStatus` in `src/core/types.ts`, produce it in `src/core/plan.ts`, add a symbol in `src/output.ts`, update the README table, and change `openspec/specs/worktree-link/spec.md`.
- **New exclusion**: add to `DEFAULT_EXCLUDED_DIRS`/`EXTENSIONS` in `src/core/excludes.ts`, update the README list, and extend `test/excludes.test.ts`.
- **New safety rule**: implement it in `validateManifest` (path level) or `findContainmentViolation`/`applyPlan` (filesystem level), with a matching spec scenario and test.
