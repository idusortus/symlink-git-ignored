import { describe, expect, it } from "vitest";

import { createExcludeMatcher, DEFAULT_EXCLUDED_DIRS } from "../src/core/excludes.js";

describe("createExcludeMatcher", () => {
  it("filters default build directories at any depth", () => {
    const matcher = createExcludeMatcher();

    expect(matcher("node_modules")).toBe(true);
    expect(matcher("packages/app/node_modules")).toBe(true);
    expect(matcher("dist")).toBe(true);
    expect(matcher("apps/web/.next", true)).toBe(true);
    expect(DEFAULT_EXCLUDED_DIRS.every((name) => matcher(name, true))).toBe(true);
  });

  it("filters default binary extensions case-insensitively", () => {
    const matcher = createExcludeMatcher();

    expect(matcher("bin/tool.EXE")).toBe(true);
    expect(matcher("lib/native.so")).toBe(true);
    expect(matcher("obj/main.O")).toBe(true);
    expect(matcher("src/index.ts")).toBe(false);
  });

  it("can disable the built-in list", () => {
    const matcher = createExcludeMatcher({ useDefaults: false });

    expect(matcher("node_modules")).toBe(false);
    expect(matcher("bin/tool.exe")).toBe(false);
  });

  it("applies user patterns as segments, basename globs, and depth prefixes", () => {
    const matcher = createExcludeMatcher({ useDefaults: false, extraPatterns: ["secrets", "*.log", "*/tmp"] });

    expect(matcher("secrets")).toBe(true);
    expect(matcher("config/secrets", true)).toBe(true);
    expect(matcher("debug.log")).toBe(true);
    expect(matcher("logs/debug.log")).toBe(true);
    expect(matcher("tmp")).toBe(true);
    expect(matcher("build/tmp", true)).toBe(true);
    expect(matcher("src/index.ts")).toBe(false);
  });

  it("ignores empty and leading-dot-slash patterns", () => {
    const matcher = createExcludeMatcher({ useDefaults: false, extraPatterns: ["", "   ", "./"] });
    expect(matcher("anything")).toBe(false);
  });
});
