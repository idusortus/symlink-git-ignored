# Tasks

## 1. README index

- [x] 1.1 Add a `## Documentation` section directly after `## Install` with absolute GitHub links to `AGENTS.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/testing.md`, and `docs/AGENT_PROMPT.md`; one line per audience (users, contributors, agents working here, agents installing elsewhere).
- [x] 1.2 Update the existing `## Development` section to point at `CONTRIBUTING.md` and `docs/testing.md` while keeping the local command list intact.
- [x] 1.3 Confirm no existing README content is removed or reworded beyond those additions, and that new links use `https://github.com/idusortus/symlink-git-ignored/blob/master/<path>` (not relative paths, which would 404 on npmjs.com).

## 2. AGENTS.md (repository agent guide)

- [x] 2.1 Create `AGENTS.md` with: one-paragraph purpose, stack (`Node >=22.12`, TypeScript ESM, `commander` + `prompts`, `tsc`, Vitest), and the `src/` module map (CLI, commands, core, output, ui, version).
- [x] 2.2 Add the command reference: `npm ci`, `npm run typecheck`, `npm test` (66 tests / 6 suites), `npm run build`, `node dist/cli.js --help`, plus how to run one suite with Vitest.
- [x] 2.3 Document the invariants an agent must preserve: containment/`realpath` safety, skip-by-default collisions, denylist applied only during discovery, no state file, relative symlinks, `ToolError` for expected failures, `.js` import specifiers, strict TypeScript.
- [x] 2.4 Document the testing expectation (unit + real-git integration; POSIX skip), the OpenSpec workflow (`propose → apply → archive`, specs are the contract, archived changes are immutable), and the docs map.
- [x] 2.5 Add the release pointer (tag `v*`, OIDC trusted publishing, no npm token) and a short "do not" list (no secrets, no `NPM_TOKEN`, no committing `dist/`, no force-adding ignored files).
- [x] 2.6 Verify every command quoted in `AGENTS.md` runs successfully in this checkout.

## 3. CLAUDE.md pointer

- [x] 3.1 Create `CLAUDE.md` (under ten lines) stating that `AGENTS.md` is authoritative, repeating the install/typecheck/test commands, and listing the three specs as the behavioral source of truth.

## 4. CONTRIBUTING.md

- [x] 4.1 Create `CONTRIBUTING.md` with prerequisites (Node >=22.12, npm, git), clone/setup (`npm ci`), and a scripts table (`typecheck`, `test`, `build`, `prepublishOnly`).
- [x] 4.2 Add the change workflow: behavior changes start with an OpenSpec change (`openspec new change`, proposal/design/tasks, `openspec validate --strict`), code + tests land together, docs update when flags/statuses change.
- [x] 4.3 Add code conventions: ESM with explicit `.js` specifiers, `strict`/`noUncheckedIndexedAccess`, expected failures as `ToolError` with codes/hints, planner statuses kept in `src/core/types.ts`, no new runtime dependency without discussion, POSIX-first.
- [x] 4.4 Add review/commit expectations (focused diffs, conventional prefixes such as `feat:`, `fix:`, `chore:`), the test pointer to `docs/testing.md`, and the architecture pointer to `docs/architecture.md`.
- [x] 4.5 Add maintainer release steps (link to README's `Releasing`), the OTP/manual-publish note, and security reporting via GitHub private security advisories rather than a public issue.

## 5. docs/architecture.md

- [x] 5.1 Create `docs/architecture.md` with an ASCII runtime flow from `src/cli.ts` through command → source resolution → manifest validation → planner → apply → output, including the `select` branch.
- [x] 5.2 Add a module map table covering every file in `src/` with its responsibility (verify against `find src -type f`).
- [x] 5.3 Describe the manifest/plan model: `ManifestEntry`, `PlanEntry`, the status vocabulary, and which actions the applier performs; link to `openspec/specs/llm-file-manifest/spec.md` and `openspec/specs/worktree-link/spec.md` for the contract instead of restating requirements.
- [x] 5.4 Document the git boundary (`rev-parse`, `worktree list --porcelain`, `ls-files --others --ignored --exclude-standard`) and the filesystem safety rules (containment check, `.git` rejection, relative targets, no state file).
- [x] 5.5 Add an extension guide: where to add a command, a status, or a new exclusion, and which tests/specs must change with it.

## 6. docs/testing.md

- [x] 6.1 Create `docs/testing.md` with the stack (Vitest 5, `tsx` harness), commands (`npm test`, `npx vitest run test/plan.test.ts`, watch mode), and a table of the six suites plus the helper.
- [x] 6.2 Explain `test/helpers/repo.ts`: temp repo creation, committed `.llm-files`, ignored fixtures, `git worktree add`, and environment isolation (`HOME`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, `NO_COLOR`).
- [x] 6.3 Explain `runCli`, why it spawns `node + tsx` instead of importing the CLI, and what the integration suites assert (relative `readlink`, idempotency, collisions, `--from`, `--json`, select filtering).
- [x] 6.4 Add a "writing a test" recipe (arrange/act/assert with the fixture, cleanup, `describe.skipIf(process.platform === 'win32')`) and the determinism rules (no network, fake timers for backup stamps, 30s timeout).
- [x] 6.5 List known gaps honestly: interactive picker/TTY path, Windows symlink behaviour, real npm registry/auth, and the fact that unit tests do not exercise git itself.

## 7. docs/AGENT_PROMPT.md

- [x] 7.1 Create `docs/AGENT_PROMPT.md` with purpose, preconditions (Node >=22.12, git repo with at least one linked worktree or permission to create one), and the tested package version (`symlink-git-ignored@0.1.2`) noted alongside `@latest`.
- [x] 7.2 Add the copy-paste prompt: survey first (`git worktree list`, existing `.llm-files`, ignored candidates, agent config dirs), then ask before creating a worktree or modifying tracked files.
- [x] 7.3 Prompt step for writing the manifest in the primary checkout via `npx -y symlink-git-ignored@0.1.2 select --add <paths...>` (or the interactive picker when a TTY exists), excluding build artifacts and secrets.
- [x] 7.4 Prompt step for applying and verifying in the linked worktree: `--dry-run`, `link`, `list`, read one file through the link, and report source/destination plus per-entry statuses.
- [x] 7.5 Add the constraints block (never force/backup over occupied paths without approval, never link `node_modules`/`dist`, never commit secrets, stop on `missing-source`/`unsafe`) and a short report template.

## 8. Verification

- [x] 8.1 Run every command quoted across the new docs (`npm ci` skipped if already installed, `npm run typecheck`, `npm test`, `npm run build`, `node dist/cli.js --help`, `npx vitest run test/plan.test.ts`) and fix any divergence.
- [x] 8.2 Check every link target exists in the repository and every README link uses the absolute GitHub form; confirm the `skills`/`docs` filenames are spelled exactly.
- [x] 8.3 Confirm `git status` shows only documentation and OpenSpec change files — no `src/`, `test/`, `package.json`, workflow, or release changes.
- [x] 8.4 `openspec validate add-project-docs --strict` passes with `specs` reported as skipped.
