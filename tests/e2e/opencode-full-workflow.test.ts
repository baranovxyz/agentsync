/**
 * OpenCode Full Workflow E2E Tests
 * Complete end-to-end test for OpenCode: skills, commands, agents all synced
 * to .opencode/, MCP in opencode.json format, AGENTS.md created
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncMCP,
  syncSkills,
} from "../../src/sync/index.js";
import { getToolProvider } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";

describe("OpenCode Full Workflow E2E", () => {
  let tmpDir: string;
  const provider = getToolProvider("opencode");

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-opencode-e2e-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("opencode provider has correct capabilities", () => {
    expect(provider.name).toBe("opencode");
    expect(provider.capabilities.skills).toBe(true);
    expect(provider.capabilities.commands).toBe(true);
    expect(provider.capabilities.agents).toBe(true);
    expect(provider.paths.skillsDir).toBe(".opencode/skills");
    expect(provider.paths.commandsDir).toBe(".opencode/commands");
    expect(provider.paths.agentsDir).toBe(".opencode/agents");
    expect(provider.paths.mcpConfigPath).toBe("opencode.json");
    expect(provider.paths.docsFile).toBe("AGENTS.md");
  });

  it("skips skills copy because readsAgentsDir=true", async () => {
    const skillDir = path.join(tmpDir, ".agents", "skills", "code-review");
    await ensureDir(skillDir);
    await outputFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: code-review\n---\n# Code Review\n\nReview all code changes.",
    );

    const results = await syncSkills([provider], tmpDir);

    // OpenCode has readsAgentsDir=true — skills are NOT copied
    expect(results[0].skillCount).toBe(0);

    // But the skill still exists at .agents/skills/ for OpenCode to read natively
    const source = path.join(
      tmpDir,
      ".agents",
      "skills",
      "code-review",
      "SKILL.md",
    );
    expect(await pathExists(source)).toBe(true);
    const content = await readFile(source, "utf-8");
    expect(content).toContain("# Code Review");
  });

  it("syncs commands to .opencode/commands/", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      "---\ndescription: Create a commit\nargument-hint: [message]\n---\n\n# Commit\n\nCreate a conventional commit.",
    );
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "test.md"),
      "---\ndescription: Run tests\n---\n\n# Test\n\nRun the test suite.",
    );

    const results = await syncCommands([provider], tmpDir);

    expect(results[0].commandCount).toBe(2);

    const commitPath = path.join(tmpDir, ".opencode", "commands", "commit.md");
    expect(await pathExists(commitPath)).toBe(true);
    const commitContent = await readFile(commitPath, "utf-8");
    expect(commitContent).toContain("description: Create a commit");
    expect(commitContent).toContain("argument-hint: [message]");
  });

  it("syncs agents to .opencode/agents/", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "reviewer.md"),
      "---\nname: reviewer\ndescription: Code review agent\n---\n\n# Reviewer\n\nReviews code changes.",
    );

    const results = await syncAgents([provider], tmpDir);

    expect(results[0].agentCount).toBe(1);

    const agentPath = path.join(tmpDir, ".opencode", "agents", "reviewer.md");
    expect(await pathExists(agentPath)).toBe(true);
    const content = await readFile(agentPath, "utf-8");
    expect(content).toContain("# Reviewer");
  });

  it("writes MCP in opencode.json format with type:local and command array", async () => {
    const mcps = {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "github_test_test" },
      },
      postgres: {
        command: "docker",
        args: ["exec", "pg-mcp"],
        env: { PG_URL: "postgresql://localhost/db" },
      },
    };

    await syncMCP([provider], mcps, tmpDir);

    const configPath = path.join(tmpDir, "opencode.json");
    expect(await pathExists(configPath)).toBe(true);

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    expect(config.mcp).toBeDefined();
    expect(Object.keys(config.mcp)).toHaveLength(2);

    // Verify OpenCode-specific format
    const github = config.mcp.github;
    expect(github.type).toBe("local");
    expect(github.command).toEqual([
      "npx",
      "-y",
      "@modelcontextprotocol/server-github",
    ]);
    expect(github.environment.GITHUB_TOKEN).toBe("github_test_test");
    expect(github.enabled).toBe(true);

    const postgres = config.mcp.postgres;
    expect(postgres.type).toBe("local");
    expect(postgres.command).toEqual(["docker", "exec", "pg-mcp"]);
  });

  it("writes URL-based MCP as remote type", async () => {
    const mcps = {
      "remote-api": {
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
    };

    await syncMCP([provider], mcps, tmpDir);

    const config = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );

    const remote = config.mcp["remote-api"];
    expect(remote.type).toBe("remote");
    expect(remote.url).toBe("https://api.example.com/mcp");
    expect(remote.headers.Authorization).toBe("Bearer token");
    expect(remote.enabled).toBe(true);
  });

  it("merges MCP into existing opencode.json without clobbering", async () => {
    // Pre-existing opencode.json with user settings
    await outputFile(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(
        { model: "claude-sonnet-4-5-20250514", theme: "dark", apiKey: "test" },
        null,
        2,
      ),
    );

    const mcps = {
      tracker: { command: "npx", args: ["-y", "@org/tracker"] },
    };

    await syncMCP([provider], mcps, tmpDir);

    const config = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );

    // Existing settings preserved
    expect(config.model).toBe("claude-sonnet-4-5-20250514");
    expect(config.theme).toBe("dark");
    expect(config.apiKey).toBe("test");

    // MCP added
    expect(config.mcp.tracker.type).toBe("local");
    expect(config.mcp.tracker.command).toEqual(["npx", "-y", "@org/tracker"]);
  });

  it("AGENTS.md is the docs file (read natively, docsFormat=null)", async () => {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# OpenCode E2E Project\n\nTest project docs.",
    );

    const results = await syncDocs([provider], tmpDir);

    expect(results[0].docsFile).toBe("AGENTS.md");
    // OpenCode has docsFormat=null, so created = hasAgentsMd check
    expect(results[0].created).toBe(true);
  });

  it("complete workflow: skills + commands + agents + docs + MCP", async () => {
    // Setup project
    const skillDir = path.join(tmpDir, ".agents", "skills", "deploy");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Deploy Skill");

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "release.md"),
      "---\ndescription: Release\n---\n# Release Command",
    );

    await ensureDir(path.join(tmpDir, ".agents", "agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agents", "qa.md"),
      "# QA Agent",
    );

    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# Full Workflow Project",
    );

    const mcps = {
      test: { command: "npx", args: ["test-server"] },
    };

    // Run all sync operations
    const skillResults = await syncSkills([provider], tmpDir);
    const cmdResults = await syncCommands([provider], tmpDir);
    const agentResults = await syncAgents([provider], tmpDir);
    await syncDocs([provider], tmpDir);
    await syncMCP([provider], mcps, tmpDir);

    // Verify counts — OpenCode has readsAgentsDir=true, so skills are NOT copied
    expect(skillResults[0].skillCount).toBe(0);
    expect(cmdResults[0].commandCount).toBe(1);
    expect(agentResults[0].agentCount).toBe(1);

    // Verify command and agent outputs (skills not copied for OpenCode)
    expect(
      await pathExists(
        path.join(tmpDir, ".opencode", "commands", "release.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(path.join(tmpDir, ".opencode", "agents", "qa.md")),
    ).toBe(true);
    expect(await pathExists(path.join(tmpDir, "opencode.json"))).toBe(true);

    // Verify MCP format
    const config = JSON.parse(
      await readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(config.mcp.test.type).toBe("local");
  });
});
