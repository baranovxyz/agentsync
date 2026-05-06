/**
 * Per-Tool Sync E2E Tests
 * Tests sync for each individual tool verifying exact output paths
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolName } from "../../src/constants.js";
import { generateHeader } from "../../src/sync/header.js";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncMCP,
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
      "---\nname: reviewer\n---\n# Reviewer Agent",
    );

    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
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
    await syncMCP(providers, mcps, tmpDir);
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
    it("syncs commands, agents, MCP (opencode format) — skills skipped (readsAgentsDir)", async () => {
      await syncAllForTool("opencode");

      // OpenCode has readsAgentsDir=true — skills are NOT copied to .opencode/skills/
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
    it("syncs skills and MCP only (no commands or agents)", async () => {
      await syncAllForTool("cursor");

      // Skills synced (cursor is holdout tool, readsAgentsDir=false)
      expect(
        await pathExists(
          path.join(tmpDir, ".cursor", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);

      // MCP synced
      expect(await pathExists(path.join(tmpDir, ".cursor", "mcp.json"))).toBe(
        true,
      );

      // No commands dir (Cursor uses rules)
      expect(await pathExists(path.join(tmpDir, ".cursor", "commands"))).toBe(
        false,
      );

      // No agents dir
      expect(await pathExists(path.join(tmpDir, ".cursor", "agents"))).toBe(
        false,
      );

      // Cursor reads AGENTS.md natively (docsFormat=null) — no file created by syncDocs
      // .agents/AGENTS.md still exists as the source
      expect(await pathExists(path.join(tmpDir, ".agents", "AGENTS.md"))).toBe(
        true,
      );
    });
  });

  describe("RooCode", () => {
    it("syncs commands and MCP (skills skipped — readsAgentsDir=true, no agents)", async () => {
      await syncAllForTool("roocode");

      // RooCode has readsAgentsDir=true — skills NOT copied
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
    it("syncs skills to .agents/ shared dir and MCP sidecar", async () => {
      await syncAllForTool("codex");

      // Skills go to .agents/skills/ (shared cross-tool dir)
      expect(
        await pathExists(
          path.join(tmpDir, ".agents", "skills", "tdd", "SKILL.md"),
        ),
      ).toBe(true);

      // MCP sidecar
      expect(await pathExists(path.join(tmpDir, ".codex", "config.toml"))).toBe(
        true,
      );

      // No commands or agents
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
    it("syncs MCP merged into settings.json, GEMINI.md directive (skills skipped — readsAgentsDir)", async () => {
      await syncAllForTool("gemini");

      // Skills NOT copied (readsAgentsDir=true)

      // MCP merged into settings
      const settings = JSON.parse(
        await readFile(path.join(tmpDir, ".gemini", "settings.json"), "utf-8"),
      );
      expect(settings.mcpServers.github.command).toBe("npx");

      // GEMINI.md created with @AGENTS.md directive
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

      // Only holdout tools (readsAgentsDir=false) get copies
      const holdoutPaths = [
        ".claude/skills/tdd/SKILL.md",
        ".cursor/skills/tdd/SKILL.md",
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

      // Source file content should be present after the header
      const sourceContent = await readFile(
        path.join(tmpDir, ".agents", "skills", "tdd", "SKILL.md"),
        "utf-8",
      );
      const header = generateHeader(".agents/skills/tdd/SKILL.md");
      expect(contents[0]).toBe(header + sourceContent);
    });
  });
});
