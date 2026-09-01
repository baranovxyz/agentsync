import { describe, expect, it } from "vitest";
import type {
  AgentSyncTomlConfig,
  McpServerConfig,
  TomlProfileConfig,
} from "../../../src/config/types.js";

describe("TOML Config Types", () => {
  it("represents only current AgentSync keys", () => {
    const profile: TomlProfileConfig = {
      tools: ["claude"],
      mcp: ["github"],
      extends: ["github:org/standards"],
    };
    const mcp: McpServerConfig = {
      command: "npx",
      args: ["-y", "@org/server"],
    };
    const config: AgentSyncTomlConfig = {
      tools: ["claude"],
      extends: ["github:org/standards"],
      mcp: { github: mcp },
      profiles: { ci: profile },
    };

    expect(config).toEqual({
      tools: ["claude"],
      extends: ["github:org/standards"],
      mcp: { github: mcp },
      profiles: { ci: profile },
    });
  });

  it("represents only the isolated dallay/Rust tool selectors", () => {
    const config: AgentSyncTomlConfig = {
      default_agents: ["claude"],
      agents: {
        claude: { enabled: true },
        cursor: { enabled: false },
      },
    };

    expect(config.default_agents).toEqual(["claude"]);
    expect(config.agents?.cursor?.enabled).toBe(false);
  });
});
