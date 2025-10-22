/**
 * Integration tests for interactive selection workflow
 * Tests the actual file system operations without mocks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { interactiveSelectPreset } from "../../../src/commands/preset/interactive-select.js";
import { interactiveRemovePreset } from "../../../src/commands/preset/interactive-remove.js";
import { listPresets } from "../../../src/commands/preset/list.js";
import * as path from "path";
import * as os from "os";
import * as fs from "../../../src/utils/fs.js";
import { mkdtemp } from "node:fs/promises";

// Mock the interactive prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Mock the registry orchestrator
vi.mock("../../../src/core/registry/registry-orchestrator.js", () => ({
  RegistryOrchestrator: vi.fn().mockImplementation(() => ({
    loadAndMerge: vi.fn(),
    validateSelections: vi.fn(),
  })),
}));

// Mock the user preset registry
vi.mock("../../../src/core/registry/user-preset-registry.js", () => ({
  UserPresetRegistry: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    add: vi.fn(),
    get: vi.fn(),
  })),
}));

// Mock the source resolver
vi.mock("../../../src/core/registry/source-resolver.js", () => ({
  SourceResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn(),
    validateSource: vi.fn(),
    isGitHubSource: vi.fn(),
  })),
}));

describe("Interactive Selection Workflow (Integration)", () => {
  let tempDir: string;
  let mockSelect: any;
  let mockCheckbox: any;
  let mockInput: any;
  let mockConfirm: any;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-selection-"));
    
    // Create real config
    await fs.ensureDir(path.join(tempDir, ".agentsync"));
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: ["github:company/standards"],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Setup mock functions
    const prompts = await import("@inquirer/prompts");
    mockSelect = vi.mocked(prompts.select);
    mockCheckbox = vi.mocked(prompts.checkbox);
    mockInput = vi.mocked(prompts.input);
    mockConfirm = vi.mocked(prompts.confirm);

    // Mock interactive environment
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.clearAllMocks();
  });

  it("should save selection to extends array", async () => {
    // Mock user input
    mockSelect.mockResolvedValue("github:company/standards");
    mockCheckbox.mockResolvedValue(["rules"]);
    mockInput.mockResolvedValueOnce("*.md").mockResolvedValueOnce("");
    mockConfirm.mockResolvedValue(true);

    // Run select command
    await interactiveSelectPreset({ cwd: tempDir });

    // Verify selection saved to correct location
    const configContent = await fs.readFile(
      path.join(tempDir, ".agentsync", "config.json"),
      "utf-8"
    );
    const config = JSON.parse(configContent);

    expect(config.extends).toHaveLength(1);
    expect(config.extends[0]).toMatchObject({
      source: "github:company/standards",
      select: {
        rules: { include: ["*.md"] },
      },
    });
  });

  it("should list presets with selections", async () => {
    // Setup config with selection
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: { include: ["*.md"] },
              commands: { include: ["commit.md"] },
            },
          },
        ],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Mock console.log to capture output
    const logSpy = vi.spyOn(console, "log");

    // Run list command
    await listPresets({ cwd: tempDir });

    // Verify output shows selections
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Rules: *.md")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Commands: commit.md")
    );
  });

  it("should remove selection from extends array", async () => {
    // Setup config with selection
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: { include: ["*.md"] },
              commands: { include: ["commit.md"] },
            },
          },
        ],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Mock user input
    mockSelect
      .mockResolvedValueOnce("github:company/standards")
      .mockResolvedValueOnce("project")
      .mockResolvedValueOnce("specific");
    mockCheckbox.mockResolvedValue(["rules"]);
    mockConfirm.mockResolvedValue(true);

    // Run remove command
    await interactiveRemovePreset({ cwd: tempDir });

    // Verify selection removed
    const configContent = await fs.readFile(
      path.join(tempDir, ".agentsync", "config.json"),
      "utf-8"
    );
    const config = JSON.parse(configContent);

    expect(config.extends[0].select).toEqual({
      commands: { include: ["commit.md"] },
    });
  });

  it("should merge project and local configs", async () => {
    // Setup project config
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: { rules: { include: ["*.md"] } },
          },
        ],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Setup local config
    await fs.outputFile(
      path.join(tempDir, "agentsync.local.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:personal/rules",
            select: { commands: { include: ["*.sh"] } },
          },
        ],
      }),
      { encoding: "utf-8" }
    );

    // Run list command
    const logSpy = vi.spyOn(console, "log");
    await listPresets({ cwd: tempDir });

    // Verify both presets shown
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("github:personal/rules")
    );
  });

  it("should handle empty selections gracefully", async () => {
    // Setup config with no selections
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: ["github:company/standards"],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Run list command
    const logSpy = vi.spyOn(console, "log");
    await listPresets({ cwd: tempDir });

    // Should not show selections section
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("github:company/standards")
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Selections:")
    );
  });

  it("should remove entire preset when all selections removed", async () => {
    // Setup config with selection
    await fs.outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: { include: ["*.md"] },
            },
          },
        ],
        tools: ["cursor"],
      }),
      { encoding: "utf-8" }
    );

    // Mock user input to remove all selections
    mockSelect
      .mockResolvedValueOnce("github:company/standards")
      .mockResolvedValueOnce("project")
      .mockResolvedValueOnce("specific");
    mockCheckbox.mockResolvedValue(["rules"]);
    mockConfirm.mockResolvedValue(true);

    // Run remove command
    await interactiveRemovePreset({ cwd: tempDir });

    // Verify entire preset removed (converted back to string)
    const configContent = await fs.readFile(
      path.join(tempDir, ".agentsync", "config.json"),
      "utf-8"
    );
    const config = JSON.parse(configContent);

    expect(config.extends).toHaveLength(1);
    expect(config.extends[0]).toBe("github:company/standards");
  });
});
