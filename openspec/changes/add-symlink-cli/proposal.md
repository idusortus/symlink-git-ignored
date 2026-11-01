# Proposal

## Why

Git worktrees share history but not working-tree files, so every gitignored file an LLM coding assistant depends on — `.env`, `.claude/`, `.opencode/`, local notes, MCP credentials — is missing in a fresh worktree. Today the workaround is manual `ln -s` calls from the original checkout, repeated per file and per worktree. A small `npx` tool can read one committed manifest and recreate those links in seconds, while keeping build output and binaries out of the picture.

## What Changes

- New CLI package `symlink-git-ignored` (bin: `symlink-git-ignored`), runnable with `npx`.
- `link` (default command) reads `.llm-files` from the current checkout and creates relative symlinks in the current checkout pointing at the same repo-relative paths in a **source checkout** — by default the primary worktree resolved from `git worktree list`, overridable with `--from <path>`.
- `select` builds or extends `.llm-files`: it enumerates entries git reports as ignored in the source checkout (so nested `.gitignore` files, `.git/info/exclude`, and global excludes are all honoured by delegating to git), presents an interactive multi-select, and appends the chosen repo-relative paths to `.llm-files` in the current checkout. `--all` and `--add <path>...` provide non-interactive paths.
- `list` reports, per manifest entry, whether the link exists (`linked`), the source is missing (`missing-source`), the destination is a real file or foreign link (`occupied`), the link is broken (`dangling`), or the entry is invalid; `--json` for scripts.
- A built-in denylist (extendable, not replaceable by default) keeps build artifacts and binaries out of the picker and out of new manifest entries: `node_modules/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `.turbo/`, `.cache/`, `target/`, `coverage/`, `*.exe`, `*.dll`, `*.so`, `*.dylib`, `*.o`, `*.a`, `*.node`, `*.wasm`. The denylist never filters entries already present in `.llm-files`.
- Collision policy: existing destinations are skipped by default, replaced with `--force`, or renamed aside with `--backup`. Dangling symlinks are repaired. `--dry-run` prints the plan without touching the filesystem.
- Safety rails: refuse to run when the current checkout *is* the source checkout, reject manifest paths that are absolute or escape the checkout, never write through a parent directory that resolves outside the checkout, and never touch `.git`.
- **Non-goals**: no `unlink`/restore command in v1, no file watching or content sync, no globs/wildcards in `.llm-files`, no copying of contents, no dedicated Windows link strategy (best-effort relative symlinks only), no CI publish workflow.

## Capabilities

### New Capabilities

- `llm-file-manifest`: what `.llm-files` is (location, syntax, validation rules, denylist) and how `select` discovers gitignored candidates and appends them to the manifest.
- `worktree-link`: how the source checkout is resolved and how links are planned, created, repaired, reported, and kept inside the current checkout.

### Modified Capabilities

<!-- None: greenfield repository with no existing specs. -->

## Impact

- New package scaffold: `package.json`, `tsconfig.json`, `.gitignore`, `src/`, `test/`, `README.md`.
- Runtime dependencies: `commander` (argument parsing) and `prompts` (searchable multi-select). `git` must be on `PATH`; the tool shells out to git instead of reimplementing gitignore semantics.
- Dev dependencies: TypeScript, `tsx`, `vitest`, `@types/node`, `@types/prompts`.
- Consumers must commit `.llm-files` at their repo root and run the tool inside a worktree. Because the manifest is tracked, edits made by `select` appear as a normal git change on the current branch — intentional, but it must be documented (see design risks).
- No changes to any existing system.
