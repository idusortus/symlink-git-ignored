# Proposal

## Why

Bootstrapping is backwards today. To create the first `.llm-files`, users must already have a linked worktree, because `select` refuses to run when the candidate source and the destination are the same checkout. That is exactly the state of a fresh repository, and it contradicts the intended workflow of writing the manifest on your main branch and committing it. The new `docs/AGENT_PROMPT.md` tells agents to create the manifest in the primary checkout, which currently fails with "The source checkout is the current checkout."

The guard exists to stop `link` from symlinking a checkout to itself. `select` only reads the ignored paths of a checkout and writes `.llm-files` in place, so the guard is over-broad for it.

## What Changes

- Allow `select` to run when the current checkout is also the candidate source checkout, including a repository with no linked worktrees. Candidates come from that checkout and `.llm-files` is written there.
- Keep the existing refusal for `link` and `list`, where source and destination being identical would produce meaningless self-links or statuses.
- Leave the worktree flow unchanged: running `select` inside a worktree still reads candidates from the primary checkout and writes the manifest to the worktree.
- Update the documentation to match: `docs/AGENT_PROMPT.md` bootstraps in the primary checkout, README notes that `select` can run in either place, and `AGENTS.md`/`docs/architecture.md` record the scoped source-resolution rule.
- Add unit and integration coverage for the primary-checkout path and for the unchanged `link` refusal.

**Non-goals**: making `link` or `list` work in the primary checkout, always writing the manifest to the primary checkout, adding a `--to <path>` destination flag, changing the manifest format, or changing exit codes and status vocabulary for existing flows.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `llm-file-manifest`: adds the requirement that `select` can create the manifest in the primary checkout when source and destination are the same.
- `worktree-link`: narrows the source-checkout rejection to `link` and `list`, which are the commands that must not target their own checkout.

## Impact

- `src/core/source.ts`: `resolveSource` gains an opt-in that permits the current checkout as the source.
- `src/commands/select.ts`: passes that option; candidate discovery and manifest writing already use the resolved roots.
- Tests: `test/source.test.ts` and `test/cli.test.ts` gain cases for the allowed self-source and the preserved `link` refusal.
- Documentation: `docs/AGENT_PROMPT.md`, `README.md`, `AGENTS.md`, and `docs/architecture.md`.
- No CLI flag, manifest-format, dependency, or release-workflow change. Existing worktree behavior is untouched.
