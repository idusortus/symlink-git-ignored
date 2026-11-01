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
npm install -g symlink-git-ignored  # optional global install
```

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

Errors always go to stderr, never mixed into stdout.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Everything linked, already linked, repaired, or deliberately skipped. |
| `1` | Missing/invalid manifest, unresolvable source, `missing-source`, `invalid`, `unsafe`, or a failed write. |
| `130` | The interactive picker was cancelled. |

## Build artifacts

These are never offered by `select` and are never added to the manifest: `node_modules`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`, `target`, `coverage`, `.venv`, `venv`, `__pycache__`, `.pytest_cache`, and files ending in `.exe`, `.dll`, `.so`, `.dylib`, `.o`, `.a`, `.node`, `.wasm`, `.pyc`, `.class`, `.jar`.

Add your own with `--exclude '*.log' --exclude '*/tmp'`, or pass `--no-default-excludes` to disable the built-in list. The denylist only filters candidate discovery: entries you already put in `.llm-files` are always linked, so changing the denylist can never silently remove an existing link.

## Safety

- The destination must be inside the current git checkout. Before writing, the deepest existing parent directory is resolved with `realpath`; a parent symlink that escapes the checkout is reported as `unsafe` and skipped.
- Manifest entries that are absolute, contain `..`, resolve outside the checkout, or point at `.git` are rejected before any filesystem call.
- Nothing is overwritten unless you pass `--force` or `--backup`.
- Running in the primary checkout is refused, since the source and destination would be the same directory.

## Caveats

- **The manifest is tracked.** `select` edits a committed file, so the change lands on the current branch and may need merging. This is deliberate: it keeps the list shared across worktrees instead of machine-local.
- **Source detection assumes the primary worktree holds the real files.** That is the checkout you ran `git worktree add` from. If it moved or was removed, pass `--from`.
- **POSIX is the supported platform.** On Windows, symlink creation needs Developer Mode or elevation; the tool reports the OS error instead of falling back to junctions or copies.
- **`--expand` can be slow** in repositories with large ignored trees. The default collapses wholly ignored directories into one candidate.

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

## License

MIT
