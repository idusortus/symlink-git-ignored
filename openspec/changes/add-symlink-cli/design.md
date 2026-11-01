# Design

## Context

See `proposal.md` for motivation. The repository is empty apart from OpenSpec scaffolding, so there is no existing code, build system, or convention to preserve. Two constraints shape the approach: the tool must run as a one-off `npx` invocation inside arbitrary user repositories, and it must agree with git about which paths are ignored — a rule set that includes nested `.gitignore` files, `.git/info/exclude`, global excludes, and precedence/negation.

## Goals / Non-Goals

**Goals:**

- One command, no configuration file beyond `.llm-files`, that reproduces every needed gitignored path as a symlink in a worktree.
- Predicable, scriptable behaviour: deterministic exit codes, `--json`, `--dry-run`, no interactive prompt on a non-TTY.
- Never destroy user data by default, and never write outside the checkout being worked in.
- Fail loudly and specifically: the message must say which entry failed and why.

**Non-Goals:**

- Reimplementing gitignore matching, or supporting non-git version control.
- Syncing content, watching for changes, or managing the source checkout's files.
- A back-reference registry/ledger of created links, or an `unlink` command (v1).
- Windows junctions/privilege elevation; POSIX symlinks are the supported path, Windows is best-effort with a clear error.
- Publishing automation, telemetry, or an installable global binary beyond the npm `bin`.

## Decisions

### Delegate ignore resolution to git

Run `git -C <source> ls-files --others --ignored --exclude-standard --directory -z`. This returns untracked-but-ignored entries relative to the source root and applies every ignore source git itself uses, in the correct order. Directories that are ignored in full come back as one entry with a trailing `/`, which matches the "link a directory once" model.

