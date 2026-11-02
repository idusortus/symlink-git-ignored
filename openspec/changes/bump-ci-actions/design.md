# Design

## Context

See `proposal.md` for motivation. Observed state:

- Both workflows use `actions/checkout@v4` and `actions/setup-node@v4` on `ubuntu-latest`. Runs annotate that those actions target Node 20 and are forced onto Node 24, and that `ubuntu-latest` migrates to Ubuntu 26 starting 2026-10-19.
- `actions/checkout@v6` declares `runs.using: node24` and keeps the inputs this repo uses (`fetch-depth`, `persist-credentials`).
- `actions/setup-node@v6` declares `runs.using: node24` and adds `package-manager-cache` (default true when `packageManager` is declared), while keeping `node-version`, `registry-url`, and `cache`.
- The publish job currently omits `cache` to avoid caching, with a comment explaining that v4 only caches when `cache` is set. On v6 that reasoning is no longer accurate.
- The CI job intentionally caches npm dependencies to keep pull-request runs fast.

## Goals / Non-Goals

**Goals:**

- Remove both annotations from normal runs by using actions and runner labels that do not rely on deprecated runtimes or a moving label.
- Keep the CI and release behavior identical: same matrix, steps, permissions, gates, and publish command.
- Make the runner image and the release cache policy explicit in configuration and docs.

**Non-Goals:**

- SHA-pinning actions or adding dependency-update automation.
- Changing the Node matrix, moving to a self-hosted runner, or altering the release trigger.
- Releasing a new package version as part of this change.

## Decisions

### Bump to the current majors: `checkout@v6`, `setup-node@v6`

Both v6 majors run on the Node 24 action runtime, which removes the deprecation annotation without changing workflow semantics. The inputs used here are stable across the bump.

- **Alternatives:** `checkout@v5`/`setup-node@v5` (still one major behind; no benefit here); pinning every action to a commit SHA (stronger supply-chain guarantee, but a larger policy change with an update workflow that does not exist yet).
- **Trade-off:** majors can change defaults. `checkout@v6` adds `allow-unsafe-pr-checkout` (default false), which only affects `pull_request_target`/`workflow_run`; this repo uses `pull_request`, so the default is safe. Re-verify the publish path on the next tag.

### Pin `ubuntu-24.04` instead of `ubuntu-latest`

The migration annotation disappears, and the jobs no longer silently move to Ubuntu 26. The project's tests are POSIX and version-agnostic, but a stable image keeps release builds reproducible.

- **Alternatives:** keep `ubuntu-latest` and accept the migration (least work, but the annotation stays and the image changes under us); jump to `ubuntu-26.04` now (fewer guarantees about image availability and package versions).
- **Trade-off:** 24.04 will itself age; revisit when 26.04 is broadly available. This is recorded as a follow-up rather than solved now.

### Explicit `package-manager-cache: false` in the publish job

With v6, caching behavior is configurable. Setting it to false makes the "release builds must not depend on a mutable cache" rule explicit rather than implied by an omitted input. CI keeps `cache: npm` because caching there is desirable.

- **Alternative:** leave the input unset. Rejected: the default can change, and the old comment would be misleading.
- **Trade-off:** one extra line in the publish workflow; no behavior change for the current repository because it does not declare a `packageManager` field.

### Keep the workflows otherwise byte-for-byte equivalent

No step is reordered, no permission is changed, and no command is edited. This keeps the change reviewable and isolates the action/runtime bump from release-policy decisions.

## Risks / Trade-offs

- **A v6 major changes an input or default we rely on** → the only inputs used are `fetch-depth`, `node-version`, `registry-url`, `cache`, and `package-manager-cache`, all verified against the v6 `action.yml`; CI exercises checkout/setup-node immediately.
- **The publish job is only exercised by a tag** → CI on `master` validates the test job; the next `v*` release validates the publish job. Record that as a post-merge check rather than claiming it in this change.
- **`ubuntu-24.04` may be retired before 26.04 is adopted** → follow-up to move to the next stable runner image; the label is explicit, so the failure mode is loud rather than a silent drift.
- **Action supply-chain risk remains at major-tag resolution** → explicitly out of scope; SHA pinning plus Dependabot is the recommended follow-up if desired.
- **Docs drift** → the new CI notes cite the workflow files as the source of truth and avoid enumerating every step.

## Open Questions

- Should a later change SHA-pin actions and add automated version updates? Deferred; it is a policy decision, not needed to clear these annotations.
