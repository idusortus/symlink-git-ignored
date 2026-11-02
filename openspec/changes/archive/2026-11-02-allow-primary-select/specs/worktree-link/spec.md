# Spec Delta

## MODIFIED Requirements

### Requirement: Source checkout resolution

The source root SHALL be, in order of precedence: the path passed with `--from`, then the first worktree reported by `git worktree list --porcelain`. A bare repository SHALL be rejected as a source. `link` and `list` SHALL fail with a clear message when the resolved source is not a directory, is the same checkout as the destination, or when only one worktree exists and it is the current one. `select` SHALL accept the current checkout as its candidate source and write the manifest there; see the `llm-file-manifest` capability.

#### Scenario: Primary worktree is chosen by default

- **WHEN** the repository has a primary checkout and one linked worktree, and `link` runs in the linked worktree
- **THEN** the source is the primary checkout

#### Scenario: Source override

- **WHEN** the user passes `--from /path/to/other-checkout`
- **THEN** every source path is resolved under `/path/to/other-checkout` regardless of `git worktree list`

#### Scenario: Running in the source checkout

- **WHEN** `link` or `list` runs with the current checkout equal to the resolved source root
- **THEN** the command refuses to run, exits non-zero, and creates nothing
