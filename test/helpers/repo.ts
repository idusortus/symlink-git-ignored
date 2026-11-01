import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = path.join(repoRoot, "src", "cli.ts");

export interface FixtureOptions {
  gitignore?: string;
  /** Use `null` to omit `.llm-files` entirely. */
  manifest?: string | null;
  trackedFiles?: Record<string, string>;
  ignoredFiles?: Record<string, string>;
}

export interface Fixture {
  baseDir: string;
  primary: string;
  worktree: string;
  home: string;
  env: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_GITIGNORE = [
  ".env",
  ".notes",
  ".claude/",
  ".cache/",
  "node_modules/",
  "dist/",
  "*.log",
  "",
].join("\n");

const DEFAULT_IGNORED_FILES: Record<string, string> = {
  ".env": "SECRET=1\n",
  ".notes": "local notes\n",
  ".claude/settings.local.json": '{"local":true}\n',
  ".cache/data.bin": "cache\n",
  "node_modules/pkg/index.js": "module.exports = 1;\n",
  "dist/bundle.js": "console.log(1);\n",
  "debug.log": "log\n",
};

export async function gitIn(fixture: Fixture, cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    env: fixture.env,
    encoding: "utf8",
  });
  return stdout;
}

export async function createRepoFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const baseDir = await mkdtemp(path.join(tmpdir(), "sgi-"));
  const primary = path.join(baseDir, "primary");
  const worktree = path.join(baseDir, "wt");
  const home = path.join(baseDir, "home");
  const gitConfig = path.join(home, ".gitconfig");

  await mkdir(primary, { recursive: true });
  await mkdir(home, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    NO_COLOR: "1",
  };
  await writeFile(gitConfig, "");
  await mkdir(path.join(home, ".config"), { recursive: true });

  const git = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync("git", ["-C", primary, ...args], { env, encoding: "utf8" });
    return stdout;
  };

  await git(["init", "-b", "main"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test User"]);

  await writeFile(path.join(primary, ".gitignore"), options.gitignore ?? DEFAULT_GITIGNORE);

  if (options.manifest !== null) {
    await writeFile(path.join(primary, ".llm-files"), options.manifest ?? ".env\n.claude/\n");
  }

  for (const [relativePath, contents] of Object.entries(options.trackedFiles ?? {})) {
    const absolutePath = path.join(primary, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  await git(["add", "-A"]);
  await git(["commit", "-m", "initial"]);

  for (const [relativePath, contents] of Object.entries({
    ...DEFAULT_IGNORED_FILES,
    ...(options.ignoredFiles ?? {}),
  })) {
    const absolutePath = path.join(primary, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  await git(["worktree", "add", worktree, "-b", "feature"]);

  return {
    baseDir,
    primary,
    worktree,
    home,
    env,
    cleanup: async () => {
      await rm(baseDir, { recursive: true, force: true });
    },
  };
}

export async function runCli(
  fixture: Fixture,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCli, cliEntry, ...args], {
      cwd: options.cwd ?? fixture.worktree,
      env: fixture.env,
      encoding: "utf8",
      timeout: 25_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}
