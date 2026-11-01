import { applyPlan } from "../core/apply.js";
import { ToolError } from "../core/errors.js";
import { getCheckoutRoot, listWorktrees } from "../core/git.js";
import { requireManifest, validateManifest } from "../core/manifest.js";
import { buildPlan } from "../core/plan.js";
import { resolveSource } from "../core/source.js";
import type { LinkOptions } from "../core/types.js";
import { formatPlan, planToJson } from "../output.js";

export async function runLink(options: LinkOptions): Promise<number> {
  if (options.force && options.backup) {
    throw new ToolError("USAGE", "--force and --backup cannot be used together.");
  }

  const destinationRoot = await getCheckoutRoot(process.cwd());
  const manifest = await requireManifest(destinationRoot);
  const worktrees = await listWorktrees(destinationRoot);
  const sourceRoot = await resolveSource({ from: options.from, destinationRoot, worktrees });

  const validated = validateManifest(manifest.entries, destinationRoot);
  const plan = await buildPlan({
    entries: validated.entries,
    problems: validated.problems,
    sourceRoot,
    destinationRoot,
    mode: "link",
    dryRun: options.dryRun,
    force: options.force,
    backup: options.backup,
  });

  if (plan.entries.length === 0) {
    process.stdout.write(
      options.json
        ? planToJson(plan)
        : "No entries in .llm-files; nothing to link. Run \"symlink-git-ignored select\" to add some.\n",
    );
    return 0;
  }

  if (!options.dryRun) {
    await applyPlan(plan);
  }

  process.stdout.write(options.json ? planToJson(plan) : formatPlan(plan, { dryRun: options.dryRun }));
  return plan.exitCode;
}
