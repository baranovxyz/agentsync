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

    // Mock home directory
    vi.stubEnv("HOME", tempHome);
  });

  afterEach(async () => {
    // Cleanup would go here in a real test
  });

  it("throws error if project config is missing", async () => {
    await expect(loadConfigHierarchy(tempDir)).rejects.toThrow(ConfigError);
  });

  it("loads project config without global config", async () => {
    // Create project config
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(configPath));
    await outputFile(
      configPath,
      JSON.stringify({
        version: "1.0",
        tools: ["cursor"],
        extends: [],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.version).toBe("1.0");
    expect(merged.tools).toEqual(["cursor"]);
    expect(merged._sources.project).toBe(configPath);
    expect(merged._sources.global).toBeUndefined();
  });

  it("merges project over global for tools", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agentsync");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.json"),
      JSON.stringify({
        version: "1.0",
        tools: ["claude"],
        extends: [],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create project config
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: ["cursor", "cline"],
        extends: [],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.tools).toEqual(["cursor", "cline"]);
  });

  it("deduplicates extends by source URL - project wins", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agentsync");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.json"),
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:company/standards",
            namespace: "company-global",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create project config with same source
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.extends).toHaveLength(1);
    const ext = merged.extends![0] as { source: string; namespace: string };
    expect(ext.source).toBe("github:company/standards");
    expect(ext.namespace).toBe("company"); // project namespace
    expect(merged._deduplicationLog).toHaveLength(1);
    expect(merged._deduplicationLog[0].kept).toBe("project");
  });

  it("keeps unique sources from both configs", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agentsync");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.json"),
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:personal/rules",
            namespace: "personal",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create project config with different source
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged.extends).toHaveLength(2);
    const sources = (merged.extends as Array<{ source: string }>).map(
      (e) => e.source,
    );
    expect(sources).toContain("github:personal/rules");
    expect(sources).toContain("github:company/standards");
    expect(merged._deduplicationLog).toHaveLength(0);
  });

  it("allows same source with different namespaces", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agentsync");
    await ensureDir(globalConfigDir);
    await outputFile(
      path.join(globalConfigDir, "config.json"),
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:company/standards",
            namespace: "company-global",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create project config with same source but different namespace
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [
          {
            source: "github:company/standards",
            namespace: "company",
          },
        ],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    // Should still deduplicate because it's the same source
    expect(merged.extends).toHaveLength(1);
    expect(merged._deduplicationLog).toHaveLength(1);
  });

  it("merges MCP servers registry and include/exclude", async () => {
    // Create project config with some servers
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [],
        mcpServers: {
          github: { command: "npx", args: ["-y", "mcp-github"], env: {} },
          postgres: { command: "docker", args: ["exec", "pg"], env: {} },
        },
        mcpInclude: ["github", "postgres"],
        useSymlinks: true,
      }),
    );

    // Create local config that adds a server and excludes one
    const localPath = path.join(tempDir, "agentsync.local.json");
    await outputFile(
      localPath,
      JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "mcp-fs"], env: {} },
        },
        mcpExclude: ["postgres"],
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    // Registry should have all 3 servers
    expect(Object.keys(merged.mcpServers || {})).toHaveLength(3);
    expect(merged.mcpServers).toHaveProperty("github");
    expect(merged.mcpServers).toHaveProperty("postgres");
    expect(merged.mcpServers).toHaveProperty("filesystem");

    // Include should have project's list
    expect(merged.mcpInclude).toEqual(["github", "postgres"]);

    // Exclude should have local's list
    expect(merged.mcpExclude).toEqual(["postgres"]);
  });

  it("records sources in merged config", async () => {
    // Create global config
    const globalConfigDir = path.join(tempHome, ".agentsync");
    await ensureDir(globalConfigDir);
    const globalPath = path.join(globalConfigDir, "config.json");
    await outputFile(
      globalPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create project config
    const projectConfigPath = path.join(tempDir, ".agentsync", "config.json");
    await ensureDir(path.dirname(projectConfigPath));
    await outputFile(
      projectConfigPath,
      JSON.stringify({
        version: "1.0",
        tools: [],
        extends: [],
        mcpServers: {},
        useSymlinks: true,
      }),
    );

    // Create local config
    const localPath = path.join(tempDir, "agentsync.local.json");
    await outputFile(
      localPath,
      JSON.stringify({
        mcpServers: {},
      }),
    );

    const merged = await loadConfigHierarchy(tempDir);

    expect(merged._sources.global).toBe(globalPath);
    expect(merged._sources.project).toBe(projectConfigPath);
    expect(merged._sources.local).toBe(localPath);
  });
});
