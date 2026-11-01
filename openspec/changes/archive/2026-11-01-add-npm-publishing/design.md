# Design

## Context

See `proposal.md` for motivation. The package is a CLI built with `tsc` to `dist/cli.js` and declared with `files: ["dist", "README.md", "LICENSE"]`; it is already runnable from a packed tarball. Publishing state observed on this machine:

- `npm view symlink-git-ignored` returns 404, so the unscoped name is unclaimed.
- `npm whoami` returns `ENEEDAUTH`; the maintainer is not logged in here.
- `git remote` is `https://github.com/idusortus/symlink-git-ignored.git`; the repository is **private**, default branch **master**.
- `npm` is 12.0.2 locally, which includes `npm trust github` and satisfies the `>=11.5.1` trusted-publishing floor.
- `commander@15` (runtime) declares `node >=22.12.0`; `vitest@5` (dev) declares `^22.12.0 || ^24.0.0 || >=26.0.0`.

`cli-five` is the in-house precedent: it publishes on every push to `main` using trusted publishing, auto-bumping a patch, with a small step that deletes the `_authToken` line `actions/setup-node` writes so npm exchanges the OIDC token instead. This design reuses the OIDC mechanics but not the auto-bump trigger.

## Goals / Non-Goals

**Goals:**

- `npx symlink-git-ignored` resolves to a published, provenance-attested package.
- Releases are reproducible from a git tag, with no long-lived npm credential in the repository.
- The published metadata truthfully describes the runtime requirement and the source repository.
- CI catches regressions before a tag can publish them.

**Non-Goals:**

- Changing CLI behaviour or the linking specs.
- Staged publishing/approval gates (`npm stage publish`) in the first release path.
- Automated changelogs, GitHub Releases, or semantic-release style commit analysis.
- Publishing under an npm organization/scope.
- Multi-repository monorepo release tooling.

## Decisions

### Tag-driven publishing instead of publish-on-master

`publish.yml` triggers on `push: tags: ['v*']`. The job verifies that the tag matches `package.json.version`, that the commit is reachable from `origin/master`, and that the version is not already on the registry before it runs `npm publish`.

- **Alternatives:** cli-five's approach — every push to `master` bumps a patch and publishes, committing the bump with `contents: write`. Rejected here because it turns every merge into a release, requires the workflow to push version commits, and makes the published version depend on CI state rather than a deliberate tag.
- **Trade-off:** one extra manual step (`git tag vX.Y.Z && git push origin vX.Y.Z`) per release. Tags give an auditable mapping from npm version to commit and are the shape npm's provenance examples assume.
- Keep `workflow_dispatch` off: a manual trigger without a tag would have to invent a version, and the `v*` gate is the contract.

### Correct the engine floor to `>=22.12.0`

`commander@15` is a runtime dependency with `engines.node >=22.12.0`, and the installed test stack (Vitest 5) requires `^22.12 || ^24 || >=26`. Declaring `>=20` would let npm install on an unsupported runtime; npm only warns on engine mismatches by default, so the failure would surface as a crash rather than an install error.

- **Alternatives:** pin `commander@14` to preserve Node 20. Rejected: Node 20 reached end of life in April 2026, CI would have to keep an EOL line alive, and newer commander releases would be blocked.
- Consequence: CI matrix is Node `22.x` and `24.x` only. `22.x` on GitHub resolves to the latest 22 release, which is above the 22.12 floor.

### Bootstrap order: manual `0.1.0`, then trusted publishing

npm configures trusted publishers per existing package, and a new trusted-publisher configuration expires if its first successful publish does not happen within two days. So:

1. `npm login` (maintainer, interactive; 2FA may require an OTP).
2. `npm publish --access public` from a clean checkout; `prepublishOnly` runs `build` and `test`.
3. Configure the publisher with `npm trust github symlink-git-ignored --file publish.yml --repo idusortus/symlink-git-ignored --allow-publish -y`.
4. Immediately tag `v0.1.1` to validate the OIDC path inside the two-day window.

- **Trade-off:** `0.1.0` is published without provenance (a local publish has no OIDC identity). `0.1.1` is the first attested release. This is normal for bootstrapping.
- `--allow-publish` is required: trusted-publisher configurations created after 3 September 2026 default to allowing only `npm stage publish`; direct `npm publish` must be granted explicitly.
- Do **not** set `"provenance": true` in `publishConfig`: it would make the local bootstrap publish fail because there is no CI provider to attest. Provenance is automatic under OIDC.

### OIDC workflow with no token

