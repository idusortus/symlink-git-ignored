# Tasks

## 1. Preflight

- [x] 1.1 Confirm the current release state: `npm view symlink-git-ignored dist-tags --json` reports `latest: 0.1.1`, and `npm whoami` reports the owning account.
- [x] 1.2 Confirm the trusted publisher is still configured: `npm trust list symlink-git-ignored` shows `github`, `publish.yml`, repository `idusortus/symlink-git-ignored`, permissions `publish, stage publish`.
- [x] 1.3 Record the current publishing-access policy from npmjs.com → `symlink-git-ignored` → Settings → Publishing access (expected: "Require two-factor authentication or a granular access token with bypass 2fa enabled", the default).
- [x] 1.4 Run `npm token list --json` and record that the only listed token (`clifive`) is already revoked; confirm no new token is created for this change.
- [x] 1.5 Record the rollback command in the change notes: `npm access set mfa=automation symlink-git-ignored`.

## 2. Apply the policy

- [x] 2.1 Run `npm access set mfa=publish symlink-git-ignored`; complete the OTP prompt. **Pause and hand off to the maintainer if the OTP or 2FA setup is unavailable** — do not fall back to `mfa=none`.
- [x] 2.2 Confirm the command exited 0. The CLI prints nothing on success, so treat exit status as necessary but not sufficient.
- [x] 2.3 Verify on npmjs.com → package Settings → Publishing access that **"Require two-factor authentication and disallow tokens"** is selected; record the confirmation date.
- [x] 2.4 Do not revoke or rotate account-wide tokens as part of this change; the package policy is the control.

## 3. Documentation

- [x] 3.1 Add a sentence to the README "Releasing" section: publishing access disallows tokens, manual publishes need an interactive 2FA prompt, and CI publishes only through the GitHub OIDC trusted publisher.
- [x] 3.2 Confirm the README still states the correct trusted-publisher identity and the two-day first-publish window; no other release instruction changes.

## 4. Verify with a patch release

- [x] 4.1 Bump with `npm version 0.1.2 --no-git-tag-version`, then run `npm run typecheck && npm test && npm run build`.
- [x] 4.2 Commit as `chore: release 0.1.2`, tag `v0.1.2`, and push both: `git push origin master && git push origin v0.1.2`.
- [x] 4.3 Watch the publish workflow (`gh run list --workflow=publish.yml --limit 1`, then `gh run watch <run-id>`); confirm the tag/version, `master` ancestry, and unpublished-version gates pass and `npm publish` succeeds without any token.
- [x] 4.4 Verify `npm view symlink-git-ignored@0.1.2 version` and that `npm view symlink-git-ignored dist-tags` moves `latest` to `0.1.2`.

## 5. Verification

- [x] 5.1 Confirm the release carries provenance: install `symlink-git-ignored@0.1.2` in a throwaway directory and run `npm audit signatures`; expect a verified attestation.
- [x] 5.2 Confirm `npx -y symlink-git-ignored@latest --version` reports `0.1.2`.
- [x] 5.3 Re-open npmjs.com → package Settings → Publishing access and confirm "Require two-factor authentication and disallow tokens" is still selected after the release.
- [x] 5.4 Confirm no `NPM_TOKEN`/`NODE_AUTH_TOKEN` secret was added and the publish workflow still has only `contents: read` plus `id-token: write`.
- [x] 5.5 Record that a token-publish rejection test was intentionally not attempted (it would require a real publish attempt with a token); the policy's registry semantics and the OIDC release are the evidence.
- [x] 5.6 `openspec validate harden-publishing-access --strict` passes.
