/**
 * Unit tests for main sync command
 */

import { chmod, mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import * as fs from "../../../src/utils/fs.js";

describe("Sync Command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-sync-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("Configuration Loading", () => {
    it("should load config from .agentsync/config.json", async () => {
      // Create minimal config
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

      // Should not throw
      await expect(
        sync({ cwd: tempDir, dryRun: true }),
      ).resolves.toBeUndefined();
    });

    it("should throw error if config.json is missing", async () => {
      await expect(sync({ cwd: tempDir, dryRun: true })).rejects.toThrow();
    });

    it("should throw error if config.json is invalid", async () => {
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(path.join(configDir, "config.json"), "invalid json", {
        encoding: "utf-8",
      });

      await expect(sync({ cwd: tempDir, dryRun: true })).rejects.toThrow();
    });
  });

  describe("Empty Presets", () => {
    it("should handle empty extends array", async () => {
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

      // Should complete successfully with no presets
      await expect(
        sync({ cwd: tempDir, dryRun: true }),
      ).resolves.toBeUndefined();
    });

    it("should handle missing extends field", async () => {
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          mcpServers: [],
          tools: ["cursor"],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Should complete successfully (extends is optional)
      await expect(
        sync({ cwd: tempDir, dryRun: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Dry Run Mode", () => {
    it("should preview changes without writing files", async () => {
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

      await sync({ cwd: tempDir, dryRun: true });

      // Verify no files created
      const cursorRulesDir = path.join(tempDir, ".cursor", "rules");
      const cursorCommandsDir = path.join(tempDir, ".cursor", "commands");
      const cursorMcpFile = path.join(tempDir, ".cursor", "mcp.json");

      expect(await fs.pathExists(cursorRulesDir)).toBe(false);
      expect(await fs.pathExists(cursorCommandsDir)).toBe(false);
      expect(await fs.pathExists(cursorMcpFile)).toBe(false);
    });
  });

  describe("Update Flag", () => {
    it("should pass update flag to orchestrator", async () => {
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

      // Should not throw with update flag
      await expect(
        sync({ cwd: tempDir, update: true, dryRun: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Tool Filtering", () => {
    it("should sync only to specified tool", async () => {
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

      // Sync only to cursor
      await sync({ cwd: tempDir, tool: "cursor", dryRun: true });

      // Should not throw
    });

    it("should throw error for unknown tool", async () => {
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
        sync({ cwd: tempDir, tool: "unknown-tool", dryRun: true }),
      ).rejects.toThrow("unknown-tool");
    });
  });

  describe("Error Handling", () => {
    it("should provide helpful error message for missing config", async () => {
      await expect(sync({ cwd: tempDir })).rejects.toThrow();
    });

    it("should handle file system errors gracefully", async () => {
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

      // Make config directory read-only (if not on Windows)
      if (process.platform !== "win32") {
        await chmod(configDir, 0o444);

        // Should handle permission error
        await expect(sync({ cwd: tempDir })).rejects.toThrow();

        // Restore permissions for cleanup
        await chmod(configDir, 0o755);
      }
    });
  });

  describe("No Tools Configured", () => {
    it("should complete successfully with empty tools array", async () => {
      const configDir = path.join(tempDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          extends: [],
          mcpServers: [],
          tools: [],
          useSymlinks: true,
        }),
        { encoding: "utf-8" },
      );

      // Should complete without error (no tools to sync to)
      await expect(
        sync({ cwd: tempDir, dryRun: true }),
      ).resolves.toBeUndefined();
    });
  });
});
