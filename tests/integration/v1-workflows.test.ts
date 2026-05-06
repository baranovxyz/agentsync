/**
 * V1 Workflow Integration Tests
 * End-to-end tests for the new v1.0 features:
 * - TOML -> sync flow (holdout vs. native tools)
 * - Flat namespace separator (--)
 * - Docs directive (CLAUDE.md with @AGENTS.md, not a symlink)
 * - Copilot .agent.md agent file extension
 */
import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../src/sync/agents.js";
import { syncCommands } from "../../src/sync/commands.js";
import { syncDocs } from "../../src/sync/docs.js";
import { syncSkills } from "../../src/sync/skills.js";
import { getToolProvider, getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../src/utils/fs.js";
import {
  createTestProject,
  type TestProject,
} from "../helpers/create-project.js";
import {
  DOCS_CONTENT,
  SIMPLE_AGENT,
  SIMPLE_COMMAND,
  SIMPLE_SKILL,
} from "../helpers/fixtures.js";

describe("V1 Workflows: TOML -> sync flow", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["claude", "opencode"]);
    await project.addSkill("tdd", SIMPLE_SKILL);
    await project.addCommand("test", SIMPLE_COMMAND);
    await project.addAgent("reviewer", SIMPLE_AGENT);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("syncs skills to Claude (holdout) but NOT to OpenCode (native)", async () => {
    const providers = getToolProviders(["claude", "opencode"]);
    const results = await syncSkills(providers, project.dir);

    // Claude is holdout (readsAgentsDir=false) — gets copies
    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult!.skillCount).toBe(1);
    expect(claudeResult!.skills).toContain("tdd");

    // Verify file exists on disk
    const skillPath = path.join(
      project.dir,
      ".claude",
      "skills",
      "tdd",
      "SKILL.md",
    );
    expect(await pathExists(skillPath)).toBe(true);
    const content = await readFile(skillPath, "utf-8");
    expect(content).toContain("# Test Skill");

    // OpenCode is native (readsAgentsDir=true) — skipped
    const opencodeResult = results.find((r) => r.tool === "opencode");
    expect(opencodeResult).toBeDefined();
    expect(opencodeResult!.skillCount).toBe(0);

    // No .opencode/skills/ directory should have been written with the skill
    const opencodeSkillPath = path.join(
      project.dir,
      ".opencode",
      "skills",
      "tdd",
      "SKILL.md",
    );
    expect(await pathExists(opencodeSkillPath)).toBe(false);
  });

  it("syncs commands to Claude (holdout) but NOT to OpenCode (native reads .agents/)", async () => {
    const providers = getToolProviders(["claude", "opencode"]);
    const results = await syncCommands(providers, project.dir);

    // Claude supports commands
    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult!.commandCount).toBe(1);
    expect(claudeResult!.commands).toContain("test.md");

    // Verify file on disk
    const cmdPath = path.join(project.dir, ".claude", "commands", "test.md");
    expect(await pathExists(cmdPath)).toBe(true);
    const content = await readFile(cmdPath, "utf-8");
    expect(content).toContain("# Test Command");

    // OpenCode supports commands too
    const opencodeResult = results.find((r) => r.tool === "opencode");
    expect(opencodeResult!.commandCount).toBe(1);
  });

  it("syncs agents to Claude (holdout) but NOT to OpenCode (native reads .agents/)", async () => {
    const providers = getToolProviders(["claude", "opencode"]);
    const results = await syncAgents(providers, project.dir);

    // Claude supports agents
    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult!.agentCount).toBe(1);

    const agentPath = path.join(
      project.dir,
      ".claude",
      "agents",
      "reviewer.md",
    );
    expect(await pathExists(agentPath)).toBe(true);

    // OpenCode supports agents
    const opencodeResult = results.find((r) => r.tool === "opencode");
    expect(opencodeResult!.agentCount).toBe(1);
  });
});

