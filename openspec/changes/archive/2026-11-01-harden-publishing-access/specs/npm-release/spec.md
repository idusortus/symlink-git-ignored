# Spec Delta

## ADDED Requirements

### Requirement: Token publishing disabled for the package

The package's npm publishing access SHALL be configured to require two-factor authentication and disallow tokens, stored by the registry as `publish_requires_tfa=true` and `automation_token_overrides_tfa=false`. No granular access token — including one created with bypass 2FA enabled — SHALL be able to publish a version of `symlink-git-ignored`.

#### Scenario: Restrictive policy is active

- **WHEN** the maintainer applies `npm access set mfa=publish symlink-git-ignored` and reviews the package's Settings → Publishing access page
- **THEN** "Require two-factor authentication and disallow tokens" is the selected policy

#### Scenario: Token publish is refused

- **WHEN** any granular access token attempts to publish a version of `symlink-git-ignored`
- **THEN** the registry rejects the publish instead of creating the version, regardless of the token's bypass-2FA setting

#### Scenario: Trusted publishing is unaffected

- **WHEN** a `v<semver>` tag is pushed and the trusted-publisher workflow runs with OIDC
- **THEN** the release publishes successfully with a provenance attestation and without any npm token

### Requirement: Hardened publishing documented

The README release section SHALL state that package publishing access disallows tokens, that manual publishes require an interactive 2FA prompt, and that CI publishes only through the GitHub OIDC trusted publisher.

#### Scenario: Maintainer reads the release process

- **WHEN** a maintainer opens the README section on releases
- **THEN** it explains that token-based publishing is disabled and that trusted publishing is the automated path
