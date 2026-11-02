# symlink-git-ignored — agent context

`symlink-git-ignored` recreates the gitignored files an LLM coding assistant needs inside a git worktree. It reads a committed `.llm-files` manifest in the current checkout and creates relative symlinks to the same paths in a source checkout — by default the primary worktree, overridable with `--from`. The package is published on npm; `README.md` is the user guide.

## Stack

- Node `>=22.12.0` (required by `commander@15`), TypeScript ESM with `NodeNext` resolution and explicit `.js` import specifiers.
- Runtime dependencies: `commander` (CLI) and `prompts` (searchable multi-select). Do not add another runtime dependency without a clear need.
- Build: `tsc` → `dist/` (gitignored). Tests: Vitest 5, executed through `tsx`.
- Specs: OpenSpec under `openspec/`.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | Commander wiring, default `link` subcommand, exit-code handling |
| `src/commands/link.ts` | Resolve roots, build the plan, apply it, print the report |
| `src/commands/list.ts` | Build the plan in `list` mode; never mutates |
| `src/commands/select.ts` | Discover/filter candidates, picker or `--add`/`--all`, append the manifest |
| `src/core/git.ts` | Git subprocess helpers, worktree and ignored-entry parsing |
| `src/core/manifest.ts` | `.llm-files` parse/validate/read and atomic append |
| `src/core/source.ts` | Source-checkout resolution and rejection rules |
| `src/core/plan.ts` | Per-entry statuses, containment check, link planning |
| `src/core/apply.ts` | Create/replace/backup links with failure isolation |
| `src/core/excludes.ts` | Built-in build-artifact denylist and pattern matcher |
| `src/core/errors.ts` | `ToolError` codes, hints, and exit-code mapping |
| `src/core/types.ts` | Manifest/plan types and the status/action vocabulary |
| `src/output.ts` | Human report and `--json` serialization |
| `src/ui/picker.ts` | `prompts` multi-select and confirmation |
| `src/version.ts` | Version read from `package.json` |

## Commands

```bash
npm ci
npm run typecheck
npm test                            # 71 tests in 6 suites; spawns the CLI in real git worktrees
npx vitest run test/plan.test.ts    # one suite
npx vitest                          # watch mode
npm run build
node dist/cli.js --help
```

`npm test` runs `tsc --noEmit` first (`pretest`). `npm publish` triggers `prepublishOnly`, which builds and tests again.

## Invariants to preserve

- **Containment**: before writing, the deepest existing ancestor of a destination must resolve inside the destination checkout; otherwise the entry is `unsafe` and skipped. This lives in `findContainmentViolation` and is re-checked in `applyPlan`.
- **Source resolution**: `link` and `list` refuse when the source checkout is the destination; `select` opts out (`allowSameRoot`) so `.llm-files` can be created in the primary checkout.
- **Manifest validation**: reject absolute paths, `..` segments, paths resolving outside the checkout, and anything at or under `.git`. Nested entries lose to their ancestor and are reported as `shadowed`.
- **Collisions skip by default**: `--force` replaces, `--backup` renames to `<name>.bak-<YYYYMMDDHHmmss>` (with numeric suffixes), dangling symlinks are repaired. `--force` plus `--backup` is a usage error.
- **The denylist applies only to `select` candidate discovery.** Entries already in `.llm-files` are always linked.
- **Relative symlink targets** via `path.relative(dirname(dest), source)`, POSIX separators.
- **No state file**: status is derived from `lstat`/`readlink` and source existence on every run. Re-runs are idempotent.
- **Expected failures throw `ToolError`** with a code and optional hint; the CLI prints `error:`/`hint:` and exits 1 (130 when the picker is cancelled). Do not print stack traces for expected failures.
- Keep the status vocabulary in `src/core/types.ts` synchronized with `src/output.ts`, `README.md`, and `openspec/specs/worktree-link/spec.md`.

## Testing

Unit tests cover the manifest parser/validator/append, the denylist matcher, the worktree porcelain parser, source resolution, the planner, and apply. Integration tests create a real temporary git repository with a linked worktree and spawn the CLI. POSIX-only suites use `describe.skipIf(process.platform === "win32")`.

Any behavior change needs a unit or integration test, and a flag/status change also needs the README table and the matching spec updated. See `docs/testing.md` for the fixture and harness details.

## OpenSpec workflow

Behavior changes go through an OpenSpec change:

```bash
openspec new change "<name>"
openspec status --change "<name>"
openspec validate "<name>" --strict
```

Write `proposal.md`, the delta spec(s) under `specs/<capability>/spec.md`, `design.md`, and `tasks.md`, then implement against them. On archive, delta specs merge into `openspec/specs/`. Archived changes under `openspec/changes/archive/` are immutable. The three capabilities are `llm-file-manifest`, `worktree-link`, and `npm-release`.

## Release

Releases are tag-driven: bump `package.json`, commit, `git tag vX.Y.Z`, push the tag. `.github/workflows/publish.yml` re-runs the checks and publishes through npm Trusted Publishing (OIDC). Never add an npm token or `NPM_TOKEN` secret. Publishing access disallows tokens, so manual publishes require interactive 2FA. See README → Releasing.

## Documentation map

- `README.md` — user guide, flags, statuses, exit codes, safety.
- `CONTRIBUTING.md` — setup, workflow, conventions, release, security.
- `docs/architecture.md` — runtime flow, modules, plan model.
- `docs/testing.md` — test architecture and how to add tests.
- `docs/AGENT_PROMPT.md` — pasteable prompt for configuring the tool in another repository.

## Do not

- Commit `dist/`, `node_modules/`, tarballs, `.npmrc`, or `.env`.
- Add secrets, publish tokens, or a `--force` example without a warning.
- Force-add ignored files to git to make a test pass.
- Edit archived OpenSpec changes or hand-edit `openspec/specs/` outside an archive/sync.
