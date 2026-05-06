/**
 * Empty Project Sync Tests
 * Verifies behavior when .agents/ has no skills, no commands, no agents.
 * All sync operations should handle gracefully with zero counts and no empty directories.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../../src/constants.js";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncMCP,
  syncSkills,
} from "../../../src/sync/index.js";
import { getToolProvider, getToolProviders } from "../../../src/tools/index.js";
import { ensureDir, pathExists } from "../../../src/utils/fs.js";

const ALL_TOOLS: ToolName[] = [
  "claude",
  "opencode",
  "cursor",
  "roocode",
  "codex",
  "copilot",
  "cline",
  "gemini",
  "amp",
  "goose",
  "aider",
  "amazonq",
  "augment",
  "kiro",
  "openhands",
  "junie",
  "crush",
  "kilocode",
  "qwen",
];

describe("Empty Project Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-empty-"));
    // Create empty .agents structure (mimics `agentsync init` with no content)
    await ensureDir(path.join(tmpDir, ".agents"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("syncSkills returns zero count for all tools", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncSkills(providers, tmpDir);

    expect(results).toHaveLength(19);
    for (const result of results) {
      expect(result.skillCount).toBe(0);
      expect(result.skills).toHaveLength(0);
    }
  });

  it("syncCommands returns zero count for all tools", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncCommands(providers, tmpDir);

    expect(results).toHaveLength(19);
    for (const result of results) {
      expect(result.commandCount).toBe(0);
      expect(result.commands).toHaveLength(0);
    }
  });

  it("syncAgents returns zero count for all tools", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncAgents(providers, tmpDir);

    expect(results).toHaveLength(19);
    for (const result of results) {
      expect(result.agentCount).toBe(0);
      expect(result.agents).toHaveLength(0);
    }
  });

  it("syncDocs returns created=false for all tools when no AGENTS.md", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncDocs(providers, tmpDir);

    for (const result of results) {
      expect(result.created).toBe(false);
    }
  });

  it("no tool output directories are created for skills", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    await syncSkills(providers, tmpDir);

    // No tool skill directories should exist
    for (const dir of [
      ".claude/skills",
      ".cursor/skills",
      ".opencode/skills",
      ".roo/skills",
      ".gemini/skills",
      ".github/skills",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("no tool output directories are created for commands", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    await syncCommands(providers, tmpDir);

    for (const dir of [
      ".claude/commands",
      ".opencode/commands",
      ".roo/commands",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("no tool output directories are created for agents", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    await syncAgents(providers, tmpDir);

    for (const dir of [
      ".claude/agents",
      ".opencode/agents",
      ".github/agents",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("full sync pipeline with empty project produces only MCP configs", async () => {
    const providers = getToolProviders(["claude", "cursor"]);
    const mcps = {
      test: { command: "npx", args: ["server"] },
    };

    await syncSkills(providers, tmpDir);
    await syncCommands(providers, tmpDir);
    await syncAgents(providers, tmpDir);
    await syncDocs(providers, tmpDir);
    await syncMCP(providers, mcps, tmpDir);

    // MCP configs should exist (written even for empty project)
    expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, ".cursor", "mcp.json"))).toBe(
      true,
    );

    // But no skill/command/agent dirs
    expect(await pathExists(path.join(tmpDir, ".claude", "skills"))).toBe(
      false,
    );
    expect(await pathExists(path.join(tmpDir, ".claude", "commands"))).toBe(
      false,
    );
  });

  it("empty preset maps produce zero results", async () => {
    const providers = [getToolProvider("claude")];

    const emptyPresets = new Map<string, string[]>();

    const skillResults = await syncSkills(providers, tmpDir, emptyPresets);
    const cmdResults = await syncCommands(providers, tmpDir, emptyPresets);
    const agentResults = await syncAgents(providers, tmpDir, emptyPresets);

    expect(skillResults[0].skillCount).toBe(0);
    expect(cmdResults[0].commandCount).toBe(0);
    expect(agentResults[0].agentCount).toBe(0);
  });
});
