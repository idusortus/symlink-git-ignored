# Configure symlink-git-ignored with an AI agent

This page is for a repository owner who wants an AI coding agent to set up `symlink-git-ignored` in a project and prove it works, rather than doing the steps by hand. It follows the same pattern as the rest of the project's tooling: survey first, write only what is needed, and verify with real command output.

The prompt was verified against `symlink-git-ignored@0.1.2` (the current release). Newer versions keep the same `select`/`link`/`list` interface; pin the version if you want reproducible setup.

## Before you start

- Node.js **>= 22.12.0**.
- A git repository with at least one linked worktree (`git worktree list` shows two or more entries), or permission for the agent to create one.
- An agent that can run shell commands and edit files in the repository.
- Decide which gitignored paths matter to your assistant: typically `.env`, `.claude/`, `.opencode/`, and local notes. Never build output, caches, or binaries.

## The prompt

Copy everything inside the fenced block into an agent session started at the repository root.

````text
TASK: Configure symlink-git-ignored in this repository and verify it works inside a git
worktree. Do not guess. Confirm every step with real command output, and report honestly
if something fails.

STEP 0 — SURVEY, READ-ONLY
- Run `git rev-parse --show-toplevel` and `git worktree list`. Record the primary checkout
  and every linked worktree.
- Run `node --version`. Stop if it is below 22.12.0.
- If `.llm-files` exists, print it and treat it as the current manifest.
- List gitignored candidates: `git ls-files --others --ignored --exclude-standard --directory`.
- Identify assistant-facing paths that exist here: `.env`, `.claude/`, `.opencode/`, local
  notes, MCP credentials. Ignore build output and caches.
- If there is no linked worktree, ASK whether to create one. Do not create one silently.

STEP 1 — CHOOSE PATHS AND WRITE THE MANIFEST (primary checkout)
- Propose the exact list of paths and ask for confirmation before writing.
- Add them with:
  `npx -y symlink-git-ignored@0.1.2 select --add <paths...>`
  Use the interactive `select` only when a TTY is available.
- Never include node_modules, dist, build, out, .next, .cache, target, coverage, or binary
  files. Do not use --no-default-excludes to get around that rule.
- Show `git diff -- .llm-files`, then ask before committing. Commit the manifest so the
  worktree receives it. Never commit secrets; the manifest stores paths only.

STEP 2 — LINK AND VERIFY IN THE WORKTREE
- cd into the linked worktree.
- Run `npx -y symlink-git-ignored@0.1.2 --dry-run` and show the plan.
- If any entry is `occupied`, STOP and ask. Do not use --force or --backup without
  explicit approval.
- Run `npx -y symlink-git-ignored@0.1.2` to create the links.
- Run `npx -y symlink-git-ignored@0.1.2 list` and report every status.
- Prove a link resolves by reading one file through it, for example `head .env` or
  `ls .claude/`.
- Run `link` a second time and confirm it reports `already-linked` (idempotent).

STEP 3 — REPORT
Report, with command output as evidence:
- primary (source) root and worktree (destination) root
- entries added to .llm-files
- per-entry status after linking
- which files you read through links
- anything skipped and why
- remaining manual steps
Stop and report instead of proceeding on `missing-source`, `unsafe`, or repeated `occupied`.
````

## Notes

- **Source detection**: the tool uses the first `git worktree list` entry. If the primary checkout moved or was removed, add `--from /path/to/checkout`.
- **Pinning**: use `symlink-git-ignored@<version>` in CI or scripted setup; `@latest` is fine for a one-off.
- **Tracked manifest**: `.llm-files` is meant to be committed. The agent should treat editing it like any other branch change.
- **Denylist**: `select` filters build artifacts automatically, and `--add` rejects them. Do not bypass that to link `node_modules` or `dist`.
- **Existing destinations**: a real `occupied` file is usually worktree-local state. Prefer leaving it alone over forcing the link.
- **Verification is the point**: a setup that writes `.llm-files` but never exercises `list` or reads through a link is incomplete.