- **Alternatives:** the `ignore` npm package (fast, but has to be taught about nested files, `.git/info/exclude`, global excludes, tracked-file precedence, and git's negation ordering); walking the tree and calling `git check-ignore` per path (N subprocess calls, or one batched call over every file including `node_modules`).
- **Trade-off:** a hard dependency on a `git` binary at runtime and on the source being a real worktree. Accepted: the tool is only meaningful in that environment, and git is already required to create the worktree.
- `--expand` switches to the same command without `--directory` and filters denylisted trees, for users who need one file out of a wholly ignored directory. It is opt-in because un-collapsed listing can walk very large trees.

### Source checkout = first `git worktree list` entry

`git worktree list --porcelain` lists the primary worktree first, then linked worktrees. The primary is the checkout the user ran `git worktree add` from, which is exactly where the real gitignored files live. `--from` overrides it, and the resolved path is normalized with `fs.realpath` before comparison so `--from` with a trailing slash or a symlinked path still compares correctly.

- **Alternatives:** guessing the parent directory of the worktree (breaks when worktrees live in `~/.worktrees/` or are created by tools that use arbitrary paths); prompting the user to pick a worktree every run (noise for the common case); requiring `--from` always (hostile default).
- **Trade-off:** if the primary checkout was removed and re-added, git may report a different first entry. `--from` and the `missing-source` diagnostics cover that; the error message mentions `--from`.

### `.llm-files` is plain line-based text

One path per line, `#` comments, blank lines ignored, trailing `/` allowed for directories, literal paths only. It diffs cleanly, is hand-editable, and mirrors the `.gitignore` mental model the user already has.

- **Alternatives:** JSON (extra syntax, noisier diffs, harder to hand-edit); TOML/YAML (adds a parser dependency and config ceremony for what is a list).
- **Trade-off:** no per-entry options (e.g. "link only on macOS"). Flags cover exclusions; per-entry options are out of scope until a real need appears.
- Manifests are parsed leniently (trim whitespace, strip one trailing `/`, drop comments) and validated strictly afterwards, with validation errors reported per entry without aborting the whole listing.

### Relative symlinks

The link target is `path.relative(path.dirname(dest), sourcePath)`, with separators normalized to `/`. Relative links survive moving the entire parent directory (common when a project folder is relocated or bind-mounted into a container) and never embed a machine-specific absolute path.

- **Alternatives:** absolute links (break on relocation, leak home-directory paths into the filesystem); hard links (do not work across filesystems and do not track content changes to the source file in all editors); copying (defeats the purpose).
- **Trade-off:** a link breaks if the source checkout and the worktree stop being relatively reachable — not possible for worktrees of the same repository unless one is moved independently, at which point `link` recreates it.

### Collision policy: skip by default, opt in to destruction

Default is non-destructive: a destination that exists and is not already the correct link is reported as `occupied` and left alone. `--force` replaces it; `--backup` renames it to `<name>.bak-<YYYYMMDDHHmmss>` (with `-1`, `-2`… on a name clash) before linking. Dangling symlinks are treated as debris from an earlier run and repaired without a flag, since they hold no data and blocking on them would make the tool fail exactly when it is needed.

- **Alternatives:** always replace (destroys worktree-local edits such as a worktree-specific `.env`); always prompt (hangs in CI, and the answer is almost always skip).
- Implementation note: use `fs.lstat` for collision detection and `fs.readlink` + `path.resolve` for comparison, so a symlink chain is never followed accidentally.

### Safe filesystem writes

Before creating parents or the link, resolve the deepest existing ancestor of the destination with `fs.realpath` and require it to equal the destination root or start with `<root> + path.sep`. This blocks a pre-existing symlinked parent (e.g. `.claude` → `~/.config/claude`) from redirecting writes outside the checkout. Manifest entries are additionally rejected at parse time if they are absolute, contain `..`, or resolve into `.git`. Parent directories are created with `fs.mkdir(..., { recursive: true })` only after the containment check.

### No state file / ledger

Status is derived from the filesystem on every run (`lstat` + `readlink` + source existence), so there is nothing to drift, no hidden file to commit, and re-runs are naturally idempotent. `list` and `link` share one planner, so their statuses cannot disagree.

- **Trade-off:** the tool cannot distinguish a link it created from an identical pre-existing link. Both satisfy the intent, so this is acceptable and avoids a source of stale state.

### Dependencies and packaging

- `commander` for commands/flags and `prompts` for a type-to-filter multi-select.
- `prompts` is chosen specifically for `autocompleteMultiselect`, which lets the user narrow a long candidate list by typing. `@clack/prompts` (better maintained) has no type-to-filter in its multiselect, and `@inquirer/prompts`'s checkbox has no search either; picking from 100+ ignored entries without filtering is the main usability failure mode here.
- Build with `tsc` to ESM in `dist/`, `"type": "module"`, `engines.node >= 20`, `bin.symlink-git-ignored = dist/cli.js` with a shebang in `src/cli.ts`. No bundler: two small runtime deps, and `tsc` output stays debuggable.
- Tests run the TypeScript entry point through `tsx` so the CLI contract is exercised without a build step; unit tests target pure modules directly.

### Output and exit contract

`--json` writes exactly one JSON object to stdout and nothing else; diagnostics go to stderr. Human output uses a fixed vocabulary so it is greppable: `linked`, `already-linked`, `missing-source`, `not-linked`, `occupied`, `dangling`, `shadowed`, `invalid`, `unsafe`, plus dry-run-only `will-link`, `will-repair`, `will-replace`, `will-backup`. Exit codes: `0` all good or skipped, `1` failures/usage/config, `130` picker cancelled.

## Risks / Trade-offs

- **A tracked `.llm-files` edited inside a worktree lands on that worktree's branch** → README documents it; `select` prints a reminder to commit; a future local-override file is noted but not built. This is the direct consequence of the chosen manifest location.
- **`git worktree list` first entry is the primary, not necessarily "where the user ran add"** → `--from` override, and `missing-source` errors suggest it.
- **Symlinks on Windows require Developer Mode or elevation** → detect `process.platform === 'win32'` and fail with an explicit message (plus a docs note) rather than hanging or creating a broken link; POSIX is the supported platform.
- **Default denylist may match a directory the user actually needs (e.g. a source folder named `build/`)** → `--no-default-excludes` and `--exclude`; and the list is only applied to discovery, never to entries already in the manifest, so existing links never silently disappear.
- **`--expand` on a repo with a huge ignored tree is slow** → warn in `--help`; default stays collapsed and denylist-filtered.
- **Source checkout on a different branch may not contain every listed path** → reported as `missing-source` with exit 1, never a link to a non-existent target.
- **`prompts` is a small, stable but low-activity dependency** → its API surface used here is one function; swapping to a different prompt library later is isolated in `src/ui/picker.ts`.

## Migration Plan

Greenfield: publish `0.1.0` under the package name, document `npx symlink-git-ignored` usage, verify with `npm pack --dry-run` and a manual end-to-end run in a temporary repository with a real linked worktree. No data migration; uninstalling leaves only ordinary symlinks the user can delete.

## Open Questions

- Is the npm name `symlink-git-ignored` available, or should the package publish under a scope? Verify with `npm view` before the first publish; the bin name can stay the same either way.
- Should a later version support a per-machine gitignored override file for entries that must not be committed (e.g. absolute paths)? Deferred; it does not change v1 behaviour or the specs.
