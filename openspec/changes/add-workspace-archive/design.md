# Design

## Context

See `proposal.md` for motivation and `specs/workspace-archive/spec.md` for the behaviour contract. The current CLI resolves the checkout with `getCheckoutRoot`, delegates all ignore semantics to git, and keeps link planning separate from filesystem mutation. `archive` should follow the same shape: resolve, plan, report, then apply. The built-in denylist already centralizes build-artifact filtering and is shared by candidate discovery.

Constraints that shape the implementation:

- No state file. Archive output paths are derived from the current checkout and options on every run.
- No runtime dependency exists for zip creation, and Node has no built-in zip writer.
- Symlinks are normal in linked worktrees; `.claude`, `.env`, and other ignored entries may be links into the primary checkout.
- Archives can contain credentials, so permissions and accidental-commit warnings matter.
- The tool is POSIX-first but must fail with a clear error, not silently misbehave, on other platforms.

## Goals / Non-Goals

**Goals:**

- Make `archive` a first-class command with the same discovery and error conventions as the rest of the CLI.
- Keep memory bounded for large ignored trees by streaming file contents into the zip.
- Produce a portable archive from either a primary checkout or a linked worktree.
- Keep the zip path layout predictable and safe to extract.

**Non-Goals:**

- A `restore` or `unzip` command. Users extract with standard zip tools.
- Encryption, password protection, or remote upload.
- Selecting individual paths on the command line; the unit of capture is the whole checkout minus filters.
- Preserving symlinks as symlinks, hard-link metadata, ownership, ACLs, or xattrs.
- Reworking `link`, `list`, `select`, or manifest semantics.

## Decisions

### Command and scope

Add `archive` as a normal (non-default) subcommand in `src/cli.ts`, with `src/commands/archive.ts` as the orchestrator. It always operates on the checkout resolved from the working directory; it does not take `--from` and does not read `.llm-files`. This matches the recovery use case (archive the workspace you are standing in) and avoids ambiguity about which checkout's ignored paths are captured.

The flag surface is:

```text
archive [--output <path>] [--force] [--dry-run]
        [--include-all] [--exclude <pattern>...] [--json]
```

`--include-all` disables only the default denylist. `--exclude` adds patterns on top of whichever default state is in effect. These names mirror the intent of `select` while making the "literal dump" case explicit.

### Git-based discovery, filesystem-based expansion

Use `git ls-files --others --ignored --exclude-standard -z` without `--directory`. That returns individual ignored files and honours nested `.gitignore`, `.git/info/exclude`, and global excludes. The existing `listIgnoredEntries(root, { collapsed: false })` helper already does this and returns `{ path, isDirectory }`.

Git's ignored listing misses links created by `link` when the ignore rule has a trailing slash. For example, `.claude/` matches a real directory but not the untracked `.claude` symlink that replaces it in a worktree. Add a second discovery pass with `git ls-files --others --exclude-standard -z`, filter it with `lstat` to untracked symlinks, and keep only links whose `realpath` resolves inside the allowed roots. Merge and de-duplicate this set with the ignored set. Tracked symlinks stay out because `--others` excludes tracked paths, and ordinary untracked files are ignored by the `lstat` filter.

The archive planner then resolves each entry with the filesystem:

1. Filter the entry through `createExcludeMatcher`.
2. `stat` the path (follows symlinks).
3. A regular file becomes one archive entry.
4. A directory (real, or reached through a symlink) is walked recursively; each regular file becomes an archive entry named `<link-path>/<relative-child>`.
5. Symlinks inside a walked directory are resolved the same way, subject to the safety rules below.

Directories are not emitted as zip entries. Git does not track empty directories, and every non-empty directory is represented by its files.

### Symlink safety envelope

Build an allowed-root set from the real paths of the current checkout and every worktree returned by `listWorktrees`. Every symlink target must resolve with `realpath` inside that set. This permits the normal worktree case (link into the primary checkout) while refusing a link to `/etc`, a home directory, or a network mount.

During recursive walking, keep a stack of real directory paths. Revisiting a path already on the stack is a `cyclic` problem; the stack is popped on return, so the same directory reached through two different link names may be archived twice under different entry names. Other failures map as follows:

| Condition | Problem status |
| --- | --- |
| `realpath`/`stat` says the target is missing | `missing-source` |
| Resolved target is outside the allowed roots | `unsafe` |
| Traversal revisits an ancestor directory | `cyclic` |
| Target is a socket, FIFO, device, or other non-file/non-directory | `unsupported` |

Problem paths are omitted but do not abort the plan. The safe remainder is still written, and the exit code is 1, matching the partial-failure model of `link`.

### Zip writer

Add `yazl` as a runtime dependency. It is a small, streaming zip writer that takes file paths, reads them lazily, sets CRC and ZIP64 metadata, and exposes its output as a Node readable stream. This avoids buffering file contents in memory and avoids shelling out to a platform `zip` binary.

Alternatives considered:

- **`fflate`**: maintained and dependency-free, but its push-based streaming API requires manual backpressure handling; the synchronous API would buffer the whole archive.
- **`archiver`**: many transitive dependencies for one command.
- **System `zip`**: not portable and adds an external runtime requirement.
- **Hand-rolled ZIP writer**: unnecessary risk around CRC, ZIP64, and central-directory details.

Use `yazl`'s `addFile` with the resolved source path and the checkout-relative entry name, passing the planned mtime and a mode that preserves the executable bit. Add a test-only `yauzl` dependency to read archives in integration tests instead of relying on an installed `unzip`.

### Two-phase plan and write

`planArchive` returns an `ArchivePlan`:

