# Tasks

## 1. Package metadata

- [x] 1.1 Set `"engines": { "node": ">=22.12.0" }` in `package.json` to match `commander@15` and the Vitest 5 floor; confirm `npm ls commander` resolves to 15.x.
- [x] 1.2 Add `"repository": { "type": "git", "url": "git+https://github.com/idusortus/symlink-git-ignored.git" }`, `"homepage": "https://github.com/idusortus/symlink-git-ignored#readme"`, `"bugs": { "url": "https://github.com/idusortus/symlink-git-ignored/issues" }`, and `"author": "idusortus (https://github.com/idusortus)"`.
- [x] 1.3 Remove the `main` and `types` fields; the package exposes only `bin`. Keep `bin`, `files`, `license`, and `publishConfig.access: "public"`.
- [x] 1.4 Expand `keywords` with `worktree`, `symlink`, `claude`, and `opencode` (keep the existing entries).
- [x] 1.5 Run `npm pkg get name version engines repository bin files` and `npm pack --dry-run`; confirm the tarball still contains only `dist/`, `README.md`, `LICENSE`, and `package.json`, and that `dist/cli.js` has its shebang.
- [x] 1.6 Run `npm run typecheck && npm run build && npm test`; all 66 tests must still pass after the metadata edit.

## 2. CI workflow

- [x] 2.1 Create `.github/workflows/ci.yml` with `name: CI`; triggers `pull_request`, `push` to `master`, and `workflow_dispatch`; `permissions: contents: read`.
- [x] 2.2 Add a `test` job on `ubuntu-latest` with `strategy.fail-fast: false` and matrix `node-version: ['22.x', '24.x']`; use `actions/checkout@v4` and `actions/setup-node@v4` with `cache: npm`.
- [x] 2.3 Steps: `npm ci`, then `npm run typecheck`, then `npm run build`, then `npm test`, then `node dist/cli.js --help` as a smoke test.
- [x] 2.4 Validate the YAML structure locally (parse it, e.g. `node -e` with a YAML parser or `npx --yes yaml-lint` if available) and confirm the workflow filename and branch (`master`) exactly match this repository.

## 3. Publish workflow

- [x] 3.1 Create `.github/workflows/publish.yml` with `name: Publish to npm`; trigger `push: tags: ['v*']`; `permissions: { contents: read, id-token: write }`; `concurrency: { group: publish-npm, cancel-in-progress: false }`.
- [x] 3.2 Add a `publish` job on `ubuntu-latest` using `actions/checkout@v4` with `fetch-depth: 0`, and `actions/setup-node@v4` with `node-version: '24'`, `registry-url: 'https://registry.npmjs.org'`, `package-manager-cache: false`.
- [x] 3.3 Add the tag/version gate: derive `TAG="${GITHUB_REF_NAME#v}"`, compare it with `node -p "require('./package.json').version"`, and fail with `::error::` before any publish when they differ.
- [x] 3.4 Add the commit gate: `git fetch origin master`, then require `git merge-base --is-ancestor "$GITHUB_SHA" origin/master`; fail with an actionable message when the tag is not on `master`.
- [x] 3.5 Add the registry gate: fail when `npm view "symlink-git-ignored@${VERSION}" version` resolves, so a duplicate tag cannot attempt a republish.
- [x] 3.6 Add `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` steps before publishing.
- [x] 3.7 Add the publish step: delete any `_authToken` line from `$NPM_CONFIG_USERCONFIG` when that file exists (the `setup-node` fallback), then run `npm publish --access public`. Do not add `NODE_AUTH_TOKEN` or any npm secret.
- [x] 3.8 Confirm `prepublishOnly` will run build and tests during publish, and that the workflow never writes to `package.json` or pushes commits (no `contents: write`).

## 4. Documentation

- [x] 4.1 Add npm and CI badges to the top of `README.md`, linking to `https://www.npmjs.com/package/symlink-git-ignored` and the Actions page.
- [x] 4.2 Add an "Install" section with `npx symlink-git-ignored`, `npx symlink-git-ignored select`, and `npm install -g symlink-git-ignored`; state the `Node >= 22.12.0` requirement.
- [x] 4.3 Add a "Releasing" section for maintainers: bump with `npm version patch --no-git-tag-version`, commit, `git tag vX.Y.Z`, `git push origin master vX.Y.Z`, then watch the `Publish to npm` workflow and verify with `npm view`.
- [x] 4.4 Document the trusted-publisher identity (`idusortus/symlink-git-ignored`, workflow `publish.yml`, `Allow npm publish` enabled), that a new configuration must complete its first publish within two days, and that `0.1.0` was a manual bootstrap so provenance begins with `0.1.1`.
- [x] 4.5 Confirm the README's flag tables and status vocabulary still match `node dist/cli.js --help` output after the edits.

## 5. Pre-public checks and commit

