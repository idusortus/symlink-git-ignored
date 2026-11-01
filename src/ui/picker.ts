import prompts from "prompts";

import { ToolError } from "../core/errors.js";
import type { IgnoredEntry } from "../core/git.js";

export async function pickCandidates(candidates: IgnoredEntry[]): Promise<string[]> {
  let cancelled = false;

  const response = await prompts(
    {
      type: "autocompleteMultiselect",
      name: "files",
      message: `Select paths to link from the source checkout (${candidates.length} available)`,
      choices: candidates.map((candidate) => ({
        title: candidate.isDirectory ? `${candidate.path}/` : candidate.path,
        value: candidate.path,
      })),
      hint: "Type to filter, space to select, enter to confirm",
      instructions: false,
    },
    {
      onCancel: () => {
        cancelled = true;
        return false;
      },
    },
  );

  if (cancelled) {
    throw new ToolError("CANCELLED", "Selection cancelled.");
  }

  const picked = (response as { files?: string[] }).files;
  return Array.isArray(picked) ? picked : [];
}

export async function confirmSelection(entryCount: number): Promise<boolean> {
  let cancelled = false;

  const response = await prompts(
    {
      type: "confirm",
      name: "confirmed",
      message: `Add ${entryCount} ${entryCount === 1 ? "entry" : "entries"} to .llm-files?`,
      initial: true,
    },
    {
      onCancel: () => {
        cancelled = true;
        return false;
      },
    },
  );

  if (cancelled) {
    throw new ToolError("CANCELLED", "Selection cancelled.");
  }

  return Boolean((response as { confirmed?: boolean }).confirmed);
}