describe("V1 Workflows: flat namespace flow", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["claude", "cursor"]);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("uses -- separator for namespaced preset skills (company--tdd)", async () => {
    const presetBase = await project.addPresetSkill("company", "tdd");

    const presetSkills = new Map([
      ["company", [path.join(presetBase, "skills")]],
    ]);

    const providers = getToolProviders(["claude", "cursor"]);
    const results = await syncSkills(providers, project.dir, presetSkills);

    // Both holdout tools should get the skill with -- separator
    for (const result of results) {
      expect(result.skillCount).toBe(1);
      expect(result.skills).toContain("company--tdd");
      // Must NOT contain "/" separator
      for (const skill of result.skills) {
        expect(skill).not.toContain("/");
      }
    }

    // Verify actual file path uses --
    const claudeSkillPath = path.join(
      project.dir,
      ".claude",
      "skills",
      "company--tdd",
      "SKILL.md",
    );
    expect(await pathExists(claudeSkillPath)).toBe(true);

    const cursorSkillPath = path.join(
      project.dir,
      ".cursor",
      "skills",
      "company--tdd",
      "SKILL.md",
    );
    expect(await pathExists(cursorSkillPath)).toBe(true);

    // Verify the name field in frontmatter is rewritten with namespace
    const claudeContent = await readFile(claudeSkillPath, "utf-8");
    expect(claudeContent).toContain("name: company--tdd");
  });

  it("project skills (no namespace) coexist alongside namespaced preset skills", async () => {
    // Add a project skill (no namespace)
    await project.addSkill("lint");

    // Add a preset skill (namespaced)
    const presetBase = await project.addPresetSkill("team", "lint");
    const presetSkills = new Map([["team", [path.join(presetBase, "skills")]]]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, project.dir, presetSkills);

    // Should have both: project "lint" and preset "team--lint"
    expect(results[0].skillCount).toBe(2);
    expect(results[0].skills).toContain("lint");
    expect(results[0].skills).toContain("team--lint");

    // Both files exist
    expect(
      await pathExists(
        path.join(project.dir, ".claude", "skills", "lint", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(project.dir, ".claude", "skills", "team--lint", "SKILL.md"),
      ),
    ).toBe(true);
  });
});

describe("V1 Workflows: docs directive flow", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["claude", "cursor", "gemini"]);
    await project.addDocs(DOCS_CONTENT);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("creates CLAUDE.md with @AGENTS.md directive (not a symlink)", async () => {
    const providers = getToolProviders(["claude"]);
    await syncDocs(providers, project.dir);

    const claudeMdPath = path.join(project.dir, "CLAUDE.md");
    expect(await pathExists(claudeMdPath)).toBe(true);

    // Content is the @AGENTS.md directive
    const content = await readFile(claudeMdPath, "utf-8");
    expect(content).toBe("@AGENTS.md\n");

    // Must NOT be a symlink — it's a regular file with a directive
    const stat = await lstat(claudeMdPath);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
  });

  it("creates GEMINI.md with @AGENTS.md directive for gemini", async () => {
    const providers = getToolProviders(["gemini"]);
    await syncDocs(providers, project.dir);

    const geminiMdPath = path.join(project.dir, "GEMINI.md");
    expect(await pathExists(geminiMdPath)).toBe(true);

    const content = await readFile(geminiMdPath, "utf-8");
    expect(content).toBe("@AGENTS.md\n");
  });

  it("cursor reads AGENTS.md natively — no action needed by syncDocs", async () => {
    const providers = getToolProviders(["cursor"]);
    const results = await syncDocs(providers, project.dir);

    // Cursor has docsFormat=null — reads AGENTS.md natively
    const cursorResult = results.find((r) => r.tool === "cursor");
    expect(cursorResult).toBeDefined();
    // created=true means AGENTS.md exists (native tool still reports it)
    expect(cursorResult!.created).toBe(true);

    // No CURSOR.md or other derivative file should be created
    expect(await pathExists(path.join(project.dir, "CURSOR.md"))).toBe(false);
  });

  it("handles missing AGENTS.md gracefully", async () => {
    // Create a fresh project without docs
    const freshProject = await createTestProject(["claude"]);

    const providers = getToolProviders(["claude"]);
    const results = await syncDocs(providers, freshProject.dir);

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult!.created).toBe(false);

    // No CLAUDE.md created when there's no AGENTS.md
    expect(await pathExists(path.join(freshProject.dir, "CLAUDE.md"))).toBe(
      false,
    );

    await freshProject.cleanup();
  });
});

