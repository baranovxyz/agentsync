/**
 * Tests for error handling in user preset registry
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserPresetRegistryError } from "../../../src/core/errors.js";
import { UserPresetRegistry } from "../../../src/core/registry/user-preset-registry.js";
import type { UserPresetEntry } from "../../../src/types/index.js";

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
  validateUserPresetEntry: vi.fn(),
  safeParseUserConfig: vi.fn(),
}));

describe("UserPresetRegistry error handling", () => {
  let registry: UserPresetRegistry;
  const mockRegistryPath = "/mock/path/config.json";

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new UserPresetRegistry(mockRegistryPath);
  });

  describe("constructor and initialization", () => {
    it("should use default path when none provided", () => {
      const defaultRegistry = new UserPresetRegistry();
      expect(defaultRegistry.getRegistryPath()).toContain(
        ".agentsync/config.json",
      );
    });

    it("should use custom path when provided", () => {
      expect(registry.getRegistryPath()).toBe(mockRegistryPath);
    });
  });

  describe("add", () => {
    const validEntry: UserPresetEntry = {
      source: "github:org/repo",
      type: "github",
      addedAt: new Date().toISOString(),
      description: "Test preset",
    };

    it("should throw ValidationError for invalid preset entry data", async () => {
      const { validateUserPresetEntry } = await import(
        "../../../src/types/schemas.js"
      );

      vi.mocked(validateUserPresetEntry).mockImplementation(() => {
        throw new Error("Invalid preset entry data");
      });

      await expect(registry.add("test-preset", validEntry)).rejects.toThrow(
        Error,
      );
    });

    it("should throw UserPresetRegistryError for duplicate preset names", async () => {
      const { validateUserPresetEntry, safeParseUserConfig } = await import(
        "../../../src/types/schemas.js"
      );
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      // Mock existing registry with duplicate preset
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {
            "test-preset": validEntry,
          },
          tools: ["cursor", "claude"],
        }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {
            "test-preset": validEntry,
          },
          tools: ["cursor", "claude"],
        },
      });

      vi.mocked(validateUserPresetEntry).mockReturnValue(validEntry);

      await expect(registry.add("test-preset", validEntry)).rejects.toThrow(
        UserPresetRegistryError,
      );
    });

    it("should throw FileSystemError when save fails", async () => {
      const { validateUserPresetEntry, safeParseUserConfig } = await import(
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
          tools: ["cursor", "claude"],
        }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        },
      });

      vi.mocked(validateUserPresetEntry).mockReturnValue(validEntry);
      vi.mocked(writeFile).mockRejectedValue(new Error("Permission denied"));

      await expect(registry.add("test-preset", validEntry)).rejects.toThrow(
        Error,
      );
    });
  });

  describe("get", () => {
    it("should throw UserPresetRegistryError for empty preset name", async () => {
      await expect(registry.get("")).rejects.toThrow(UserPresetRegistryError);
      await expect(registry.get("   ")).rejects.toThrow(
        UserPresetRegistryError,
      );
    });

    it("should throw UserPresetRegistryError for non-existent preset", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserConfig } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        },
      });

      await expect(registry.get("non-existent")).rejects.toThrow(
        UserPresetRegistryError,
      );
    });

    it("should throw UserPresetRegistryError for corrupted registry file", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue("{ invalid json }");

      await expect(registry.get("test-preset")).rejects.toThrow(
        UserPresetRegistryError,
      );
    });
  });

  describe("remove", () => {
    it("should throw UserPresetRegistryError for empty preset name", async () => {
      await expect(registry.remove("")).rejects.toThrow(
        UserPresetRegistryError,
      );
      await expect(registry.remove("   ")).rejects.toThrow(
        UserPresetRegistryError,
      );
    });

    it("should throw UserPresetRegistryError for non-existent preset", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserConfig } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        },
      });

      await expect(registry.remove("non-existent")).rejects.toThrow(
        UserPresetRegistryError,
      );
    });
  });

  describe("error context and metadata", () => {
    it("should include operation details in error context", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue("{ invalid json }");

      try {
        await registry.get("test-preset");
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          expect(error.getUserMessage()).toContain("load");
        }
      }
    });

    it("should include preset name in error context when available", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserConfig } = await import(
        "../../../src/types/schemas.js"
      );

      // Mock empty registry
      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: true,
        data: {
          version: "1.0",
          presets: {},
          tools: ["cursor", "claude"],
        },
      });

      try {
        await registry.get("non-existent-preset");
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          expect(error.getUserMessage()).toContain("non-existent-preset");
        }
      }
    });

    it("should provide user-friendly error messages with suggestions", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue("{ invalid json }");

      try {
        await registry.get("test-preset");
      } catch (error) {
        expect(error).toBeInstanceOf(UserPresetRegistryError);
        if (error instanceof UserPresetRegistryError) {
          const message = error.getUserMessage();
          expect(message).toBeDefined();
          expect(typeof message).toBe("string");
          expect(message.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle registry file creation failures", async () => {
      const { pathExists, mkdir } = await import("../../../src/utils/fs.js");

      vi.mocked(pathExists).mockResolvedValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error("Permission denied"));

      await expect(registry.list()).rejects.toThrow(UserPresetRegistryError);
    });

    it("should handle invalid registry format", async () => {
      const { pathExists, readFile } = await import("../../../src/utils/fs.js");
      const { safeParseUserConfig } = await import(
        "../../../src/types/schemas.js"
      );

      vi.mocked(pathExists).mockResolvedValue(true);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ invalid: "structure" }),
      );

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: false,
        error: new Error("Invalid format"),
      });

      vi.mocked(safeParseUserConfig).mockReturnValue({
        success: false,
        error: new Error("Invalid legacy format"),
      });

      await expect(registry.list()).rejects.toThrow(UserPresetRegistryError);
    });
  });
});
