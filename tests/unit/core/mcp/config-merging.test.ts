import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectConfig } from "../../../../src/core/mcp/config.js";

describe("MCP Config Merging (Option A: Local Replaces Project)", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), `.test-mcp-config-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (testDir && (await fs.stat(testDir).catch(() => null))) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it("loads project config only when local config does not exist", async () => {
    // Setup: Create project config
    const projectConfigPath = path.join(testDir, ".agentsync", "config.json");
    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(
      projectConfigPath,
      JSON.stringify({
        mcpServers: ["github", "postgres"],
      }),
    );

    // Change to test directory
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const config = await loadProjectConfig();
      expect(config.mcpServers).toEqual(["github", "postgres"]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses local config when it specifies mcpServers", async () => {
    // Setup: Create project and local configs
    const projectConfigPath = path.join(testDir, ".agentsync", "config.json");
    const localConfigPath = path.join(testDir, "agentsync.local.json");

    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(
      projectConfigPath,
      JSON.stringify({
        mcpServers: ["github", "postgres"],
      }),
    );
    await fs.writeFile(
      localConfigPath,
      JSON.stringify({
        mcpServers: ["filesystem"],
      }),
    );

    // Change to test directory
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const config = await loadProjectConfig();
      // Local completely replaces project (Option A)
      expect(config.mcpServers).toEqual(["filesystem"]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses project config when local config does not specify mcpServers", async () => {
    // Setup: Create project config and local config without mcpServers
    const projectConfigPath = path.join(testDir, ".agentsync", "config.json");
    const localConfigPath = path.join(testDir, "agentsync.local.json");

    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(
      projectConfigPath,
      JSON.stringify({
        mcpServers: ["github", "postgres"],
      }),
    );
    await fs.writeFile(
      localConfigPath,
      JSON.stringify({
        // No mcpServers field
        tools: ["cursor"],
      }),
    );

    // Change to test directory
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const config = await loadProjectConfig();
      // Local doesn't have mcpServers, so project config is used
      expect(config.mcpServers).toEqual(["github", "postgres"]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("allows empty local array to disable all MCPs", async () => {
    // Setup: Create project config with MCPs and local config with empty array
    const projectConfigPath = path.join(testDir, ".agentsync", "config.json");
    const localConfigPath = path.join(testDir, "agentsync.local.json");

    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(
      projectConfigPath,
      JSON.stringify({
        mcpServers: ["github", "postgres"],
      }),
    );
    await fs.writeFile(
      localConfigPath,
      JSON.stringify({
        mcpServers: [],
      }),
    );

    // Change to test directory
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const config = await loadProjectConfig();
      // Local empty array disables all MCPs
      expect(config.mcpServers).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws error when no config files exist", async () => {
    // Change to test directory
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      await expect(loadProjectConfig()).rejects.toThrow(
        /MCP configuration not found/,
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