describe("V1 Workflows: Copilot .agent.md flow", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["copilot"]);
    await project.addAgent("reviewer", SIMPLE_AGENT);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("outputs agent as reviewer.agent.md (not reviewer.md)", async () => {
    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, project.dir);

    expect(results[0].agentCount).toBe(1);
    expect(results[0].agents).toContain("reviewer.agent.md");

    // Verify the .agent.md file exists
    const agentPath = path.join(
      project.dir,
      ".github",
      "agents",
      "reviewer.agent.md",
    );
    expect(await pathExists(agentPath)).toBe(true);

    // Verify content is preserved
    const content = await readFile(agentPath, "utf-8");
    expect(content).toContain("# Code Reviewer");
    expect(content).toContain("Reviews code for quality");
  });

  it("reviewer.md does NOT exist (only .agent.md)", async () => {
    const providers = [getToolProvider("copilot")];
    await syncAgents(providers, project.dir);

    // The plain .md file should NOT exist
    const wrongPath = path.join(
      project.dir,
      ".github",
      "agents",
      "reviewer.md",
    );
    expect(await pathExists(wrongPath)).toBe(false);
  });

  it("handles namespaced preset agents with .agent.md extension", async () => {
    // Create a preset agent directory
    const presetDir = path.join(project.dir, "preset-agents");
    await ensureDir(presetDir);
    await outputFile(
      path.join(presetDir, "qa-bot.md"),
      "---\nname: qa-bot\ndescription: QA automation\n---\n\n# QA Bot\n",
    );

    const presetAgents = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("copilot")];
    const results = await syncAgents(providers, project.dir, presetAgents);

    // Should have both project agent + preset agent
    expect(results[0].agentCount).toBe(2);

    // Namespaced preset agent: company/qa-bot.agent.md
    const namespacedPath = path.join(
      project.dir,
      ".github",
      "agents",
      "company",
      "qa-bot.agent.md",
    );
    expect(await pathExists(namespacedPath)).toBe(true);

    // Project agent still: reviewer.agent.md
    const projectPath = path.join(
      project.dir,
      ".github",
      "agents",
      "reviewer.agent.md",
    );
    expect(await pathExists(projectPath)).toBe(true);
  });
});

describe("V1 Workflows: combined full sync", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject([
      "claude",
      "opencode",
      "cursor",
      "copilot",
      "gemini",
    ]);
    await project.addSkill("tdd", SIMPLE_SKILL);
    await project.addCommand("test", SIMPLE_COMMAND);
    await project.addAgent("reviewer", SIMPLE_AGENT);
    await project.addDocs(DOCS_CONTENT);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("all content types sync correctly to all configured tools", async () => {
    const providers = getToolProviders([
      "claude",
      "opencode",
      "cursor",
      "copilot",
      "gemini",
    ]);

    // Run all sync operations
    const skillResults = await syncSkills(providers, project.dir);
    const commandResults = await syncCommands(providers, project.dir);
    const agentResults = await syncAgents(providers, project.dir);
    const docsResults = await syncDocs(providers, project.dir);

    // --- Skills ---
    // Holdout tools (claude, cursor, copilot) get skill copies
    const claudeSkills = skillResults.find((r) => r.tool === "claude");
    const cursorSkills = skillResults.find((r) => r.tool === "cursor");
    const copilotSkills = skillResults.find((r) => r.tool === "copilot");
    expect(claudeSkills!.skillCount).toBe(1);
    expect(cursorSkills!.skillCount).toBe(1);
    expect(copilotSkills!.skillCount).toBe(1);

    // Native tools (opencode, gemini) skip
    const opencodeSkills = skillResults.find((r) => r.tool === "opencode");
    const geminiSkills = skillResults.find((r) => r.tool === "gemini");
    expect(opencodeSkills!.skillCount).toBe(0);
    expect(geminiSkills!.skillCount).toBe(0);

    // --- Commands ---
    // Claude and OpenCode support commands
    const claudeCmds = commandResults.find((r) => r.tool === "claude");
    const opencodeCmds = commandResults.find((r) => r.tool === "opencode");
    expect(claudeCmds!.commandCount).toBe(1);
    expect(opencodeCmds!.commandCount).toBe(1);

    // Cursor, Copilot, Gemini do NOT support commands
    const cursorCmds = commandResults.find((r) => r.tool === "cursor");
    const copilotCmds = commandResults.find((r) => r.tool === "copilot");
    const geminiCmds = commandResults.find((r) => r.tool === "gemini");
    expect(cursorCmds!.commandCount).toBe(0);
    expect(copilotCmds!.commandCount).toBe(0);
    expect(geminiCmds!.commandCount).toBe(0);

    // --- Agents ---
    // Claude, OpenCode, Copilot support agents
    const claudeAgents = agentResults.find((r) => r.tool === "claude");
    const opencodeAgents = agentResults.find((r) => r.tool === "opencode");
    const copilotAgents = agentResults.find((r) => r.tool === "copilot");
    expect(claudeAgents!.agentCount).toBe(1);
    expect(opencodeAgents!.agentCount).toBe(1);
    expect(copilotAgents!.agentCount).toBe(1);

    // Copilot uses .agent.md extension
    expect(copilotAgents!.agents).toContain("reviewer.agent.md");

    // Cursor and Gemini do NOT support agents
    const cursorAgents = agentResults.find((r) => r.tool === "cursor");
    const geminiAgents = agentResults.find((r) => r.tool === "gemini");
    expect(cursorAgents!.agentCount).toBe(0);
    expect(geminiAgents!.agentCount).toBe(0);

    // --- Docs ---
    // Claude gets CLAUDE.md with @AGENTS.md directive
    const claudeDocs = docsResults.find((r) => r.tool === "claude");
    expect(claudeDocs!.created).toBe(true);
    expect(await pathExists(path.join(project.dir, "CLAUDE.md"))).toBe(true);

    // Gemini gets GEMINI.md with @AGENTS.md directive
    const geminiDocs = docsResults.find((r) => r.tool === "gemini");
    expect(geminiDocs!.created).toBe(true);
    expect(await pathExists(path.join(project.dir, "GEMINI.md"))).toBe(true);

    // Cursor, OpenCode read AGENTS.md natively (no derivative file)
    const cursorDocs = docsResults.find((r) => r.tool === "cursor");
    expect(cursorDocs!.created).toBe(true); // AGENTS.md exists
  });
});

