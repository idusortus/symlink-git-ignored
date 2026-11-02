# Tasks

## 1. Core change

- [x] 1.1 Add `allowSameRoot?: boolean` to `ResolveSourceOptions` in `src/core/source.ts`; skip only the `SOURCE_IS_DESTINATION` throw when it is true, keeping the missing-directory, bare-repository, and realpath checks unchanged.
- [x] 1.2 Pass `allowSameRoot: true` from `runSelect` in `src/commands/select.ts`; leave `runLink` and `runList` untouched.
- [x] 1.3 Confirm the error message and code for `link`/`list` are unchanged (`SOURCE_IS_DESTINATION`, "The source checkout is the current checkout...").

## 2. Tests

- [x] 2.1 In `test/source.test.ts`, keep the existing default rejection test and add cases: `allowSameRoot: true` resolves to the destination realpath, and a `--from` path equal to the destination is accepted only with the flag.
- [x] 2.2 Extend `test/helpers/repo.ts` with an option to create a fixture without a linked worktree (for example `worktree: false`), defaulting to the current behavior.
- [x] 2.3 In `test/cli.test.ts`, add: `select --add .env` in the primary checkout with no linked worktree creates `.llm-files` there and exits 0; `select` in a fixture that has a worktree but is run from the primary still writes the manifest in the primary.
- [x] 2.4 Add regression tests that `link` and `list` in the primary checkout still exit 1 with the source-checkout message.
- [x] 2.5 Add an assertion that `select` run inside a worktree writes `.llm-files` to the worktree and not to the primary (extend the existing "creates the manifest" test).

## 3. Documentation

- [x] 3.1 Update `docs/AGENT_PROMPT.md` STEP 1 to bootstrap in the primary checkout (`npx -y symlink-git-ignored@0.1.2 select --add ...`), with a note that running `select` in a worktree writes the manifest there.
- [x] 3.2 Add a short note to `README.md` (Install or The manifest section) that `select` can run in the primary checkout or a worktree and writes `.llm-files` in the checkout where it runs.
- [x] 3.3 Update `AGENTS.md`'s source-resolution invariant to scope the self-checkout refusal to `link`/`list` and state that `select` accepts the current checkout.
- [x] 3.4 Update `docs/architecture.md` source-resolution/flow notes with the same exception.

## 4. Verification

- [x] 4.1 Manual end-to-end in a throwaway repository with no linked worktrees: `select --add .env` creates `.llm-files`, `select --all` extends it, `link` still refuses with the source-checkout error, then `git worktree add` + `link` succeeds.
- [x] 4.2 `npm run typecheck && npm test && npm run build` pass, including the new tests.
- [x] 4.3 `node dist/cli.js select --help` is unchanged (no new flag) and the README/AGENTS claims match the behavior.
- [x] 4.4 `openspec validate allow-primary-select --strict` passes.
