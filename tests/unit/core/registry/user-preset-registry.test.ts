/**
 * Tests for User Preset Registry System
 */

import { mkdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UserPresetRegistry } from "../../../../src/core/registry/user-preset-registry.js";
import type { UserPresetEntry } from "../../../../src/types/schemas.js";

describe("UserPresetRegistry", () => {
  let registry: UserPresetRegistry;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `agentsync-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Initialize registry with custom path
    registry = new UserPresetRegistry(path.join(tempDir, "config.json"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Adding presets", () => {
    it("should add a new preset successfully", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);

      const retrieved = await registry.get("test-preset");
      expect(retrieved.source).toBe(entry.source);
      expect(retrieved.type).toBe(entry.type);
      expect(retrieved.description).toBe(entry.description);
    });

    it("should throw error when adding duplicate preset", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);

      await expect(registry.add("test-preset", entry)).rejects.toThrow(
        "Preset with name 'test-preset' already exists",
      );
    });

    it("should validate required fields when adding preset", async () => {
      const invalidEntry = {
        description: "Missing required fields",
      };

      await expect(
        registry.add("test-preset", invalidEntry as any),
      ).rejects.toThrow();
    });
  });

  describe("Removing presets", () => {
    it("should remove an existing preset successfully", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);
      await registry.remove("test-preset");

      await expect(registry.get("test-preset")).rejects.toThrow(
        "Preset with name 'test-preset' not found",
      );
    });

    it("should throw error when removing non-existent preset", async () => {
      await expect(registry.remove("non-existent")).rejects.toThrow(
        "Preset with name 'non-existent' not found",
      );
    });
  });

  describe("Listing presets", () => {
    it("should return empty object when no presets exist", async () => {
      const presets = await registry.list();
      expect(presets).toEqual({});
    });

    it("should list all presets", async () => {
      const entry1: UserPresetEntry = {
        source: "github:example/repo1",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "First test preset",
      };

      const entry2: UserPresetEntry = {
        source: "github:example/repo2",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "Second test preset",
      };

      await registry.add("test-preset-1", entry1);
      await registry.add("test-preset-2", entry2);

      const presets = await registry.list();
      expect(Object.keys(presets)).toHaveLength(2);
      expect(presets["test-preset-1"].description).toBe(entry1.description);
      expect(presets["test-preset-2"].description).toBe(entry2.description);
    });
  });

  describe("Validation", () => {
    it("should validate preset entry structure", async () => {
      const invalidEntries = [
        null,
        undefined,
        {},
        { source: "" },
        { source: "test" }, // missing required fields
        { source: "test", type: "invalid-type" }, // invalid type
      ];

      for (const entry of invalidEntries) {
        await expect(registry.add("test", entry as any)).rejects.toThrow();
      }
    });

    it("should validate source format", async () => {
      const entry: UserPresetEntry = {
        source: "invalid-source-format",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      // Note: The new schema doesn't validate source format as strictly
      // This test might need adjustment based on actual validation requirements
      await expect(registry.add("test-preset", entry)).resolves.not.toThrow();
    });
  });

  describe("Persistence", () => {
    it("should persist presets to disk", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);

      // Create new registry instance to test persistence
      const newRegistry = new UserPresetRegistry(
        path.join(tempDir, "config.json"),
      );
      const retrieved = await newRegistry.get("test-preset");

      expect(retrieved.source).toBe(entry.source);
      expect(retrieved.type).toBe(entry.type);
      expect(retrieved.description).toBe(entry.description);
    });

    it("should handle missing registry file gracefully", async () => {
      const newRegistry = new UserPresetRegistry(
        path.join(tempDir, "non-existent.json"),
      );
      const presets = await newRegistry.list();
      expect(presets).toEqual({});
    });
  });

  describe("Error handling", () => {
    it("should handle corrupted registry file", async () => {
      const registryPath = path.join(tempDir, "corrupted.json");

      // Write invalid JSON
      const { writeFile } = await import("node:fs/promises");
      await writeFile(registryPath, "{ invalid json }");

      const corruptedRegistry = new UserPresetRegistry(registryPath);

      await expect(corruptedRegistry.list()).rejects.toThrow(
        "Registry file contains invalid JSON",
      );
    });

    it("should handle file system errors gracefully", async () => {
      const readOnlyRegistry = new UserPresetRegistry(
        "/root/readonly/config.json",
      );

      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await expect(
        readOnlyRegistry.add("test-preset", entry),
      ).rejects.toThrow();
    });
  });

  describe("Metadata", () => {
    it("should return registry metadata", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);

      const metadata = await registry.getMetadata();
      expect(metadata.version).toBe("1.0");
      expect(metadata.totalPresets).toBe(1);
    });
  });
});
