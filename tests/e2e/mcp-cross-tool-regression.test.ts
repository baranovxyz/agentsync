/**
 * Cross-Tool MCP Format Regression Test
 * Verifies exact JSON/TOML/YAML output structures for all tools from same MCP input
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../src/constants.js";
import type { MCP } from "../../src/core/mcp/tokens.js";
import { syncMCP } from "../../src/sync/mcp.js";
import { getToolProvider, getToolProviders } from "../../src/tools/index.js";
import { pathExists } from "../../src/utils/fs.js";

describe("Cross-Tool MCP Regression", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-regression-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const standardMCPs: Record<string, MCP> = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "github_test_test123" },
    },
    postgres: {
      command: "docker",
      args: ["exec", "-i", "postgres-mcp"],
      env: { POSTGRES_URL: "postgresql://user:pass@localhost:5432/db" },
    },
    "remote-api": {
      url: "https://mcp.enterprise.com/v1",
      headers: {
        Authorization: "Bearer ent-token-456",
        "X-Org-ID": "org-789",
      },
    },
  };

  it("all tools produce parseable config files", async () => {
    const providers = getToolProviders([...SUPPORTED_TOOLS]);
    await syncMCP(providers, standardMCPs, tmpDir);

    for (const tool of SUPPORTED_TOOLS) {
      const provider = getToolProvider(tool);
      if (!provider.paths.mcpConfigPath) continue;

      const configPath = path.join(tmpDir, provider.paths.mcpConfigPath);
      expect(await pathExists(configPath)).toBe(true);

      const raw = await readFile(configPath, "utf-8");
      if (configPath.endsWith(".toml")) {
        expect(() => parseToml(raw)).not.toThrow();
      } else if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
        expect(() => yaml.load(raw)).not.toThrow();
      } else {
        expect(() => JSON.parse(raw)).not.toThrow();
      }
    }
  });

  describe("Claude Code → .mcp.json", () => {
    it("exact structure: { mcpServers: { ... } }", async () => {
      await getToolProvider("claude").mcpFormat!.writeMCP(standardMCPs, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
      );

      expect(content).toEqual({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "github_test_test123" },
          },
          postgres: {
            command: "docker",
            args: ["exec", "-i", "postgres-mcp"],
            env: { POSTGRES_URL: "postgresql://user:pass@localhost:5432/db" },
          },
          "remote-api": {
            url: "https://mcp.enterprise.com/v1",
            headers: {
              Authorization: "Bearer ent-token-456",
              "X-Org-ID": "org-789",
            },
          },
        },
      });
    });
  });

  describe("OpenCode → opencode.json", () => {
    it("exact structure: { mcp: { type, command[], environment } }", async () => {
      await getToolProvider("opencode").mcpFormat!.writeMCP(
        standardMCPs,
        tmpDir,
      );

      const content = JSON.parse(
        await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
      );

      expect(content.mcp.github).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-github"],
        enabled: true,
        environment: { GITHUB_TOKEN: "github_test_test123" },
      });

      expect(content.mcp.postgres).toEqual({
        type: "local",
        command: ["docker", "exec", "-i", "postgres-mcp"],
        enabled: true,
        environment: {
          POSTGRES_URL: "postgresql://user:pass@localhost:5432/db",
        },
      });

      expect(content.mcp["remote-api"]).toEqual({
        type: "remote",
        url: "https://mcp.enterprise.com/v1",
        enabled: true,
        headers: {
          Authorization: "Bearer ent-token-456",
          "X-Org-ID": "org-789",
        },
      });
    });
  });

  describe("Cursor → .cursor/mcp.json", () => {
    it("exact structure: { mcpServers: { ... } }", async () => {
      await getToolProvider("cursor").mcpFormat!.writeMCP(standardMCPs, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".cursor", "mcp.json"), "utf-8"),
      );

      expect(content.mcpServers.github.command).toBe("npx");
      expect(content.mcpServers["remote-api"].url).toBe(
        "https://mcp.enterprise.com/v1",
      );
    });
  });

  describe("RooCode → .roo/mcp.json", () => {
    it("standard mcpServers format", async () => {
      await getToolProvider("roocode").mcpFormat!.writeMCP(
        standardMCPs,
        tmpDir,
      );

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".roo", "mcp.json"), "utf-8"),
      );

      expect(Object.keys(content.mcpServers)).toHaveLength(3);
      expect(content.mcpServers.github.command).toBe("npx");
    });
  });

  describe("Codex → .codex/config.toml", () => {
    it("TOML format with mcp_servers table", async () => {
      await getToolProvider("codex").mcpFormat!.writeMCP(standardMCPs, tmpDir);

      const raw = await readFile(
        path.join(tmpDir, ".codex", "config.toml"),
        "utf-8",
      );
      const content = parseToml(raw) as Record<string, unknown>;
      const servers = content.mcp_servers as Record<
        string,
        Record<string, unknown>
      >;

      expect(servers.github.command).toBe("npx");
    });
  });

  describe("Copilot → .vscode/mcp.json (VS Code native format)", () => {
    it("uses 'servers' key (not mcpServers)", async () => {
      await getToolProvider("copilot").mcpFormat!.writeMCP(
        standardMCPs,
        tmpDir,
      );

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".vscode", "mcp.json"), "utf-8"),
      );

      expect(content.servers.github.command).toBe("npx");
      expect(content.servers["remote-api"].url).toBe(
        "https://mcp.enterprise.com/v1",
      );
    });
  });

  describe("Gemini → .gemini/settings.json", () => {
    it("mcpServers merged into settings", async () => {
      await getToolProvider("gemini").mcpFormat!.writeMCP(standardMCPs, tmpDir);

      const content = JSON.parse(
        await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
      );

      expect(content.mcpServers.github.command).toBe("npx");
      expect(content.mcpServers.postgres.command).toBe("docker");
      expect(content.mcpServers["remote-api"].url).toBe(
        "https://mcp.enterprise.com/v1",
      );
    });
  });

  describe("Idempotency", () => {
    it("running sync twice produces identical output", async () => {
      const providers = getToolProviders([...SUPPORTED_TOOLS]);

      await syncMCP(providers, standardMCPs, tmpDir);
      const firstRun: Record<string, string> = {};
      for (const tool of SUPPORTED_TOOLS) {
        const p = getToolProvider(tool);
        if (!p.paths.mcpConfigPath) continue;
        firstRun[tool] = await readFile(
          path.join(tmpDir, p.paths.mcpConfigPath),
          "utf-8",
        );
      }

      await syncMCP(providers, standardMCPs, tmpDir);
      for (const tool of SUPPORTED_TOOLS) {
        const p = getToolProvider(tool);
        if (!p.paths.mcpConfigPath) continue;
        const secondRun = await readFile(
          path.join(tmpDir, p.paths.mcpConfigPath),
          "utf-8",
        );
        expect(secondRun).toBe(firstRun[tool]);
      }
    });
  });
});
