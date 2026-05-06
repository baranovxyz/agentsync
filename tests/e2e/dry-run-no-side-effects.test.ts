/**
 * Dry Run No Side Effects Tests
 * Verifies that when sync functions are NOT called, no files are created.
 * Tests the absence of side effects by checking directory state stays clean.
 * Also tests that empty sync inputs produce no tool directories.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../src/constants.js";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncMCP,
  syncSkills,
} from "../../src/sync/index.js";
import { getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

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

describe("Dry Run / No Side Effects", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-dryrun-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("no tool directories created when no skills exist", async () => {
    // Empty .agents dir, no skills
    await ensureDir(path.join(tmpDir, ".agents"));

    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncSkills(providers, tmpDir);

    // All results should have zero skills
    for (const result of results) {
      expect(result.skillCount).toBe(0);
    }

    // Tool-specific skill dirs should NOT exist
    for (const dir of [
      ".claude/skills",
      ".cursor/skills",
      ".opencode/skills",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("no command directories created when no commands exist", async () => {
    await ensureDir(path.join(tmpDir, ".agents"));

    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncCommands(providers, tmpDir);

    for (const result of results) {
      expect(result.commandCount).toBe(0);
    }

    // Command dirs should NOT exist
    for (const dir of [
      ".claude/commands",
      ".opencode/commands",
      ".roo/commands",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("no agent directories created when no agents exist", async () => {
    await ensureDir(path.join(tmpDir, ".agents"));

    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncAgents(providers, tmpDir);

    for (const result of results) {
      expect(result.agentCount).toBe(0);
    }

    for (const dir of [
      ".claude/agents",
      ".opencode/agents",
      ".github/agents",
    ]) {
      expect(await pathExists(path.join(tmpDir, dir))).toBe(false);
    }
  });

  it("no CLAUDE.md or GEMINI.md created when no AGENTS.md exists", async () => {
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncDocs(providers, tmpDir);

    // All should report created=false
    for (const result of results) {
      expect(result.created).toBe(false);
    }

    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, "AGENTS.md"))).toBe(false);
  });

  it("empty MCP config still creates config files", async () => {
    // With empty MCPs, writeMCP is still called and creates file structure
    const providers = getToolProviders(ALL_TOOLS);
    await syncMCP(providers, {}, tmpDir);

    // MCP configs are written even when empty (valid empty state)
    // This is by design - tools need the config file to exist
    expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(true);
    expect(await pathExists(path.join(tmpDir, "opencode.json"))).toBe(true);
  });

  it("tmpDir stays clean when sync functions receive empty providers array", async () => {
    // Create some content to ensure sync would produce output if providers existed
    const skillDir = path.join(tmpDir, ".agents", "skills", "test");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "test.md"),
      "# Test",
    );

    // Pass empty providers array
    const skillResults = await syncSkills([], tmpDir);
    const cmdResults = await syncCommands([], tmpDir);
    const agentResults = await syncAgents([], tmpDir);

    expect(skillResults).toHaveLength(0);
    expect(cmdResults).toHaveLength(0);
    expect(agentResults).toHaveLength(0);

    // No tool directories should be created
    const entries = await readdir(tmpDir);
    const toolDirs = entries.filter(
      (e) =>
        e.startsWith(".claude") ||
        e.startsWith(".cursor") ||
        e.startsWith(".opencode") ||
        e.startsWith(".roo") ||
        e.startsWith(".github") ||
        e.startsWith(".gemini") ||
        e.startsWith(".codex") ||
        e === ".mcp.json" ||
        e === "opencode.json",
    );
    expect(toolDirs).toHaveLength(0);
  });

  it("only specified tools receive output, others stay untouched", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "deploy");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Deploy");

    // Only sync to Claude
    const providers = getToolProviders(["claude"]);
    await syncSkills(providers, tmpDir);

    // Claude should have the skill
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "deploy", "SKILL.md"),
      ),
    ).toBe(true);

    // Other tools should NOT have anything
    expect(await pathExists(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, ".opencode"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, ".roo"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, ".gemini"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, ".vscode"))).toBe(false);
  });

  it("no MCP configs written when syncMCP receives empty providers", async () => {
    const mcps = {
      test: { command: "npx", args: ["server"] },
    };

    const results = await syncMCP([], mcps, tmpDir);
    expect(results).toHaveLength(0);

    // No MCP files created
    expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, "opencode.json"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, ".cursor"))).toBe(false);
  });
});
