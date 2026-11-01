import { getCheckoutRoot, listWorktrees } from "../core/git.js";
import { requireManifest, validateManifest } from "../core/manifest.js";
import { buildPlan } from "../core/plan.js";
import { resolveSource } from "../core/source.js";
import type { ListOptions } from "../core/types.js";
import { formatPlan, planToJson } from "../output.js";

export async function runList(options: ListOptions): Promise<number> {
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
    mode: "list",
  });

  if (plan.entries.length === 0) {
    process.stdout.write(
      options.json
        ? planToJson(plan)
        : "No entries in .llm-files; nothing to list. Run \"symlink-git-ignored select\" to add some.\n",
    );
    return 0;
  }

  process.stdout.write(options.json ? planToJson(plan) : formatPlan(plan));
  return plan.exitCode;
}