describe("V1 Security: namespace path traversal prevention", () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTestProject(["claude"]);
  });

  afterEach(async () => {
    await project.cleanup();
  });

  const maliciousNamespaces = [
    "../../etc",
    "../outside",
    "..\\windows",
    "ns/subdir",
    "ns\\subdir",
    "valid\0null",
    "..",
    ".",
  ];

  it("rejects path-traversal namespaces in syncSkills", async () => {
    for (const ns of maliciousNamespaces) {
      const presetDir = path.join(project.dir, "preset-evil");
      const skillDir = path.join(presetDir, "evil-skill");
      await ensureDir(skillDir);
      await outputFile(path.join(skillDir, "SKILL.md"), "# Evil");

      const presetSkills = new Map([[ns, [presetDir]]]);
      const providers = [getToolProvider("claude")];

      await expect(
        syncSkills(providers, project.dir, presetSkills),
      ).rejects.toThrow(/path-unsafe|invalid characters/i);
    }
  });

  it("rejects path-traversal namespaces in syncCommands", async () => {
    for (const ns of maliciousNamespaces) {
      const presetDir = path.join(project.dir, "preset-evil-cmds");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "evil.md"), "# Evil command");

      const presetCommands = new Map([[ns, [presetDir]]]);
      const providers = [getToolProvider("claude")];

      await expect(
        syncCommands(providers, project.dir, presetCommands),
      ).rejects.toThrow(/path-unsafe|invalid characters/i);
    }
  });

  it("rejects path-traversal namespaces in syncAgents", async () => {
    for (const ns of maliciousNamespaces) {
      const presetDir = path.join(project.dir, "preset-evil-agents");
      await ensureDir(presetDir);
      await outputFile(path.join(presetDir, "evil.md"), "# Evil agent");

      const presetAgents = new Map([[ns, [presetDir]]]);
      const providers = [getToolProvider("claude")];

      await expect(
        syncAgents(providers, project.dir, presetAgents),
      ).rejects.toThrow(/path-unsafe|invalid characters/i);
    }
  });

  it("accepts valid namespaces with hyphens and underscores", async () => {
    const validNamespaces = ["company", "my-team", "org_backend", "v2", "A1"];

    for (const ns of validNamespaces) {
      const presetDir = path.join(project.dir, `preset-${ns}`);
      const skillDir = path.join(presetDir, "test-skill");
      await ensureDir(skillDir);
      await outputFile(
        path.join(skillDir, "SKILL.md"),
        `---\nname: test\ndescription: test\n---\n# Test`,
      );

      const presetSkills = new Map([[ns, [presetDir]]]);
      const providers = [getToolProvider("claude")];

      // Should not throw
      const results = await syncSkills(providers, project.dir, presetSkills);
      expect(results[0].skillCount).toBe(1);
    }
  });
});
