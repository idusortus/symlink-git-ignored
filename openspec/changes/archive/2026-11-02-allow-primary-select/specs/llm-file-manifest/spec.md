# Spec Delta

## ADDED Requirements

### Requirement: Manifest creation in the primary checkout

`select` SHALL run when the current checkout is also the candidate source checkout, including a repository with no linked worktrees. In that case candidates SHALL be the ignored paths of the current checkout, and the manifest SHALL be written to the current checkout. Running `select` inside a linked worktree SHALL keep its existing behavior: candidates come from the primary checkout and the manifest is written to the worktree.

#### Scenario: Select in the primary checkout

- **WHEN** the user runs `select --add .env` in the primary checkout of a repository with no linked worktrees
- **THEN** `.llm-files` is created in that checkout containing `.env`, and the command exits successfully

#### Scenario: Select in a linked worktree still targets the worktree

- **WHEN** the user runs `select` inside a linked worktree
- **THEN** candidates come from the primary checkout and `.llm-files` is written in the worktree
