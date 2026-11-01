import { lstat, mkdir, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";

import { findContainmentViolation } from "./plan.js";
import type { Plan } from "./types.js";

function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export async function chooseBackupPath(destinationPath: string): Promise<string> {
  const base = `${destinationPath}.bak-${timestamp()}`;
  let candidate = base;
  let counter = 1;

  for (;;) {
    try {
      await lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate;
      }
      throw error;
    }
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

/** Apply the non-skip actions of a plan, recording failures without aborting the run. */
export async function applyPlan(plan: Plan): Promise<Plan> {
  for (const entry of plan.entries) {
    if (entry.action === "none" || entry.action === "skip") {
      continue;
    }

    const destinationPath = path.join(plan.destinationRoot, entry.path.replace(/\/+$/, ""));

    try {
      const violation = await findContainmentViolation(destinationPath, plan.destinationRoot);
      if (violation) {
        entry.status = "unsafe";
        entry.action = "skip";
        entry.message = `Refusing to write through ${violation}, which resolves outside the checkout.`;
        plan.failures += 1;
        continue;
      }

      if (!entry.target) {
        throw new Error("internal error: link target was not computed");
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });

      if (entry.action === "backup") {
        const backupPath = await chooseBackupPath(destinationPath);
        await rename(destinationPath, backupPath);
        entry.message = `existing path moved to ${path.basename(backupPath)}`;
      } else if (entry.action === "replace") {
        await rm(destinationPath, { recursive: true, force: true });
      }

      await symlink(entry.target, destinationPath, entry.isDirectory ? "dir" : "file");
    } catch (error) {
      plan.failures += 1;
      entry.message = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  plan.exitCode = plan.failures > 0 ? 1 : 0;
  return plan;
}
