# worktree-link Specification

## Purpose

Defines how the tool resolves the checkout that holds the real gitignored files and how it creates, repairs, and reports relative symlinks to those files inside the checkout being worked in.

## Requirements

### Requirement: Current checkout resolution

The tool SHALL resolve the destination root with `git rev-parse --show-toplevel` from the working directory, so it behaves identically from any subdirectory of a checkout. When the working directory is not inside a git working tree, the command SHALL fail with a message explaining that it must run inside a worktree or repository.

#### Scenario: Run from a subdirectory

- **WHEN** the user runs `link` from `<worktree>/packages/app`
- **THEN** links are created relative to the worktree root, not to `packages/app`

#### Scenario: Run outside git

- **WHEN** the user runs the tool in a directory that is not inside a git working tree
- **THEN** the command exits non-zero with a message that no git repository was found

### Requirement: Source checkout resolution

The source root SHALL be, in order of precedence: the path passed with `--from`, then the first worktree reported by `git worktree list --porcelain`. The tool SHALL fail with a clear message when the resolved source is not a directory, is the same checkout as the destination, or when only one worktree exists and it is the current one. A bare repository SHALL be rejected as a source.

#### Scenario: Primary worktree is chosen by default

- **WHEN** the repository has a primary checkout and one linked worktree, and `link` runs in the linked worktree
- **THEN** the source is the primary checkout

#### Scenario: Source override

- **WHEN** the user passes `--from /path/to/other-checkout`
- **THEN** every source path is resolved under `/path/to/other-checkout` regardless of `git worktree list`

#### Scenario: Running in the source checkout

- **WHEN** the current checkout root equals the resolved source root
- **THEN** the command refuses to run, exits non-zero, and creates nothing

### Requirement: Relative symlink creation

For each valid manifest entry the tool SHALL create a symlink at `<destination-root>/<entry>` whose target is the relative path from the entry's parent directory to `<source-root>/<entry>`, using POSIX separators. Missing parent directories SHALL be created. Re-running when the link already points at the correct target SHALL be a no-op reported as `already-linked`.

#### Scenario: Link to an ignored file

- **WHEN** the manifest lists `.env` and the source checkout has `.env`
- **THEN** the destination checkout gets `.env` as a relative symlink to the source file

#### Scenario: Link to an ignored directory

- **WHEN** the manifest lists `.claude/`
- **THEN** the destination gets one symlink at `.claude` pointing at the source directory

#### Scenario: Idempotent rerun

- **WHEN** `link` runs twice with no filesystem changes
- **THEN** the second run creates no new links and reports every entry as `already-linked`

### Requirement: Collision handling

When the destination path already exists and is not a symlink resolving to the correct source, the tool SHALL skip it and report the collision without deleting anything. With `--force` it SHALL remove the existing path and create the link. With `--backup` it SHALL first rename the existing path to `<name>.bak-<YYYYMMDDHHmmss>`, adding a numeric suffix when that name is taken, then create the link. A dangling symlink SHALL be replaced without requiring `--force` and reported as `repaired`. `--force` and `--backup` together SHALL be rejected as conflicting options.

#### Scenario: Existing real file is protected

- **WHEN** the destination already contains a regular file at `.env` and neither `--force` nor `--backup` is given
- **THEN** the file is left untouched, the entry is reported as `occupied`, and the other entries are still processed

#### Scenario: Backup then link

- **WHEN** the destination contains a regular file at `.env` and the user passes `--backup`
- **THEN** the file is renamed to `.env.bak-<timestamp>` and `.env` becomes the symlink

#### Scenario: Dangling link is repaired

- **WHEN** the destination `.env` is a symlink whose target no longer exists in the source checkout
- **THEN** the tool replaces it with the correct relative link and reports `repaired`

### Requirement: Missing source and partial failure

When a manifest entry has no corresponding path in the source checkout, the tool SHALL report it as `missing-source`, create nothing for that entry, continue processing remaining entries, and exit with a non-zero status. Entries that succeed SHALL remain linked.

#### Scenario: One entry missing, rest applied

- **WHEN** the manifest lists `.env` and `.notes` but the source has only `.env`
- **THEN** `.env` is linked, `.notes` is reported as `missing-source`, and the exit status is 1

### Requirement: Containment and .git protection

Before creating any parent directory or link, the tool SHALL verify that the deepest existing ancestor of the destination path resolves to a path inside the destination root; if it does not, the entry SHALL be reported as `unsafe` and skipped. The tool SHALL never create, modify, or traverse into the destination `.git` directory, and SHALL reject link targets under the source `.git` directory.

#### Scenario: Symlinked parent escapes the worktree

- **WHEN** destination `.claude` is a symlink pointing outside the checkout and the manifest lists `.claude/settings.json`
- **THEN** the entry is reported as `unsafe`, nothing is written outside the checkout, and the run exits non-zero

### Requirement: Plan reporting and dry run

Every command SHALL compute a plan before mutating the filesystem. `--dry-run` SHALL print that plan and exit without creating, moving, or deleting anything. Human-readable output SHALL state the source and destination roots, one line per manifest entry with its final status, and a summary count. `--json` SHALL emit a single object containing the source root, destination root, an array of entries with `path`, `status`, and `target` (when known), and a summary of counts.

#### Scenario: Dry run changes nothing

- **WHEN** `link --dry-run` runs against a worktree with missing links
- **THEN** it prints the actions it would take, creates no files, and exits 0

#### Scenario: JSON output is machine readable

- **WHEN** `list --json` runs
- **THEN** stdout is a single JSON object with `source`, `destination`, `entries`, and `summary` and contains no progress or colour output

### Requirement: Entry status reporting

`list` SHALL report each manifest entry with exactly one of: `linked`, `already-linked`, `missing-source`, `not-linked`, `occupied`, `dangling`, `shadowed`, `invalid`, or `unsafe`. `list` SHALL treat a source path that exists but is not reachable from the destination as `not-linked` and a destination symlink whose target does not exist as `dangling`.

#### Scenario: Status of a fresh worktree

- **WHEN** `list` runs in a worktree where no link has been created yet
- **THEN** every valid entry is reported as `not-linked` and the summary reflects that

### Requirement: Exit status contract

The tool SHALL exit 0 when every valid entry is linked, already linked, repaired, or deliberately skipped by the collision policy without `--force`/`--backup`; it SHALL exit 1 when the manifest is missing or invalid, the source cannot be resolved, or any entry is `missing-source`, `invalid`, `unsafe`, or fails to link; and it SHALL exit 130 when the interactive picker is cancelled.

#### Scenario: Skips do not fail the build

- **WHEN** all entries are either linked or skipped because of an existing destination
- **THEN** the command exits 0 while still printing a warning for each skipped entry
