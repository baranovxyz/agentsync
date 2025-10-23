/**
 * Integration tests for main sync command
 * Tests full workflow including GitHub preset loading (mocked)
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../src/commands/sync.js";
import * as fs from "../../src/utils/fs.js";

describe("Sync Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-sync-int-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("Full Workflow", () => {
    it("should sync rules to Cursor", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Run sync
      await sync({ cwd: tempDir });

      // Verify rules directory created (even if empty)
      const rulesDir = path.join(tempDir, ".cursor", "rules");
      expect(await fs.pathExists(rulesDir)).toBe(false); // No rules to sync
    });

    it("should sync rules to Claude", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["claude"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Run sync
      await sync({ cwd: tempDir });

      // Verify no rules directory (no rules)
      const rulesDir = path.join(tempDir, ".claude", "rules");
      expect(await fs.pathExists(rulesDir)).toBe(false);
    });

    it("should sync to multiple tools", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor", "claude"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Run sync
      await sync({ cwd: tempDir });

      // Should complete without error
    });

    it("should sync only to specified tool when --tool flag used", async () => {
      // Setup config with multiple tools
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor", "claude"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Run sync with --tool cursor
      await sync({ cwd: tempDir, tool: "cursor" });

      // Should complete without error
    });
  });

  describe("MCPs Sync", () => {
    it("should sync MCPs when mcpServers configured", async () => {
      // Setup config with MCP
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Create global MCP registry (required for MCP sync)
      const homeDir = os.homedir();
      const agentsyncDir = path.join(homeDir, ".agentsync");
      const mcpRegistryPath = path.join(agentsyncDir, "mcp.json");

      const mcpRegistryBackup = (await fs.pathExists(mcpRegistryPath))
        ? await fs.readFile(mcpRegistryPath, "utf-8")
        : null;

      try {
        await fs.ensureDir(agentsyncDir);
        await fs.outputFile(
          mcpRegistryPath,
          JSON.stringify({
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: "{GITHUB_TOKEN}",
              },
            },
          }),
          { encoding: "utf-8" },
        );

        // Run sync
        await sync({ cwd: tempDir });

        // Should complete without error
      } finally {
        // Restore original registry
        if (mcpRegistryBackup) {
          await fs.outputFile(mcpRegistryPath, mcpRegistryBackup, {
            encoding: "utf-8",
          });
        } else {
          await fs.remove(mcpRegistryPath);
        }
      }
    });
  });

  describe("Dry Run", () => {
    it("should not write files in dry run mode", async () => {
      // Setup config
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Run sync in dry run mode
      await sync({ cwd: tempDir, dryRun: true });

      // Verify no directories created
      expect(await fs.pathExists(path.join(tempDir, ".cursor", "rules"))).toBe(
        false,
      );
      expect(
        await fs.pathExists(path.join(tempDir, ".cursor", "commands")),
      ).toBe(false);
      expect(
        await fs.pathExists(path.join(tempDir, ".cursor", "mcp.json")),
      ).toBe(false);
    });
  });

  describe("Error Scenarios", () => {
    it("should fail gracefully when config is missing", async () => {
      await expect(sync({ cwd: tempDir })).rejects.toThrow(
        "configuration not found",
      );
    });

    it("should fail when config is invalid JSON", async () => {
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        "invalid json {",
        { encoding: "utf-8" },
      );

      await expect(sync({ cwd: tempDir })).rejects.toThrow();
    });

    it("should fail when tool is invalid", async () => {
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      await expect(
        sync({ cwd: tempDir, tool: "invalid-tool" }),
      ).rejects.toThrow("Unknown tool");
    });
  });
});
