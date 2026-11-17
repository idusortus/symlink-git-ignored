# Tasks

## 1. Dependencies and denylist

- [x] 1.1 Add `yazl` to `dependencies`, `@types/yazl` to `devDependencies`, and `yauzl` plus `@types/yauzl` to `devDependencies` for tests; run `npm install`. Verify with `npm ls yazl yauzl @types/yazl @types/yauzl` and a short Node ESM import of `yazl`.
- [x] 1.2 Add `bin`, `obj`, `.vs`, and `TestResults` to `DEFAULT_EXCLUDED_DIRS` in `src/core/excludes.ts`. Extend `test/excludes.test.ts` to assert each directory is matched at the root and at depth. Verify with `npx vitest run test/excludes.test.ts`.
- [x] 1.3 Update the build-artifacts list in `README.md` with the four new directories and note the escape hatches (`select --no-default-excludes`, `archive --include-all` once added). Verify the README list matches `DEFAULT_EXCLUDED_DIRS` exactly.

## 2. Archive planning

- [x] 2.1 Add `ArchiveStatus`, `ArchiveEntry`, `ArchiveProblem`, `ArchivePlan`, and `ArchiveOptions` to `src/core/types.ts`, keeping archive statuses separate from `EntryStatus`. Verify with `npm run typecheck`.
- [x] 2.2 Implement output-path resolution in `src/core/archive.ts`: default `<checkout>/llm-workspace.zip`, `--output` resolved against the working directory, and normalization to an absolute path. Add unit coverage for default, relative, and absolute output paths. Verify with `npx vitest run test/archive.test.ts`.
- [x] 2.3 Implement `planArchive` discovery with `listIgnoredEntries(root, { collapsed: false })` plus untracked symlinks from `git ls-files --others`, then apply `createExcludeMatcher`, sorting, de-duplication, and exclusion of the output path itself. Cover nested `.gitignore`, tracked files being absent, default denylist, `--include-all`, `--exclude`, an untracked worktree link, and empty results in `test/archive.test.ts`. Verify with `npx vitest run test/archive.test.ts`.
- [x] 2.4 Implement symlink dereferencing and recursive directory expansion, including files under a symlinked directory, with entry names kept under the link path. Cover symlink-to-file and symlink-to-directory cases in `test/archive.test.ts`. Verify with `npx vitest run test/archive.test.ts`.
- [x] 2.5 Implement the symlink safety envelope: allowed roots from the checkout plus `listWorktrees`, `realpath` containment, stack-based cycle detection, and `missing-source`/`unsafe`/`cyclic`/`unsupported` problems. Add unit tests for an external link, a broken link, a loop, and a non-regular target, including that safe entries survive and the plan exits 1. Verify with `npx vitest run test/archive.test.ts`.
- [x] 2.6 Add a planner test that rejects or normalizes unsafe entry names, asserting every planned entry is relative, POSIX-separated, and free of `..` or a leading `./`. Verify with `npx vitest run test/archive.test.ts`.

## 3. Archive writing

- [x] 3.1 Implement `writeArchive` with `yazl`, streaming from the planned source paths into a temporary file in the output directory, creating parent directories, applying `chmod 0600` on POSIX, and renaming into place. Add a test that opens the result with `yauzl` and checks entry names, contents, and mtime. Verify with `npx vitest run test/archive.test.ts`.
- [x] 3.2 Implement overwrite protection and `--force`, including rejecting a destination that is a directory. Cover existing-file refusal, forced replacement, and no leftover temporary files in `test/archive.test.ts`. Verify with `npx vitest run test/archive.test.ts`.
- [x] 3.3 Ensure a read failure during writing removes the temporary file and leaves any previous archive untouched. Add a test using a planned file that is deleted or made unreadable before the write. Verify with `npx vitest run test/archive.test.ts`.
- [x] 3.4 Implement the `git check-ignore` helper and the stderr warning for a written archive inside the checkout that git does not ignore. Add unit coverage for ignored and non-ignored output paths, and assert the warning never reaches stdout. Verify with `npx vitest run test/archive.test.ts`.

## 4. CLI command and reporting

- [x] 4.1 Add `formatArchive` and `archiveToJson` to `src/output.ts` with the documented human fields and the JSON keys `checkout`, `archive`, `dryRun`, `entries`, `problems`, `summary`, and `exitCode`. Add an output test asserting the JSON shape and that problems are separate from entries. Verify with `npx vitest run test/archive.test.ts`.
- [x] 4.2 Add `src/commands/archive.ts` to resolve the checkout and worktrees, run the plan, write only when not dry-running, print human or JSON output, and return the plan's exit code. Verify with `npm run typecheck`.
- [x] 4.3 Register `archive` in `src/cli.ts` with `--output`, `--force`, `--dry-run`, `--include-all`, `--exclude <pattern...>`, and `--json`, plus help examples. Verify with `npx tsx src/cli.ts archive --help` and confirm the flags and examples are listed.
- [x] 4.4 Add CLI integration tests for the default output in a primary checkout without a manifest, running from a subdirectory, and running outside git. Use `yauzl` to confirm the zip entries and contents. Verify with `npx vitest run test/cli.test.ts`.
- [x] 4.5 Add CLI integration tests for `--output`, existing-file refusal, `--force`, `--dry-run`, and `--json`. Verify with `npx vitest run test/cli.test.ts`.
- [x] 4.6 Add CLI integration tests for `--include-all`, `--exclude`, and the empty-archive message, plus archiving in a linked worktree where `.claude` is a symlink to the primary checkout. Verify with `npx vitest run test/cli.test.ts`.
- [x] 4.7 Add CLI integration tests for POSIX owner-only permissions and the committable-archive stderr warning, including an `--json` run whose stdout remains a single JSON object. Verify with `npx vitest run test/cli.test.ts`.

## 5. Documentation

- [x] 5.1 Add the `archive` section to `README.md`: flags, default output, `--force`, recovery workflow (`unzip` into a fresh clone), credential handling, `.gitignore` advice, and the denylist/`--include-all` trade-off. Verify each documented command runs as written.
- [x] 5.2 Update `docs/architecture.md` with the archive runtime flow and module map entries (`src/commands/archive.ts`, `src/core/archive.ts`, output formatters). Verify the module names match the files on disk.
- [x] 5.3 Update `AGENTS.md` layout and commands tables for the archive modules and the new test suite, and add the archive tests to `docs/testing.md`. Verify the commands and paths mentioned exist.

## 6. Integration verification

- [x] 6.1 Run `npm run typecheck`, `npm test`, and `npm run build`; confirm all pass and `dist/commands/archive.js` and `dist/core/archive.js` exist.
- [x] 6.2 Run `node dist/cli.js archive --help` and an end-to-end smoke run in a temporary repository; confirm the output zip opens with `yauzl` or `unzip -l` and contains the expected ignored files.
- [x] 6.3 Run `openspec validate add-workspace-archive --strict`; confirm no validation errors or warnings.

## Workflow follow-up

- Review the implementation against `specs/workspace-archive/spec.md` and `specs/llm-file-manifest/spec.md`.
- Archive the change after the project's review requirements are satisfied.
- Verify the archived specs and update release notes or the version through the normal release process.
