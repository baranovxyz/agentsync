import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Global content in sync plan", () => {
  let tmpDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-global-test-"));
    fakeHome = path.join(tmpDir, "home");
    await ensureDir(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("discovers global skill dirs when ~/.agents/skills/ exists", async () => {
    // Create global skills directory
    const globalSkillsDir = path.join(fakeHome, ".agents", "skills");
    await ensureDir(globalSkillsDir);

    // Mock getGlobalConfigDir to return our fake home
    vi.doMock("../../../src/utils/global-config.js", () => ({
      getGlobalConfigDir: () => path.join(fakeHome, ".agents"),
      getGlobalConfigPath: () => path.join(fakeHome, ".agents", "config.toml"),
      loadGlobalConfig: async () => null,
    }));

    // Create a minimal project config so buildSyncPlan doesn't throw
    const projectDir = path.join(tmpDir, "project");
    await ensureDir(path.join(projectDir, ".agents"));
    await outputFile(
      path.join(projectDir, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    // buildSyncPlan walks up to find .git
    await ensureDir(path.join(projectDir, ".git"));

    const { buildSyncPlan } = await import("../../../src/sync/plan.js");
    const plan = await buildSyncPlan({ cwd: projectDir });

    expect(plan.hierarchySkillDirs).toEqual([globalSkillsDir]);
    expect(plan.hierarchyCommandDirs).toEqual([]);
    expect(plan.hierarchyAgentDirs).toEqual([]);
  });

  it("discovers all global content dirs when they exist", async () => {
    const globalAgentsBase = path.join(fakeHome, ".agents");
    await ensureDir(path.join(globalAgentsBase, "skills"));
    await ensureDir(path.join(globalAgentsBase, "commands"));
    await ensureDir(path.join(globalAgentsBase, "agents"));

    vi.doMock("../../../src/utils/global-config.js", () => ({
      getGlobalConfigDir: () => globalAgentsBase,
      getGlobalConfigPath: () => path.join(globalAgentsBase, "config.toml"),
      loadGlobalConfig: async () => null,
    }));

    const projectDir = path.join(tmpDir, "project2");
    await ensureDir(path.join(projectDir, ".agents"));
    await outputFile(
      path.join(projectDir, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    await ensureDir(path.join(projectDir, ".git"));

    const { buildSyncPlan } = await import("../../../src/sync/plan.js");
    const plan = await buildSyncPlan({ cwd: projectDir });

    expect(plan.hierarchySkillDirs).toEqual([
      path.join(globalAgentsBase, "skills"),
    ]);
    expect(plan.hierarchyCommandDirs).toEqual([
      path.join(globalAgentsBase, "commands"),
    ]);
    expect(plan.hierarchyAgentDirs).toEqual([
      path.join(globalAgentsBase, "agents"),
    ]);
  });

  it("returns empty arrays when no global dirs exist", async () => {
    // No global dirs created — fakeHome/.agents/ doesn't even exist
    vi.doMock("../../../src/utils/global-config.js", () => ({
      getGlobalConfigDir: () => path.join(fakeHome, ".agents"),
      getGlobalConfigPath: () => path.join(fakeHome, ".agents", "config.toml"),
      loadGlobalConfig: async () => null,
    }));

    const projectDir = path.join(tmpDir, "project3");
    await ensureDir(path.join(projectDir, ".agents"));
    await outputFile(
      path.join(projectDir, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );
    await ensureDir(path.join(projectDir, ".git"));

    const { buildSyncPlan } = await import("../../../src/sync/plan.js");
    const plan = await buildSyncPlan({ cwd: projectDir });

    expect(plan.hierarchySkillDirs).toEqual([]);
    expect(plan.hierarchyCommandDirs).toEqual([]);
    expect(plan.hierarchyAgentDirs).toEqual([]);
  });

  it("does not duplicate global skills dir when agentsync.toml is in the discovery chain", async () => {
    // Simulate: git root is above the project (e.g., home dir is a git repo),
    // so discoverConfigChain walks through ~/.agents/agentsync.toml on its way up.
    // Plan pass 1 already adds ~/.agents/skills/ explicitly — pass 2 must not add it again.
    const fakeHomeAgents = path.join(fakeHome, ".agents");
    const globalSkillsDir = path.join(fakeHomeAgents, "skills");
    await ensureDir(globalSkillsDir);
    await ensureDir(path.join(fakeHomeAgents, "commands"));
    await ensureDir(path.join(fakeHomeAgents, "agents"));
    // This agentsync.toml makes the home-level .agents/ appear in discoverConfigChain
    await outputFile(
      path.join(fakeHomeAgents, "agentsync.toml"),
      'tools = ["claude"]\n',
    );
    // .git at the fake-home level — chain walk stops here after collecting home-level config
    await ensureDir(path.join(fakeHome, ".git"));

    const projectDir = path.join(fakeHome, "project");
    await ensureDir(path.join(projectDir, ".agents"));
    await outputFile(
      path.join(projectDir, ".agents", "agentsync.toml"),
      'tools = ["claude"]\n',
    );

    vi.doMock("../../../src/utils/global-config.js", () => ({
      getGlobalConfigDir: () => fakeHomeAgents,
      getGlobalConfigPath: () => path.join(fakeHomeAgents, "config.toml"),
      loadGlobalConfig: async () => null,
    }));

    const { buildSyncPlan } = await import("../../../src/sync/plan.js");
    const plan = await buildSyncPlan({ cwd: projectDir });

    const skillsDirCount = plan.hierarchySkillDirs.filter(
      (d) => path.resolve(d) === path.resolve(globalSkillsDir),
    ).length;
    const commandsDirCount = plan.hierarchyCommandDirs.filter(
      (d) =>
        path.resolve(d) === path.resolve(path.join(fakeHomeAgents, "commands")),
    ).length;
    const agentsDirCount = plan.hierarchyAgentDirs.filter(
      (d) =>
        path.resolve(d) === path.resolve(path.join(fakeHomeAgents, "agents")),
    ).length;

    expect(skillsDirCount).toBe(1);
    expect(commandsDirCount).toBe(1);
    expect(agentsDirCount).toBe(1);
  });
});

describe("Global content sync execution", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-global-exec-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("syncs global skills with lowest priority", async () => {
    const { syncSkills } = await import("../../../src/sync/skills.js");
    const { getToolProvider } = await import("../../../src/tools/index.js");

    // Create a global skill
    const globalSkillsDir = path.join(tmpDir, "global-skills");
    const globalSkillDir = path.join(globalSkillsDir, "my-global-skill");
    await ensureDir(globalSkillDir);
    await outputFile(
      path.join(globalSkillDir, "SKILL.md"),
      "---\nname: my-global-skill\n---\n# Global Skill",
    );

    // Create a project skill with the same name (should overwrite)
    const projectSkillsDir = path.join(
      tmpDir,
      ".agents",
      "skills",
      "my-global-skill",
    );
    await ensureDir(projectSkillsDir);
    await outputFile(
      path.join(projectSkillsDir, "SKILL.md"),
      "---\nname: my-global-skill\n---\n# Project Skill (wins)",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, undefined, {
      globalDirs: [globalSkillsDir],
    });

    expect(results[0].skills).toContain("my-global-skill");

    // The project version should win (written last)
    const { readFile } = await import("node:fs/promises");
    const outputPath = path.join(
      tmpDir,
      ".claude",
      "skills",
      "my-global-skill",
      "SKILL.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("Project Skill (wins)");
  });

  it("syncs global commands with lowest priority", async () => {
    const { syncCommands } = await import("../../../src/sync/commands.js");
    const { getToolProvider } = await import("../../../src/tools/index.js");

    // Create a global command
    const globalCommandsDir = path.join(tmpDir, "global-commands");
    await ensureDir(globalCommandsDir);
    await outputFile(
      path.join(globalCommandsDir, "my-cmd.md"),
      "---\ndescription: Global command\n---\n# Global Command",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir, undefined, {
      globalDirs: [globalCommandsDir],
    });

    expect(results[0].commands).toContain("my-cmd.md");
  });

  it("syncs global agents with lowest priority", async () => {
    const { syncAgents } = await import("../../../src/sync/agents.js");
    const { getToolProvider } = await import("../../../src/tools/index.js");

    // Create a global agent
    const globalAgentsDir = path.join(tmpDir, "global-agents");
    await ensureDir(globalAgentsDir);
    await outputFile(
      path.join(globalAgentsDir, "my-agent.md"),
      "---\ndescription: Global agent\n---\n# Global Agent",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncAgents(providers, tmpDir, undefined, {
      globalDirs: [globalAgentsDir],
    });

    expect(results[0].agents).toContain("my-agent.md");
  });
});
