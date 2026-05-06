/**
 * Sync Write Order Tests
 * Validates that project custom content wins over preset content on collision.
 * Per merge semantics spec (Section 3, Scenario C): project custom layer
 * has higher specificity than preset layer.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncAgents } from "../../../src/sync/agents.js";
import { syncCommands } from "../../../src/sync/commands.js";
import { syncSkills } from "../../../src/sync/skills.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("Sync write order: project custom wins over preset", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-order-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("project custom skill overwrites preset skill with same namespaced name", async () => {
    // Preset produces "acme--tdd" skill
    const presetSkills = path.join(tmpDir, "preset", "skills");
    const presetSkillDir = path.join(presetSkills, "tdd");
    await ensureDir(presetSkillDir);
    await outputFile(
      path.join(presetSkillDir, "SKILL.md"),
      "---\ndescription: tdd\n---\n# Preset TDD Content",
    );

    // Project custom skill with the exact namespace-format name "acme--tdd"
    const customSkillDir = path.join(tmpDir, ".agents", "skills", "acme--tdd");
    await ensureDir(customSkillDir);
    await outputFile(
      path.join(customSkillDir, "SKILL.md"),
      "---\ndescription: custom override\n---\n# Custom Override TDD",
    );

    const presets = new Map([["acme", [presetSkills]]]);
    const providers = [getToolProvider("claude")];
    await syncSkills(providers, tmpDir, presets);

    const content = await readFile(
      path.join(tmpDir, ".claude", "skills", "acme--tdd", "SKILL.md"),
      "utf-8",
    );

    // Project custom must win (higher specificity layer)
    expect(content).toContain("Custom Override TDD");
    expect(content).not.toContain("Preset TDD Content");
  });

  it("project custom command overwrites preset command with same path", async () => {
    // Preset command
    const presetCmds = path.join(tmpDir, "preset", "commands");
    await ensureDir(presetCmds);
    await outputFile(
      path.join(presetCmds, "deploy.md"),
      "---\ndescription: deploy\n---\n# Preset Deploy",
    );

    // Project custom command that will collide with namespaced "acme/deploy.md"
    const customCmdDir = path.join(tmpDir, ".agents", "commands", "acme");
    await ensureDir(customCmdDir);
    await outputFile(
      path.join(customCmdDir, "deploy.md"),
      "---\ndescription: custom deploy\n---\n# Custom Deploy",
    );

    const presets = new Map([["acme", [presetCmds]]]);
    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir, presets);

    const content = await readFile(
      path.join(tmpDir, ".claude", "commands", "acme", "deploy.md"),
      "utf-8",
    );

    // Project custom must win
    expect(content).toContain("Custom Deploy");
    expect(content).not.toContain("Preset Deploy");
  });

  it("project custom agent overwrites preset agent with same path", async () => {
    // Preset agent
    const presetAgents = path.join(tmpDir, "preset", "agents");
    await ensureDir(presetAgents);
    await outputFile(
      path.join(presetAgents, "reviewer.md"),
      "---\ndescription: reviewer\n---\n# Preset Reviewer",
    );

    // Project custom agent that will collide with namespaced "acme/reviewer.md"
    const customAgentDir = path.join(tmpDir, ".agents", "agents", "acme");
    await ensureDir(customAgentDir);
    await outputFile(
      path.join(customAgentDir, "reviewer.md"),
      "---\ndescription: custom reviewer\n---\n# Custom Reviewer",
    );

    const presets = new Map([["acme", [presetAgents]]]);
    const providers = [getToolProvider("claude")];
    await syncAgents(providers, tmpDir, presets);

    const content = await readFile(
      path.join(tmpDir, ".claude", "agents", "acme", "reviewer.md"),
      "utf-8",
    );

    // Project custom must win
    expect(content).toContain("Custom Reviewer");
    expect(content).not.toContain("Preset Reviewer");
  });
});
