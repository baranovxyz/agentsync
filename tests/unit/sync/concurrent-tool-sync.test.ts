/**
 * Concurrent Tool Sync Tests
 * Verifies syncing to all 19 tools simultaneously produces correct outputs
 * with no file corruption and consistent content across tools
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { getToolProviders } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

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

describe("Concurrent Tool Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-concurrent-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupFullProject(): Promise<void> {
    // Skills
    const skillDir = path.join(tmpDir, ".agents", "skills", "deploy");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: deploy\n---\n# Deploy Skill\n\nDeploy the application.",
    );

    // Commands
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "review.md"),
      "---\ndescription: Review code\n---\n# Review Command",
    );

    // Agents
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "architect.md"),
      "---\nname: architect\n---\n# Architect Agent",
    );

    // Docs
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# Concurrent Test Project",
    );
  }

  it("creates holdout tool output directories when syncing skills", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    await syncSkills(providers, tmpDir);

    // Holdout tools (readsAgentsDir=false) get skills copied
    const holdoutDirs = [
      ".claude/skills",
      ".cursor/skills",
      ".github/skills", // copilot
    ];

    for (const dir of holdoutDirs) {
      expect(
        await pathExists(path.join(tmpDir, dir, "deploy", "SKILL.md")),
      ).toBe(true);
    }

    // Native tools (readsAgentsDir=true) skip skill copy
    // They read from .agents/skills/ directly (which already has the files)
  });

  it("syncs skills with identical content across holdout tools", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    await syncSkills(providers, tmpDir);

    // Only holdout tools (readsAgentsDir=false) get copies
    const skillPaths = [
      ".claude/skills/deploy/SKILL.md",
      ".cursor/skills/deploy/SKILL.md",
      ".github/skills/deploy/SKILL.md", // copilot
    ];

    const contents: string[] = [];
    for (const p of skillPaths) {
      const content = await readFile(path.join(tmpDir, p), "utf-8");
      contents.push(content);
    }

    // All files should have identical content
    for (const content of contents) {
      expect(content).toBe(contents[0]);
    }
  });

  it("commands only written to claude, opencode, roocode, amp, and augment", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncCommands(providers, tmpDir);

    const commandTools = results.filter((r) => r.commandCount > 0);
    const noCommandTools = results.filter((r) => r.commandCount === 0);

    expect(commandTools).toHaveLength(5);
    expect(commandTools.map((r) => r.tool).sort()).toEqual(
      ["amp", "augment", "claude", "opencode", "roocode"].sort(),
    );
    expect(noCommandTools).toHaveLength(14);
  });

  it("agents written to claude, codex, opencode, copilot, and amazonq", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncAgents(providers, tmpDir);

    const agentTools = results.filter((r) => r.agentCount > 0);
    expect(agentTools).toHaveLength(5);
    expect(agentTools.map((r) => r.tool).sort()).toEqual(
      ["amazonq", "claude", "codex", "copilot", "opencode"].sort(),
    );
  });

  it("MCP configs written to all MCP-capable tools with correct format", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    const mcps = {
      tracker: {
        command: "npx",
        args: ["-y", "@org/tracker"],
        env: { KEY: "val" },
      },
    };

    const results = await syncMCP(providers, mcps, tmpDir);

    // All MCP-capable tools (17 of 19 — Aider and Cline have no MCP) should have MCP
    expect(results.filter((r) => r.serverCount > 0)).toHaveLength(17);

    // OpenCode uses special format
    const oc = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(oc.mcp.tracker.type).toBe("local");
    expect(oc.mcp.tracker.command).toEqual(["npx", "-y", "@org/tracker"]);

    // Gemini merges into settings.json
    const gem = JSON.parse(
      await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
    );
    expect(gem.mcpServers.tracker.command).toBe("npx");

    // Standard tools use mcpServers
    const claude = JSON.parse(
      await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
    );
    expect(claude.mcpServers.tracker.command).toBe("npx");
  });

  it("docs creates CLAUDE.md and GEMINI.md directive files for tools with docsFormat", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);
    const results = await syncDocs(providers, tmpDir);

    // CLAUDE.md should exist with @AGENTS.md directive
    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult?.created).toBe(true);
    expect(claudeResult?.docsFile).toBe("CLAUDE.md");
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    const claudeContent = await readFile(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );
    expect(claudeContent).toBe("@AGENTS.md\n");

    // GEMINI.md should exist with @AGENTS.md directive
    const geminiResult = results.find((r) => r.tool === "gemini");
    expect(geminiResult?.created).toBe(true);
    expect(geminiResult?.docsFile).toBe("GEMINI.md");
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(true);
    const geminiContent = await readFile(
      path.join(tmpDir, "GEMINI.md"),
      "utf-8",
    );
    expect(geminiContent).toBe("@AGENTS.md\n");

    // Other tools use AGENTS.md natively (docsFormat=null)
    const nativeTools = results.filter((r) => r.docsFile === "AGENTS.md");
    expect(nativeTools.length).toBeGreaterThanOrEqual(5);
  });

  it("full pipeline with multiple skills/commands/agents has no cross-contamination", async () => {
    // Create multiple items
    for (const name of ["alpha", "beta", "gamma"]) {
      const dir = path.join(tmpDir, ".agents", "skills", name);
      await ensureDir(dir);
      await outputFile(path.join(dir, "SKILL.md"), `# ${name}`);
    }

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    for (const name of ["cmd-a", "cmd-b"]) {
      await outputFile(
        path.join(tmpDir, ".agents", "commands", `${name}.md`),
        `---\ndescription: ${name}\n---\n# ${name}`,
      );
    }

    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "agent-x.md"),
      "# Agent X",
    );

    const providers = getToolProviders(ALL_TOOLS);

    const skillResults = await syncSkills(providers, tmpDir);
    const cmdResults = await syncCommands(providers, tmpDir);
    const agentResults = await syncAgents(providers, tmpDir);

    // Holdout tools (readsAgentsDir=false) with a skillsDir get skills copied (3 skills)
    // Native tools (readsAgentsDir=true) skip skill copy (0 skills)
    // Tools with no skillsDir (aider) also return 0 skills
    for (const r of skillResults) {
      const provider = providers.find((p) => p.name === r.tool)!;
      if (provider.readsAgentsDir || !provider.paths.skillsDir) {
        expect(r.skillCount).toBe(0);
      } else {
        expect(r.skillCount).toBe(3);
      }
    }

    // Only command-supporting tools have 2 commands
    const cmdSupporting = cmdResults.filter((r) => r.commandCount > 0);
    for (const r of cmdSupporting) {
      expect(r.commandCount).toBe(2);
    }

    // Only agent-supporting tools have 1 agent
    const agentSupporting = agentResults.filter((r) => r.agentCount > 0);
    for (const r of agentSupporting) {
      expect(r.agentCount).toBe(1);
    }
  });

  it("results array always has one entry per provider in order", async () => {
    await setupFullProject();
    const providers = getToolProviders(ALL_TOOLS);

    const skillResults = await syncSkills(providers, tmpDir);
    const cmdResults = await syncCommands(providers, tmpDir);
    const agentResults = await syncAgents(providers, tmpDir);

    expect(skillResults).toHaveLength(19);
    expect(cmdResults).toHaveLength(19);
    expect(agentResults).toHaveLength(19);

    // Order matches provider order
    for (let i = 0; i < ALL_TOOLS.length; i++) {
      expect(skillResults[i].tool).toBe(ALL_TOOLS[i]);
      expect(cmdResults[i].tool).toBe(ALL_TOOLS[i]);
      expect(agentResults[i].tool).toBe(ALL_TOOLS[i]);
    }
  });
});
