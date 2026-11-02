# Contributing

Thanks for improving `symlink-git-ignored`. This guide covers local setup, the change workflow, code conventions, and releases. For usage see [README.md](README.md); for internals see [docs/architecture.md](docs/architecture.md) and [docs/testing.md](docs/testing.md).

## Prerequisites

- **Node.js >= 22.12.0** — the runtime dependency `commander@15` does not support earlier versions.
- **npm** with the committed `package-lock.json`.
- **git** on `PATH`, and a POSIX environment for the integration tests (Linux or macOS). They are skipped on Windows because they create real symlinks.

## Setup

```bash
git clone https://github.com/idusortus/symlink-git-ignored.git
cd symlink-git-ignored
npm ci
npm run typecheck
npm test
```

`npm ci` is preferred over `npm install`; the lockfile is part of the repository.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm test` | Runs typecheck (`pretest`), then the 66 Vitest tests |
| `npm run build` | Emits `dist/` with the executable `dist/cli.js` |
| `npm run prepublishOnly` | Build + test; also runs automatically on `npm publish` |

`npm pack --dry-run` shows exactly what would be published: `dist/`, `README.md`, `LICENSE`, and `package.json`.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/cli.ts` | Commander setup, subcommands, exit codes |
| `src/commands/` | `link`, `list`, `select` entry points |
| `src/core/` | git access, manifest, source resolution, plan/apply, exclusions, errors, types |
| `src/output.ts` | human report and JSON output |
| `src/ui/picker.ts` | interactive multi-select |
| `test/` | Vitest suites and the real-git fixture helper |
| `openspec/specs/` | behavioral contracts for the three capabilities |
| `openspec/changes/` | active and archived changes |

## Change workflow

1. **Start with a spec change when behavior changes.** Use OpenSpec:
   ```bash
   openspec new change "<kebab-case-name>"
   openspec status --change "<name>"
   ```
   Fill in `proposal.md`, the delta spec(s) under `specs/<capability>/spec.md`, `design.md`, and `tasks.md`, then run `openspec validate "<name>" --strict`. Documentation-only or tooling-only changes set `skip_specs: true` in the change's `.openspec.yaml` instead of inventing requirements.
2. **Implement against the artifacts.** Keep the CLI flags, status vocabulary, README tables, and the matching spec in sync.
3. **Add tests.** A behavior change needs a unit or integration test; see [docs/testing.md](docs/testing.md).
4. **Verify locally.**
   ```bash
   npm run typecheck && npm test && npm run build
   ```
5. **Open a focused pull request.** Explain the problem, the change, and how you verified it. CI runs the same checks on Node 22 and 24.

Archived changes under `openspec/changes/archive/` are immutable. Do not edit them or hand-edit `openspec/specs/` outside an archive/sync step.

## Code conventions

- **ESM with explicit `.js` specifiers** (`import { runLink } from "./commands/link.js"`) and `strict` TypeScript, including `noUncheckedIndexedAccess`.
- **Expected failures throw `ToolError`** with a code and, when useful, a hint (`src/core/errors.ts`). Do not leak stack traces for user errors; unexpected exceptions may bubble to the CLI's catch-all.
- **Statuses and actions live in `src/core/types.ts`.** Adding one means updating `src/core/plan.ts`, `src/output.ts`, the README status table, and `openspec/specs/worktree-link/spec.md`.
- **Do not weaken safety invariants**: containment checks, skip-by-default collisions, `.git` rejection, and a denylist that only filters discovery. See [docs/architecture.md](docs/architecture.md#filesystem-safety).
- **Keep helpers small and testable.** Parsing logic (manifest, porcelain output, exclude patterns) belongs in pure functions with unit tests.
- **No new runtime dependency without a clear need.** The package deliberately ships only `commander` and `prompts`.
- **Do not commit `dist/`.** It is a build artifact and gitignored.

## Testing

```bash
npm test
npx vitest run test/plan.test.ts
npx vitest
```

The suite combines pure unit tests with integration tests that build a temporary git repository and worktree, then spawn the real CLI. Environment isolation, fixture details, and known gaps are documented in [docs/testing.md](docs/testing.md).

## Continuous integration

CI runs in GitHub Actions on `ubuntu-24.04` with `actions/checkout@v6` and `actions/setup-node@v6`. Pull-request and `master` runs test Node 22 and 24 and cache npm downloads; the tag-driven release workflow deliberately sets `package-manager-cache: false`. The publish job authenticates only through OIDC, never a token.

## Commits and pull requests

- Use conventional prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Keep diffs focused; avoid unrelated formatting or drive-by refactors.
- Reference the OpenSpec change in the PR description when one applies.
- Confirm `git status` is clean except for intended files, and that CI (Node 22 and 24) is green.

## Releasing (maintainers)

Releases are cut from tags; see [README → Releasing](README.md#releasing).

```bash
npm version patch --no-git-tag-version
git commit -am "chore: release X.Y.Z"
git tag vX.Y.Z
git push origin master vX.Y.Z
```

Pushing the tag runs `.github/workflows/publish.yml`, which refuses to publish unless the tag matches `package.json`, the commit is on `master`, and the version is unpublished. Publishing uses npm Trusted Publishing (OIDC), so no npm token exists in the repository or in GitHub secrets. Package publishing access disallows tokens, so an emergency manual publish requires an interactive 2FA prompt. Verify the release with `npm view symlink-git-ignored@X.Y.Z version` and `npm audit signatures` in a throwaway install.

## Security

Report suspected vulnerabilities privately through the repository's **Security → Report a vulnerability** (GitHub Security Advisories). Do not open a public issue for containment escapes, path traversal, credential handling, or release-pipeline weaknesses. Include the affected version, a reproduction, and the impact you observed.
