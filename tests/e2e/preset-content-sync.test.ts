/**
 * Preset Content Sync E2E Test
 * Validates the core v1 feature: presets syncing skills, commands, and agents
 * to holdout tool directories with correct namespace isolation.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents, syncCommands, syncSkills } from "../../src/sync/index.js";
import { getToolProvider, getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile } from "../../src/utils/fs.js";

describe("Preset Content Sync E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-e2e-preset-sync-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: create a filesystem preset with skills, commands, and agents
   */
  async function createPreset(
    name: string,
    content: {
      skills?: Array<{ name: string; body: string }>;
      commands?: Array<{ name: string; body: string }>;
      agents?: Array<{ name: string; body: string }>;
    },
  ): Promise<string> {
    const presetDir = path.join(tmpDir, `preset-${name}`);

    for (const skill of content.skills ?? []) {
      const dir = path.join(presetDir, "skills", skill.name);
      await ensureDir(dir);
      await outputFile(
        path.join(dir, "SKILL.md"),
        `---\ndescription: ${skill.name} skill\n---\n${skill.body}`,
      );
    }

    for (const cmd of content.commands ?? []) {
      await ensureDir(path.join(presetDir, "commands"));
      await outputFile(
        path.join(presetDir, "commands", `${cmd.name}.md`),
        `---\ndescription: ${cmd.name} command\n---\n${cmd.body}`,
      );
    }

    for (const agent of content.agents ?? []) {
      await ensureDir(path.join(presetDir, "agents"));
      await outputFile(
        path.join(presetDir, "agents", `${agent.name}.md`),
        `---\ndescription: ${agent.name} agent\n---\n${agent.body}`,
      );
    }

    return presetDir;
  }

  it("single preset syncs skills, commands, and agents to holdout tool", async () => {
    const presetDir = await createPreset("full", {
      skills: [
        { name: "tdd", body: "# TDD\nWrite tests first." },
        { name: "review", body: "# Review\nReview all changes." },
      ],
      commands: [{ name: "deploy", body: "# Deploy\nDeploy to production." }],
      agents: [
        { name: "reviewer", body: "# Reviewer\nAn automated reviewer." },
      ],
    });

    const presetSkills = new Map([
      ["company", [path.join(presetDir, "skills")]],
    ]);
    const presetCommands = new Map([
      ["company", [path.join(presetDir, "commands")]],
    ]);
    const presetAgents = new Map([
      ["company", [path.join(presetDir, "agents")]],
    ]);

    const providers = [getToolProvider("claude")];

    const skillResults = await syncSkills(providers, tmpDir, presetSkills);
    const cmdResults = await syncCommands(providers, tmpDir, presetCommands);
    const agentResults = await syncAgents(providers, tmpDir, presetAgents);

    // Skills
    expect(skillResults[0].skillCount).toBe(2);
    expect(skillResults[0].skills).toContain("company--tdd");
    expect(skillResults[0].skills).toContain("company--review");

    // Commands
    expect(cmdResults[0].commandCount).toBe(1);

    // Agents
    expect(agentResults[0].agentCount).toBe(1);

    // Verify file content
    const tddContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "company--tdd", "SKILL.md"),
      "utf-8",
    );
    expect(tddContent).toContain("Write tests first");

    const deployContent = await readFile(
      path.join(tmpDir, ".claude", "commands", "company", "deploy.md"),
      "utf-8",
    );
    expect(deployContent).toContain("Deploy to production");
  });

  it("preset with only skills (no commands/agents) syncs without error", async () => {
    const presetDir = await createPreset("skills-only", {
      skills: [{ name: "lint", body: "# Lint\nRun linter." }],
    });

    const presetSkills = new Map([["team", [path.join(presetDir, "skills")]]]);

    const providers = [getToolProvider("claude")];
    const skillResults = await syncSkills(providers, tmpDir, presetSkills);
    const cmdResults = await syncCommands(providers, tmpDir);
    const agentResults = await syncAgents(providers, tmpDir);

    expect(skillResults[0].skillCount).toBe(1);
    expect(skillResults[0].skills).toContain("team--lint");
    expect(cmdResults[0].commandCount).toBe(0);
    expect(agentResults[0].agentCount).toBe(0);
  });

  it("multiple presets merge with namespace isolation across tools", async () => {
    const presetA = await createPreset("alpha", {
      skills: [{ name: "deploy", body: "# Deploy Alpha" }],
      commands: [{ name: "build", body: "# Build Alpha" }],
    });

    const presetB = await createPreset("beta", {
      skills: [{ name: "deploy", body: "# Deploy Beta" }],
      commands: [{ name: "build", body: "# Build Beta" }],
    });

    const presetSkills = new Map([
      ["alpha", [path.join(presetA, "skills")]],
      ["beta", [path.join(presetB, "skills")]],
    ]);
    const presetCommands = new Map([
      ["alpha", [path.join(presetA, "commands")]],
      ["beta", [path.join(presetB, "commands")]],
    ]);

    const providers = getToolProviders(["claude", "cursor"]);
    const skillResults = await syncSkills(providers, tmpDir, presetSkills);
    await syncCommands(providers, tmpDir, presetCommands);

    for (const result of skillResults) {
      if (result.skillCount > 0) {
        expect(result.skillCount).toBe(2);
        expect(result.skills).toContain("alpha--deploy");
        expect(result.skills).toContain("beta--deploy");
      }
    }

    // Verify content differs between namespaces
    const alphaContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "alpha--deploy", "SKILL.md"),
      "utf-8",
    );
    const betaContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "beta--deploy", "SKILL.md"),
      "utf-8",
    );
    expect(alphaContent).toContain("Deploy Alpha");
    expect(betaContent).toContain("Deploy Beta");
  });

  it("preset + project custom skills coexist", async () => {
    // Project custom skill (no namespace)
    const projSkillDir = path.join(tmpDir, ".agents", "skills", "my-custom");
    await ensureDir(projSkillDir);
    await outputFile(
      path.join(projSkillDir, "SKILL.md"),
      "---\ndescription: Custom skill\n---\n# My Custom Skill",
    );

    // Preset skill
    const presetDir = await createPreset("org", {
      skills: [{ name: "standard", body: "# Org Standard" }],
    });

    const presetSkills = new Map([["org", [path.join(presetDir, "skills")]]]);
    const providers = [getToolProvider("cursor")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(2);
    expect(results[0].skills).toContain("my-custom");
    expect(results[0].skills).toContain("org--standard");
  });

  it("missing preset subdirectory does not error", async () => {
    // Preset with only a skills dir — commands/ and agents/ don't exist
    const presetDir = await createPreset("partial", {
      skills: [{ name: "test", body: "# Test" }],
    });

    // Point at non-existent commands/agents dirs
    const presetCommands = new Map([
      ["partial", [path.join(presetDir, "commands")]],
    ]);
    const presetAgents = new Map([
      ["partial", [path.join(presetDir, "agents")]],
    ]);

    const providers = [getToolProvider("claude")];

    // Should not throw
    const cmdResults = await syncCommands(providers, tmpDir, presetCommands);
    const agentResults = await syncAgents(providers, tmpDir, presetAgents);

    expect(cmdResults[0].commandCount).toBe(0);
    expect(agentResults[0].agentCount).toBe(0);
  });

  it("native tools skip preset content (they read .agents/ directly)", async () => {
    const presetDir = await createPreset("native-test", {
      skills: [{ name: "test", body: "# Test skill" }],
    });

    const presetSkills = new Map([
      ["native-test", [path.join(presetDir, "skills")]],
    ]);

    // gemini and opencode are native tools (readsAgentsDir=true)
    const providers = getToolProviders(["gemini", "opencode"]);
    const results = await syncSkills(providers, tmpDir, presetSkills);

    for (const result of results) {
      expect(result.skillCount).toBe(0);
    }
  });
});
