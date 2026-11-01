# Design

## Context

See `proposal.md` for motivation. Observed state that shapes the docs:

- `README.md` is 187 lines and already accurate for installation, the manifest, all three commands, JSON output, exit codes, the denylist, safety, caveats, releasing, and development. It is also the npm package page (`files` includes it).
- The repository has 15 source files under `src/` and six Vitest suites plus one fixture helper under `test/` (66 tests). The architecture is small enough to describe on one page.
- `openspec/specs/` now holds the three capability specs (`llm-file-manifest`, `worktree-link`, `npm-release`); they are the behavioral source of truth and should be linked, not duplicated.
- `.claude/` and `.opencode/` currently contain only generated OpenSpec command/skill files; there is no root agent-context file.
- `cli-five` (a sibling project) establishes the house pattern this design follows: a root `AGENTS.md` as tool-agnostic context, plus a copy-paste `docs/INSTALL_PROMPT.md` for agents installing the tool elsewhere.
- The npm tarball ships only `dist/`, `README.md`, and `LICENSE`. Anything in `docs/` or `AGENTS.md` is repository-only unless added to `files`.

## Goals / Non-Goals

**Goals:**

- Give each audience one obvious entry point: users → `README.md`, contributors → `CONTRIBUTING.md`, agents working on the repo → `AGENTS.md`, agents using the tool elsewhere → `docs/AGENT_PROMPT.md`.
- Make the architecture and test strategy discoverable well enough that a contributor can add a command or status without reverse-engineering the whole CLI.
- Keep every factual claim traceable to code, `--help`, or a spec, and verify quoted commands at implementation time.

**Non-Goals:**

- Rewriting or restructuring the README. It stays canonical; the new Documentation section only indexes the additions.
- Shipping developer/agent docs in the npm tarball.
- A static-site generator, versioned docs, or screenshots.
- Documenting internal behavior that is not part of the contract (e.g., the exact prompt library API) beyond what a contributor needs.

## Decisions

### README stays canonical; new docs are complementary

The README is the install page, the npm listing, and the place users already look. Splitting it would break inbound links and force readers to jump between files for the basics. Instead, README gains a `## Documentation` section with absolute GitHub URLs and keeps its existing depth; the new files cover different audiences and deeper material.

- **Alternative:** a slim landing-page README with `docs/` holding command details. Rejected: the npm package page would lose its self-contained usage guide, and this change is additive by intent.
- **Trade-off:** some overlap (the release process appears in README and is referenced from CONTRIBUTING). Accepted: each file must stand alone for its audience, and the shared section is a pointer rather than a copy.

### Absolute GitHub links in README

Because the tarball excludes `docs/` and `AGENTS.md`, relative links like `docs/architecture.md` render on GitHub but 404 on npmjs.com. Every link from README to a repository-only file will use `https://github.com/idusortus/symlink-git-ignored/blob/master/<path>`.

- **Alternative:** add `docs`, `AGENTS.md`, and `CONTRIBUTING.md` to `files`. Rejected: it inflates the package with material npm consumers cannot use and makes those docs part of the published surface.
- **Trade-off:** links hardcode the `master` branch name. That is the repository's default branch and is already referenced by badges and release docs.

### One agent-context file, with a thin alias

`AGENTS.md` is the canonical, tool-agnostic context file (the agents.md convention). `CLAUDE.md` contains only a short statement that `AGENTS.md` is authoritative plus the few commands Claude needs immediately.

- **Alternatives:** duplicate the full content in both (drifts immediately); only `AGENTS.md` (Claude tooling that looks for `CLAUDE.md` misses it); only `CLAUDE.md` (other tools miss it).
- **Trade-off:** one extra file to notice, mitigated by keeping it under ten lines.

### Separate consumer prompt from repo agent guide

`AGENTS.md` tells an agent how to change this codebase. `docs/AGENT_PROMPT.md` is an artifact you paste into an agent working in *someone else's* repository; it must not assume this repo exists locally, and it must instruct the agent to survey, ask before writing, and verify with real command output.

- **Alternative:** put the install prompt inside `AGENTS.md`. Rejected: conflates audiences and makes an already long context file longer for contributors who never need the prompt.
- **Trade-off:** the prompt embeds CLI flags and statuses, so it can drift. Mitigation: keep it procedural (run `select`, `link`, `list`, read the output) rather than enumerating every flag, and pin a tested package version in the examples.

### Split developer docs by question, not by file type

`CONTRIBUTING.md` answers "how do I participate", `docs/architecture.md` answers "how is it built", `docs/testing.md` answers "how do I test it". One giant contributor file was rejected because the architecture section is reference material that maintainers revisit independently, and the test-fixture details are substantial enough to deserve their own page.

- **Trade-off:** three files to keep current. Each ends with links to the others rather than repeating their content.

### Accuracy rules for every document

- Quote only commands that run in this repository, and run them during implementation.
- Describe statuses, flags, and exit codes from the implementation and `--help`, not from memory.
- Link to `openspec/specs/<capability>/spec.md` for behavioral contracts instead of restating requirements.
- State known limitations plainly (TTY-only picker, POSIX symlinks, no negative token-publish test).

## Risks / Trade-offs

- **Documentation drifts from the CLI** → keep flag tables in README only, have the other docs speak in verbs (`select`, `link`, `list`) and link to README for flags; add `--help` as the cited source of truth.
- **A new command or status lands without docs** → CONTRIBUTING and AGENTS.md both state that behavior changes require a spec update and a README/docs update; the release checklist already points at docs.
- **The consumer prompt is copied into a repo with different conventions** → the prompt starts with a survey step and requires asking before writing, and it forbids force/backup over occupied paths without explicit approval.
- **Absolute README links break if the default branch is renamed** → documented trade-off; the branch is `master` today and referenced by the CI/npm badges as well.
- **Docs become a second source of truth for the manifest semantics** → architecture links to `llm-file-manifest` and `worktree-link` specs for the contract, and only explains the shape.

## Open Questions

- None. A future docs site or changelog is intentionally deferred and does not change this document set.
