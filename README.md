# symlink-git-ignored

[![npm version](https://img.shields.io/npm/v/symlink-git-ignored.svg)](https://www.npmjs.com/package/symlink-git-ignored)
[![CI](https://github.com/idusortus/symlink-git-ignored/actions/workflows/ci.yml/badge.svg)](https://github.com/idusortus/symlink-git-ignored/actions/workflows/ci.yml)

Git worktrees share history but not working-tree files. Every gitignored file an LLM coding assistant relies on — `.env`, `.claude/`, `.opencode/`, local notes, MCP credentials — is missing from a fresh worktree. This tool recreates those files as symlinks, driven by one committed manifest.

```bash
cd ../my-repo-feature          # a linked worktree
npx symlink-git-ignored        # symlink everything listed in .llm-files
```

The real files stay in your primary checkout (the one you ran `git worktree add` from). Nothing is copied, and no file content is ever touched.

## Install

Requires **Node >= 22.12.0**.

```bash
npx symlink-git-ignored             # run once inside a worktree
npx symlink-git-ignored select      # add gitignored paths to .llm-files
npx symlink-git-ignored archive     # write gitignored files to a zip
npm install -g symlink-git-ignored  # optional global install
```

## Documentation

- **Using the tool** — this README covers install, commands, flags, statuses, exit codes, and safety.
- **Contributing** — [CONTRIBUTING.md](https://github.com/idusortus/symlink-git-ignored/blob/master/CONTRIBUTING.md): setup, change workflow, conventions, release, and security reporting.
- **Architecture** — [docs/architecture.md](https://github.com/idusortus/symlink-git-ignored/blob/master/docs/architecture.md): runtime flow, module map, plan model, and safety invariants.
- **Testing** — [docs/testing.md](https://github.com/idusortus/symlink-git-ignored/blob/master/docs/testing.md): the Vitest suite, real-git fixtures, and how to add a test.
- **AI agents** — [AGENTS.md](https://github.com/idusortus/symlink-git-ignored/blob/master/AGENTS.md) for working on this repository, and [docs/AGENT_PROMPT.md](https://github.com/idusortus/symlink-git-ignored/blob/master/docs/AGENT_PROMPT.md) for having an agent configure the tool in another repository.

## The manifest

`.llm-files` lives at the repo root and is committed, so every worktree receives it through git:

```gitignore
# Paths to link from the source checkout into worktrees.
.env
.claude/
docs/local/
```

- UTF-8, one repo-relative path per line.
- Lines starting with `#` are comments; blank lines are ignored.
- A trailing `/` marks a directory (accepted, not required).
- Paths are literal: no globs, no `..`, no absolute paths.
- Duplicates are reported; a path already covered by a directory entry is reported as `shadowed`.

Create it with `npx symlink-git-ignored select` in your primary checkout, then commit it. The manifest is written in the checkout where `select` runs; run it in a worktree only if you want the file on that worktree's branch.

## Commands

### `link` (default)

```bash
npx symlink-git-ignored [--from <path>] [--dry-run] [--force] [--backup] [--json]
```

Creates one relative symlink per manifest entry in the current checkout, pointing at the same path in the source checkout.

| Flag | Meaning |
| --- | --- |
| `--from <path>` | Source checkout. Defaults to the primary worktree from `git worktree list`. |
| `--dry-run` | Print the plan; create, move, and delete nothing. |
| `--force` | Replace an existing destination (file, directory, or foreign link). |
| `--backup` | Rename an existing destination to `<name>.bak-<YYYYMMDDHHmmss>` first. |
| `--json` | Emit one JSON object on stdout. |

`--force` and `--backup` are mutually exclusive. A dangling symlink is repaired without either flag. With neither flag, an occupied destination is skipped and the run still exits 0.

### `select`

```bash
npx symlink-git-ignored select              # interactive, type-to-filter picker
npx symlink-git-ignored select --all        # every candidate
npx symlink-git-ignored select --add .env .claude/
```

Candidates are the paths git reports as ignored in the source checkout, so nested `.gitignore` files, `.git/info/exclude`, and global excludes all apply exactly as git does. Files already in the manifest, tracked files, and build artifacts are not offered.

| Flag | Meaning |
| --- | --- |
| `--from <path>` | Source checkout to read ignored paths from. |
| `--all` | Add every candidate without prompting. |
| `--add <paths...>` | Add named paths without prompting. |
| `--expand` | Offer individual files inside wholly ignored directories (may be slow). |
| `--exclude <pattern...>` | Extra patterns to keep out of the candidate list. |
| `--no-default-excludes` | Disable the built-in build-artifact denylist. |

Without `--all` or `--add`, `select` needs a TTY. `--add` rejects tracked paths, paths outside the checkout, and denylisted paths with a specific error.

Selected paths are appended atomically, preserving comments and order. Because the manifest is tracked, the edit appears on the current branch — commit it when you want other worktrees to pick it up.

### `archive`

```bash
npx symlink-git-ignored archive [--output <path>] [--force] [--dry-run] [--include-all] [--exclude <pattern...>] [--json]
```

Writes a zip of the gitignored files in the current checkout. It does not need `.llm-files`, and it works in the primary checkout or a linked worktree. Entries keep their repo-relative paths, so extracting the zip into a fresh clone restores the workspace layout, including `.env`, agent configuration, MCP credentials, and other local files that git cannot restore.

| Flag | Meaning |
| --- | --- |
| `--output <path>` | Archive destination. Defaults to `<checkout>/llm-workspace.zip`; a relative path is resolved against the current directory. |
| `--force` | Replace an existing archive. |
| `--dry-run` | Print the plan; write no archive. |
| `--include-all` | Include build artifacts and dependencies that the default denylist excludes. |
| `--exclude <pattern...>` | Extra patterns to keep out of the archive. |
| `--json` | Emit one JSON object on stdout. |

Symlinks are dereferenced into real file and directory contents, so an archive made in a linked worktree does not restore links back to the primary checkout. Links are followed only when their targets resolve inside the current checkout or another registered worktree; missing, external, cyclic, and non-regular targets are reported and skipped, and the command exits 1 while still writing the safe entries. Build artifacts, dependency trees, and binaries are excluded by default; `--include-all` produces a literal dump, which can be very large.

The default output is not automatically gitignored. Treat the archive as a secret: it is created with owner-only permissions (`0600`) on POSIX, and the command warns on stderr when the destination sits inside the checkout but git would let it be committed.

Recovery:

```bash
git clone <repository> recovered
cd recovered
unzip ../llm-workspace.zip
```

Keep the archive out of source control by adding `llm-workspace.zip` to `.gitignore` or writing it outside the checkout with `--output`.

### `list`

```bash
npx symlink-git-ignored list [--from <path>] [--json]
```

Reports the current state of every manifest entry without changing anything:

| Status | Meaning |
| --- | --- |
| `linked` | Destination is a symlink to the source path. |
| `not-linked` | Nothing exists at the destination yet. |
| `missing-source` | The source checkout does not have this path. |
| `occupied` | The destination is a real file/directory or a link pointing elsewhere. |
| `dangling` | The destination is a symlink whose target does not exist. |
| `shadowed` | A directory entry already covers this path. |
| `invalid` | Absolute path, `..`, escape from the checkout, `.git`, or a duplicate. |
| `unsafe` | A parent directory resolves outside the checkout. |

`link` additionally reports `already-linked` and `repaired`, plus `will-link`, `will-repair`, `will-replace`, and `will-backup` during `--dry-run`.

## JSON output

```json
{
  "source": "/home/me/code/my-repo",
  "destination": "/home/me/code/my-repo-feature",
  "entries": [
    { "path": ".env", "status": "linked", "target": "../my-repo/.env" }
  ],
  "summary": { "total": 1, "byStatus": { "linked": 1 }, "failures": 0 },
  "exitCode": 0
}
```

Errors always go to stderr, never mixed into stdout. `archive --json` emits one object with `checkout`, `archive`, `dryRun`, `entries`, `problems`, `summary`, and `exitCode`; each entry has `path`, `size`, and a status of `archived` or `would-archive`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Everything linked, already linked, repaired, or deliberately skipped, or the archive was written, was empty, or a dry run was clean. |
| `1` | Missing/invalid manifest, unresolvable source, `missing-source`, `invalid`, `unsafe`, a failed write, an archive problem, or an output conflict. |
| `130` | The interactive picker was cancelled. |

## Build artifacts

These are never offered by `select` and are never added to the manifest: `node_modules`, `dist`, `build`, `out`, `bin`, `obj`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `.vs`, `target`, `coverage`, `TestResults`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`, and files ending in `.exe`, `.dll`, `.so`, `.dylib`, `.o`, `.a`, `.node`, `.wasm`, `.pyc`, `.class`, `.jar`.

Add your own with `--exclude '*.log' --exclude '*/tmp'`, or pass `--no-default-excludes` to disable the built-in list. The denylist only filters candidate discovery: entries you already put in `.llm-files` are always linked, so changing the denylist can never silently remove an existing link. The `archive` command applies the same denylist by default; use `archive --include-all` for a literal dump of every ignored path.

## Safety

- The destination must be inside the current git checkout. Before writing, the deepest existing parent directory is resolved with `realpath`; a parent symlink that escapes the checkout is reported as `unsafe` and skipped.
- Manifest entries that are absolute, contain `..`, resolve outside the checkout, or point at `.git` are rejected before any filesystem call.
- Nothing is overwritten unless you pass `--force` or `--backup`.
- Running in the primary checkout is refused, since the source and destination would be the same directory.

## Caveats

- **The manifest is tracked.** `select` edits a committed file, so the change lands on the current branch and may need merging. This is deliberate: it keeps the list shared across worktrees instead of machine-local.
- **Source detection assumes the primary worktree holds the real files.** That is the checkout you ran `git worktree add` from. If it moved or was removed, pass `--from`.
- **POSIX is the supported platform.** On Windows, symlink creation needs Developer Mode or elevation; the tool reports the OS error instead of falling back to junctions or copies. Atomic archive replacement also relies on POSIX rename semantics.
- **`--expand` can be slow** in repositories with large ignored trees. The default collapses wholly ignored directories into one candidate.
- **`archive` follows only links inside the checkout and its registered worktrees.** A link to another location is reported as `unsafe` rather than copied. Broken targets, symlink loops, and non-regular files are reported and skipped.
- **The archive is a best-effort snapshot.** Files changing or disappearing while it is written can abort the run; the previous archive is left in place.
- **The archive is not encrypted.** It can contain credentials by design. Store and transfer it carefully, and keep it out of git.

## Releasing

Releases are published from tags. From a clean `master` checkout:

```bash
npm version patch --no-git-tag-version   # or: npm version 1.2.3 --no-git-tag-version
git commit -am "chore: release X.Y.Z"
git tag vX.Y.Z
git push origin master vX.Y.Z
```

Pushing the tag runs `.github/workflows/publish.yml`, which refuses to publish unless the tag matches `package.json`, the tagged commit is on `master`, and the version does not already exist on the registry.

Publishing uses npm Trusted Publishing (OIDC), so no npm token is stored in this repository. Package publishing access is configured as **Require two-factor authentication and disallow tokens**: manual publishes must complete an interactive 2FA prompt, granular access tokens cannot publish this package, and CI publishes only through the trusted publisher.

The trusted publisher is:

- repository: `idusortus/symlink-git-ignored`
- workflow: `publish.yml`
- actions: `npm publish` allowed (configurations created after 3 September 2026 default to stage-only)

A new trusted-publisher configuration must complete its first successful publish within two days or it expires. `0.1.0` was published manually to bootstrap the package; provenance attestations begin with `0.1.1`.

## Development

```bash
npm install
npm run typecheck
npm test          # unit + integration tests (spawns the CLI in real git worktrees)
npm run build     # emits dist/ with the executable entry point
node dist/cli.js --help
```

Integration tests are skipped on Windows because they exercise real symlinks.

See [CONTRIBUTING.md](https://github.com/idusortus/symlink-git-ignored/blob/master/CONTRIBUTING.md) for setup, review expectations, and the change workflow, and [docs/architecture.md](https://github.com/idusortus/symlink-git-ignored/blob/master/docs/architecture.md) plus [docs/testing.md](https://github.com/idusortus/symlink-git-ignored/blob/master/docs/testing.md) for how the code and tests are organized.

## License

MIT
