import type { ArchivePlan, ArchiveStatus, Plan, PlanStatus } from "./core/types.js";

const SYMBOLS: Record<PlanStatus, string> = {
  linked: "+",
  "already-linked": "=",
  "missing-source": "!",
  "not-linked": "-",
  occupied: "x",
  dangling: "~",
  repaired: "~",
  shadowed: ".",
  invalid: "!",
  unsafe: "!",
  "will-link": "+",
  "will-repair": "~",
  "will-replace": "x",
  "will-backup": ">",
};

const FAILURE_STATUSES = new Set<PlanStatus>(["missing-source", "invalid", "unsafe"]);

function supportsColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function colorize(status: PlanStatus, text: string): string {
  if (!supportsColor()) {
    return text;
  }
  if (FAILURE_STATUSES.has(status)) {
    return `\u001b[31m${text}\u001b[0m`;
  }
  if (status === "already-linked" || status === "linked" || status === "will-link") {
    return `\u001b[32m${text}\u001b[0m`;
  }
  if (status === "occupied" || status === "dangling" || status === "shadowed") {
    return `\u001b[33m${text}\u001b[0m`;
  }
  return text;
}

export function countStatuses(plan: Plan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of plan.entries) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

export function formatPlan(plan: Plan, options: { dryRun?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`source:      ${plan.sourceRoot}`);
  lines.push(`destination: ${plan.destinationRoot}`);
  if (options.dryRun) {
    lines.push("dry run:     no changes were made");
  }
  lines.push("");

  const width = plan.entries.reduce((maximum, entry) => Math.max(maximum, entry.path.length), 0);
  for (const entry of plan.entries) {
    const symbol = colorize(entry.status, SYMBOLS[entry.status]);
    const status = colorize(entry.status, entry.status);
    const suffix = entry.message ? `  ${entry.message}` : "";
    lines.push(`${symbol} ${entry.path.padEnd(width)}  ${status}${suffix}`);
  }

  const counts = countStatuses(plan);
  const total = plan.entries.length;
  const summary = Object.entries(counts)
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
  const noun = total === 1 ? "entry" : "entries";
  const failed = plan.failures > 0 ? `, ${plan.failures} failed` : "";
  lines.push("");
  lines.push(`${total} ${noun}${summary ? `: ${summary}` : ""}${failed}`);

  return `${lines.join("\n")}\n`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatArchive(plan: ArchivePlan): string {
  const lines: string[] = [];
  lines.push(`checkout: ${plan.checkoutRoot}`);
  lines.push(`archive:  ${plan.archivePath}`);
  if (plan.dryRun) {
    lines.push("dry run:  no archive was written");
  }
  lines.push("");

  for (const entry of plan.entries) {
    lines.push(`+ ${entry.path}  ${formatBytes(entry.size)}`);
  }
  for (const problem of plan.problems) {
    lines.push(`! ${problem.path}  ${problem.status}  ${problem.message}`);
  }

  if (plan.entries.length === 0 && plan.problems.length === 0) {
    lines.push("Nothing to archive.");
  } else {
    lines.push("");
    const files = plan.entries.length === 1 ? "file" : "files";
    const problemCount = plan.problems.length;
    const problems = problemCount > 0 ? `, ${problemCount} ${problemCount === 1 ? "problem" : "problems"}` : "";
    const dryRun = plan.dryRun ? " (dry run)" : "";
    lines.push(
      `${plan.entries.length} ${files} (${formatBytes(plan.totalBytes)})${problems}${dryRun}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function archiveToJson(plan: ArchivePlan): string {
  const status: ArchiveStatus = plan.dryRun ? "would-archive" : "archived";
  const payload = {
    checkout: plan.checkoutRoot,
    archive: plan.archivePath,
    dryRun: plan.dryRun,
    entries: plan.entries.map((entry) => ({
      path: entry.path,
      size: entry.size,
      status,
    })),
    problems: plan.problems.map((problem) => ({
      path: problem.path,
      status: problem.status,
      message: problem.message,
    })),
    summary: {
      total: plan.entries.length,
      bytes: plan.totalBytes,
      problems: plan.problems.length,
    },
    exitCode: plan.exitCode,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function planToJson(plan: Plan): string {
  const payload = {
    source: plan.sourceRoot,
    destination: plan.destinationRoot,
    entries: plan.entries.map((entry) => ({
      path: entry.path,
      status: entry.status,
      ...(entry.target ? { target: entry.target } : {}),
      ...(entry.message ? { message: entry.message } : {}),
    })),
    summary: {
      total: plan.entries.length,
      byStatus: countStatuses(plan),
      failures: plan.failures,
    },
    exitCode: plan.exitCode,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
