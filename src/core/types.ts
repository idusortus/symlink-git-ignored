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

export type ArchiveStatus = "archived" | "would-archive";

export type ArchiveProblemStatus = "missing-source" | "unsafe" | "cyclic" | "unsupported";

export interface ArchiveEntry {
  /** POSIX path relative to the checkout root. */
  path: string;
  /** Absolute path to read when writing the archive. */
  sourcePath: string;
  size: number;
  mtime: Date;
  /** POSIX file mode, including the file type bits. */
  mode: number;
}

export interface ArchiveProblem {
  path: string;
  status: ArchiveProblemStatus;
  message: string;
}

export interface ArchivePlan {
  checkoutRoot: string;
  archivePath: string;
  dryRun: boolean;
  entries: ArchiveEntry[];
  problems: ArchiveProblem[];
  totalBytes: number;
  exitCode: number;
}

export interface ArchiveOptions {
  output?: string;
  force?: boolean;
  dryRun?: boolean;
  includeAll?: boolean;
  exclude?: string[];
  json?: boolean;
}
