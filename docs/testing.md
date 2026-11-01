# Testing

The suite is Vitest 5. Unit tests cover pure logic; integration tests build a real temporary git repository with a linked worktree and spawn the actual CLI. There is no mocking of git or the filesystem.

## Commands

```bash
npm test                            # pretest runs tsc --noEmit, then all 66 tests
npx vitest run test/plan.test.ts    # one file
npx vitest run -t "backup"          # tests whose name matches
npx vitest                          # watch mode
```

`vitest.config.ts` includes `test/**/*.test.ts` and sets a 30-second timeout for tests and hooks.

## Layout

| File | Covers |
| --- | --- |
| `test/helpers/repo.ts` | Fixture creation (`createRepoFixture`), `gitIn`, and `runCli` |
| `test/cli.test.ts` | End-to-end `link`, `list`, `select` against a real worktree (POSIX only) |
| `test/plan.test.ts` | Planner statuses, `applyPlan`, containment, backup stamps (POSIX only) |
| `test/manifest.test.ts` | Parsing, validation, shadowing/duplicates, atomic append |
| `test/excludes.test.ts` | Built-in denylist and user patterns |
| `test/git.test.ts` | NUL splitting and the `git worktree list --porcelain` parser |
| `test/source.test.ts` | Source precedence, realpath normalization, rejection codes |

## The fixture

`createRepoFixture(options)` creates a temp directory containing:

- `primary/` — a real git repository with a committed `.gitignore` and, unless `manifest: null`, a committed `.llm-files`.
- `wt/` — a linked worktree on branch `feature` created with `git worktree add`.
- `home/` — a temporary HOME used by the child processes.

Options: `gitignore`, `manifest` (use `null` to omit it), `trackedFiles`, and `ignoredFiles`. Default ignored fixtures include `.env`, `.notes`, `.claude/settings.local.json`, `.cache/data.bin`, `node_modules/pkg/index.js`, `dist/bundle.js`, and `debug.log`.

The fixture isolates the environment so a developer's global git configuration cannot leak in:

```ts
HOME, XDG_CONFIG_HOME, GIT_CONFIG_GLOBAL=<temp>, GIT_CONFIG_NOSYSTEM=1,
GIT_TERMINAL_PROMPT=0, NO_COLOR=1
```

## Spawning the CLI

`runCli(fixture, args, { cwd })` runs:

```text
<node> node_modules/tsx/dist/cli.mjs src/cli.ts <args...>
```

with the fixture environment and the worktree (or an explicit `cwd`) as the working directory. It spawns a real process instead of importing `src/cli.ts` so tests exercise argument parsing, `process.cwd()`, stdout/stderr separation, and exit codes exactly as a user would. A non-zero exit is returned as `{ code, stdout, stderr }` rather than thrown.

`gitIn(fixture, cwd, args)` runs git with the same isolated environment for test setup such as adding a second worktree.

## What the integration tests assert

- Relative `readlink` targets (`../primary/.env`) and directory links.
- Idempotency (`already-linked` on a second run).
- Collision policy: skip by default, `--backup` creates `.env.bak-<timestamp>`, `--force` replaces.
- `--from` selects another worktree, `--dry-run` writes nothing.
- `--json` emits a single parseable object; `list` distinguishes `not-linked` from `linked`.
- `select --add`/`--all` filtering, tracked-path rejection, denylist rejection, `--expand`, non-TTY guidance, and manifest creation.
- Failure modes: running in the source checkout, outside git, and with a missing manifest.

## Writing a test

Use the fixture, keep the arrange/act/assert phases visible, and clean up:

```ts
import { createRepoFixture, runCli, type Fixture } from "./helpers/repo.js";

let fixture: Fixture | undefined;

afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

it("links a manifest entry", async () => {
  fixture = await createRepoFixture();
  const result = await runCli(fixture, ["link"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("linked");
});
```

Guidelines:

- Guard suites that create symlinks with `describe.skipIf(process.platform === "win32")`.
- For pure logic, prefer a unit test with a temp directory over an integration test.
- Backup timestamps come from `new Date()`; use `vi.useFakeTimers()`/`vi.setSystemTime()` when asserting a suffix.
- No test may hit the network or the npm registry.
- If a test needs an unwritable path, skip when `process.getuid?.() === 0` (root bypasses permissions).

## Known gaps

- **Interactive picker**: the TTY multi-select and confirmation flow is not covered; tests use `--add`/`--all` and verify the non-TTY error path.
- **Windows**: symlink behaviour requires Developer Mode/elevation, so CLI/planner suites are skipped there.
- **Real registry/auth**: publishing, provenance, and npm settings are verified manually as part of releases, not in this suite.
- **Git itself**: the porcelain tests use captured output, not every git version; integration tests assume a reasonably modern git.
- **Containment on macOS**: `/tmp` is a symlink to `/private/tmp`; the planner realpaths both roots, but a failure there usually means the fixture assumption changed.
