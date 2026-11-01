# Tasks

## 1. Package scaffold

- [x] 1.1 Create `package.json`: name `symlink-git-ignored`, version `0.1.0`, `"type": "module"`, `"engines": { "node": ">=20" }`, `bin.symlink-git-ignored = "dist/cli.js"`, `files: ["dist"]`, `publishConfig.access = "public"`, scripts `build` (`tsc -p tsconfig.json`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `pretest` (`npm run typecheck`), `prepublishOnly` (`npm run build && npm test`). Dependencies: `commander`, `prompts`. Dev dependencies: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/prompts`.
- [x] 1.2 Create `tsconfig.json` targeting ES2022, `module`/`moduleResolution` `NodeNext`, `outDir: "dist"`, `rootDir: "src"`, `strict: true`, `noUncheckedIndexedAccess: true`, `declaration: true`.
- [x] 1.3 Create `.gitignore` with `node_modules/`, `dist/`, `*.tgz`, `.DS_Store`.
- [x] 1.4 Add a minimal `src/cli.ts` with the `#!/usr/bin/env node` shebang, a `commander` program named `symlink-git-ignored`, version from `package.json`, and placeholder subcommands, so `node --import tsx src/cli.ts --help` runs.

## 2. Core types and errors

- [x] 2.1 Define `src/core/types.ts`: `EntryStatus`, `PlanEntry` (`path`, `status`, `sourcePath?`, `target?`, `message?`), `Plan` (`sourceRoot`, `destinationRoot`, `entries`, `failures`, `exitCode`), `ManifestEntry` (`raw`, `path`, `isDirectory`), and option types shared by the commands.
- [x] 2.2 Define `src/core/errors.ts` with a `ToolError` carrying `code`, `message`, and optional `hint`, plus formatting that prints `error: <message>` and `hint: <hint>` to stderr. Ensure no stack trace is printed for expected failures.

## 3. Git integration

- [x] 3.1 `src/core/git.ts`: `runGit(args, cwd)` wrapping `execFile` with `-C <cwd>`, `utf8`, NUL-splitting helper, and a typed failure for "not a git repository".
- [x] 3.2 `getCheckoutRoot(cwd)` via `git rev-parse --show-toplevel`; trim trailing newline and `realpath` the result.
- [x] 3.3 `listWorktrees(root)` via `git worktree list --porcelain`; parse blocks into `{ path, bare, branch?, detached }`, preserving order.
- [x] 3.4 `listIgnoredEntries(root, { collapsed })` via `git ls-files --others --ignored --exclude-standard --directory -z` (drop `--directory` when `collapsed` is false); strip the trailing `/` and return normalized relative paths plus an `isDirectory` flag. Handle empty output and git failures.
- [x] 3.5 Unit-test the porcelain parser and NUL splitting against captured fixture strings, including bare and detached worktrees.

## 4. Manifest parsing and validation

- [x] 4.1 `src/core/manifest.ts`: `manifestPath(root)` → `<root>/.llm-files`; `readManifest(root)` → `{ exists, text, entries }`; `parseManifest(text)` skipping blank/comment lines, trimming, stripping one trailing `/`, and recording line numbers for diagnostics.
- [x] 4.2 Implement `validateEntries(entries, root)`: reject absolute paths, `..` segments, paths resolving outside `root`, and anything equal to or inside `.git`; mark duplicates as `invalid`-with-warning and keep the first; mark nested entries `shadowed` and keep the ancestor (sort by path depth before comparing). Return `{ valid, problems }`.
- [x] 4.3 Implement `appendEntries(root, paths)` with an atomic write: read existing text, append only new normalized paths (sorted, de-duplicated), add a one-line header when creating the file, write `<manifest>.tmp-<pid>` in the same directory then `fs.rename`.
- [x] 4.4 Unit-test parsing edge cases (CRLF, indentation, trailing `/`, `#` mid-line is part of the path), validation rejections, duplicate handling, shadowing, and that `appendEntries` preserves existing comments and does not duplicate.

## 5. Exclusions

- [x] 5.1 `src/core/excludes.ts`: built-in denylist constants for directory segments (`node_modules`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `target`, `coverage`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`) and extensions (`.exe`, `.dll`, `.so`, `.dylib`, `.o`, `.a`, `.node`, `.wasm`, `.pyc`, `.class`, `.jar`).
- [x] 5.2 `createExcludeMatcher({ useDefaults, extraPatterns })`: segment match at any depth for directory names, case-insensitive extension match, plus user patterns supporting exact segment, `*` glob within a segment, and leading `*/` for any depth. Keep it dependency-free and pure.
- [x] 5.3 Unit-test denylist hits at depth, extension cases, `--no-default-excludes`, user globs, and that the matcher never sees manifest entries (linking path does not call it).

## 6. Source resolution

- [x] 6.1 `src/core/source.ts`: `resolveSource({ from, destinationRoot, worktrees })` implementing precedence `--from` → first worktree entry; `realpath` both roots; reject missing directory, bare repository, and `source === destination` with distinct `ToolError` codes and hints mentioning `--from`.
- [x] 6.2 Cover the "single worktree, equals destination" case and the "`--from` outside any worktree but existing directory" case.
- [x] 6.3 Unit-test precedence, `realpath` normalization (trailing slash, symlinked path), and each rejection.

## 7. Link planning

- [x] 7.1 `src/core/plan.ts`: `buildPlan({ manifestEntries, sourceRoot, destinationRoot, force, backup, dryRun })` producing one `PlanEntry` per valid manifest entry, in manifest order, using `lstat` on the destination and source, `readlink` + `path.resolve` for existing links, and `path.relative(dirname(dest), sourcePath)` normalized to `/`.
- [x] 7.2 Map states to statuses exactly as specified: `linked` (created), `already-linked`, `missing-source`, `occupied`, `dangling`, `repaired`, `shadowed`, `invalid`, `unsafe`; dry-run variants `will-link`, `will-repair`, `will-replace`, `will-backup`. Guarantee each entry gets exactly one status.
- [x] 7.3 Implement the containment check (deepest existing ancestor `realpath` must be root or start with `root + sep`) and mark failures `unsafe`.
- [x] 7.4 Unit-test the planner with temp directories: fresh link, correct existing link, foreign link, real file, dangling link, directory entry, containment violation, and dry-run statuses.

## 8. Filesystem operations

- [x] 8.1 `src/core/apply.ts`: `applyPlan(plan, { force, backup })` performing `mkdir -p` parents, `--force` unlink of the existing destination, `--backup` rename with a `YYYYMMDDHHmmss` stamp and numeric suffix on clash, and `fs.symlink(target, dest)`; re-check containment immediately before each write.
- [x] 8.2 Idempotency and failure isolation: a failure on one entry must be recorded, must not abort the remaining entries, and must influence only the exit code.
- [x] 8.3 Integration-test apply against real temp directories, including the backup collision suffix and a simulated EACCES on one entry (skip on Windows).

## 9. Commands

- [x] 9.1 `src/commands/link.ts`: default command; resolve destination and source, read and validate the manifest, build the plan, print the human report (roots, one line per entry, summary), honour `--dry-run`, `--force`, `--backup`, `--from`, `--json`, and return the exit code from the plan.
- [x] 9.2 `src/commands/list.ts`: same resolution without mutation; report each entry's current status plus totals; `--json` emits `{ source, destination, entries, summary }` and no other stdout writes.
- [x] 9.3 `src/commands/select.ts`: discover candidates from the source (collapsed by default, `--expand` to list files inside ignored directories), remove already-listed and denylisted entries, then either `--all`, `--add <paths...>` (validated against the candidate set), or the interactive picker; write via `appendEntries`; print a reminder that the manifest change is uncommitted.
- [x] 9.4 `src/ui/picker.ts`: wrap `prompts.autocompleteMultiselect` over sorted candidates (directories first), with a `hint` showing the filter keystroke and a `confirm` summary before writing; return a cancelled signal on Ctrl-C and map it to exit 130.
- [x] 9.5 `src/output.ts`: shared human formatter (status symbols, colour only when `process.stdout.isTTY` and `NO_COLOR` is unset) and JSON serializer; never mix the two on stdout.
- [x] 9.6 Wire `src/cli.ts`: `commander` root with default command `link`, subcommands `select` and `list`, global `--from`, `--json`, `--dry-run` (where applicable), `--version`, `--help`; convert `ToolError` and unexpected exceptions into exit code 1 with stderr output; ensure `--force` + `--backup` is a usage error.

## 10. Tests

- [x] 10.1 `test/helpers/repo.ts`: create a temp directory, `git init`, set local `user.email`/`user.name`, write `.gitignore` and a committed baseline containing `.llm-files`, commit, then `git worktree add <tmp>/wt -b test-branch`; return roots and a `runCli()` helper using `node --import tsx src/cli.ts` with a fixed `HOME`/`GIT_CONFIG_GLOBAL` pointing at a temp config so global excludes do not leak in.
- [x] 10.2 Integration: `link` in a fresh worktree creates relative links whose `readlink` output is the expected relative path, and a second run reports every entry `already-linked` (exit 0).
- [x] 10.3 Integration: `link` with an occupied destination exits 0 and leaves the file byte-identical; with `--backup` creates `.bak-<timestamp>`; with `--force` replaces it.
- [x] 10.4 Integration: `--dry-run` leaves the worktree unchanged; `--from` points at a second worktree; running in the primary checkout exits 1; running outside git exits 1.
- [x] 10.5 Integration: `list --json` in a fresh and a linked worktree emits the documented shape with the expected status counts and no non-JSON stdout.
- [x] 10.6 Integration: `select --add` appends only valid candidates, rejects a tracked path, and rejects a denylisted path with an actionable message; `select --all` adds candidates but never `node_modules`; manifest stays parseable across two `select` runs.
- [x] 10.7 Unit: containment check blocks a symlinked parent pointing outside the worktree; manifest entries containing `..` and absolute paths are rejected before any filesystem call.
- [x] 10.8 Skip symlink/backup tests on Windows with `describe.skipIf(process.platform === 'win32')` and document why.

## 11. Documentation

- [x] 11.1 `README.md`: what problem it solves, install/`npx` usage, a worked example (`.llm-files` + `npx symlink-git-ignored` inside a worktree), full command/flag reference, status vocabulary table, exit codes, denylist contents and how to extend it, and the tracked-manifest caveat (edits land on the current branch).
- [x] 11.2 Add a short "Windows" note (Developer Mode/elevation; POSIX is the supported platform) and a "Safety" note (skip-by-default, containment check, `.git` protection).
- [x] 11.3 Confirm `--help` text for every command matches the README flag tables.

## 12. Verification

- [x] 12.1 `npm run typecheck && npm run build && npm test` all pass with no skipped suites other than the documented Windows ones.
- [x] 12.2 Manual end-to-end in a throwaway repo: create a worktree, run `npx --yes .` (`npm exec -- symlink-git-ignored` equivalent) from the worktree, verify links, edit the source file and confirm the change is visible through the link, then rerun and confirm idempotency.
- [x] 12.3 `npm pack --dry-run` shows only `dist/`, `README.md`, `LICENSE`, and `package.json`; verify `npm view symlink-git-ignored version` to settle the open question about the package name.
- [x] 12.4 `openspec validate "add-symlink-cli" --strict` passes.
