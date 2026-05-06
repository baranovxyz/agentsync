import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pathExists } from "../../src/utils/fs.js";
import { createTestProject } from "./create-project.js";

describe("TestProject helper", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) await cleanup();
  });

  it("creates a temp directory with config", async () => {
    const project = await createTestProject(["claude", "cursor"]);
    cleanup = project.cleanup;
    expect(
      await pathExists(path.join(project.dir, ".agents", "agentsync.toml")),
    ).toBe(true);
  });

  it("addSkill creates skill directory with SKILL.md", async () => {
    const project = await createTestProject(["claude"]);
    cleanup = project.cleanup;
    await project.addSkill("tdd", "# TDD Skill");
    expect(
      await pathExists(
        path.join(project.dir, ".agents", "skills", "tdd", "SKILL.md"),
      ),
    ).toBe(true);
    const content = await readFile(
      path.join(project.dir, ".agents", "skills", "tdd", "SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("# TDD Skill");
  });

  it("addCommand creates command file", async () => {
    const project = await createTestProject(["claude"]);
    cleanup = project.cleanup;
    await project.addCommand("commit", "# Commit");
    expect(
      await pathExists(
        path.join(project.dir, ".agents", "commands", "commit.md"),
      ),
    ).toBe(true);
  });

  it("addAgent creates agent file", async () => {
    const project = await createTestProject(["claude"]);
    cleanup = project.cleanup;
    await project.addAgent("reviewer", "# Reviewer");
    expect(
      await pathExists(
        path.join(project.dir, ".agents", "agents", "reviewer.md"),
      ),
    ).toBe(true);
  });

  it("addDocs creates AGENTS.md", async () => {
    const project = await createTestProject(["claude"]);
    cleanup = project.cleanup;
    await project.addDocs("# My Project");
    expect(
      await pathExists(path.join(project.dir, ".agents", "AGENTS.md")),
    ).toBe(true);
  });
});
