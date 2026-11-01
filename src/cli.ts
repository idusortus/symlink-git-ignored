#!/usr/bin/env node
import { Command } from "commander";

import { runLink } from "./commands/link.js";
import { runList } from "./commands/list.js";
import { runSelect } from "./commands/select.js";
import { exitCodeFor, formatError } from "./core/errors.js";
import { VERSION } from "./version.js";

interface LinkCliOptions {
  from?: string;
  json?: boolean;
  dryRun?: boolean;
  force?: boolean;
  backup?: boolean;
}

interface ListCliOptions {
  from?: string;
  json?: boolean;
}

interface SelectCliOptions {
  from?: string;
  all?: boolean;
  add?: string[];
  expand?: boolean;
  exclude?: string[];
  defaultExcludes?: boolean;
}

async function execute(task: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await task();
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = exitCodeFor(error);
  }
}

function addLinkOptions(command: Command): void {
  command
    .option("--from <path>", "source checkout to link from (default: primary git worktree)")
    .option("--dry-run", "print the plan without creating or moving anything")
    .option("--force", "replace existing destinations")
    .option("--backup", "move existing destinations aside before linking")
    .option("--json", "print machine-readable JSON");
}

const program = new Command();

program
  .name("symlink-git-ignored")
  .description(
    "Create symlinks in a git worktree to the gitignored paths listed in .llm-files.",
  )
  .version(VERSION)
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  $ npx symlink-git-ignored                 link every path listed in .llm-files
  $ npx symlink-git-ignored --dry-run       show what would be linked
  $ npx symlink-git-ignored select          pick gitignored files to add
  $ npx symlink-git-ignored select --all    add every gitignored candidate
  $ npx symlink-git-ignored list --json     report link status as JSON
`,
  );

const linkCommand = program
  .command("link", { isDefault: true })
  .description("Create symlinks from .llm-files (the default command)");
addLinkOptions(linkCommand);
linkCommand.action(() => {
  const options = linkCommand.opts<LinkCliOptions>();
  return execute(() =>
    runLink({
      from: options.from,
      json: options.json,
      dryRun: options.dryRun,
      force: options.force,
      backup: options.backup,
    }),
  );
});

const selectCommand = program
  .command("select")
  .description("Add gitignored paths from the source checkout to .llm-files")
  .option("--from <path>", "source checkout to read gitignored files from")
  .option("--all", "add every candidate without prompting")
  .option("--add <paths...>", "add specific paths without prompting")
  .option("--expand", "list files inside wholly ignored directories (may be slow)")
  .option("--exclude <pattern...>", "extra patterns to keep out of the candidate list")
  .option("--no-default-excludes", "disable the built-in build-artifact denylist");
selectCommand.action(() => {
  const options = selectCommand.opts<SelectCliOptions>();
  return execute(() =>
    runSelect({
      from: options.from,
      all: options.all,
      add: options.add,
      expand: options.expand,
      exclude: options.exclude,
      useDefaultExcludes: options.defaultExcludes !== false,
    }),
  );
});

const listCommand = program
  .command("list")
  .description("Report the status of every path in .llm-files")
  .option("--from <path>", "source checkout to check against")
  .option("--json", "print machine-readable JSON");
listCommand.action(() => {
  const options = listCommand.opts<ListCliOptions>();
  return execute(() =>
    runList({
      from: options.from,
      json: options.json,
    }),
  );
});

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
