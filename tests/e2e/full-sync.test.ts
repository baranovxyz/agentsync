/**
 * Full Sync E2E Test
 * Tests the complete sync workflow: init → add content → sync → verify all tools
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
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

describe("Full Sync E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-e2e-full-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupProject(tools: ToolName[]): Promise<void> {
    // Create .agents structure with TOML config
    await ensureDir(path.join(tmpDir, ".agents"));
    const toolsLine = `tools = [${tools.map((t) => `"${t}"`).join(", ")}]`;
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      `${toolsLine}\n`,
    );

    // Create a skill
    const skillDir = path.join(tmpDir, ".agents", "skills", "code-review");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\ndescription: Review code for quality\n---\n\n# Code Review\n\nReview all code changes for quality issues.",
    );

    // Create a command
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      "---\ndescription: Create a conventional commit\nargument-hint: [message]\n---\n\n# Commit Command\n\nCreate a commit following conventional commits.",
    );

    // Create an agent
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Code review agent\n---\n\n# Reviewer Agent\n\nA specialized agent for code review.",
    );

    // Create AGENTS.md
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# Project\n\nTest project for AgentSync E2E.\n\n## Commands\n\n- `pnpm test`\n",
    );
  }

  const testMcps = {
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "test-token" },
    },
  };

  it("syncs skills to holdout tools (readsAgentsDir=false)", async () => {
    const tools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    await setupProject(tools);

    const providers = getToolProviders(tools);
    const results = await syncSkills(providers, tmpDir);

    // Holdout tools (readsAgentsDir=false) get skills copied
    const holdoutPaths = [
      ".claude/skills/code-review/SKILL.md",
      ".cursor/skills/code-review/SKILL.md",
      ".github/skills/code-review/SKILL.md", // copilot
    ];

    for (const expectedPath of holdoutPaths) {
      const fullPath = path.join(tmpDir, expectedPath);
      expect(await pathExists(fullPath)).toBe(true);
      const content = await readFile(fullPath, "utf-8");
      expect(content).toContain("# Code Review");
    }

    // Native tools (readsAgentsDir=true) skip — they read .agents/ directly
    const nativeResults = results.filter((r) =>
      ["opencode", "roocode", "codex", "gemini"].includes(r.tool),
    );
    for (const r of nativeResults) {
      expect(r.skillCount).toBe(0);
    }
  });

  it("syncs commands to tools that support them", async () => {
    const tools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    await setupProject(tools);

    const providers = getToolProviders(tools);
    const results = await syncCommands(providers, tmpDir);

    // Tools that support commands
    const withCommands = results.filter((r) => r.commandCount > 0);
    const withoutCommands = results.filter((r) => r.commandCount === 0);

    // Claude, OpenCode, RooCode support commands
    expect(withCommands.length).toBe(3);
    // Cursor, Codex, Copilot, Gemini do not
    expect(withoutCommands.length).toBe(4);

    // Verify command file content
    const claudeCmd = path.join(tmpDir, ".claude", "commands", "commit.md");
    expect(await pathExists(claudeCmd)).toBe(true);
    const content = await readFile(claudeCmd, "utf-8");
    expect(content).toContain("conventional commit");
  });

  it("syncs agents to tools that support them", async () => {
    const tools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    await setupProject(tools);

    const providers = getToolProviders(tools);
    const results = await syncAgents(providers, tmpDir);

    // Claude, OpenCode, Copilot support agents
    const withAgents = results.filter((r) => r.agentCount > 0);
    expect(withAgents.length).toBe(3);

    // Verify agent file
    const claudeAgent = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(await pathExists(claudeAgent)).toBe(true);
  });

  it("generates docs directive files for claude and gemini", async () => {
    const tools: ToolName[] = ["claude", "cursor", "gemini"];
    await setupProject(tools);

    const providers = getToolProviders(tools);
    await syncDocs(providers, tmpDir);

    // CLAUDE.md created with @AGENTS.md directive
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    const claudeContent = await readFile(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );
    expect(claudeContent).toBe("@AGENTS.md\n");

    // GEMINI.md created with @AGENTS.md directive
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(true);
    const geminiContent = await readFile(
      path.join(tmpDir, "GEMINI.md"),
      "utf-8",
    );
    expect(geminiContent).toBe("@AGENTS.md\n");
  });

  it("syncs MCP servers to all tools", async () => {
    const tools: ToolName[] = [
      "claude",
      "opencode",
      "cursor",
      "roocode",
      "codex",
      "copilot",
      "gemini",
    ];
    await setupProject(tools);

    const providers = getToolProviders(tools);
    await syncMCP(providers, testMcps, tmpDir);

    // Verify each tool's MCP config
    const mcpPaths = [
      ".mcp.json", // Claude
      "opencode.json", // OpenCode
      ".cursor/mcp.json", // Cursor
      ".roo/mcp.json", // RooCode
      ".codex/config.toml", // Codex
      ".vscode/mcp.json", // Copilot (VS Code native format)
      ".gemini/settings.json", // Gemini
    ];

    for (const mcpPath of mcpPaths) {
      const fullPath = path.join(tmpDir, mcpPath);
      expect(await pathExists(fullPath)).toBe(true);

      const raw = await readFile(fullPath, "utf-8");
      const content = fullPath.endsWith(".toml")
        ? (parseToml(raw) as Record<string, unknown>)
        : JSON.parse(raw);
      // Codex: mcp_servers, OpenCode: mcp, Copilot: servers, others: mcpServers
      const servers =
        (content as Record<string, unknown>).mcp_servers ||
        (content as Record<string, unknown>).mcpServers ||
        (content as Record<string, unknown>).mcp ||
        (content as Record<string, unknown>).servers;
      expect(servers).toBeDefined();
      expect(servers.github).toBeDefined();
    }
  });

  it("complete workflow: skills + commands + agents + docs + MCP", async () => {
    const tools: ToolName[] = ["claude", "cursor", "gemini"];
    await setupProject(tools);

    const providers = getToolProviders(tools);

    // Run all sync operations
    const skillResults = await syncSkills(providers, tmpDir);
    const commandResults = await syncCommands(providers, tmpDir);
    const agentResults = await syncAgents(providers, tmpDir);
    await syncDocs(providers, tmpDir);
    await syncMCP(providers, testMcps, tmpDir);

    // Verify totals: claude(1) + cursor(1) + gemini(0, readsAgentsDir=true) = 2
    expect(skillResults.reduce((s, r) => s + r.skillCount, 0)).toBe(2);
    // Only Claude supports commands (Cursor and Gemini don't)
    expect(commandResults.reduce((s, r) => s + r.commandCount, 0)).toBe(1);
    // Only Claude supports agents (Cursor and Gemini don't)
    expect(agentResults.reduce((s, r) => s + r.agentCount, 0)).toBe(1);

    // Verify Claude has everything
    expect(
      await pathExists(
        path.join(tmpDir, ".claude", "skills", "code-review", "SKILL.md"),
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

    // Verify Cursor has skills but not commands or agents
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "skills", "code-review", "SKILL.md"),
      ),
    ).toBe(true);
    // Cursor uses rules, not commands
    expect(await pathExists(path.join(tmpDir, ".cursor", "agents"))).toBe(
      false,
    );

    // Gemini has readsAgentsDir=true, so no skill copy to .gemini/
    // But it still reads from .agents/skills/ natively

    // Verify shared directory
    expect(
      await pathExists(
        path.join(tmpDir, ".agents", "skills", "code-review", "SKILL.md"),
      ),
    ).toBe(true);
  });
});
