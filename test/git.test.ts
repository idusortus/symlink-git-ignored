import { describe, expect, it } from "vitest";

import { parseWorktrees, splitNul } from "../src/core/git.js";

describe("splitNul", () => {
  it("splits NUL-delimited output and drops the empty record", () => {
    expect(splitNul("a\0b\0\0c\0")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for empty output", () => {
    expect(splitNul("")).toEqual([]);
  });
});

describe("parseWorktrees", () => {
  it("parses primary, linked, detached, and bare worktrees in order", () => {
    const output = [
      "worktree /repo/main",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/feature",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feature",
      "locked",
      "",
      "worktree /repo/detached",
      "HEAD 3333333333333333333333333333333333333333",
      "detached",
      "prunable gitdir file points to non-existent location",
      "",
      "worktree /repo/bare.git",
      "bare",
      "",
    ].join("\n");

    expect(parseWorktrees(output)).toEqual([
      {
        path: "/repo/main",
        head: "1111111111111111111111111111111111111111",
        branch: "main",
        detached: false,
        bare: false,
        locked: false,
      },
      {
        path: "/repo/feature",
        head: "2222222222222222222222222222222222222222",
        branch: "feature",
        detached: false,
        bare: false,
        locked: true,
      },
      {
        path: "/repo/detached",
        head: "3333333333333333333333333333333333333333",
        detached: true,
        bare: false,
        locked: false,
      },
      {
        path: "/repo/bare.git",
        detached: false,
        bare: true,
        locked: false,
      },
    ]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseWorktrees("")).toEqual([]);
  });
});
