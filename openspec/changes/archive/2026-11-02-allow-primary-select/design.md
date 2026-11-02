# Design

## Context

See `proposal.md` for motivation. Relevant implementation today:

- `runSelect` resolves the destination with `getCheckoutRoot(process.cwd())`, reads the manifest from that root, and calls `resolveSource({ from, destinationRoot, worktrees })`.
- `resolveSource` resolves `--from` or the first worktree, realpaths it, and throws `SOURCE_IS_DESTINATION` when it equals the destination root. It is shared with `link` and `list`.
- `select` uses `sourceRoot` only for `listIgnoredEntries`; `readManifest` and `appendEntries` always use `destinationRoot`. When the two roots are equal, candidate listing and manifest writing already point at the same checkout.
- The new `docs/AGENT_PROMPT.md` currently tells agents to write the manifest in the primary checkout, which fails today.

## Goals / Non-Goals

**Goals:**

- `select` works in the primary checkout, including a repository with no linked worktrees.
- `link` and `list` keep refusing a source equal to the destination.
- The manifest continues to be written to the checkout where the command runs, so the worktree flow is unchanged.
- Docs describe the actual behavior, including where the manifest lands.

**Non-Goals:**

- Always writing the manifest into the primary checkout (explicitly declined; current-checkout behavior is kept).
- A `--to <path>` destination override.
- Changing `link`/`list` behavior in the primary checkout.
- Changing manifest syntax, status vocabulary, or exit codes.

## Decisions

### Opt-in flag on `resolveSource`

Add `allowSameRoot?: boolean` to `ResolveSourceOptions`. After resolving and realpath-ing both roots, the equality check becomes:

```ts
if (resolved === destinationReal && !options.allowSameRoot) {
  throw new ToolError("SOURCE_IS_DESTINATION", ...);
}
```

`runSelect` passes `allowSameRoot: true`; `link` and `list` do not.

- **Alternatives:** relax the check globally (would let `link` symlink a checkout to itself and report meaningless `list` statuses); duplicate source resolution inside `select` (two code paths to keep consistent); catch `SOURCE_IS_DESTINATION` in `select` and fall back to the destination (hides real errors and couples commands to error strings).
- **Trade-off:** one more option to pass correctly. Mitigated by a unit test that asserts the default still rejects and that only the explicit flag allows it.

### Destination stays the current checkout

Running `select` in the primary writes `.llm-files` there; running it in a worktree writes it in the worktree, as today. This was chosen explicitly over "always write to the primary" and over adding a destination flag.

- **Alternative considered:** always-primary, which matches "generate the manifest in main" literally but would surprise worktree users and require cross-checkout writes. Rejected.
- **Trade-off:** a user who runs `select` in a worktree still gets the file there. Documentation states this clearly, and merging/cherry-picking the manifest is a normal git operation.

### Spec split by capability

The permission belongs to `llm-file-manifest`, because it describes how the manifest is created. The narrowed rejection belongs to `worktree-link`, whose requirement currently says "the tool" fails when source and destination match. The delta therefore adds a requirement to `llm-file-manifest` and modifies the existing `Source checkout resolution` requirement in `worktree-link`, carrying all three of its scenarios and rewording the self-checkout scenario to name `link` and `list`.

- **Alternative:** a single ADDED requirement in `worktree-link` that carves out `select`. Rejected: the behavior change is about manifest creation, and leaving the old blanket sentence in place would contradict the new requirement.

### Documentation follows the behavior

`docs/AGENT_PROMPT.md` STEP 1 changes from "write the manifest in the primary checkout" (currently broken) to the now-valid primary-checkout flow, with a note that running `select` in a worktree writes there. README gains a short note in the install/quick-start area, `AGENTS.md` scopes the source-resolution invariant, and `docs/architecture.md` notes the exception in the flow description.

- **Trade-off:** four files for one sentence each. Justified because the current docs actively instruct a failing command.

## Risks / Trade-offs

- **The guard could accidentally be relaxed for `link`/`list`** → the flag is opt-in and both commands keep their current calls; add regression tests for `link` and `list` in the primary checkout.
- **A user expects `select` in a worktree to write the primary** → README and agent prompt state "written to the checkout you run it in".
- **Candidate discovery in a repository with no worktree** → `git worktree list` still reports the primary, so `resolveSource` returns it; the only change is skipping the equality error. No new git call is needed.
- **Untracked `.llm-files` could appear as a candidate** → it is neither tracked nor ignored, so `git ls-files --others --ignored` does not list it; existing behavior already excludes it.
- **Behavior change for scripts that relied on the failure** → unlikely; the failure made the primary unusable for `select`. The change is additive for the worktree path.

## Migration Plan

No migration. Existing worktree flows behave identically; the primary checkout gains a previously rejected path. Ship as a normal patch release after implementation.

## Open Questions

- Should `list` also be allowed in the primary checkout as a diagnostic? Deferred; it would report every entry as `linked` and adds no value today.