Publish job permissions are `contents: read` and `id-token: write`. The workflow uses `actions/setup-node` with `node-version: '24'`, `registry-url: 'https://registry.npmjs.org'`, and `package-manager-cache: false` (release builds should not rely on a mutable cache). As in cli-five, the publish step removes any `_authToken` line that `setup-node` wrote into `NODE_CONFIG_USERCONFIG` before running `npm publish --access public`, so npm cannot fall back to a token.

- **Alternatives:** store a granular `NPM_TOKEN` secret. Simpler, but adds a long-lived credential that must be rotated and can leak; rejected in favour of OIDC.
- The repository `repository.url` must match the GitHub repo exactly, otherwise trusted publishing rejects the publish. This is why the metadata task is a hard prerequisite, not cosmetic.

### Public repository for provenance

npm only generates provenance for public repositories, even when the package is public. Flipping `idusortus/symlink-git-ignored` to public is a visibility change on a free account; it also makes branch protection available, but protection is not part of this change.

Before flipping, run a secret scan over the working tree and history (the repository has two `init` commits and no `.env` or `.npmrc` tracked), and confirm the published tarball exposes only `dist/` and docs. The source becomes public at the same time as the first publish, which is intentional for an `npx` tool.

### Keep `prepublishOnly` as a safety net

Both the workflow and local publishes get `build` + `typecheck` + tests from `prepublishOnly` (which invokes `npm test` and therefore `pretest`). CI additionally runs them explicitly for readable logs and so a failure happens before the publish step.

- **Trade-off:** the suite runs twice in CI. Accepted for defence against a manual publish from a dirty tree; the suite takes about five seconds.
- A clean checkout requirement matters: the tarball is built from `dist/`, so a stale `dist/` cannot leak into the release because `prepublishOnly` rebuilds.

### CI gate on Node 22 and 24

`.github/workflows/ci.yml` runs on `pull_request`, `push` to `master`, and `workflow_dispatch`, with `permissions: contents: read` and a fail-fast-disabled matrix of `22.x`, `24.x`. Steps: `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, then `node dist/cli.js --help` as a smoke test. Caching uses the lockfile.

- **Alternatives:** single Node 24 job. Rejected: the declared engine floor is 22.12 and a regression could hide behind a newer syntax/runtime assumption.
- **Trade-off:** two jobs double the minutes; acceptable for a small suite on a public repository.

## Risks / Trade-offs

- **Trusted-publisher configuration expires two days after creation if no publish succeeds** → create it only after `0.1.0` is confirmed, tag `0.1.1` immediately, and verify `npm trust list` before tagging.
- **A `v*` tag can be pushed from an unmerged branch** → the workflow fetches `origin/master` and fails unless the tagged commit is an ancestor; also configure tag protection once the repo is public (optional follow-up).
- **Making the repository public exposes all history** → scan tracked files and history for credentials first; this repo has no `.env`, `.npmrc`, or generated secrets, and `dist/` is gitignored.
- **`0.1.0` has no provenance** → document that provenance starts at `0.1.1`; the npm page will show the badge from that release onward.
- **Local publish from a dirty tree could differ from the pushed commit** → publish only after `git status` is clean and the commit is pushed; verify the tarball with `npm pack --dry-run`.
- **npm 2FA prompts can block a headless apply** → pause and hand `npm login` / OTP entry to the maintainer; never ask for a token to be pasted into the repository.
- **`npm publish` warnings about `engines` are non-fatal** → the engine fix prevents installing on Node 20, but npm still warns rather than refusing; README states the requirement and CI covers both supported lines.

## Migration Plan

1. Land metadata, workflows, and README; commit and push to `master` (still private).
2. Secret-scan, then flip the repository to public and verify Actions remain enabled.
3. Maintainer logs in; publish `0.1.0` manually and verify `npm view` plus `npx`.
4. Create the trusted publisher with `npm trust`, allowing `npm publish`, and confirm with `npm trust list`.
5. Bump to `0.1.1`, commit, tag, push the tag; watch the workflow; verify the version and provenance.
6. Optional hardening: on npmjs.com, restrict token-based publishing now that OIDC works.

**Rollback:** `npm unpublish symlink-git-ignored@<version>` is allowed within npm's unpublish policy window, otherwise `npm deprecate`; delete the git tag if the workflow failed before publishing. Repository visibility is reversible, but anything already published stays public.

## Open Questions

- Adopt `npm stage publish` with maintainer approval once releases become frequent? Deferred; it changes the release UX without changing today's outcome.
- Generate GitHub Releases from tags? Deferred; npm's version page and git tags already provide the mapping.
