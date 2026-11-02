# Proposal

## Why

Every workflow run now carries two warnings: `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 action runtime and are being forced onto Node 24, and `ubuntu-latest` is migrating to Ubuntu 26. The repository already documents its CI and release path, so the warnings are noise in every run and the pinned versions are behind the current Node 24 action runtime. `setup-node@v6` also supports an explicit package-manager cache switch, which lets the release workflow state its no-cache policy in configuration instead of relying on the absence of a `cache` input.

## What Changes

- Bump both workflows to `actions/checkout@v6` and `actions/setup-node@v6`, the current majors running on the Node 24 runtime.
- Pin both jobs to `ubuntu-24.04` instead of `ubuntu-latest`, removing the migration annotation and making the runner image explicit and reproducible.
- In the publish workflow, set `package-manager-cache: false` explicitly (supported by `setup-node@v6`) and replace the stale "v4 only caches when `cache` is set" comment.
- Keep the CI matrix (`22.x`, `24.x`), `cache: npm` for CI, permissions (`contents: read`, `id-token: write`), OIDC publishing, tag/version gates, and every command unchanged.
- Update `AGENTS.md` and `CONTRIBUTING.md` with a short CI note describing the runner, action majors, and the cache policy so the next person does not have to read the YAML to learn it.

**Non-goals**: pinning actions to commit SHAs, adding Dependabot or Renovate, changing the Node matrix, altering release permissions or the trusted-publisher setup, and cutting a release. There is no product behavior change, so this change declares `skip_specs: true`.

## Capabilities

### New Capabilities

<!-- None: CI tooling only. -->

### Modified Capabilities

<!-- None: the npm-release requirements (CI gate, tag release, OIDC, provenance) are unchanged. -->

## Impact

- `.github/workflows/ci.yml` and `.github/workflows/publish.yml`: action majors, runner label, cache input, comments.
- `AGENTS.md` and `CONTRIBUTING.md`: short CI/release-workflow notes.
- No `src/`, `test/`, `package.json`, manifest, or CLI behavior changes. The publish workflow's new action versions are only fully exercised by the next tag release; CI verifies the test job immediately.
