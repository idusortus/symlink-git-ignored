export const DEFAULT_EXCLUDED_DIRS: readonly string[] = [
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "target",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
];

export const DEFAULT_EXCLUDED_EXTENSIONS: readonly string[] = [
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".o",
  ".a",
  ".node",
  ".wasm",
  ".pyc",
  ".class",
  ".jar",
];

export interface ExcludeOptions {
  useDefaults?: boolean;
  extraPatterns?: string[];
}

const DEFAULT_DIR_SET = new Set(DEFAULT_EXCLUDED_DIRS.map((name) => name.toLowerCase()));
const DEFAULT_EXTENSIONS = DEFAULT_EXCLUDED_EXTENSIONS.map((extension) => extension.toLowerCase());

function escapeRegexCharacter(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globSegment(pattern: string): RegExp {
  let source = "";
  for (const character of pattern) {
    if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegexCharacter(character);
    }
  }
  return new RegExp(`^${source}$`, "i");
}

/**
 * Build a matcher for build artifacts and other paths that should never be offered
 * as link candidates. It is intentionally only used during candidate discovery.
 */
export function createExcludeMatcher(
  options: ExcludeOptions = {},
): (entryPath: string, isDirectory?: boolean) => boolean {
  const useDefaults = options.useDefaults !== false;

  const segmentRules: RegExp[] = [];
  const pathRules: RegExp[][] = [];

  for (const rawPattern of options.extraPatterns ?? []) {
    const pattern = rawPattern.trim().replace(/^\.\//, "");
    if (!pattern) {
      continue;
    }
    const segments = pattern.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      continue;
    }
    if (segments.length === 1) {
      const only = segments[0];
      if (only) {
        segmentRules.push(globSegment(only));
      }
      continue;
    }
    const first = segments[0];
    const body = first === "*" || first === "**" ? segments.slice(1) : segments;
    if (body.length > 0) {
      pathRules.push(body.map(globSegment));
    }
  }

  return (entryPath: string, isDirectory = false): boolean => {
    const segments = entryPath.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return false;
    }

    if (useDefaults) {
      for (const segment of segments) {
        if (DEFAULT_DIR_SET.has(segment.toLowerCase())) {
          return true;
        }
      }
      if (!isDirectory) {
        const basename = segments[segments.length - 1];
        if (basename) {
          const lower = basename.toLowerCase();
          if (DEFAULT_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
            return true;
          }
        }
      }
    }

    for (const rule of segmentRules) {
      if (segments.some((segment) => rule.test(segment))) {
        return true;
      }
    }

    for (const rule of pathRules) {
      if (rule.length > segments.length) {
        continue;
      }
      const tail = segments.slice(segments.length - rule.length);
      const matches = rule.every((segmentRule, index) => {
        const segment = tail[index];
        return segment !== undefined && segmentRule.test(segment);
      });
      if (matches) {
        return true;
      }
    }

    return false;
  };
}
