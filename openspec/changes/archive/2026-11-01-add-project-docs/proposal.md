# Proposal

## Why

The project has a solid user-facing README, but nothing for the two other audiences it depends on. Contributors get no setup, architecture, or test guidance beyond a five-line "Development" block, and coding agents get no repository context at all. For a tool whose entire purpose is to hand gitignored context to LLM assistants, there is also no agent-facing way to install and configure it in another repository. That gap is now visible because the CLI and its specs are complete and published, so the documentation can describe stable behavior instead of a moving target.

## What Changes

- Add `AGENTS.md` as the tool-agnostic repository guide for coding agents: stack, layout, commands, invariants, test expectations, and the OpenSpec workflow.
- Add `CLAUDE.md` as a short pointer to `AGENTS.md` so Claude-based tooling picks up the same context without a second copy drifting.
- Add `CONTRIBUTING.md` for developers: prerequisites, setup, scripts, change workflow, code conventions, review expectations, release pointer, and security reporting.
- Add `docs/architecture.md`: runtime flow, module map, manifest/plan model, git boundary, filesystem-safety invariants, and extension points.
- Add `docs/testing.md`: how the Vitest suite and real-git fixtures work, what each suite covers, how to add a test, and the known gaps (TTY picker, Windows, registry).
- Add `docs/AGENT_PROMPT.md`: a copy-paste prompt that lets an agent in another repository choose gitignored paths, write `.llm-files`, link them inside a worktree, and verify the result.
- Add a `Documentation` index to `README.md` with links to all of the above, and point the existing `Development` section at `CONTRIBUTING.md` and `docs/testing.md`.

**Non-goals**: a documentation site, API reference (the package exposes no library API), changelog automation, screenshots, translations, and moving README content into `docs/`. There are no code, CLI, workflow, or spec-level behavior changes; this change sets `skip_specs: true` because documentation does not alter the system contract.

## Capabilities

### New Capabilities

<!-- None: documentation only. This change declares skip_specs: true. -->

### Modified Capabilities

<!-- None: no behavior changes. -->

## Impact

- New files: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/testing.md`, `docs/AGENT_PROMPT.md`.
- `README.md` gains a Documentation section and cross-links; the user-facing content that is already accurate stays as the canonical guide.
- The npm tarball is unchanged: `files` still ships only `dist/`, `README.md`, and `LICENSE`, so README links to the new documents must be absolute GitHub URLs rather than relative paths.
- No runtime, dependency, build, test, or workflow changes.
