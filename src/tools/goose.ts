/**
 * Goose Tool Provider (Block)
 *
 * Goose reads .agents/skills/ natively (shared cross-tool directory).
 * MCP is configured via YAML at .goose/config.yaml under "extensions" key.
 * Field mapping: command→cmd, args→args, env→envs, url→uri.
 * Type field: "stdio" for command-based, "sse" for URL-based.
 * Merges into existing config.yaml to preserve non-MCP settings.
 *
 * Ref: https://block.github.io/goose/docs/
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "js-yaml";
import type { MCP } from "../core/mcp/tokens.js";
import { outputFile, pathExists } from "../utils/fs.js";
import type { ToolProvider } from "./types.js";

/**
 * Convert standard MCP format to Goose's extensions format
 */
function toGooseExtensions(mcps: Record<string, MCP>): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};

  for (const [name, mcp] of Object.entries(mcps)) {
    if ("command" in mcp) {
      const ext: Record<string, unknown> = {
        type: "stdio",
        cmd: mcp.command,
        args: mcp.args,
      };
      if (mcp.env && Object.keys(mcp.env).length > 0) {
        ext.envs = mcp.env;
      }
      extensions[name] = ext;
    } else {
      // URL-based (SSE)
      const ext: Record<string, unknown> = {
        type: "sse",
        uri: mcp.url,
      };
      if (mcp.headers && Object.keys(mcp.headers).length > 0) {
        ext.headers = mcp.headers;
      }
      extensions[name] = ext;
    }
  }

  return extensions;
}

export const gooseProvider: ToolProvider = {
  name: "goose",
  displayName: "Goose",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: null,
    agentsDir: null,
    mcpConfigPath: ".goose/config.yaml",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: false,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
  },
  readsAgentsDir: true,
  agentFileExtension: ".md",
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      const configFile = path.join(cwd, ".goose", "config.yaml");

      // Merge into existing config.yaml to preserve non-MCP settings
      let existing: Record<string, unknown> = {};
      if (await pathExists(configFile)) {
        try {
          const content = await readFile(configFile, "utf-8");
          const parsed = yaml.load(content);
          if (parsed && typeof parsed === "object") {
            existing = parsed as Record<string, unknown>;
          }
        } catch {
          // Start fresh if parse fails
        }
      }

      existing.extensions = toGooseExtensions(mcps);
      await outputFile(configFile, yaml.dump(existing), {
        encoding: "utf-8",
      });
    },
  },
  docsFormat: null,
};
