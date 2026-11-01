import type { Plan, PlanStatus } from "./core/types.js";

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
