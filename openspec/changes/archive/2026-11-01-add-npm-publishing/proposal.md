# Proposal

## Why

`symlink-git-ignored` works locally but is not on the npm registry, so the documented `npx symlink-git-ignored` entry point does not exist yet and the package name is unclaimed. There is also no CI, no release path, and `engines: ">=20"` is wrong: the runtime dependency `commander@15` requires Node `>=22.12.0`, so Node 20 users would install successfully and crash on first run.

## What Changes

- **Fix the runtime contract**: `engines.node` becomes `>=22.12.0` (matching `commander@15` and the Vitest 5 floor used by the test suite), and the README states the same requirement.
- **Complete the package metadata**: add `repository`, `homepage`, `bugs`, and `author`; expand `keywords` with `worktree`, `symlink`, `claude`, `opencode`; remove `main` and `types`, which misleadingly advertise a library API when the package is a CLI with only a `bin`.
- **Add CI** (`.github/workflows/ci.yml`): typecheck, build, and the full test suite on pull requests and pushes to `master`, on Node 22 and 24.
- **Add tag-driven publishing** (`.github/workflows/publish.yml`): a pushed `v<semver>` tag publishes that exact version with `--access public`. The job aborts before publishing when the tag and `package.json` version disagree, or when that version already exists on the registry.
- **Publish through npm Trusted Publishing (OIDC)**: `id-token: write`, no `NPM_TOKEN` secret, no long-lived token in the repo. The trusted publisher is created with `npm trust github symlink-git-ignored --file publish.yml --repo idusortus/symlink-git-ignored --allow-publish`.
- **Bootstrap the first release**: `0.1.0` is published once from the maintainer's machine after `npm login` (trusted publishing cannot be configured until the package exists). The trusted publisher is then created, and `0.1.1` is tagged to prove the OIDC path and produce the first provenance attestation.
- **Make the GitHub repository public**: required for npm provenance attestations and consistent with an `npx`-distributed open-source CLI. A secret scan runs before the visibility change.
- **Document installation and releases** in `README.md`: npm badge, `npx` and global install, the `v*` tag workflow, the trusted-publisher settings, and the two-day validation window on a new trusted-publisher configuration.

**Non-goals**: staged publishing with maintainer approval, automatic patch bumps on every `master` push, GitHub Releases/changelog automation, publishing under an org scope, Windows CI, and migrating away from `commander` to keep Node 20 support (Node 20 reached end of life in April 2026).

## Capabilities

### New Capabilities

- `npm-release`: what the published package must contain, how a version reaches the registry, the authentication and provenance guarantees of that path, and the CI gate that precedes it.

### Modified Capabilities

<!-- None: the linking behaviour in `llm-file-manifest` and `worktree-link` does not change. -->

## Impact

- `package.json` (engines, repository/homepage/bugs/author, keywords, remove `main`/`types`), `README.md`, new `.github/workflows/ci.yml`, new `.github/workflows/publish.yml`.
- npm registry: new public package `symlink-git-ignored` at `0.1.0`, then `0.1.1` from CI; npmjs.com package settings gain a trusted publisher.
- GitHub: `idusortus/symlink-git-ignored` changes from private to public; existing implementation work is committed and pushed to `master`; tag `v0.1.1` is created.
- Maintainer machine: `npm login` and one manual `npm publish`; npm 12.0.2 is already installed, which satisfies the trusted-publishing CLI floor (`>=11.5.1`).
- No code behaviour changes; the `engines` correction is the only runtime-visible adjustment.
