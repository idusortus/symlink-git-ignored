# Proposal

## Why

Git worktrees share history but not gitignored working-tree files. The existing tool recreates those files as symlinks from one checkout, but it cannot produce a portable copy. Losing the primary checkout therefore loses local credentials, agent configuration, and other ignored files that git cannot restore. A single command should capture everything git ignores into a zip that can restore a workspace or seed a clone on another machine.

The current denylist also misses common .NET output folders, so `select` offers `bin/` and `obj/` trees that no worktree needs.

## What Changes

- Add an `archive` command that writes a zip of gitignored files from the current checkout, preserving repo-relative paths so extraction recreates the workspace layout.
- Enumerate ignored paths with git (`ls-files --others --ignored --exclude-standard`), so nested `.gitignore` files, `.git/info/exclude`, and global excludes all apply.
- Exclude the built-in build-artifact denylist by default. Add `--include-all` for a literal dump of every ignored path, and `--exclude <pattern>...` for extra exclusions.
- Dereference symlinks into real file and directory contents so an archive made in a linked worktree restores usable files instead of links back to the primary checkout. Detect loops, missing targets, and links that escape the checkout and known worktrees.
- Default to `<checkout>/llm-workspace.zip`, refuse to overwrite without `--force`, support `--output <path>`, and never include the archive itself.
- Support `--dry-run` and `--json`, and warn when the archive lands in a checkout without being gitignored because it may contain credentials.
- Expand the built-in denylist with `bin`, `obj`, `.vs`, and `TestResults`.

## Capabilities

### New Capabilities

- `workspace-archive`: Defines the `archive` command: which ignored paths are captured, how symlinks and build artifacts are handled, where the zip is written, overwrite behavior, reporting, and safety warnings.

### Modified Capabilities

- `llm-file-manifest`: Expands the documented build-artifact denylist used by `select` (and reused by `archive`) with common .NET output folders and Visual Studio artifacts.

## Impact

- New command wiring in `src/cli.ts` and a new `src/commands/archive.ts`.
- New archive planning and zip-writing modules under `src/core/`.
- `src/core/excludes.ts` gains the .NET directory entries; `select` behavior changes only by offering fewer candidates.
- A new runtime dependency for zip creation (planned: `yazl`, with `@types/yazl` for development), because Node has no built-in zip writer and shelling out to `zip` is not portable.
- New archive types and JSON/human output, plus README, architecture, testing, and CLI integration tests.
- No change to `.llm-files`, manifest validation, or `link`/`list` behavior.
