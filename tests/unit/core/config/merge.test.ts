import { describe, expect, it } from "vitest";
import { mergeConfigChain } from "../../../../src/core/config/merge.js";
import type { AgentSyncConfig } from "../../../../src/types/schemas.js";

describe("mergeConfigChain", () => {
  const makeConfig = (
    overrides: Partial<AgentSyncConfig>,
  ): AgentSyncConfig => ({
    ...overrides,
  });

  it("returns base config when chain has one entry", () => {
    const base = makeConfig({ tools: ["cursor", "claude"] });
    const result = mergeConfigChain([base]);
    expect(result.tools).toEqual(["cursor", "claude"]);
  });

  it("most-specific tools win", () => {
    const org = makeConfig({ tools: ["cursor", "claude", "cline"] });
    const team = makeConfig({ tools: ["cursor", "claude"] });
    const result = mergeConfigChain([team, org]);
    expect(result.tools).toEqual(["cursor", "claude"]);
  });

  it("MCP servers merge per-key, specific wins", () => {
    const org = makeConfig({
      mcp: {
        github: { command: "npx", args: ["gh-mcp"] },
        filesystem: { command: "npx", args: ["fs-mcp"] },
      },
    });
    const team = makeConfig({
      mcp: {
        github: { command: "npx", args: ["gh-mcp-v2"] },
        postgres: { command: "docker", args: ["pg-mcp"] },
      },
    });
    const result = mergeConfigChain([team, org]);
    const github = result.mcp?.github;
    const filesystem = result.mcp?.filesystem;
    const postgres = result.mcp?.postgres;
    expect("args" in github! ? github.args : undefined).toEqual(["gh-mcp-v2"]);
    expect("args" in filesystem! ? filesystem.args : undefined).toEqual([
      "fs-mcp",
    ]);
    expect("args" in postgres! ? postgres.args : undefined).toEqual(["pg-mcp"]);
  });

  it("extends accumulate across levels", () => {
    const org = makeConfig({
      extends: ["github:company/base"],
    });
    const team = makeConfig({
      extends: ["github:company/frontend"],
    });
    const result = mergeConfigChain([team, org]);
    expect(result.extends).toHaveLength(2);
  });

  it("handles empty chain", () => {
    const result = mergeConfigChain([]);
    expect(result).toEqual({});
  });
});
