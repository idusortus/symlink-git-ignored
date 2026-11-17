# workspace-archive Specification

## Purpose

Capture the gitignored files of a checkout into a portable zip so a workspace, including local credentials and agent configuration that git cannot restore, can be recovered or cloned.

## Requirements

### Requirement: Archive command scope

`archive` SHALL resolve the checkout root with git from the working directory, so it behaves identically from any subdirectory, and SHALL archive gitignored paths from that checkout. It SHALL work without a `.llm-files` manifest. When the working directory is not inside a git working tree, the command SHALL fail with a message explaining that it must run inside a checkout and SHALL write no archive.

#### Scenario: Run from a subdirectory

- **WHEN** the user runs `archive` from `<checkout>/packages/app`
- **THEN** paths stored in the zip remain relative to the checkout root, not to `packages/app`

#### Scenario: Archive without a manifest

- **WHEN** the checkout has no `.llm-files` but has gitignored files
- **THEN** the command archives the ignored files and exits successfully

#### Scenario: Run outside git

- **WHEN** the command runs in a directory that is not inside a git working tree
- **THEN** it exits non-zero with a message that no git repository was found and creates no archive

### Requirement: Ignored file discovery

The command SHALL discover entries with git's own ignore resolution, using `git ls-files --others --ignored --exclude-standard`, so nested `.gitignore` files, `.git/info/exclude`, and global excludes are honoured. It SHALL include untracked ignored files, never tracked files or anything under `.git`, and SHALL store each file at its POSIX path relative to the checkout root. Empty directories SHALL not be represented, because git does not track them.

#### Scenario: Nested gitignore rule is honoured

- **WHEN** the checkout has `packages/app/.gitignore` containing `local.json` and that file is untracked
- **THEN** `packages/app/local.json` is included in the archive

#### Scenario: Tracked files are excluded

- **WHEN** a tracked file also matches a `.gitignore` rule
- **THEN** the file is not added to the archive

#### Scenario: The git directory is never archived

- **WHEN** the checkout contains ignored paths
- **THEN** no entry whose path is `.git` or starts with `.git/` appears in the archive

### Requirement: Untracked worktree link discovery

In addition to ignored files, the command SHALL consider untracked symlinks in the current checkout whose resolved targets are inside the current checkout or another registered worktree. This includes links created by `link` when a trailing-slash ignore rule such as `.claude/` does not classify the symlink itself as ignored. Tracked symlinks SHALL remain excluded, and the discovered links SHALL follow the dereferencing and containment requirements.

#### Scenario: Worktree link is discovered

- **WHEN** `.claude/` is gitignored and `.claude` in a linked worktree is an untracked symlink to the primary checkout
- **THEN** `archive` considers `.claude` and archives the files under its target

#### Scenario: Tracked symlink is not added as a worktree link

- **WHEN** a symlink is tracked by git
- **THEN** it is not discovered merely because it is a symlink

### Requirement: Denylist filtering

By default `archive` SHALL exclude the built-in build-artifact denylist shared with `select`, including the .NET directory additions. `--include-all` SHALL disable only the built-in denylist, and `--exclude <pattern>...` SHALL add patterns for the current run. Filtering SHALL apply to every path considered, including files discovered under a symlinked directory.

#### Scenario: Dependency trees are not archived by default

- **WHEN** `node_modules/` and `bin/` are gitignored and the user runs `archive`
- **THEN** neither directory contributes entries to the zip

#### Scenario: Include everything ignored

- **WHEN** the user runs `archive --include-all`
- **THEN** `node_modules/` and `bin/` are included even though the built-in denylist would reject them

#### Scenario: Extra exclusions apply

- **WHEN** the user runs `archive --exclude '*.log'`
- **THEN** ignored files ending in `.log` are omitted while other ignored files are archived

### Requirement: Symlink content capture

The command SHALL dereference symlinks and store the target's contents under the symlink's checkout-relative path, so a zip created in a linked worktree restores real files rather than links back to the primary checkout. A symlink to a directory SHALL contribute the directory's files recursively under the symlink path.

#### Scenario: Worktree link restores file contents

- **WHEN** `.claude` is a symlink to the primary checkout's `.claude` directory and the user runs `archive` in a linked worktree
- **THEN** the zip contains `.claude/settings.local.json` with the target file's contents, not a symlink entry

#### Scenario: Linked file is captured

- **WHEN** an ignored path is a symlink to a regular file inside another registered worktree
- **THEN** the zip contains that file's contents at the symlink's path

### Requirement: Symlink target containment

A symlink target SHALL be followed only when its resolved path is inside the current checkout or another registered worktree of the same repository. A target outside those roots SHALL be reported as `unsafe` and skipped, while the remaining entries are still archived and the command exits non-zero.

#### Scenario: External symlink is refused

- **WHEN** an ignored symlink resolves outside the checkout and all registered worktrees
- **THEN** the archive omits that path, reports it as `unsafe`, and exits 1

### Requirement: Symlink traversal failures

A symlink target that does not exist SHALL be reported as `missing-source`, a directory traversal that revisits an ancestor as `cyclic`, and a target that is neither a regular file nor a directory as `unsupported`. Each affected path SHALL be skipped, the remaining entries SHALL still be archived, and the command SHALL exit non-zero.

#### Scenario: Broken symlink is reported

- **WHEN** an ignored symlink points at a path that does not exist
- **THEN** the archive omits that path, reports it as `missing-source`, and exits 1

#### Scenario: Symlink loop is stopped

- **WHEN** following a symlinked directory would revisit an ancestor already on the traversal stack
- **THEN** the traversal stops at that path, reports it as `cyclic`, and does not hang or recurse forever

