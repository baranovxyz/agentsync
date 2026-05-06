import { describe, expect, it } from "vitest";
import {
  parseTomlConfig,
  tomlToInternalConfig,
} from "../../../src/config/toml-loader.js";

describe("TOML Config Loader", () => {
  describe("parseTomlConfig", () => {
    it("parses minimal TOML config", () => {
      const toml = `
tools = ["claude"]
`;
      const config = parseTomlConfig(toml);
      expect(config.tools).toEqual(["claude"]);
    });

    it("parses MCP servers", () => {
      const toml = `
[mcp_servers.github]
command = "npx"
args = ["-y", "@mcp/github"]
[mcp_servers.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
`;
      const config = parseTomlConfig(toml);
      expect(config.mcp_servers?.github?.command).toBe("npx");
      expect(config.mcp_servers?.github?.env?.GITHUB_TOKEN).toBe(
        "{GITHUB_TOKEN}",
      );
    });

    it("parses agentsync extensions", () => {
      const toml = `
[agentsync]

[[agentsync.presets]]
source = "github:company/standards"
namespace = "company"
`;
      const config = parseTomlConfig(toml);
      expect(config.agentsync?.presets?.[0]?.source).toBe(
        "github:company/standards",
      );
    });

    it("throws on invalid TOML", () => {
      expect(() => parseTomlConfig("not valid {{{{")).toThrow();
    });
  });

  describe("tomlToInternalConfig", () => {
    it("maps tools array", () => {
      const toml = parseTomlConfig(`
tools = ["claude", "cursor"]
`);
      const internal = tomlToInternalConfig(toml);
      expect(internal.tools).toContain("claude");
      expect(internal.tools).toContain("cursor");
      expect(internal.tools).not.toContain("gemini");
    });

    it("maps mcp_servers to mcp", () => {
      const toml = parseTomlConfig(`
[mcp_servers.github]
command = "npx"
args = ["-y", "@mcp/github"]
`);
      const internal = tomlToInternalConfig(toml);
      expect(internal.mcp?.github).toBeDefined();
      expect((internal.mcp?.github as { command: string }).command).toBe("npx");
    });

    it("maps agentsync.presets to extends (source strings)", () => {
      const toml = parseTomlConfig(`
[agentsync]
[[agentsync.presets]]
source = "github:org/repo"
namespace = "org"
`);
      const internal = tomlToInternalConfig(toml);
      // In v1, extends is flat string array (source only)
      expect(internal.extends?.[0]).toBe("github:org/repo");
    });

    it("maps no mcp_enabled/disabled (removed in v1)", () => {
      const toml = parseTomlConfig(`
[agentsync]
mcp_enabled = ["github", "postgres"]
mcp_disabled = ["redis"]
`);
      const internal = tomlToInternalConfig(toml);
      // v1 schema no longer has mcpEnabled/mcpDisabled
      // mcp_enabled/disabled in TOML are ignored by tomlToInternalConfig
      expect(internal).not.toHaveProperty("mcpEnabled");
      expect(internal).not.toHaveProperty("mcpDisabled");
    });
  });
});
