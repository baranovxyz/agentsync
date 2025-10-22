/**
 * Tests for error handling in user preset registry
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPresetRegistry } from "../../../src/core/registry/user-preset-registry.js";
import {
  UserPresetRegistryError,
  ValidationError,
  FileSystemError,
  ErrorCategory,
  ErrorSeverity,
} from "../../../src/core/errors.js";
import type { UserPreset } from "../../../src/types/index.js";

// Mock dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("../../../src/utils/fs.js", () => ({
  pathExists: vi.fn(),
}));

vi.mock("../../../src/types/schemas.js", () => ({
  validateUserPreset: vi.fn(),
  safeParseUserPresetRegistry: vi.fn(),
}));

describe("UserPresetRegistry error handling", () => {
  let registry: UserPresetRegistry;
  const mockRegistryPath = "/mock/path/user-presets.json";

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new UserPresetRegistry(mockRegistryPath);
  });

  describe("constructor and initialization", () => {
    it("should use default path when none provided", () => {
      const defaultRegistry = new UserPresetRegistry();
      expect(defaultRegistry.getRegistryPath()).toContain(
        ".agentsync/user-presets.json"
      );
    });

    it("should use custom path when provided", () => {
      expect(registry.getRegistryPath()).toBe(mockRegistryPath);
    });
  });

  describe("add", () => {
    const validPreset: UserPreset = {
      name: "test-preset",
      description: "Test preset",
      version: "1.0.0",
      source: "github:org/repo",
      namespace: "org",
    };

    it("should throw ValidationError for invalid preset data", async () => {
      const { validateUserPreset } = await import(
        "../../../src/types/schemas.js"
      );

      vi.mocked(validateUserPreset).mockImplementation(() => {
        throw new Error("Invalid preset data");
      });

      await expect(registry.add(validPreset)).rejects.toThrow(ValidationError);
    });

    it("should throw UserPresetRegistryError for duplicate preset names", async () => {
      const { validateUserPreset, safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      // Mock existing registry with duplicate preset
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {
            "test-preset": validPreset,
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 1,
          },
        })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {
            "test-preset": validPreset,
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 1,
          },
        },
      });

      vi.mocked(validateUserPreset).mockReturnValue(validPreset);

      await expect(registry.add(validPreset)).rejects.toThrow(
        UserPresetRegistryError
      );
    });

    it("should throw FileSystemError when save fails", async () => {
      const { validateUserPreset, safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );
      const { pathExists, readFile, writeFile } = await import(
        "../../../src/utils/fs.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        },
      });

      vi.mocked(validateUserPreset).mockReturnValue(validPreset);
      vi.mocked(writeFile).mockRejectedValue(new Error("Permission denied"));

      await expect(registry.add(validPreset)).rejects.toThrow(FileSystemError);
    });
  });

  describe("get", () => {
    it("should throw UserPresetRegistryError for empty preset name", async () => {
      await expect(registry.get("")).rejects.toThrow(UserPresetRegistryError);
      await expect(registry.get("   ")).rejects.toThrow(
        UserPresetRegistryError
      );
    });

    it("should throw UserPresetRegistryError for non-existent preset", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        },
      });

      await expect(registry.get("non-existent")).rejects.toThrow(
        UserPresetRegistryError
      );
    });

    it("should throw UserPresetRegistryError for corrupted registry file", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      // Mock corrupted file
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue("invalid json");

      await expect(registry.get("any-preset")).rejects.toThrow(
        UserPresetRegistryError
      );
    });
  });

  describe("remove", () => {
    it("should throw UserPresetRegistryError for empty preset name", async () => {
      await expect(registry.remove("")).rejects.toThrow(
        UserPresetRegistryError
      );
      await expect(registry.remove("   ")).rejects.toThrow(
        UserPresetRegistryError
      );
    });

    it("should throw UserPresetRegistryError for non-existent preset", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        },
      });

      await expect(registry.remove("non-existent")).rejects.toThrow(
        UserPresetRegistryError
      );
    });
  });

  describe("update", () => {
    it("should throw UserPresetRegistryError for empty preset name", async () => {
      await expect(registry.update("", {})).rejects.toThrow(
        UserPresetRegistryError
      );
    });

    it("should throw UserPresetRegistryError for non-existent preset", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalPresets: 0,
          },
        },
      });

      await expect(registry.update("non-existent", {})).rejects.toThrow(
        UserPresetRegistryError
      );
    });
  });

  describe("error context and metadata", () => {
    it("should include operation details in error context", async () => {
      try {
        await registry.get("");
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          expect(error.metadata.context?.operation).toBe("get");
          expect(error.metadata.category).toBe(ErrorCategory.FILE_SYSTEM);
        }
      }
    });

    it("should include preset name in error context when available", async () => {
      try {
        await registry.get("non-existent-preset");
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          expect(error.metadata.context?.presetName).toBe(
            "non-existent-preset"
          );
        }
      }
    });

    it("should provide user-friendly error messages with suggestions", async () => {
      try {
        await registry.add({} as UserPreset);
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          const userMessage = error.getUserMessage();
          expect(userMessage).toContain("💡 Suggestion:");
          expect(userMessage).toContain(
            "Check if the preset name already exists"
          );
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle registry file creation failures", async () => {
      const { pathExists, mkdir } = await import("../../../src/utils/fs.js");

      // Mock non-existent file and directory creation failure
      vi.mocked(pathExists).mockResolvedValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error("Permission denied"));

      await expect(registry.list()).rejects.toThrow(FileSystemError);
    });

    it("should handle invalid registry format", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserPresetRegistry } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock invalid registry format
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ invalid: "structure" })
      );

      vi.mocked(safeParseUserPresetRegistry).mockReturnValue({
        success: false,
        error: new Error("Invalid registry format"),
      });

      await expect(registry.list()).rejects.toThrow(UserPresetRegistryError);
    });
  });
});
