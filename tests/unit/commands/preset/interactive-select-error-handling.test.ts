/**
 * Tests for error handling in interactive selection commands
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { interactiveSelectPreset } from "../../../src/commands/preset/interactive-select.js";
import {
  InteractiveSelectionError,
  SelectionValidationError,
  SourceResolutionError,
  UserPresetRegistryError,
  ConfigError,
  FileSystemError,
} from "../../../src/core/errors.js";

// Mock dependencies
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../../../src/core/registry/registry-orchestrator.js", () => ({
  RegistryOrchestrator: vi.fn(() => ({
    loadAndMerge: vi.fn(),
    validateSelections: vi.fn(),
  })),
}));

vi.mock("../../../src/core/registry/user-preset-registry.js", () => ({
  UserPresetRegistry: vi.fn(() => ({
    list: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
  })),
}));

vi.mock("../../../src/core/config/interactive-selection-merger.js", () => ({
  ConfigMerger: vi.fn(() => ({
    applySelections: vi.fn(),
  })),
}));

describe("interactiveSelectPreset error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.stdin.isTTY
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
    });
  });

  it("should throw InteractiveSelectionError when not in interactive environment", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
    });

    await expect(interactiveSelectPreset()).rejects.toThrow(
      InteractiveSelectionError
    );
  });

  it("should handle configuration loading errors", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("Config not found"));

    await expect(interactiveSelectPreset()).rejects.toThrow(ConfigError);
  });

  it("should handle invalid configuration format", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue("invalid json");

    await expect(interactiveSelectPreset()).rejects.toThrow(ConfigError);
  });

  it("should handle user preset registry errors", async () => {
    const { readFile } = await import("node:fs/promises");
    const { UserPresetRegistry } = await import(
      "../../../src/core/registry/user-preset-registry.js"
    );

    // Mock valid config
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: [],
        tools: [],
      })
    );

    // Mock registry error
    vi.mocked(UserPresetRegistry).mockImplementation(
      () =>
        ({
          list: vi.fn().mockRejectedValue(new Error("Registry corrupted")),
        }) as any
    );

    await expect(interactiveSelectPreset()).rejects.toThrow(
      UserPresetRegistryError
    );
  });

  it("should handle preset loading errors", async () => {
    const { readFile } = await import("node:fs/promises");
    const { select } = await import("@inquirer/prompts");
    const { RegistryOrchestrator } = await import(
      "../../../src/core/registry/registry-orchestrator.js"
    );

    // Mock valid config
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: ["github:org/repo"],
        tools: [],
      })
    );

    // Mock user selection
    vi.mocked(select).mockResolvedValue("github:org/repo");

    // Mock loading error
    vi.mocked(RegistryOrchestrator).mockImplementation(
      () =>
        ({
          loadAndMerge: vi.fn().mockRejectedValue(new Error("Network error")),
        }) as any
    );

    await expect(interactiveSelectPreset()).rejects.toThrow(
      SourceResolutionError
    );
  });

  it("should handle selection validation errors", async () => {
    const { readFile } = await import("node:fs/promises");
    const { select, checkbox } = await import("@inquirer/prompts");
    const { RegistryOrchestrator } = await import(
      "../../../src/core/registry/registry-orchestrator.js"
    );

    // Mock valid config
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: ["github:org/repo"],
        tools: [],
      })
    );

    // Mock user selections
    vi.mocked(select).mockResolvedValue("github:org/repo");
    vi.mocked(checkbox).mockResolvedValue(["rules"]);

    // Mock preset content and validation error
    vi.mocked(RegistryOrchestrator).mockImplementation(
      () =>
        ({
          loadAndMerge: vi.fn().mockResolvedValue({
            rules: new Map([["test.md", "content"]]),
            commands: new Map(),
            mcps: {},
          }),
          validateSelections: vi.fn().mockResolvedValue({
            valid: false,
            errors: ["Invalid pattern: *.invalid"],
          }),
        }) as any
    );

    await expect(interactiveSelectPreset()).rejects.toThrow(
      SelectionValidationError
    );
  });

  it("should handle file system errors when saving selection", async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { select, checkbox, confirm } = await import("@inquirer/prompts");
    const { RegistryOrchestrator } = await import(
      "../../../src/core/registry/registry-orchestrator.js"
    );

    // Mock valid config
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: ["github:org/repo"],
        tools: [],
      })
    );

    // Mock user selections
    vi.mocked(select).mockResolvedValue("github:org/repo");
    vi.mocked(checkbox).mockResolvedValue(["rules"]);
    vi.mocked(confirm).mockResolvedValue(true);

    // Mock preset content and successful validation
    vi.mocked(RegistryOrchestrator).mockImplementation(
      () =>
        ({
          loadAndMerge: vi.fn().mockResolvedValue({
            rules: new Map([["test.md", "content"]]),
            commands: new Map(),
            mcps: {},
          }),
          validateSelections: vi.fn().mockResolvedValue({
            valid: true,
            errors: [],
          }),
        }) as any
    );

    // Mock write error
    vi.mocked(writeFile).mockRejectedValue(new Error("Permission denied"));

    await expect(interactiveSelectPreset()).rejects.toThrow(FileSystemError);
  });

  it("should handle empty preset sources gracefully", async () => {
    const { readFile } = await import("node:fs/promises");

    // Mock config with no sources
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: [],
        tools: [],
      })
    );

    // Should not throw, but should exit early
    await expect(interactiveSelectPreset()).resolves.not.toThrow();
  });

  it("should handle invalid GitHub source format", async () => {
    const { readFile } = await import("node:fs/promises");
    const { select, input } = await import("@inquirer/prompts");

    // Mock valid config
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        version: "1.0",
        extends: [],
        tools: [],
      })
    );

    // Mock user selecting to add new source
    vi.mocked(select).mockResolvedValue("add-new");

    // Mock invalid source input
    vi.mocked(input).mockResolvedValue("invalid-source");

    await expect(interactiveSelectPreset()).rejects.toThrow(
      InteractiveSelectionError
    );
  });

  it("should provide user-friendly error messages", async () => {
    const { readFile } = await import("node:fs/promises");

    // Mock config file not found
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file"));

    try {
      await interactiveSelectPreset();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      if (error instanceof ConfigError) {
        const userMessage = error.getUserMessage();
        expect(userMessage).toContain("Failed to load configuration");
        expect(userMessage).toContain("💡 Suggestion:");
      }
    }
  });
});
