import {
  archiveCommitWarning,
  assertArchiveDestination,
  planArchive,
  writeArchive,
} from "../core/archive.js";
import { getCheckoutRoot, listWorktrees } from "../core/git.js";
import type { ArchiveOptions } from "../core/types.js";
import { archiveToJson, formatArchive } from "../output.js";

export async function runArchive(options: ArchiveOptions): Promise<number> {
  const checkoutRoot = await getCheckoutRoot(process.cwd());
  const worktrees = await listWorktrees(checkoutRoot);
  const plan = await planArchive({
    checkoutRoot,
    worktrees,
    output: options.output,
    includeAll: options.includeAll,
    exclude: options.exclude,
    dryRun: options.dryRun,
    cwd: process.cwd(),
  });

  if (plan.entries.length > 0) {
    if (plan.dryRun) {
      await assertArchiveDestination(plan.archivePath, options.force === true);
    } else {
      await writeArchive(plan, { force: options.force === true });
      const warning = await archiveCommitWarning(plan);
      if (warning) {
        process.stderr.write(`${warning}\n`);
      }
    }
  }

  process.stdout.write(options.json ? archiveToJson(plan) : formatArchive(plan));
  return plan.exitCode;
}
