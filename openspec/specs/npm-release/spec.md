# npm-release Specification

## Purpose

Defines how `symlink-git-ignored` is packaged, published to the public npm registry, and proven to come from this repository, including the CI gate and the tokenless trusted-publishing path used for tagged releases.

## Requirements

### Requirement: Publishable package metadata

The package SHALL declare `repository.url` as `git+https://github.com/idusortus/symlink-git-ignored.git`, matching the public GitHub repository exactly, plus `homepage`, `bugs`, `author`, and `license`. It SHALL keep `bin.symlink-git-ignored` and `files` limited to the built output, README, and LICENSE. It SHALL NOT declare `main` or `types`, because the package exposes only a CLI and advertising a library entry point is misleading.

#### Scenario: Registry metadata points at the source repository

- **WHEN** the published package metadata is read with `npm view symlink-git-ignored repository.url homepage bugs.url bin`
- **THEN** the repository URL is `git+https://github.com/idusortus/symlink-git-ignored.git` and the bin entry is `dist/cli.js`

#### Scenario: Tarball contains no development files

- **WHEN** `npm pack --dry-run` runs in a clean checkout
- **THEN** the tarball contains `dist/`, `README.md`, `LICENSE`, and `package.json` only, with no `src/`, `test/`, or OpenSpec files

### Requirement: Correct Node runtime floor

`engines.node` SHALL be `>=22.12.0`, reflecting that the runtime dependency `commander@15` does not support earlier Node versions. The README SHALL state the same minimum.

#### Scenario: Node floor matches the dependency

- **WHEN** `package.json` and the installed `commander` package are compared
- **THEN** the declared engine range is at least as strict as `commander`'s own `>=22.12.0`

### Requirement: First public release

The tool SHALL be published to the public npm registry as `symlink-git-ignored@0.1.0` with `access: public`, and SHALL be runnable through `npx` without a local install.

#### Scenario: Running the published package

- **WHEN** a user runs `npx -y symlink-git-ignored@0.1.0 --version`
- **THEN** the command prints `0.1.0` and exits successfully

#### Scenario: Package is discoverable

- **WHEN** `npm view symlink-git-ignored version` runs after the bootstrap publish
- **THEN** it reports `0.1.0`

### Requirement: Tag-driven release

Publishing SHALL be triggered by pushing a tag matching `v<semver>` to `master`, and only that tag's commit SHALL be published. Before publishing, the workflow SHALL require the tag's version to equal `package.json.version` and SHALL require that version to be absent from the registry. A mismatch or an already-published version SHALL fail the job without publishing.

#### Scenario: Matching tag publishes

- **WHEN** `package.json` contains `0.1.1` and the tag `v0.1.1` is pushed
- **THEN** the workflow publishes `symlink-git-ignored@0.1.1` with public access

#### Scenario: Tag and manifest disagree

- **WHEN** the tag is `v0.2.0` but `package.json` still says `0.1.1`
- **THEN** the workflow fails before running `npm publish` and reports both versions

#### Scenario: Version already exists

- **WHEN** the tag version is already present on the registry
- **THEN** the workflow fails with an actionable message instead of attempting a duplicate publish

### Requirement: CI quality gate

Pull requests and pushes to `master` SHALL run the project's typecheck, build, and full test suite in GitHub Actions on Node 22 and Node 24. The publish workflow SHALL run the same checks on the tagged commit before publishing.

#### Scenario: Failing tests block a release

- **WHEN** any test fails on the tagged commit
- **THEN** the publish job stops before `npm publish` and no version reaches the registry

#### Scenario: Supported Node lines are covered

- **WHEN** CI runs for a pull request
- **THEN** both Node 22 and Node 24 execute `npm run typecheck`, `npm run build`, and `npm test`

### Requirement: Tokenless trusted publishing

The publish workflow SHALL authenticate with npm Trusted Publishing over GitHub OIDC, using `permissions: id-token: write` and no long-lived npm token in the repository or in GitHub secrets. The trusted-publisher configuration SHALL name this repository and the `publish.yml` workflow filename, and SHALL allow direct `npm publish` in addition to staged publishing.

#### Scenario: No publish token exists

- **WHEN** the repository secrets and workflow files are inspected
- **THEN** no `NPM_TOKEN` or registry `_authToken` is present, and the publish job requests an OIDC token

#### Scenario: Workflow identity mismatch

- **WHEN** the configured trusted publisher names a different workflow filename
- **THEN** the publish fails with an authentication error rather than silently falling back to a token

### Requirement: Provenance for tagged releases

Releases published by the tag workflow SHALL carry an npm provenance attestation generated from the public GitHub repository.

#### Scenario: Verifying a release

- **WHEN** `npm audit signatures` runs after `0.1.1` is published by CI
- **THEN** the package reports a verified attestation, and the npm package page shows its provenance

### Requirement: Public source repository

The GitHub repository SHALL be public before any CI publish, and the published package's repository metadata SHALL identify it.

#### Scenario: Repository visibility

- **WHEN** the publish workflow runs
- **THEN** the repository is public, so npm can attach provenance to the release

### Requirement: Installation and release documentation

The README SHALL document `npx symlink-git-ignored` and global installation, the supported Node version, and maintainer release steps: bump the version, commit, tag `v<version>`, push the tag, and confirm the workflow result. It SHALL also record that a new trusted-publisher configuration must complete its first publish within two days.

#### Scenario: New contributor reads the release process

- **WHEN** a maintainer opens the README section on releases
- **THEN** the steps from version bump to tag push and verification are listed, including the trusted-publisher filename and the two-day window