```ts
interface ArchiveEntry {
  path: string;        // POSIX, checkout-relative
  sourcePath: string;  // absolute real path to read
  size: number;
  mtime: Date;
  mode: number;
}

interface ArchiveProblem {
  path: string;
  status: "missing-source" | "unsafe" | "cyclic" | "unsupported";
  message: string;
}

interface ArchivePlan {
  checkoutRoot: string;
  archivePath: string;
  entries: ArchiveEntry[];
  problems: ArchiveProblem[];
  totalBytes: number;
  exitCode: number;
}
```

Planning resolves every symlink and directory before the writer starts, so entry names, sizes, and problems are known up front. Writing then streams only `plan.entries`. A file that disappears or becomes unreadable between planning and writing causes the writer to fail; the temporary archive is removed and the command exits 1 rather than leaving a partial file.

This differs from a single-pass walk: a single pass would make output atomicity and complete problem reporting harder, and would emit a partially written temp file that must be cleaned up on every validation failure.

### Output path, atomicity, and warnings

- Default output: `path.join(checkoutRoot, "llm-workspace.zip")`.
- `--output` is resolved against `process.cwd()`, not the checkout root, matching normal CLI expectations for an explicit path.
- Parent directories are created before writing, so an explicit nested output path works like the rest of the tool.
- An existing destination is an error without `--force`. A destination that is a directory is always an error. With `--force`, a regular file or symlink is replaced.
- Write to `<output>.tmp-<pid>-<timestamp>` in the same directory, `chmod` the temp file to `0600` on POSIX, then rename over the destination. POSIX rename is atomic. On Windows, where rename cannot replace an existing file, remove the destination immediately before the rename and document that the replacement is best-effort.
- Never include the output: compare each candidate's absolute source path against the resolved output path, including files discovered under symlinked directories. If the output already existed and git lists it as ignored, this comparison removes it.
- After a successful write, if the output is inside the checkout, ask git whether the path is ignored (`git check-ignore -q -- <relative>`). A non-zero "not ignored" result prints a stderr warning that the zip can be committed and may contain credentials. The warning is best-effort and never changes the exit code.

`runGit` currently throws on any non-zero exit. Add a small helper that treats `check-ignore` exit 1 as "not ignored" and other failures as git errors, rather than changing `runGit`'s general contract.

### Exit and reporting model

- 0: archive written, nothing to archive, or clean dry run.
- 1: output conflict/failure, or any archive problem. A partial archive is still written when at least one safe entry exists.
- `--dry-run` computes the plan, prints it, and writes nothing. Output collisions are still reported as errors because the real run would fail.
- `--json` writes one object to stdout with `checkout`, `archive`, `dryRun`, `entries`, `problems`, `summary`, and `exitCode`; warnings and errors stay on stderr.
- Human output lists the checkout, the archive path, one line per entry or problem, and a summary with file count and total bytes.

Keep archive types in `src/core/types.ts` and formatting in `src/output.ts` alongside the link formatters. A separate status vocabulary avoids overloading `EntryStatus`, which describes symlink state rather than archive state.

### Denylist expansion

Add `bin`, `obj`, `.vs`, and `TestResults` to `DEFAULT_EXCLUDED_DIRS`. No matcher logic changes are needed: the existing matcher already applies directory segments at any depth. The README list, `select` behaviour, and the archive default inherit the change. Users who need an ignored `bin/` directory can pass `--no-default-excludes` to `select` or `--include-all` to `archive`.

### Documentation and tests

- README: new command section, flags, default output, recovery workflow (`unzip` into a fresh clone), credential warning, `.gitignore` advice, and the expanded denylist.
- `docs/architecture.md`: add the archive flow and modules to the runtime diagram and module map.
- Unit tests: denylist additions; planner filtering; symlink-to-file and symlink-to-directory expansion; missing/external/cyclic links; output self-exclusion; entry-name safety.
- CLI integration tests: archive in a primary checkout and in a linked worktree, `--include-all`, `--exclude`, `--output`, overwrite protection and `--force`, `--dry-run`, `--json`, owner-only mode, and the not-ignored warning. Use `yauzl` to inspect entries and contents.

## Risks / Trade-offs

- **Credentials in a portable file** → create with `0600` and warn when the destination is committable. The user still controls distribution; no encryption is attempted.
- **Large archives with `--include-all`** → streaming avoids memory growth, but time and disk use can be large. The default denylist keeps dependencies and build output out. Document the cost.
- **Following symlinks can duplicate content or cross into another worktree** → restrict to registered worktrees, detect cycles by real path, and report each skipped target.
- **Files changing during the run** → there is no snapshot or lock. The planner records sizes and mtimes, then `yazl` reads later. A disappearing file aborts the write and removes the temp file. Document that the archive reflects a best-effort point in time.
- **`bin` is a broad directory name** → some non-.NET repositories keep ignored scripts in `bin/`. This is a deliberate default reduction; `select --no-default-excludes` and `archive --include-all` are the escape hatches.
- **`yazl` and `yauzl` are small, older packages** → they are stable, focused, and dependency-light. Keep them behind the archive module so replacing the writer later does not affect planning, output, or specs.
- **Windows rename semantics** → the POSIX path is atomic; Windows replacement is remove-then-rename. The existing README already scopes full symlink support to POSIX, so archive documents the same platform caveat.

## Migration Plan

The change is additive and needs no data migration. Ship as a minor release. Existing `.llm-files` manifests, links, and `select` workflows keep working; the only behavioural change outside the new command is that `select` no longer offers `bin`, `obj`, `.vs`, or `TestResults` candidates by default. Users who want the old candidate list pass `--no-default-excludes`.

Rollback is a revert of the release: the archive command and dependency disappear, and the denylist returns to its previous set. No persisted state is created by `archive` beyond the output zip.