#### Scenario: Unsupported target is reported

- **WHEN** an ignored path resolves to a socket, FIFO, or device rather than a regular file or directory
- **THEN** the archive omits that path, reports it as `unsupported`, and exits 1

### Requirement: Archive output destination

The command SHALL write `<checkout>/llm-workspace.zip` by default. `--output <path>` SHALL override the destination, with a relative path resolved against the current working directory.

#### Scenario: Default destination

- **WHEN** the user runs `archive` in a checkout with a readable ignored `.env`
- **THEN** `<checkout>/llm-workspace.zip` is created

#### Scenario: Custom output path

- **WHEN** the user runs `archive --output /tmp/workspace.zip`
- **THEN** the zip is written at `/tmp/workspace.zip` with checkout-relative entry names

### Requirement: Archive overwrite protection

An existing destination SHALL cause an error without `--force`. With `--force`, a regular file or symlink SHALL be replaced. A destination that is a directory SHALL always be rejected. The command SHALL write through a temporary file in the destination directory and rename it into place, so a failed write never truncates or replaces a previous archive. The output file SHALL never be included in its own archive.

#### Scenario: Existing archive is protected

- **WHEN** `llm-workspace.zip` already exists and the user runs `archive` without `--force`
- **THEN** the command exits non-zero and leaves the existing file unchanged

#### Scenario: Forced replacement is atomic

- **WHEN** an archive exists and the user runs `archive --force`
- **THEN** the new archive replaces it and no temporary file is left behind

#### Scenario: Destination directory is rejected

- **WHEN** `--output` points at an existing directory
- **THEN** the command exits non-zero and leaves the directory unchanged

#### Scenario: Output is excluded from itself

- **WHEN** an ignored `llm-workspace.zip` exists and the user runs `archive --force`
- **THEN** the new archive does not contain an entry for itself

### Requirement: Empty archive handling

When no paths remain after discovery and filtering, the command SHALL report that there is nothing to archive and exit successfully without creating or replacing the destination file.

#### Scenario: Nothing to archive

- **WHEN** every ignored path is excluded by the denylist
- **THEN** no zip is written, the message says there is nothing to archive, and the exit status is 0

### Requirement: Archive format and entry names

The command SHALL produce a standard zip archive that ordinary extraction tools can read. Entry names SHALL be POSIX paths relative to the checkout root, without a leading slash, `..` segment, or leading `./`. The archive SHALL preserve file contents, modification times, and the executable bit where the platform provides it. It SHALL contain no directory-traversal entry.

#### Scenario: Standard extraction restores the layout

- **WHEN** the produced zip is extracted into an empty checkout root
- **THEN** each archived file appears at its original repo-relative path with its original contents

#### Scenario: Entry names cannot escape extraction

- **WHEN** the archive is inspected
- **THEN** every entry name is relative and free of `..` segments

### Requirement: Dry run

`--dry-run` SHALL resolve ignored paths, symlinks, and denylist filtering, print the plan, and write no zip and no temporary file. The exit status SHALL still reflect any reported problems.

#### Scenario: Dry run changes nothing

- **WHEN** the user runs `archive --dry-run`
- **THEN** the output lists the files that would be archived and no file is created

### Requirement: Archive human-readable output

Human-readable output SHALL state the checkout, the destination archive, one line per included entry or problem, and a summary with file count and total bytes.

#### Scenario: Summary lists entries

- **WHEN** `archive` writes an archive containing two ignored files
- **THEN** stdout names the checkout and archive, lists both file paths, and prints a summary with the count and total size

### Requirement: Archive JSON output

`--json` SHALL emit exactly one object on stdout with `checkout`, `archive`, `dryRun`, `entries`, `problems`, `summary`, and `exitCode`. Each entry SHALL carry `path`, `size`, and a status of `archived` or `would-archive`; each problem SHALL carry `path`, a status of `missing-source`, `unsafe`, `cyclic`, or `unsupported`, and a message. Errors SHALL go to stderr and SHALL never be mixed into the JSON on stdout.

#### Scenario: JSON is machine readable

- **WHEN** the user runs `archive --json`
- **THEN** stdout is a single JSON object with the documented keys and contains no progress or colour output

#### Scenario: Problems are reported separately

- **WHEN** one ignored symlink is unsafe and another file is archivable
- **THEN** the safe file is included, the unsafe path appears in `problems`, and the command exits 1

### Requirement: Archive exit status

The command SHALL exit 0 when every considered path is archived and the archive is written, when there is nothing to archive, or when a clean dry run completes. It SHALL exit 1 when the output cannot be written or replaced, when any path is `missing-source`, `unsafe`, `cyclic`, or `unsupported`, or when no archive could be produced.

#### Scenario: Partial archive still fails

- **WHEN** one symlink is unsafe but other files are archived
- **THEN** the zip is written for the safe files and the command exits 1

### Requirement: Archive confidentiality safeguards

On POSIX the archive SHALL be created with owner-only permissions (`0600`). When an archive is written inside the current checkout and git does not ignore the destination path, the command SHALL print a warning on stderr that the file can be committed accidentally and may contain credentials. The warning SHALL not appear on stdout or alter `--json` output.

#### Scenario: Archive is owner-only

- **WHEN** the command writes an archive on a POSIX filesystem
- **THEN** the resulting file is readable and writable by the owner only

#### Scenario: Committable archive is flagged

- **WHEN** the default `llm-workspace.zip` is not matched by any ignore rule
- **THEN** the command writes it and warns on stderr that it is inside the checkout and may contain credentials
