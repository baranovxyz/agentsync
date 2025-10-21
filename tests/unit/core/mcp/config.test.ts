/**
 * Project MCP Config Loader & Merger Tests
 * Loads agentsync.local.json (with fallbacks) and filters selected MCPs
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadProjectConfig,
  filterSelectedMCPs,
  type ProjectMCPConfig,
} from "../../../../src/core/mcp/config.js";
import type { MCP } from "../../../../src/core/mcp/tokens.js";
import * as fs from "../../../../src/utils/fs.js";
import * as path from "path";
import * as os from "os";

describe("loadProjectConfig", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentsync-project-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it("loads from agentsync.local.json (primary location)", async () => {
    const config = {
      mcpServers: ["github", "postgres"],
    };
    await fs.writeJson("agentsync.local.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual(["github", "postgres"]);
    expect(result.tools).toBeUndefined();
  });

  it("loads from .agentsync/config.local.json (backup location)", async () => {
    await fs.ensureDir(".agentsync");
    const config = {
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.local.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual(["github"]);
  });

  it("loads from .agentsync/config.json (team-shared fallback)", async () => {
    await fs.ensureDir(".agentsync");
    const config = {
      mcpServers: ["github"],
    };
    await fs.writeJson(".agentsync/config.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual(["github"]);
  });

  it("prefers .agentsync/config.json over other locations (team config primary)", async () => {
    await fs.ensureDir(".agentsync");
    await fs.writeJson("agentsync.local.json", { mcpServers: ["local"] });
    await fs.writeJson(".agentsync/config.local.json", {
      mcpServers: ["backup"],
    });
    await fs.writeJson(".agentsync/config.json", { mcpServers: ["team"] });

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual(["team"]);
  });

  it("loads config with tools selection", async () => {
    const config = {
      tools: ["cursor", "claude"],
      mcpServers: ["github"],
    };
    await fs.writeJson("agentsync.local.json", config);

    const result = await loadProjectConfig();

    expect(result.tools).toEqual(["cursor", "claude"]);
    expect(result.mcpServers).toEqual(["github"]);
  });

  it("loads config with overrides (object format)", async () => {
    const config = {
      mcpServers: {
        github: true,
        postgres: {
          env: {
            POSTGRES_URL: "postgresql://localhost/custom_db",
          },
        },
      },
    };
    await fs.writeJson("agentsync.local.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual(config.mcpServers);
  });

  it("throws error if no config file exists", async () => {
    await expect(loadProjectConfig()).rejects.toThrow(
      /MCP configuration not found/
    );
  });

  it("throws error if config is not valid JSON", async () => {
    await fs.writeFile("agentsync.local.json", "invalid json{");

    await expect(loadProjectConfig()).rejects.toThrow(/Failed to parse/);
  });

  it("throws error if mcpServers is missing", async () => {
    const config = {
      tools: ["cursor"],
      // Missing mcpServers
    };
    await fs.writeJson("agentsync.local.json", config);

    await expect(loadProjectConfig()).rejects.toThrow(/missing 'mcpServers'/);
  });

  it("accepts empty array as valid mcpServers", async () => {
    const config = {
      mcpServers: [],
    };
    await fs.writeJson("agentsync.local.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual([]);
  });

  it("accepts empty object as valid mcpServers", async () => {
    const config = {
      mcpServers: {},
    };
    await fs.writeJson("agentsync.local.json", config);

    const result = await loadProjectConfig();

    expect(result.mcpServers).toEqual({});
  });

  it("supports custom config path", async () => {
    const customPath = path.join(tempDir, "custom-config.json");
    const config = {
      mcpServers: ["github"],
    };
    await fs.writeJson(customPath, config);

    const result = await loadProjectConfig(customPath);

    expect(result.mcpServers).toEqual(["github"]);
  });
});

describe("filterSelectedMCPs", () => {
  const globalRegistry: Record<string, MCP> = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "{GITHUB_TOKEN}",
      },
    },
    postgres: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: {
        POSTGRES_URL: "{DATABASE_URL}",
      },
    },
    linear: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-linear"],
      env: {
        LINEAR_API_KEY: "{LINEAR_API_KEY}",
      },
    },
  };

  it("filters MCPs from array selection", () => {
    const config: ProjectMCPConfig = {
      mcpServers: ["github", "postgres"],
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.github).toBeDefined();
    expect(result.postgres).toBeDefined();
    expect(result.linear).toBeUndefined();
  });

  it("filters single MCP", () => {
    const config: ProjectMCPConfig = {
      mcpServers: ["github"],
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result.github).toBeDefined();
  });

  it("throws error if selected MCP not in global registry", () => {
    const config: ProjectMCPConfig = {
      mcpServers: ["github", "nonexistent"],
    };

    expect(() => filterSelectedMCPs(globalRegistry, config)).toThrow(
      /MCP server 'nonexistent' not found in global registry/
    );
  });

  it("applies overrides when using object format", () => {
    const config: ProjectMCPConfig = {
      mcpServers: {
        github: true, // Use global config
        postgres: {
          env: {
            POSTGRES_URL: "postgresql://localhost/custom_db",
          },
        },
      },
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(result.github.env?.GITHUB_TOKEN).toBe("{GITHUB_TOKEN}"); // From global
    expect(result.postgres.env?.POSTGRES_URL).toBe(
      "postgresql://localhost/custom_db"
    ); // Override
  });

  it("merges overrides with global config (keeps command and args)", () => {
    const config: ProjectMCPConfig = {
      mcpServers: {
        postgres: {
          env: {
            POSTGRES_URL: "custom_url",
          },
        },
      },
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(result.postgres.command).toBe("npx"); // From global
    expect(result.postgres.args).toEqual([
      "-y",
      "@modelcontextprotocol/server-postgres",
    ]); // From global
    expect(result.postgres.env?.POSTGRES_URL).toBe("custom_url"); // Override
  });

  it('handles object format with "true" value (use global as-is)', () => {
    const config: ProjectMCPConfig = {
      mcpServers: {
        github: true,
        postgres: true,
      },
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.github).toEqual(globalRegistry.github);
    expect(result.postgres).toEqual(globalRegistry.postgres);
  });

  it("lists available MCPs in error message", () => {
    const config: ProjectMCPConfig = {
      mcpServers: ["invalid"],
    };

    try {
      filterSelectedMCPs(globalRegistry, config);
      expect.fail("Should have thrown error");
    } catch (error) {
      const errorMsg = (error as Error).message;
      expect(errorMsg).toContain("Available MCPs:");
      expect(errorMsg).toContain("github");
      expect(errorMsg).toContain("postgres");
      expect(errorMsg).toContain("linear");
    }
  });

  it("returns empty object for empty array config", () => {
    const config: ProjectMCPConfig = {
      mcpServers: [],
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty object for empty object config", () => {
    const config: ProjectMCPConfig = {
      mcpServers: {},
    };

    const result = filterSelectedMCPs(globalRegistry, config);

    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});
