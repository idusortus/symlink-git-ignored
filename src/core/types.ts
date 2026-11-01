export type EntryStatus =
  | "linked"
  | "already-linked"
  | "missing-source"
  | "not-linked"
  | "occupied"
  | "dangling"
  | "repaired"
  | "shadowed"
  | "invalid"
  | "unsafe";

export type DryRunStatus = "will-link" | "will-repair" | "will-replace" | "will-backup";

export type PlanStatus = EntryStatus | DryRunStatus;

export type PlanAction = "create" | "replace" | "backup" | "none" | "skip";

export type PlanMode = "link" | "list";

export interface ManifestEntry {
  /** Path exactly as written in the manifest, minus any trailing slash. */
  raw: string;
  /** Normalized display/resolution path (no trailing slash). */
  path: string;
  isDirectory: boolean;
  /** 1-based line number in `.llm-files`, used for diagnostics. */
  line: number;
}

export interface Manifest {
  exists: boolean;
  text: string;
  entries: ManifestEntry[];
}

export interface ManifestProblem {
  line: number;
  path: string;
  status: "invalid" | "shadowed";
  message: string;
}

export interface PlanEntry {
  path: string;
  status: PlanStatus;
  action: PlanAction;
  isDirectory: boolean;
  sourcePath?: string;
  target?: string;
  message?: string;
}

export interface Plan {
  sourceRoot: string;
  destinationRoot: string;
  entries: PlanEntry[];
  failures: number;
  exitCode: number;
}

export interface BuildPlanOptions {
  entries: ManifestEntry[];
  problems: ManifestProblem[];
  sourceRoot: string;
  destinationRoot: string;
  mode: PlanMode;
  dryRun?: boolean;
  force?: boolean;
  backup?: boolean;
}

export interface LinkOptions {
  from?: string;
  json?: boolean;
  dryRun?: boolean;
  force?: boolean;
  backup?: boolean;
}

export interface ListOptions {
  from?: string;
  json?: boolean;
}

export interface SelectOptions {
  from?: string;
  all?: boolean;
  add?: string[];
  expand?: boolean;
  exclude?: string[];
  useDefaultExcludes?: boolean;
}
