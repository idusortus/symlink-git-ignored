# Design

## Context

See `proposal.md` for motivation. Current release state observed on 2026-11-01:

- `latest` is `0.1.1`; `v0.1.1` was published by `.github/workflows/publish.yml` through OIDC with a provenance attestation.
- The trusted-publisher configuration exists (`github`, `publish.yml`, repository `idusortus/symlink-git-ignored`, permissions `publish, stage publish`).
- `npm access set mfa=publish <pkg>` sends `{ publish_requires_tfa: true, automation_token_overrides_tfa: false }` to `POST /-/package/<pkg>/access`; `mfa=automation` sets the override back to `true`, and `mfa=none` disables the requirement. The command wraps the request in an OTP prompt.
- npm exposes no CLI getter for the MFA policy: `npm access get` only supports `status`, and `libnpmaccess` has `setMfa` but no `getMfa`.
- `npm token list` shows a single token named `clifive`, description "github release bump", already revoked on 2026-05-19. No active automation token exists on the account.
- The local `~/.npmrc` holds a registry credential used by the CLI; it is not listed by `npm token list`, so it is likely a granular or web-session credential shared with other projects.
- `master` is unprotected and has no rulesets or environments. That is intentionally out of scope here.

## Goals / Non-Goals

**Goals:**

- Make the package reject every token-based publish, including bypass-2FA granular tokens.
- Leave OIDC trusted publishing as the only automated path and prove it still works.
- Leave a clear, reversible record of the policy and how to roll it back.

**Non-Goals:**

- Account-wide token hygiene beyond the package policy (no active token exists to revoke).
- GitHub-side release-rail hardening (tag protection, branch protection, SHA pinning, `persist-credentials: false`). Those are separate changes with their own trade-offs.
- Negative testing by attempting a token publish. It would require a real version slot and an interactive token, and the registry enforcement is defined by the setting, not by our client.
- Changing the trusted-publisher permissions or moving to staged publishing.

## Decisions

### Apply the policy with `npm access set mfa=publish`, not the website

The CLI writes exactly the two registry fields the Settings page writes, so it is scriptable, auditable in the shell history, and less error-prone than clicking through npmjs.com.

- **Alternatives:** npmjs.com → package Settings → Publishing access (the only documented path before npm 12); patching the registry endpoint directly (same result, more risk).
- **Trade-off:** npm still requires an interactive OTP, so the apply phase pauses rather than running unattended. This is unavoidable for a security setting.
- The command exits silently on success (`ignoreBody: true`), so success must be confirmed independently — see verification below.

### Verify with a real trusted-publish release

Because there is no getter, the only trustworthy end-to-end proof is a release: bump to `0.1.2`, tag `v0.1.2`, push, and watch `publish.yml`. If OIDC were ever treated as a token, the job would fail at `npm publish` and the version would not appear.

- **Alternatives:** read the settings page only (no proof the pipeline still works); attempt a token publish and expect rejection (needs a real version and a token, and a failed publish still consumes an upload attempt); querying an undocumented settings endpoint (brittle).
- **Trade-off:** `0.1.2` is a permanent, code-identical release. That is acceptable — it also documents when the policy took effect — and is normal for verifying a release-rail change.
- Confirmation is two-part: the Settings page shows the restrictive policy, and the tagged release succeeds with an attestation.

### Do not revoke account tokens

`npm token list` shows only a revoked token, and the local credential is shared with `cli-five`. The package-level policy neutralizes token publishing for this package without breaking other projects.

- **Alternatives:** revoke every token on the account (breaks unrelated local workflows and `cli-five` operations that may still use that credential); rotate the local `.npmrc` token (out of scope and not stored in this repository).
- **Trade-off:** a compromised token could still publish other packages the account can access. That is an account-wide concern, not one this change should silently take on.
- **Note:** the policy applies to publishing only. `npm view`, installs, `npm trust`, and OTP-authenticated setting changes still work with existing credentials.

### Keep the trusted publisher unchanged

The trusted publisher already allows `publish` (not stage-only). The new policy removes token authentication; OIDC is a separate credential exchange and remains the intended path. No workflow edit is needed for the policy itself.

- **Trade-off:** the workflow is not hardened further (no pinned actions, no tag protection). Called out as a non-goal and a follow-up rather than folded in.

### Rollback

If `0.1.2` cannot publish, or if an emergency manual publish is needed, run `npm access set mfa=automation symlink-git-ignored` to restore "2FA required, automation tokens may override". That keeps 2FA mandatory while re-allowing bypass-2FA tokens. `mfa=none` is not recommended and should not be used as the rollback.

## Risks / Trade-offs

- **The maintainer's npm account may not have 2FA enabled or the session may lack an OTP** → the command fails with a TFA error; stop and complete 2FA setup rather than falling back to `mfa=none`.
- **No getter means a silent wrong value is possible** → confirm the selected radio button on the Settings page and record the date, then prove it with the release.
- **A failed `0.1.2` release leaves a tag but no version** → delete the tag (`git push origin :refs/tags/v0.1.2`), roll back the policy if OIDC is implicated, and retry with a new patch version; npm never allows reusing a published version, but a failed publish leaves it unused.
- **Manual bootstrap publishes now require an interactive OTP** → already true in practice for `0.1.0`; document it so nobody expects `npm publish` to work with a token.
- **The local shared credential stops working for this package** → intended. It remains valid for other packages; do not "fix" this by creating a bypass token, which the policy rejects anyway.

## Migration Plan

1. Confirm `latest` and the trusted-publisher entry; record the current policy from the Settings page.
2. Run `npm access set mfa=publish symlink-git-ignored` and complete the OTP.
3. Confirm "Require two-factor authentication and disallow tokens" is selected on npmjs.com.
4. Update the README release section.
5. Bump to `0.1.2`, commit, tag `v0.1.2`, push, and watch the publish workflow.
6. Verify the version, the attestation, and that the policy is still selected.

**Rollback:** `npm access set mfa=automation symlink-git-ignored`; delete the failed tag if no version was published.

## Open Questions

- Should GitHub release rails (tag protection for `v*`, required checks on `master`, SHA-pinned actions) follow as a separate change? Deferred; it does not change this capability's behavior.