- [ ] 5.1 Add `.npmrc` and `.env` to `.gitignore` as a safety net; confirm `git ls-files` contains no `.npmrc`, `.env`, `*.pem`, or key material.
- [ ] 5.2 Secret-scan the working tree and history: `git grep -nE '(npm_[A-Za-z0-9]{36}|ghp_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)'` and the same pattern over `git log -p --all`; investigate every hit (the two `init` commits should be clean).
- [ ] 5.3 Confirm `git status` shows only intended files (implementation, tests, docs, workflows, OpenSpec change) and that `dist/`, `node_modules/`, and tarballs are ignored.
- [ ] 5.4 Commit everything with a descriptive message and push `master` to `origin`; confirm `git status` is clean and `git log origin/master..master` is empty.
- [ ] 5.5 Re-run `npm ci && npm test && npm run build` from the committed tree; confirm the tarball built from a clean checkout is identical in file list to `npm pack --dry-run`.

## 6. Repository visibility

- [ ] 6.1 Flip the repository public only after 5.2 passes: `gh api -X PATCH repos/idusortus/symlink-git-ignored -F private=false`.
- [ ] 6.2 Verify with `gh api repos/idusortus/symlink-git-ignored --jq .visibility` → `public`, and confirm Actions remain enabled (`gh api repos/idusortus/symlink-git-ignored/actions/permissions`).
- [ ] 6.3 Confirm the public repository shows the committed source and that `git+https://github.com/idusortus/symlink-git-ignored.git` resolves.
- [ ] 6.4 Optionally enable tag protection/rules for `v*` and branch protection for `master` now that the free-plan restriction lifted; record whichever choice was made.

## 7. Bootstrap publish (`0.1.0`) — maintainer terminal required

- [ ] 7.1 Run `npm whoami`; it currently fails with `ENEEDAUTH`. **Pause and ask the maintainer to run `npm login`** (2FA/OTP may be required), then re-run `npm whoami` and confirm the account that will own the package.
- [ ] 7.2 From the clean checkout at the pushed commit, run `npm publish --access public`; `prepublishOnly` builds and tests first. Stop on any failure rather than retrying blindly.
- [ ] 7.3 Verify `npm view symlink-git-ignored version` → `0.1.0`, and `npm view symlink-git-ignored repository.url bin engines` shows the expected values.
- [ ] 7.4 Verify the installed CLI: `npx -y symlink-git-ignored@0.1.0 --version` → `0.1.0`, and `npx -y symlink-git-ignored@0.1.0 --help` lists `link`, `select`, and `list`.
- [ ] 7.5 Confirm the registry tarball file list matches the local pack (`npm view symlink-git-ignored@0.1.0 dist.tarball`, download/inspect if needed) and contains no `src/`, `test/`, or OpenSpec files.

## 8. Trusted publisher — maintainer authentication required

- [ ] 8.1 Run `npm trust github symlink-git-ignored --file publish.yml --repo idusortus/symlink-git-ignored --allow-publish -y`; pause for OTP if prompted. Do not store any token in the repository.
- [ ] 8.2 Verify with `npm trust list symlink-git-ignored` that the GitHub configuration names `idusortus`, `symlink-git-ignored`, `publish.yml`, and allows `npm publish` (not stage-only).
- [ ] 8.3 Record the configuration date; the first successful publish must happen within two days or the configuration expires.
- [ ] 8.4 Optional hardening: on npmjs.com → package settings → Publishing access, select "Require two-factor authentication and disallow tokens" after 9.4 proves OIDC works.

## 9. First CI release (`0.1.1`)

- [ ] 9.1 Bump the version with `npm version 0.1.1 --no-git-tag-version`, then `npm run typecheck && npm test && npm run build`.
- [ ] 9.2 Commit as `chore: release 0.1.1`, tag `v0.1.1`, and push both: `git push origin master && git push origin v0.1.1`.
- [ ] 9.3 Watch the workflow with `gh run list --workflow=publish.yml --limit 1` and `gh run watch <run-id>`; confirm every gate passed and `npm publish` succeeded.
- [ ] 9.4 Verify `npm view symlink-git-ignored@0.1.1 version`, then run `npm audit signatures` in a throwaway install (`npm i symlink-git-ignored@0.1.1`) and confirm the package reports a verified attestation.
- [ ] 9.5 Confirm the npm package page shows the provenance badge and the repository link, and that `npx -y symlink-git-ignored@latest --version` reports the new version.
- [ ] 9.6 Confirm the CI workflow also ran green for the release commit on Node 22 and 24.

## 10. Verification

- [ ] 10.1 `npm run typecheck && npm run build && npm test` pass locally from a clean checkout.
- [ ] 10.2 `npm pack --dry-run` lists only `dist/`, `README.md`, `LICENSE`, and `package.json`, and `files`/`bin`/`engines` match the npm view output.
- [ ] 10.3 README badges resolve, the install commands work, and the release section matches the actual workflow filename and tag format.
- [ ] 10.4 `openspec validate add-npm-publishing --strict` passes.
