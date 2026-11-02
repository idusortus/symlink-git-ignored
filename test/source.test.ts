import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorktreeInfo } from "../src/core/git.js";
import { resolveSource } from "../src/core/source.js";

let baseDir: string;
let primary: string;
let worktree: string;
let other: string;

function worktreeInfo(worktreePath: string, overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: worktreePath,
    detached: false,
    bare: false,
    locked: false,
    ...overrides,
  };
}

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), "sgi-source-"));
  primary = path.join(baseDir, "primary");
  worktree = path.join(baseDir, "worktree");
  other = path.join(baseDir, "other");
  await mkdir(primary);
  await mkdir(worktree);
  await mkdir(other);
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("resolveSource", () => {
  it("prefers --from, then the first worktree", async () => {
    const worktrees = [worktreeInfo(primary), worktreeInfo(worktree)];

    await expect(resolveSource({ destinationRoot: worktree, worktrees })).resolves.toBe(
      await realpath(primary),
    );
    await expect(resolveSource({ from: other, destinationRoot: worktree, worktrees })).resolves.toBe(
      await realpath(other),
    );
  });

  it("normalizes trailing slashes and symlinked paths", async () => {
    const link = path.join(baseDir, "primary-link");
    await symlink(primary, link);

    await expect(
      resolveSource({ from: `${link}/`, destinationRoot: worktree, worktrees: [] }),
    ).resolves.toBe(await realpath(primary));
  });

  it("accepts a --from directory that is not a registered worktree", async () => {
    await expect(
      resolveSource({
        from: other,
        destinationRoot: worktree,
        worktrees: [worktreeInfo(primary), worktreeInfo(worktree)],
      }),
    ).resolves.toBe(await realpath(other));
  });

  it("rejects a missing source", async () => {
    await expect(
      resolveSource({
        from: path.join(baseDir, "nope"),
        destinationRoot: worktree,
        worktrees: [],
      }),
    ).rejects.toMatchObject({ code: "SOURCE_MISSING" });
  });

  it("rejects the current checkout as the source", async () => {
    await expect(
      resolveSource({
        destinationRoot: worktree,
        worktrees: [worktreeInfo(worktree)],
      }),
    ).rejects.toMatchObject({ code: "SOURCE_IS_DESTINATION" });
  });

  it("allows the current checkout when allowSameRoot is set", async () => {
    await expect(
      resolveSource({
        destinationRoot: worktree,
        worktrees: [worktreeInfo(worktree)],
        allowSameRoot: true,
      }),
    ).resolves.toBe(await realpath(worktree));
  });

  it("allows --from equal to the destination only with allowSameRoot", async () => {
    await expect(
      resolveSource({
        from: worktree,
        destinationRoot: worktree,
        worktrees: [],
        allowSameRoot: true,
      }),
    ).resolves.toBe(await realpath(worktree));

    await expect(
      resolveSource({ from: worktree, destinationRoot: worktree, worktrees: [] }),
    ).rejects.toMatchObject({ code: "SOURCE_IS_DESTINATION" });
  });

  it("rejects a bare primary worktree", async () => {
    await expect(
      resolveSource({
        destinationRoot: worktree,
        worktrees: [worktreeInfo(primary, { bare: true })],
      }),
    ).rejects.toMatchObject({ code: "SOURCE_BARE" });
  });

  it("rejects an empty worktree list", async () => {
    await expect(
      resolveSource({ destinationRoot: worktree, worktrees: [] }),
    ).rejects.toMatchObject({ code: "SOURCE_MISSING" });
  });
});
