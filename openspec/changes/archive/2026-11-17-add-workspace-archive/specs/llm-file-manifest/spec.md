# Spec Delta

## MODIFIED Requirements

### Requirement: Build-artifact denylist

`select` SHALL exclude build artifacts and binaries using a built-in denylist that matches directory names at any depth and file extensions in the list documented in the README. The directory list SHALL include the common .NET output and Visual Studio folders `bin`, `obj`, `.vs`, and `TestResults`. `--exclude <pattern>` SHALL add patterns for the current run, and `--no-default-excludes` SHALL disable the built-in list. The denylist SHALL affect candidate discovery only; it SHALL NOT suppress or alter linking of entries already present in `.llm-files`.

#### Scenario: Denylisted directory is never offered

- **WHEN** `node_modules/` is gitignored and the user runs `select --all`
- **THEN** no `node_modules` entry is added to `.llm-files`

#### Scenario: .NET output folders are never offered

- **WHEN** `bin/`, `obj/`, `.vs/`, and `TestResults/` are gitignored at the repository root or inside a project directory and the user runs `select --all`
- **THEN** none of them is added to `.llm-files`

#### Scenario: Existing manifest entry is linked despite the denylist

- **WHEN** `.llm-files` lists `dist/` and the user runs `link`
- **THEN** the tool attempts to link `dist/` instead of silently skipping it
