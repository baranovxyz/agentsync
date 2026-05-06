import { describe, expect, it } from "vitest";
import type {
  AgentConfig,
  AgentSyncTomlConfig,
  TargetConfig,
} from "../../../src/config/types.js";

describe("TOML Config Types", () => {
  it("AgentConfig has enabled and targets fields", () => {
    const config: AgentConfig = {
      enabled: true,
      description: "Claude Code",
      targets: {},
    };
    expect(config.enabled).toBe(true);
  });

  it("TargetConfig has source, destination, type", () => {
    const target: TargetConfig = {
      source: "AGENTS.md",
      destination: "CLAUDE.md",
      type: "copy",
    };
    expect(target.type).toBe("copy");
  });

  it("AgentSyncTomlConfig has base fields and extensions", () => {
    const config: AgentSyncTomlConfig = {
      source_dir: ".",
      agents: {},
      mcp_servers: {},
      mcp: { enabled: true, merge_strategy: "merge" },
      gitignore: { enabled: true },
      agentsync: {
        version: "1.0",
        mcp_enabled: ["github"],
        mcp_disabled: [],
        presets: [],
      },
    };
    expect(config.agentsync?.version).toBe("1.0");
  });
});
