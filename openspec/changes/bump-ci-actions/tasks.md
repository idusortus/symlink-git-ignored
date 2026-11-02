# Tasks

## 1. CI workflow

- [x] 1.1 Change `.github/workflows/ci.yml` to `runs-on: ubuntu-24.04`.
- [x] 1.2 Bump the checkout step to `actions/checkout@v6` and the Node step to `actions/setup-node@v6`, keeping `node-version: ${{ matrix.node-version }}` and `cache: npm`.
- [x] 1.3 Leave triggers, permissions, the `22.x`/`24.x` matrix, and all steps unchanged.

## 2. Publish workflow

- [x] 2.1 Change `.github/workflows/publish.yml` to `runs-on: ubuntu-24.04`.
- [x] 2.2 Bump `actions/checkout@v4` (with `fetch-depth: 0`) to `actions/checkout@v6`.
- [x] 2.3 Bump `actions/setup-node@v4` to `actions/setup-node@v6`, keep `node-version: '24'` and `registry-url`, and replace the stale v4 cache comment with `package-manager-cache: false` plus a one-line explanation.
- [x] 2.4 Leave the tag/version, `master` ancestry, unpublished-version gates, permissions, concurrency, and the OIDC publish step unchanged.

## 3. Documentation

- [x] 3.1 Add a short CI note to `AGENTS.md`: runner `ubuntu-24.04`, `checkout@v6` / `setup-node@v6`, CI caches npm, release builds disable the package cache.
- [x] 3.2 Add the same CI summary to `CONTRIBUTING.md` near the pull-request/CI guidance.
- [x] 3.3 Search the docs and workflows for stale `@v4`, `ubuntu-latest`, or v4-cache comments and update them; confirm no other file mentions action versions.

## 4. Verification

- [x] 4.1 Parse both workflow YAML files locally and confirm `on`, `permissions`, `jobs`, and all inputs are valid; verify the v6 action inputs used (`fetch-depth`, `node-version`, `registry-url`, `cache`, `package-manager-cache`) exist in their `action.yml`.
- [x] 4.2 Confirm the only diff is the runner labels, action majors, the cache input/comment, and docs — no step, command, permission, or matrix changes.
- [ ] 4.3 Commit and push `master`; confirm the CI workflow runs green on Node 22 and 24 and that the Node 20 deprecation and `ubuntu-latest` migration annotations are gone from the run.
- [ ] 4.4 Record that the publish workflow's v6 actions are verified on the next `v*` tag release (not in this change), and that a follow-up will move `ubuntu-24.04` to the next stable image when appropriate.
- [ ] 4.5 `openspec validate bump-ci-actions --strict` passes with `specs` skipped.
