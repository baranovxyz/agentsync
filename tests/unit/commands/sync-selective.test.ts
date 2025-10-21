/**
 * Tests for sync command with selective loading integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import { RegistryOrchestrator } from "../../../src/core/registry/registry-orchestrator.js";
import { RulesSyncTarget } from "../../../src/targets/rules-sync-target.js";
import { CommandsSyncTarget } from "../../../src/targets/commands-sync-target.js";
import { validateConfig } from "../../../src/types/schemas.js";
import { readFile } from "node:fs/promises";
import * as path from "path";
import { syncMCP } from "../../../src/commands/mcp/sync.js";

// Mock dependencies
vi.mock("node:fs/promises");
vi.mock("../../../src/core/registry/registry-orchestrator.js");
vi.mock("../../../src/targets/rules-sync-target.js");
vi.mock("../../../src/targets/commands-sync-target.js");
vi.mock("../../../src/commands/mcp/sync.js");
vi.mock("../../../src/types/schemas.js");
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

const mockReadFile = vi.mocked(readFile);
const mockValidateConfig = vi.mocked(validateConfig);
const mockRegistryOrchestrator = vi.mocked(RegistryOrchestrator);
const mockRulesSyncTarget = vi.mocked(RulesSyncTarget);
const mockCommandsSyncTarget = vi.mocked(CommandsSyncTarget);
const mockSyncMCP = vi.mocked(syncMCP);

describe("sync command with selective loading", () => {
  const mockCwd = "/test/project";
  const mockConfigPath = path.join(mockCwd, ".agentsync", "config.json");
  const mockConfig = {
    version: "1.0",
    extends: ["github:company/standards", "github:team/rules"],
    tools: ["cursor", "claude"] as ("cursor" | "claude")[],
    mcpServers: ["github"],
    useSymlinks: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
    mockValidateConfig.mockReturnValue(mockConfig);

    // Mock RegistryOrchestrator
    const mockOrchestratorInstance = {
      loadAndMerge: vi.fn(),
      loadAndMergeSelective: vi.fn(),
      validateSelections: vi.fn(),
    };
    mockRegistryOrchestrator.mockImplementation(
      () => mockOrchestratorInstance as any
    );

    // Mock sync targets
    const mockRulesSyncInstance = {
      sync: vi.fn(),
    };
    const mockCommandsSyncInstance = {
      sync: vi.fn(),
    };
    mockRulesSyncTarget.mockImplementation(() => mockRulesSyncInstance as any);
    mockCommandsSyncTarget.mockImplementation(
      () => mockCommandsSyncInstance as any
    );

    // Mock MCP sync
    mockSyncMCP.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use regular loadAndMerge when no selections are provided", async () => {
    const mockMerged = {
      rules: new Map([["rule1.md", "content1"]]),
      commands: new Map([["cmd1.md", "content1"]]),
      mcps: { github: { name: "github", command: "npx" } },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.loadAndMerge.mockResolvedValue(mockMerged);

    await sync({ cwd: mockCwd });

    expect(mockOrchestratorInstance.loadAndMerge).toHaveBeenCalledWith(
      mockCwd,
      {
        update: undefined,
      }
    );
    expect(
      mockOrchestratorInstance.loadAndMergeSelective
    ).not.toHaveBeenCalled();
  });

  it("should use loadAndMergeSelective when selections are provided", async () => {
    const mockMerged = {
      rules: new Map([["rule1.md", "content1"]]),
      commands: new Map([["cmd1.md", "content1"]]),
      mcps: { github: { name: "github", command: "npx" } },
    };

    const mockSelections = {
      "github:company/standards": {
        rules: { include: ["*.md"] },
        commands: { include: ["*.md"] },
      },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.loadAndMergeSelective.mockResolvedValue(
      mockMerged
    );

    await sync({ cwd: mockCwd, selections: mockSelections } as any);

    expect(mockOrchestratorInstance.loadAndMergeSelective).toHaveBeenCalledWith(
      mockCwd,
      mockSelections,
      { update: undefined }
    );
    expect(mockOrchestratorInstance.loadAndMerge).not.toHaveBeenCalled();
  });

  it("should validate selections when provided", async () => {
    const mockSelections = {
      "github:company/standards": {
        rules: { include: ["*.md"] },
        commands: { include: ["*.md"] },
      },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.validateSelections.mockResolvedValue({
      valid: true,
      errors: [],
    });
    mockOrchestratorInstance.loadAndMergeSelective.mockResolvedValue({
      rules: new Map(),
      commands: new Map(),
      mcps: {},
    });

    await sync({ cwd: mockCwd, selections: mockSelections } as any);

    expect(mockOrchestratorInstance.validateSelections).toHaveBeenCalledWith(
      mockCwd,
      mockSelections,
      { update: undefined }
    );
  });

  it("should throw error when selections are invalid", async () => {
    const mockSelections = {
      "github:company/standards": {
        rules: { include: ["nonexistent.md"] },
      },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.validateSelections.mockResolvedValue({
      valid: false,
      errors: ["Rule file 'nonexistent.md' not found in preset"],
    });

    await expect(
      sync({ cwd: mockCwd, selections: mockSelections } as any)
    ).rejects.toThrow("Invalid selections");
  });

  it("should maintain backward compatibility when no selections are provided", async () => {
    const mockMerged = {
      rules: new Map([["rule1.md", "content1"]]),
      commands: new Map([["cmd1.md", "content1"]]),
      mcps: { github: { name: "github", command: "npx" } },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.loadAndMerge.mockResolvedValue(mockMerged);

    await sync({ cwd: mockCwd });

    // Should work exactly as before
    expect(mockOrchestratorInstance.loadAndMerge).toHaveBeenCalled();
    expect(
      mockOrchestratorInstance.loadAndMergeSelective
    ).not.toHaveBeenCalled();
  });

  it("should pass update option to orchestrator", async () => {
    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.loadAndMerge.mockResolvedValue({
      rules: new Map(),
      commands: new Map(),
      mcps: {},
    });

    await sync({ cwd: mockCwd, update: true });

    expect(mockOrchestratorInstance.loadAndMerge).toHaveBeenCalledWith(
      mockCwd,
      {
        update: true,
      }
    );
  });

  it("should pass update option to orchestrator when using selections", async () => {
    const mockSelections = {
      "github:company/standards": {
        rules: { include: ["*.md"] },
      },
    };

    const mockOrchestratorInstance = new (mockRegistryOrchestrator as any)();
    mockOrchestratorInstance.validateSelections.mockResolvedValue({
      valid: true,
      errors: [],
    });
    mockOrchestratorInstance.loadAndMergeSelective.mockResolvedValue({
      rules: new Map(),
      commands: new Map(),
      mcps: {},
    });

    await sync({
      cwd: mockCwd,
      update: true,
      selections: mockSelections,
    } as any);

    expect(mockOrchestratorInstance.validateSelections).toHaveBeenCalledWith(
      mockCwd,
      mockSelections,
      { update: true }
    );
    expect(mockOrchestratorInstance.loadAndMergeSelective).toHaveBeenCalledWith(
      mockCwd,
      mockSelections,
      { update: true }
    );
  });
});
