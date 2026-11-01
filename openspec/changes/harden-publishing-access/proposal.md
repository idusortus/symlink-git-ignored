# Proposal

## Why

`0.1.1` publishes through npm Trusted Publishing, but the package still uses npm's default publishing-access policy: two-factor authentication **or** a granular access token with bypass-2FA enabled. That leaves a token as a usable publish path — a leaked or over-scoped token could ship a release without an interactive 2FA prompt. The archived `add-npm-publishing` change listed this hardening as optional task 8.4; it was deliberately deferred and is now the remaining release-security gap.

## What Changes

- Set the package publishing-access policy for `symlink-git-ignored` to **"Require two-factor authentication and disallow tokens"** via `npm access set mfa=publish symlink-git-ignored`, which the registry stores as `publish_requires_tfa=true` and `automation_token_overrides_tfa=false`.
- Record the resulting policy and its consequence in the README release section: token publishing is disabled, manual publishes require interactive 2FA, and CI publishes only through OIDC.
- Verify the change end to end by cutting `0.1.2` from a `v0.1.2` tag, confirming the trusted-publisher workflow still succeeds and still produces a provenance attestation.
- Keep the trusted-publisher configuration as-is (`publish, stage publish`); the policy change targets token authentication only.

**Non-goals**: revoking account-wide npm tokens (the only listed token is already revoked, and the local credential is shared with other projects), GitHub tag/branch protection, SHA-pinning GitHub Actions, dependency-update automation, and staged publishing approvals. A negative token-publish test is also out of scope: proving rejection would require attempting a real publish with a token, so the setting is verified through the package settings page and the successful OIDC release.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `npm-release`: adds the package-level publishing-access requirement that disables token publishing, and requires the hardening to be documented and proven by a trusted release.

## Impact

- npm registry: package settings for `symlink-git-ignored` change from the default policy to disallow tokens; `latest` moves from `0.1.1` to `0.1.2`.
- Repository: `README.md` gains a short paragraph in the release section; `package.json`/`package-lock.json` version bump to `0.1.2`; a new tag `v0.1.2` is pushed.
- Maintainer: one interactive `npm access set` call requiring an OTP.
- No application code changes; the CLI, tests, build, and workflows are untouched.
- Rollback if OIDC stops publishing: `npm access set mfa=automation symlink-git-ignored` (re-allows bypass-2FA tokens while still requiring 2FA), then re-tag.
