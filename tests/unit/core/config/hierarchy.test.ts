/**
 * Config Hierarchy Tests
 * Tests for global + project + local config merging with deduplication
 */

import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfigHierarchy } from "../../../../src/core/config/hierarchy.js";
import { ConfigError } from "../../../../src/core/errors.js";
import { ensureDir, outputFile } from "../../../../src/utils/fs.js";

describe("loadConfigHierarchy", () => {
  let tempDir: string;
  let tempHome: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `agentsync-test-${Date.now()}`);
    tempHome = path.join(os.tmpdir(), `agentsync-home-${Date.now()}`);
    await ensureDir(tempDir);
    await ensureDir(tempHome);

    // Create .git marker so discoverConfigChain stops here
    // (prevents walk-up interference from parallel tests)
    await ensureDir(path.join(tempDir, ".git"));

    // Mock home directory
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("USERPROFILE", tempHome);
  });

  afterEach(async () => {
    // Cleanup would go here in a real test
  });

  it("throws error if project config is missing", async () => {
    await expect(loadConfigHierarchy(tempDir)).rejects.toThrow(ConfigError);
  });

  it("loads project config without global config", async () => {
    // Create project config
    const configPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(configPath));
    await outputFile(configPath, 'tools = ["cursor"]\nextends = []\n');

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.tools).toEqual(["cursor"]);
    expect(merged._sources.project).toBe(configPath);
    expect(merged._sources.global).toBeUndefined();
  });

  it("merges project over global for tools", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agents");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.toml"),
      'tools = ["claude"]\nextends = []\n',
    );

    // Create project config
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      'tools = ["cursor", "claude"]\nextends = []\n',
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.tools).toEqual(["cursor", "claude"]);
  });

  it("deduplicates extends by source string - project wins", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agents");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.toml"),
      'tools = []\nextends = ["github:company/standards"]\n',
    );

    // Create project config with same source
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      'tools = []\n\n[[agentsync.presets]]\nsource = "github:company/standards"\nnamespace = "company"\n',
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.extends).toHaveLength(1);
    expect(merged.extends![0]).toBe("github:company/standards");
    expect(merged._deduplicationLog).toHaveLength(1);
    expect(merged._deduplicationLog[0].kept).toBe("project");
  });

  it("keeps unique sources from both configs", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agents");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.toml"),
      'tools = []\nextends = ["github:personal/rules"]\n',
    );

    // Create project config with different source
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      'tools = []\n\n[[agentsync.presets]]\nsource = "github:company/standards"\nnamespace = "company"\n',
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.extends).toHaveLength(2);
    expect(merged.extends).toContain("github:personal/rules");
    expect(merged.extends).toContain("github:company/standards");
    expect(merged._deduplicationLog).toHaveLength(0);
  });

  it("deduplicates same source from both configs", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agents");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.toml"),
      'tools = []\nextends = ["github:company/standards"]\n',
    );

    // Create project config with same source
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      'tools = []\n\n[[agentsync.presets]]\nsource = "github:company/standards"\nnamespace = "company"\n',
    );

    const merged = await loadConfigHierarchy(tempDir);

    // Should deduplicate because it's the same source string
    expect(merged.extends).toHaveLength(1);
    expect(merged._deduplicationLog).toHaveLength(1);
  });

  it("merges MCP servers and applies local mcp_disabled", async () => {
    // Create project config with some servers (defined = enabled)
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      `tools = []
extends = []

[mcp_servers.github]
command = "npx"
args = ["-y", "mcp-github"]

[mcp_servers.postgres]
command = "docker"
args = ["exec", "pg"]
`,
    );

    // Create local config that adds a server and disables one
    const localPath = path.join(tempDir, "agentsync.local.toml");
    await outputFile(
      localPath,
      `mcp_disabled = ["postgres"]

[mcp.filesystem]
command = "npx"
args = ["-y", "mcp-fs"]
`,
    );

    const merged = await loadConfigHierarchy(tempDir);

    // Registry should have github + filesystem (postgres removed by mcp_disabled)
    expect(merged.mcp).toHaveProperty("github");
    expect(merged.mcp).toHaveProperty("filesystem");
    expect(merged.mcp).not.toHaveProperty("postgres");
  });

  it("records sources in merged config", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agents");
    await ensureDir(globalConfigDir);
    const globalPath = path.join(globalConfigDir, "config.toml");
    await outputFile(globalPath, "tools = []\nextends = []\n");

    // Create project config
    const projectConfigPath = path.join(tempDir, ".agents", "agentsync.toml");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(projectConfigPath, "tools = []\nextends = []\n");

    // Create local config
    const localPath = path.join(tempDir, "agentsync.local.toml");
    await outputFile(localPath, "");

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged._sources.global).toBe(globalPath);
    expect(merged._sources.project).toBe(projectConfigPath);
    expect(merged._sources.local).toBe(localPath);
  });
});
