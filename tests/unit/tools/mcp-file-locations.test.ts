/**
 * MCP File Locations Test
 * Verifies MCP files use the expected path and parent directories are created.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import type { MCP } from "../../../src/core/mcp/tokens.js";
import { syncManagedMCP } from "../../../src/sync/mcp.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";

const testProcessHome = process.env.HOME;

describe("MCP File Locations", () => {
  let tmpDir: string;
  let tmpHomeDir: string;

  const testMcps: Record<string, MCP> = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token" },
    },
  };

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-mcp-locations-"));
    tmpHomeDir = path.join(tmpDir, "home");
    vi.stubEnv("HOME", tmpHomeDir);
    vi.stubEnv("USERPROFILE", tmpHomeDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("runs AgentSync tests with a disposable process home", () => {
    expect(path.basename(testProcessHome ?? "")).toMatch(
      /^agentsync-vitest-home-/,
    );
  });

  it("writes Claude MCP to .mcp.json", async () => {
    const provider = getToolProvider("claude");
    expect(provider.paths.mcpConfigPath).toBe(".mcp.json");

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes OpenCode MCP to opencode.json under 'mcp' key", async () => {
    const provider = getToolProvider("opencode");
    expect(provider.paths.mcpConfigPath).toBe("opencode.json");

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, "opencode.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcp).toBeDefined();
    expect(content.mcp.github).toBeDefined();
  });

  it("writes Cursor MCP to .cursor/mcp.json and creates .cursor/ dir", async () => {
    const provider = getToolProvider("cursor");
    expect(provider.paths.mcpConfigPath).toBe(".cursor/mcp.json");

    // .cursor/ should not exist yet
    expect(await pathExists(path.join(tmpDir, ".cursor"))).toBe(false);

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".cursor", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes RooCode MCP to .roo/mcp.json and creates .roo/ dir", async () => {
    const provider = getToolProvider("roocode");
    expect(provider.paths.mcpConfigPath).toBe(".roo/mcp.json");

    expect(await pathExists(path.join(tmpDir, ".roo"))).toBe(false);

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".roo", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes Codex MCP only to the project config by default", async () => {
    const provider = getToolProvider("codex");
    expect(provider.paths.mcpConfigPath).toBe(".codex/config.toml");

    expect(await pathExists(path.join(tmpDir, ".codex"))).toBe(false);

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".codex", "config.toml");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = parseToml(await readFile(mcpPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const servers = content.mcp_servers as Record<string, unknown>;
    expect(servers.github).toBeDefined();
    expect(
      await pathExists(path.join(tmpHomeDir, ".codex", "config.toml")),
    ).toBe(false);
  });

  it("merges Codex MCP into the disposable home when explicitly enabled", async () => {
    vi.stubEnv("AGENTSYNC_CODEX_HOME_MCP", "1");
    const provider = getToolProvider("codex");
    const homeConfigPath = path.join(tmpHomeDir, ".codex", "config.toml");
    await outputFile(
      homeConfigPath,
      'model = "existing-model"\n\n[mcp_servers.existing]\ncommand = "existing-command"\nargs = []\n',
    );

    await syncManagedMCP([provider], testMcps, tmpDir);

    const homeConfig = parseToml(
      await readFile(homeConfigPath, "utf-8"),
    ) as Record<string, unknown>;
    expect(homeConfig.model).toBe("existing-model");
    const homeServers = homeConfig.mcp_servers as Record<string, unknown>;
    expect(homeServers.existing).toBeDefined();
    expect(homeServers.github).toBeDefined();

    const projectConfig = parseToml(
      await readFile(path.join(tmpDir, ".codex", "config.toml"), "utf-8"),
    ) as Record<string, unknown>;
    const projectServers = projectConfig.mcp_servers as Record<string, unknown>;
    expect(projectServers.github).toBeDefined();
  });

  it("writes Copilot MCP to .vscode/mcp.json and creates .vscode/ dir", async () => {
    const provider = getToolProvider("copilot");
    expect(provider.paths.mcpConfigPath).toBe(".vscode/mcp.json");

    expect(await pathExists(path.join(tmpDir, ".vscode"))).toBe(false);

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".vscode", "mcp.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    // VS Code native format uses "servers" key
    expect(content.servers.github).toBeDefined();
  });

  it("writes Gemini MCP to .gemini/settings.json and creates .gemini/ dir", async () => {
    const provider = getToolProvider("gemini");
    expect(provider.paths.mcpConfigPath).toBe(".gemini/settings.json");

    expect(await pathExists(path.join(tmpDir, ".gemini"))).toBe(false);

    await syncManagedMCP([provider], testMcps, tmpDir);

    const mcpPath = path.join(tmpDir, ".gemini", "settings.json");
    expect(await pathExists(mcpPath)).toBe(true);

    const content = JSON.parse(await readFile(mcpPath, "utf-8"));
    expect(content.mcpServers.github).toBeDefined();
  });

  it("writes MCP to every MCP-capable tool in one call", async () => {
    const expectedPaths = [
      ".mcp.json",
      "opencode.json",
      ".cursor/mcp.json",
      ".roo/mcp.json",
      ".codex/config.toml",
      ".vscode/mcp.json",
      ".gemini/settings.json",
      ".amp/settings.json",
      ".goose/config.yaml",
      ".amazonq/mcp.json",
      ".augment/settings.json",
      ".kiro/settings/mcp.json",
      ".openhands/mcp.json",
      ".junie/mcp/mcp.json",
      "crush.json",
      ".kilocode/mcp.json",
      ".qwen/.mcp.json",
      ".factory/mcp.json",
      ".vibe/config.toml",
    ];
    const providers = SUPPORTED_TOOLS.map(getToolProvider).filter(
      (provider) => provider.mcpFormat && provider.paths.mcpConfigPath,
    );
    expect(
      providers.map((provider) => provider.paths.mcpConfigPath).sort(),
    ).toEqual([...expectedPaths].sort());

    const results = await syncManagedMCP(providers, testMcps, tmpDir);
    expect(results.results).toHaveLength(expectedPaths.length);
    for (const result of results.results) {
      expect(result.serverCount).toBe(1);
      expect(result.servers).toContain("github");
    }

    for (const expected of expectedPaths) {
      expect(
        await pathExists(path.join(tmpDir, expected)),
        `${expected} should exist`,
      ).toBe(true);
    }
  });

  it("writes multiple MCP servers to each tool", async () => {
    const multiMcps: Record<string, MCP> = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "token1" },
      },
      postgres: {
        command: "docker",
        args: ["exec", "postgres-mcp"],
        env: { POSTGRES_URL: "postgres://localhost" },
      },
    };

    const provider = getToolProvider("claude");
    await syncManagedMCP([provider], multiMcps, tmpDir);

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(Object.keys(content.mcpServers)).toHaveLength(2);
    expect(content.mcpServers.github).toBeDefined();
    expect(content.mcpServers.postgres).toBeDefined();
  });

  it("stamps Droid's type discriminator on both transports", async () => {
    const provider = getToolProvider("droid");
    expect(provider.paths.mcpConfigPath).toBe(".factory/mcp.json");

    // Droid writes this file itself, keeping permission and OAuth state in it.
    await outputFile(
      path.join(tmpDir, ".factory", "mcp.json"),
      JSON.stringify({ persistentPermissions: { tracker: "always" } }),
    );

    await syncManagedMCP(
      [provider],
      {
        ...testMcps,
        linear: { url: "https://mcp.linear.app/mcp", headers: { A: "b" } },
      },
      tmpDir,
    );

    const content = JSON.parse(
      await readFile(path.join(tmpDir, ".factory", "mcp.json"), "utf-8"),
    );
    // Droid parses entries as a discriminated union on `type`; a URL server
    // written without it fails Droid's schema outright.
    expect(content.mcpServers.github.type).toBe("stdio");
    expect(content.mcpServers.github.command).toBe("npx");
    expect(content.mcpServers.linear.type).toBe("http");
    expect(content.mcpServers.linear.url).toBe("https://mcp.linear.app/mcp");
    expect(content.mcpServers.linear.headers).toEqual({ A: "b" });
    // Droid-owned state in the same file survives the sync.
    expect(content.persistentPermissions).toEqual({ tracker: "always" });
  });

  it("writes Vibe MCP as an array of tables and preserves other config", async () => {
    const provider = getToolProvider("vibe");
    expect(provider.paths.mcpConfigPath).toBe(".vibe/config.toml");

    // .vibe/config.toml is human-authored — models, theme and permissions live
    // alongside the MCP servers, so the writer must merge rather than replace.
    const configPath = path.join(tmpDir, ".vibe", "config.toml");
    await outputFile(configPath, 'theme = "dark"\nactive_model = "medium"\n');

    await syncManagedMCP([provider], testMcps, tmpDir);

    const config = parseToml(await readFile(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(config.theme).toBe("dark");
    expect(config.active_model).toBe("medium");

    const servers = config.mcp_servers as Array<Record<string, unknown>>;
    expect(Array.isArray(servers)).toBe(true);
    expect(servers).toHaveLength(1);
    // The server name is a FIELD in Vibe, not the key it is stored under.
    expect(servers[0].name).toBe("github");
    expect(servers[0].transport).toBe("stdio");
    expect(servers[0].command).toBe("npx");
  });
});
