# Spec Delta

## Purpose

Defines the `.llm-files` manifest that names the gitignored paths an agent needs in a worktree, and the `select` workflow that discovers gitignored candidates and records the user's choices in that manifest.

## ADDED Requirements

### Requirement: Manifest location and syntax

The tool SHALL read the manifest from `.llm-files` at the root of the current checkout, interpreting it as UTF-8 text with one repo-relative path per line. Lines whose first non-whitespace character is `#` SHALL be treated as comments, and blank lines SHALL be ignored. Paths SHALL be POSIX-style, relative to the checkout root, without a leading `./`; a trailing `/` SHALL be accepted and ignored for comparison. Entries SHALL be literal paths: no glob, brace, or wildcard expansion.

#### Scenario: Comments and blank lines are ignored

- **WHEN** `.llm-files` contains a comment line, a blank line, and `.claude/settings.local.json`
- **THEN** the tool treats the manifest as containing exactly one entry, `.claude/settings.local.json`

#### Scenario: Trailing slash marks a directory

- **WHEN** the manifest contains `.opencode/`
- **THEN** the tool treats the entry as the directory `.opencode` for both source resolution and destination comparison

### Requirement: Manifest path validation

The tool SHALL reject any manifest entry that is absolute, contains a `..` segment, normalizes outside the checkout root, or resolves to `.git` or anything inside it. Duplicate entries SHALL be collapsed to the first occurrence and reported as a warning. When one entry is nested inside another entry, the ancestor SHALL win, the nested entry SHALL be reported as `shadowed` rather than linked, and the run SHALL continue.

#### Scenario: Escaping entry is rejected

- **WHEN** an entry is `../secrets.env` or `/etc/passwd`
- **THEN** the tool reports the entry as invalid, does not create any symlink for it, and exits with a non-zero status

#### Scenario: Nested entry is shadowed

- **WHEN** the manifest lists both `.claude/` and `.claude/settings.local.json`
- **THEN** the tool links `.claude/`, reports `.claude/settings.local.json` as `shadowed`, and exits successfully

### Requirement: Missing and empty manifest handling

When `.llm-files` does not exist at the current checkout root, `link` and `list` SHALL fail with a message naming the expected path and suggesting `select`. When `.llm-files` exists but contains no entries, `link` SHALL report that there is nothing to link and exit successfully.

#### Scenario: Missing manifest

- **WHEN** the user runs `link` in a worktree with no `.llm-files`
- **THEN** the command exits non-zero and prints the expected manifest path plus the `select` command to run

#### Scenario: Empty manifest

- **WHEN** `.llm-files` contains only comments
- **THEN** `link` prints that there are no entries and exits 0 without touching the filesystem

### Requirement: Candidate discovery from git

`select` SHALL derive candidates from the source checkout using git's own ignore resolution, so that nested `.gitignore` files, `.git/info/exclude`, and global excludes are honoured without reimplementation. Candidates SHALL exclude files tracked by git, entries already present in the manifest, and the `.git` directory. By default a directory that git reports as wholly ignored SHALL be offered as a single candidate; when `--expand` is passed, its individual ignored files SHALL be offered instead.

#### Scenario: Nested gitignore rule is honoured

- **WHEN** the source checkout has `packages/app/.gitignore` containing `local.json`
- **THEN** `select` offers `packages/app/local.json` as a candidate

#### Scenario: Already-listed entry is not offered again

- **WHEN** `.llm-files` already contains `.env`
- **THEN** `select` does not offer `.env` as a candidate

#### Scenario: Ignored directory collapses to one candidate

- **WHEN** `.claude/` is ignored in full and `select` runs without `--expand`
- **THEN** `.claude/` appears once as a directory candidate rather than one candidate per file inside it

### Requirement: Build-artifact denylist

`select` SHALL exclude build artifacts and binaries using a built-in denylist that matches directory names at any depth and file extensions in the list documented in the README. `--exclude <pattern>` SHALL add patterns for the current run, and `--no-default-excludes` SHALL disable the built-in list. The denylist SHALL affect candidate discovery only; it SHALL NOT suppress or alter linking of entries already present in `.llm-files`.

#### Scenario: Denylisted directory is never offered

- **WHEN** `node_modules/` is gitignored and the user runs `select --all`
- **THEN** no `node_modules` entry is added to `.llm-files`

#### Scenario: Existing manifest entry is linked despite the denylist

- **WHEN** `.llm-files` lists `dist/` and the user runs `link`
- **THEN** the tool attempts to link `dist/` instead of silently skipping it

### Requirement: Selection writes the manifest atomically

`select` SHALL append the chosen entries to `.llm-files` in the current checkout, preserving existing order and comments, de-duplicating, and writing through a temporary file and rename so an interrupted write never truncates the manifest. Creating the file SHALL add a one-line comment header. Cancelling the picker SHALL leave the file untouched and exit with the cancel status. In interactive mode the picker SHALL support typing to filter candidates; when stdin is not a TTY and neither `--all` nor `--add` is given, the command SHALL fail with guidance instead of hanging.

#### Scenario: Selection extends the manifest

- **WHEN** the manifest lists `.env` and the user selects `.claude/` in the picker
- **THEN** the file still lists `.env` and now also lists `.claude/`, with no duplicate entries

#### Scenario: Non-interactive run without a selection flag

- **WHEN** `select` runs with stdin not attached to a TTY and no `--all` or `--add`
- **THEN** the command exits non-zero, writes nothing, and prints the non-interactive alternatives

### Requirement: Non-interactive selection

`select --all` SHALL add every candidate that survives filtering. `select --add <path>...` SHALL add exactly the named paths, validating each against the candidate set and rejecting paths that are tracked, not ignored, denylisted, or outside the source checkout.

#### Scenario: Adding a specific path

- **WHEN** the user runs `select --add .env .claude/settings.local.json` and both are gitignored in the source checkout
- **THEN** both paths are appended to the manifest for the next `link` run
