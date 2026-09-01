/**
 * Per-Tool Sync E2E Tests
 * Tests sync for each individual tool verifying exact output paths
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../src/constants.js";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncManagedMCP,
  syncSkills,
} from "../../src/sync/index.js";
import { getToolProvider, getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

describe("Per-Tool Sync E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-per-tool-"));

    // Create standard test content
    const skillDir = path.join(tmpDir, ".agents", "skills", "tdd");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development\n---\n\n# TDD Skill\n\nAlways write tests first.",
    );

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      "---\ndescription: Create commit\n---\n# Commit",
    );

    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Review changes\n---\n# Reviewer Agent",
    );

    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Project Docs\n\nStandard project documentation.",
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const mcps = {
    github: {
      command: "npx",
      args: ["-y", "@mcp/github"],
      env: { GITHUB_TOKEN: "tok" },
    },
  };

  async function syncAllForTool(tool: ToolName): Promise<void> {
    const providers = [getToolProvider(tool)];
    await syncSkills(providers, tmpDir);
    await syncCommands(providers, tmpDir);
    await syncAgents(providers, tmpDir);
    await syncDocs(providers, tmpDir);
    await syncManagedMCP(providers, mcps, tmpDir);
  }

  describe("Claude Code", () => {
    it("syncs skills, commands, agents, docs, MCP", async () => {
      await syncAllForTool("claude");

      expect(
        await pathExists(
          path.join(tmpDir, ".claude", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);
      expect(
        await pathExists(path.join(tmpDir, ".claude", "commands", "commit.md")),
      ).toBe(true);
      expect(
        await pathExists(path.join(tmpDir, ".claude", "agents", "reviewer.md")),
      ).toBe(true);
      expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
      expect(await pathExists(path.join(tmpDir, ".mcp.json"))).toBe(true);

      // Verify MCP content
      const mcp = JSON.parse(
        await readFile(path.join(tmpDir, ".mcp.json"), "utf-8"),
      );
      expect(mcp.mcpServers.github.command).toBe("npx");
    });
  });

  describe("OpenCode", () => {
    it("syncs commands, agents, MCP (opencode format) — skills skipped (nativeSkillsDiscovery)", async () => {
      await syncAllForTool("opencode");

      // OpenCode has nativeSkillsDiscovery=true — skills are NOT copied to .opencode/skills/
      // Commands and agents are still synced
      expect(
        await pathExists(
          path.join(tmpDir, ".opencode", "commands", "commit.md"),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          path.join(tmpDir, ".opencode", "agents", "reviewer.md"),
        ),
      ).toBe(true);

      // Verify OpenCode-specific MCP format
      const config = JSON.parse(
        await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
      );
      expect(config.mcp.github.type).toBe("local");
      expect(config.mcp.github.command).toEqual(["npx", "-y", "@mcp/github"]);
      expect(config.mcp.github.environment.GITHUB_TOKEN).toBe("tok");
    });
  });

  describe("Cursor", () => {
    it("reads canonical skills and generates commands, agents, and MCP", async () => {
      await syncAllForTool("cursor");

      // Cursor reads the canonical skill in place; no duplicate is generated.
      expect(
        await pathExists(
          path.join(tmpDir, ".agents", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);
      expect(await pathExists(path.join(tmpDir, ".cursor", "skills"))).toBe(
        false,
      );

      // MCP synced
      expect(await pathExists(path.join(tmpDir, ".cursor", "mcp.json"))).toBe(
        true,
      );

      expect(
        await pathExists(path.join(tmpDir, ".cursor", "commands", "commit.md")),
      ).toBe(true);
      expect(
        await pathExists(path.join(tmpDir, ".cursor", "agents", "reviewer.md")),
      ).toBe(true);

      // Cursor reads the canonical root file natively.
      expect(await pathExists(path.join(tmpDir, "AGENTS.md"))).toBe(true);
    });
  });

  describe("RooCode", () => {
    it("syncs commands and MCP (skills skipped — nativeSkillsDiscovery=true, no agents)", async () => {
      await syncAllForTool("roocode");

      // RooCode has nativeSkillsDiscovery=true — skills NOT copied
      // Commands are still synced
      expect(
        await pathExists(path.join(tmpDir, ".roo", "commands", "commit.md")),
      ).toBe(true);
      expect(await pathExists(path.join(tmpDir, ".roo", "mcp.json"))).toBe(
        true,
      );

      // No agents
      expect(await pathExists(path.join(tmpDir, ".roo", "agents"))).toBe(false);
    });
  });

  describe("Codex CLI", () => {
    it("syncs skills to .agents/ shared dir, MCP sidecar, and subagents (md + toml + config merge)", async () => {
      await syncAllForTool("codex");

      // Skills go to .agents/skills/ (shared cross-tool dir)
      expect(
        await pathExists(
          path.join(tmpDir, ".agents", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);

      // MCP sidecar + agents in same config.toml
      expect(await pathExists(path.join(tmpDir, ".codex", "config.toml"))).toBe(
        true,
      );

      // Subagent md body copied
      expect(
        await pathExists(path.join(tmpDir, ".codex", "agents", "reviewer.md")),
      ).toBe(true);

      // Subagent role-config TOML wrapper
      expect(
        await pathExists(
          path.join(tmpDir, ".codex", "agents", "reviewer.toml"),
        ),
      ).toBe(true);

      // No commands (cx uses skills for those)
      expect(await pathExists(path.join(tmpDir, ".codex", "commands"))).toBe(
        false,
      );
    });
  });

  describe("Copilot CLI", () => {
    it("syncs skills and agents (.agent.md) to .github/, MCP to .copilot/", async () => {
      await syncAllForTool("copilot");

      // Skills
      expect(
        await pathExists(
          path.join(tmpDir, ".github", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);

      // Agents with .agent.md extension
      expect(
        await pathExists(
          path.join(tmpDir, ".github", "agents", "reviewer.agent.md"),
        ),
      ).toBe(true);

      // MCP (VS Code native format)
      expect(await pathExists(path.join(tmpDir, ".vscode", "mcp.json"))).toBe(
        true,
      );

      // No commands
      expect(await pathExists(path.join(tmpDir, ".github", "commands"))).toBe(
        false,
      );
    });
  });

  describe("Gemini CLI", () => {
    it("syncs MCP merged into settings.json, GEMINI.md directive (skills skipped — nativeSkillsDiscovery)", async () => {
      await syncAllForTool("gemini");

      // Skills NOT copied (nativeSkillsDiscovery=true)

      // MCP merged into settings
      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
      );
      expect(settings.mcpServers.github.command).toBe("npx");

      expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(true);
      const geminiContent = await readFile(
        path.join(tmpDir, "GEMINI.md"),
        "utf-8",
      );
      expect(geminiContent).toBe("@AGENTS.md\n");

      // No commands or agents dirs
      expect(await pathExists(path.join(tmpDir, ".gemini", "commands"))).toBe(
        false,
      );
      expect(await pathExists(path.join(tmpDir, ".gemini", "agents"))).toBe(
        false,
      );
    });
  });

  describe("Cross-tool skill content integrity", () => {
    it("holdout tools receive identical skill content", async () => {
      const allTools: ToolName[] = [
        "claude",
        "opencode",
        "cursor",
        "roocode",
        "codex",
        "copilot",
        "gemini",
      ];
      const providers = getToolProviders(allTools);
      await syncSkills(providers, tmpDir);

      // Only holdout tools get copies; Cursor reads the source natively.
      const holdoutPaths = [
        ".claude/skills/tdd/SKILL.md",
        ".github/skills/tdd/SKILL.md", // copilot
      ];

      const contents: string[] = [];
      for (const sp of holdoutPaths) {
        const fullPath = path.join(tmpDir, sp);
        expect(await pathExists(fullPath)).toBe(true);
        contents.push(await readFile(fullPath, "utf-8"));
      }

      // All should be identical
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0]);
      }

      const sourceContent = await readFile(
        path.join(tmpDir, ".agents", "skills", "tdd", "SKILL.md"),
        "utf-8",
      );
      expect(contents[0]).toBe(sourceContent);
    });
  });
});
