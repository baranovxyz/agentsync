import { describe, expect, it } from "vitest";
import {
  isForeignDallayConfig,
  parseProjectTomlConfig,
  parseTomlConfig,
  tomlToInternalConfig,
} from "../../../src/config/toml-loader.js";
import { ConfigError } from "../../../src/core/errors.js";

function captureConfigError(toml: string): ConfigError {
  try {
    parseTomlConfig(toml, "/project/.agents/agentsync.toml");
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("Expected parseTomlConfig to throw");
}

function parseForeign(toml: string) {
  return parseProjectTomlConfig(toml, "/project/.agents/agentsync.toml");
}

describe("TOML Config Loader", () => {
  describe("parseTomlConfig", () => {
    it("parses the current flat config", () => {
      const config = parseTomlConfig(`
tools = ["claude"]
extends = ["github:company/standards"]

[mcp.github]
command = "npx"
args = ["-y", "@mcp/github"]

[mcp.github.env]
GITHUB_TOKEN = "{GITHUB_TOKEN}"
`);

      expect(config.tools).toEqual(["claude"]);
      expect(config.extends).toEqual(["github:company/standards"]);
      expect(config.mcp?.github).toEqual({
        command: "npx",
        args: ["-y", "@mcp/github"],
        env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
      });
    });

    it("rejects object-form extends", () => {
      const error = captureConfigError(`
tools = ["claude"]
extends = [{ source = "github:company/standards", namespace = "company" }]
`);

      expect(error.message).toContain("extends.0");
      expect(error.suggestion).toContain("extends (string array)");
    });

    it("rejects current tools mixed with default_agents", () => {
      const error = captureConfigError(`
tools = []
default_agents = ["claude"]
`);

      expect(error.message).toContain('Unrecognized key: "default_agents"');
    });

    it("rejects current tools mixed with [agents.*]", () => {
      const error = captureConfigError(`
tools = ["cursor"]

[agents.claude]
enabled = true
`);

      expect(error.message).toContain('Unrecognized key: "agents"');
    });

    it("rejects unsupported tools instead of silently dropping them", () => {
      const error = captureConfigError(
        'tools = ["claude", "windsurf", "cursor"]',
      );

      expect(error.message).toContain("tools.1");
      expect(error.suggestion).toContain("current top-level tools");
    });

    it("rejects unsupported tools inside profiles", () => {
      const error = captureConfigError(`
tools = ["claude"]

[profiles.release]
tools = ["windsurf"]
`);

      expect(error.message).toContain("profiles.release.tools.0");
    });

    it("rejects skills as an unknown profile field", () => {
      const error = captureConfigError(`
tools = ["claude"]

[profiles.release]
skills = ["deploy"]
`);

      expect(error.message).toContain("profiles.release");
      expect(error.message).toContain('"skills"');
      expect(error.message).toContain("Unrecognized key");
    });

    it.each(["skills_dirs", "presets", "typo"])(
      "rejects unknown profile field %s",
      (field) => {
        const error = captureConfigError(`
tools = ["claude"]

[profiles.release]
${field} = ["unused"]
`);

        expect(error.message).toContain("profiles.release");
        expect(error.message).toContain("Unrecognized key");
      },
    );

    it.each(["toolz", "skills_dirs", "workerHints"])(
      "rejects unknown current root field %s",
      (field) => {
        const error = captureConfigError(`
tools = ["claude"]
${field} = "unused"
`);

        expect(error.message).toContain("Unrecognized key");
        expect(error.message).toContain(field);
      },
    );

    it("rejects an unknown current root table", () => {
      const error = captureConfigError(`
tools = ["claude"]

[unexpected]
enabled = true
`);

      expect(error.message).toContain("Unrecognized key");
      expect(error.message).toContain("unexpected");
    });

    it("keeps foreign MCP tables outside the current schema", () => {
      const error = captureConfigError(`
tools = ["claude"]

[mcp_servers.github]
command = "npx"
`);

      expect(error.message).toContain('Unrecognized key: "mcp_servers"');
      expect(error.suggestion).toContain("current top-level tools");
    });

    it.each([
      ["empty command", 'command = ""'],
      ["empty URL", 'url = ""'],
      ["mixed transports", 'command = "npx"\nurl = "https://mcp.example"'],
    ])("rejects an MCP server with %s", (_, server) => {
      const error = captureConfigError(`
tools = ["claude"]

[mcp.invalid]
${server}
`);

      expect(error.message).toContain("mcp.invalid");
    });

    it("discards foreign MCP control and server tables", () => {
      const parsed = parseForeign(`
default_agents = ["claude"]

[mcp]
enabled = false
merge_strategy = "replace"

[mcp_servers.github]
type = "stdio"
command = "npx"
disabled = false
`);

      expect(parsed).toEqual({ default_agents: ["claude"] });
      expect(tomlToInternalConfig(parsed).mcp).toBeUndefined();
    });

    it("keeps foreign selectors outside the strict current parser", () => {
      const error = captureConfigError('default_agents = ["claude"]');

      expect(error.message).toContain('Unrecognized key: "default_agents"');
    });

    it("throws on invalid TOML", () => {
      expect(() => parseTomlConfig("not valid {{{{")).toThrow();
    });
  });

  describe("tomlToInternalConfig", () => {
    it("maps current tools, extends, profiles, and MCP", () => {
      const internal = tomlToInternalConfig(
        parseTomlConfig(`
tools = ["claude", "cursor"]
extends = ["github:org/repo"]

[mcp.github]
command = "npx"

[profiles.ci]
tools = ["claude"]
`),
      );

      expect(internal.tools).toEqual(["claude", "cursor"]);
      expect(internal.extends).toEqual(["github:org/repo"]);
      expect(internal.mcp?.github).toEqual({ command: "npx", args: [] });
      expect(internal.profiles?.ci?.tools).toEqual(["claude"]);
      expect(internal).not.toHaveProperty("profile");
    });
  });

  describe("foreign dallay/Rust config isolation", () => {
    it("classifies foreign layouts only when tools is absent", () => {
      expect(isForeignDallayConfig({ default_agents: ["claude"] })).toBe(true);
      expect(isForeignDallayConfig({ agents: { claude: {} } })).toBe(true);
      expect(isForeignDallayConfig({})).toBe(false);
      expect(isForeignDallayConfig({ mcp_servers: {} })).toBe(false);
      expect(
        isForeignDallayConfig({
          tools: [],
          default_agents: ["claude"],
        }),
      ).toBe(false);
    });

    it("maps supported default_agents and ignores foreign MCP definitions", () => {
      const parsed = parseForeign(`
default_agents = ["claude", "copilot", "windsurf"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@mcp/github"]
`);
      const internal = tomlToInternalConfig(parsed);

      expect(isForeignDallayConfig(parsed)).toBe(true);
      expect(internal.tools).toEqual(["claude", "copilot"]);
      expect(internal.mcp).toBeUndefined();
    });

    it("falls back to enabled [agents.*] keys", () => {
      const internal = tomlToInternalConfig(
        parseForeign(`
default_agents = []

[agents.claude]
enabled = true

[agents.cursor]
enabled = false

[agents.copilot]
description = "GitHub Copilot"
`),
      );

      expect(internal.tools).toEqual(["claude", "copilot"]);
    });

    it("does not treat a foreign [mcp] table as canonical MCP", () => {
      const internal = tomlToInternalConfig(
        parseForeign(`
default_agents = ["claude"]

[mcp]
enabled = true
`),
      );

      expect(internal.mcp).toBeUndefined();
    });

    it("keeps an explicit empty tool selection when no foreign id is supported", () => {
      const internal = tomlToInternalConfig(
        parseForeign(`
source_dir = "."
compress_agents_md = false

[agents.windsurf]
enabled = true
`),
      );

      expect(internal.tools).toEqual([]);
    });
  });
});
