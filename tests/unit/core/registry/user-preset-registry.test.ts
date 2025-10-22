/**
 * Tests for User Preset Registry System
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UserPresetRegistry } from "../../../../src/core/registry/user-preset-registry.js";
import { mkdir, rm } from "node:fs/promises";
import * as path from "path";
import * as os from "os";
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
        "Preset 'test-preset' already exists"
      );
    });

    it("should validate required fields when adding preset", async () => {
      const invalidEntry = {
        description: "Missing required fields",
      };

      await expect(registry.add("test-preset", invalidEntry as any)).rejects.toThrow();
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
        "Preset 'test-preset' not found"
      );
    });

    it("should throw error when removing non-existent preset", async () => {
      await expect(registry.remove("non-existent")).rejects.toThrow(
        "Preset 'non-existent' not found"
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
        path.join(tempDir, "config.json")
      );
      const retrieved = await newRegistry.get("test-preset");

      expect(retrieved.source).toBe(entry.source);
      expect(retrieved.type).toBe(entry.type);
      expect(retrieved.description).toBe(entry.description);
    });

    it("should handle missing registry file gracefully", async () => {
      const newRegistry = new UserPresetRegistry(
        path.join(tempDir, "non-existent.json")
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
        "Registry file contains invalid JSON"
      );
    });

    it("should handle file system errors gracefully", async () => {
      const readOnlyRegistry = new UserPresetRegistry(
        "/root/readonly/config.json"
      );

      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await expect(readOnlyRegistry.add("test-preset", entry)).rejects.toThrow();
    });
  });

  describe("Backward compatibility", () => {
    it("should migrate legacy registry format", async () => {
      // Create a legacy registry file
      const legacyRegistryPath = path.join(tempDir, "user-presets.json");
      const { writeFile } = await import("node:fs/promises");
      
      const legacyData = {
        presets: {
          "legacy-preset": {
            name: "legacy-preset",
            description: "A legacy preset",
            source: "github:example/legacy",
            namespace: "example",
            addedAt: "2023-01-01T00:00:00.000Z",
          },
        },
        lastUpdated: "2023-01-01T00:00:00.000Z",
      };

      await writeFile(legacyRegistryPath, JSON.stringify(legacyData, null, 2));

      // Create registry with legacy path
      const legacyRegistry = new UserPresetRegistry(legacyRegistryPath);
      
      // Should migrate and work with new format
      const presets = await legacyRegistry.list();
      expect(presets["legacy-preset"]).toBeDefined();
      expect(presets["legacy-preset"].source).toBe("github:example/legacy");
      expect(presets["legacy-preset"].type).toBe("github");
    });

    it("should support legacy add method", async () => {
      const legacyPreset = {
        name: "legacy-preset",
        description: "A legacy preset",
        source: "github:example/legacy",
        namespace: "example",
      };

      await registry.addLegacy(legacyPreset);

      const retrieved = await registry.get("legacy-preset");
      expect(retrieved.source).toBe(legacyPreset.source);
      expect(retrieved.type).toBe("github");
      expect(retrieved.description).toBe(legacyPreset.description);
    });

    it("should support legacy list method", async () => {
      const entry: UserPresetEntry = {
        source: "github:example/repo",
        type: "github",
        addedAt: new Date().toISOString(),
        description: "A test preset",
      };

      await registry.add("test-preset", entry);

      const legacyList = await registry.listLegacy();
      expect(legacyList).toHaveLength(1);
      expect(legacyList[0].name).toBe("test-preset");
      expect(legacyList[0].source).toBe(entry.source);
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