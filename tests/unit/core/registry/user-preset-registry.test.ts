/**
 * Tests for User Preset Registry System
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UserPresetRegistry } from "../../../../src/core/registry/user-preset-registry.js";
import { mkdir, rm } from "node:fs/promises";
import * as path from "path";
import * as os from "os";

describe("UserPresetRegistry", () => {
  let registry: UserPresetRegistry;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = path.join(os.tmpdir(), `agentsync-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Initialize registry with custom path
    registry = new UserPresetRegistry(path.join(tempDir, "user-presets.json"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Adding presets", () => {
    it("should add a new preset successfully", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
        metadata: {
          author: "Test Author",
          tags: ["test", "example"],
        },
      };

      await registry.add(preset);

      const retrieved = await registry.get("test-preset");
      expect(retrieved.name).toBe(preset.name);
      expect(retrieved.description).toBe(preset.description);
      expect(retrieved.version).toBe(preset.version);
      expect(retrieved.source).toBe(preset.source);
      expect(retrieved.namespace).toBe(preset.namespace);
    });

    it("should throw error when adding duplicate preset", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await registry.add(preset);

      await expect(registry.add(preset)).rejects.toThrow(
        "Preset with name 'test-preset' already exists"
      );
    });

    it("should validate required fields when adding preset", async () => {
      const invalidPreset = {
        description: "Missing required fields",
      };

      await expect(registry.add(invalidPreset as any)).rejects.toThrow();
    });
  });

  describe("Removing presets", () => {
    it("should remove an existing preset successfully", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await registry.add(preset);
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
    it("should return empty list when no presets exist", async () => {
      const presets = await registry.list();
      expect(presets).toEqual([]);
    });

    it("should list all presets", async () => {
      const preset1 = {
        name: "test-preset-1",
        description: "First test preset",
        version: "1.0.0",
        source: "github:example/repo1",
        namespace: "example1",
      };

      const preset2 = {
        name: "test-preset-2",
        description: "Second test preset",
        version: "1.0.0",
        source: "github:example/repo2",
        namespace: "example2",
      };

      await registry.add(preset1);
      await registry.add(preset2);

      const presets = await registry.list();
      expect(presets).toHaveLength(2);
      expect(presets).toHaveLength(2);
      expect(
        presets.some(
          (p) =>
            p.name === preset1.name && p.description === preset1.description
        )
      ).toBe(true);
      expect(
        presets.some(
          (p) =>
            p.name === preset2.name && p.description === preset2.description
        )
      ).toBe(true);
    });
  });

  describe("Updating presets", () => {
    it("should update an existing preset successfully", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await registry.add(preset);

      const updatedPreset = {
        ...preset,
        description: "Updated description",
        version: "2.0.0",
      };

      await registry.update("test-preset", updatedPreset);

      const retrieved = await registry.get("test-preset");
      expect(retrieved.description).toBe("Updated description");
      expect(retrieved.version).toBe("2.0.0");
    });

    it("should throw error when updating non-existent preset", async () => {
      const updatedPreset = {
        name: "non-existent",
        description: "Updated description",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await expect(
        registry.update("non-existent", updatedPreset)
      ).rejects.toThrow("Preset 'non-existent' not found");
    });
  });

  describe("Validation", () => {
    it("should validate preset structure", async () => {
      const invalidPresets = [
        null,
        undefined,
        {},
        { name: "" },
        { name: "test" }, // missing required fields
        { name: "test", source: "invalid-source" }, // invalid source format
        {
          name: "test",
          source: "github:example/repo",
          version: "invalid-version",
        },
      ];

      for (const preset of invalidPresets) {
        await expect(registry.add(preset as any)).rejects.toThrow();
      }
    });

    it("should validate source format", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "invalid-source-format",
        namespace: "example",
      };

      await expect(registry.add(preset)).rejects.toThrow(
        /Source must be in format 'github:org\/repo'/
      );
    });
  });

  describe("Persistence", () => {
    it("should persist presets to disk", async () => {
      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await registry.add(preset);

      // Create new registry instance to test persistence
      const newRegistry = new UserPresetRegistry(
        path.join(tempDir, "user-presets.json")
      );
      const retrieved = await newRegistry.get("test-preset");

      expect(retrieved.name).toBe(preset.name);
      expect(retrieved.description).toBe(preset.description);
      expect(retrieved.version).toBe(preset.version);
      expect(retrieved.source).toBe(preset.source);
      expect(retrieved.namespace).toBe(preset.namespace);
    });

    it("should handle missing registry file gracefully", async () => {
      const newRegistry = new UserPresetRegistry(
        path.join(tempDir, "non-existent.json")
      );
      const presets = await newRegistry.list();
      expect(presets).toEqual([]);
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
        "Failed to parse user preset registry"
      );
    });

    it("should handle file system errors gracefully", async () => {
      const readOnlyRegistry = new UserPresetRegistry(
        "/root/readonly/presets.json"
      );

      const preset = {
        name: "test-preset",
        description: "A test preset",
        version: "1.0.0",
        source: "github:example/repo",
        namespace: "example",
      };

      await expect(readOnlyRegistry.add(preset)).rejects.toThrow();
    });
  });
});
