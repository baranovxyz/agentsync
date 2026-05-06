/**
 * Preset Namespace Collision Tests
 * Verifies that presets with different namespaces can define same-named skills
 * and both survive in output without collision
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands, syncSkills } from "../../src/sync/index.js";
import { getToolProvider, getToolProviders } from "../../src/tools/index.js";
import { ensureDir, outputFile } from "../../src/utils/fs.js";

describe("Preset Namespace Collision", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-ns-collision-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("two presets with same skill name under different namespaces both survive", async () => {
    // Preset A: company--deploy
    const presetA = path.join(tmpDir, "preset-a", "deploy");
    await ensureDir(presetA);
    await outputFile(path.join(presetA, "SKILL.md"), "# Deploy from Company A");

    // Preset B: team--deploy
    const presetB = path.join(tmpDir, "preset-b", "deploy");
    await ensureDir(presetB);
    await outputFile(path.join(presetB, "SKILL.md"), "# Deploy from Team B");

    const presetSkills = new Map([
      ["company", [path.join(tmpDir, "preset-a")]],
      ["team", [path.join(tmpDir, "preset-b")]],
    ]);

    const providers = [getToolProvider("claude")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(2);
    expect(results[0].skills).toContain("company--deploy");
    expect(results[0].skills).toContain("team--deploy");

    // Both files exist with correct content (flat namespace separator --)
    const companyContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "company--deploy", "SKILL.md"),
      "utf-8",
    );
    expect(companyContent).toContain("Company A");

    const teamContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "team--deploy", "SKILL.md"),
      "utf-8",
    );
    expect(teamContent).toContain("Team B");
  });

  it("three namespaces with overlapping skill names all coexist", async () => {
    // Three presets all have "lint" skill
    for (const [ns, label] of [
      ["alpha", "Alpha"],
      ["beta", "Beta"],
      ["gamma", "Gamma"],
    ] as const) {
      const dir = path.join(tmpDir, `preset-${ns}`, "lint");
      await ensureDir(dir);
      await outputFile(path.join(dir, "SKILL.md"), `# Lint from ${label}`);
    }

    const presetSkills = new Map([
      ["alpha", [path.join(tmpDir, "preset-alpha")]],
      ["beta", [path.join(tmpDir, "preset-beta")]],
      ["gamma", [path.join(tmpDir, "preset-gamma")]],
    ]);

    const providers = getToolProviders(["claude", "cursor"]);
    const results = await syncSkills(providers, tmpDir, presetSkills);

    for (const result of results) {
      expect(result.skillCount).toBe(3);
      expect(result.skills).toContain("alpha--lint");
      expect(result.skills).toContain("beta--lint");
      expect(result.skills).toContain("gamma--lint");
    }

    // Verify each has distinct content
    const alphaContent = await readFile(
      path.join(tmpDir, ".claude", "skills", "alpha--lint", "SKILL.md"),
      "utf-8",
    );
    expect(alphaContent).toContain("Alpha");

    const gammaContent = await readFile(
      path.join(tmpDir, ".cursor", "skills", "gamma--lint", "SKILL.md"),
      "utf-8",
    );
    expect(gammaContent).toContain("Gamma");
  });

  it("project skills (no namespace) coexist with namespaced preset skills", async () => {
    // Project skill (no namespace)
    const projDir = path.join(tmpDir, ".agents", "skills", "deploy");
    await ensureDir(projDir);
    await outputFile(path.join(projDir, "SKILL.md"), "# Project Deploy");

    // Preset with same name
    const presetDir = path.join(tmpDir, "preset", "deploy");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "SKILL.md"), "# Preset Deploy");

    const presetSkills = new Map([["company", [path.join(tmpDir, "preset")]]]);

    const providers = [getToolProvider("cursor")];
    const results = await syncSkills(providers, tmpDir, presetSkills);

    expect(results[0].skillCount).toBe(2);
    expect(results[0].skills).toContain("deploy");
    expect(results[0].skills).toContain("company--deploy");
  });

  it("namespace collision in commands: two presets both define commit.md", async () => {
    const presetA = path.join(tmpDir, "preset-a-cmds");
    await ensureDir(presetA);
    await outputFile(
      path.join(presetA, "commit.md"),
      "---\ndescription: Commit (A)\n---\n# Commit A",
    );

    const presetB = path.join(tmpDir, "preset-b-cmds");
    await ensureDir(presetB);
    await outputFile(
      path.join(presetB, "commit.md"),
      "---\ndescription: Commit (B)\n---\n# Commit B",
    );

    const presetCommands = new Map([
      ["org-a", [presetA]],
      ["org-b", [presetB]],
    ]);

    // Claude supports commands
    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir, presetCommands);

    expect(results[0].commandCount).toBe(2);

    const aContent = await readFile(
      path.join(tmpDir, ".claude", "commands", "org-a", "commit.md"),
      "utf-8",
    );
    expect(aContent).toContain("Commit A");

    const bContent = await readFile(
      path.join(tmpDir, ".claude", "commands", "org-b", "commit.md"),
      "utf-8",
    );
    expect(bContent).toContain("Commit B");
  });

  it("namespace isolation verified across holdout tools simultaneously", async () => {
    const presetX = path.join(tmpDir, "preset-x", "build");
    await ensureDir(presetX);
    await outputFile(path.join(presetX, "SKILL.md"), "# Build X");

    const presetY = path.join(tmpDir, "preset-y", "build");
    await ensureDir(presetY);
    await outputFile(path.join(presetY, "SKILL.md"), "# Build Y");

    const presetSkills = new Map([
      ["x-team", [path.join(tmpDir, "preset-x")]],
      ["y-team", [path.join(tmpDir, "preset-y")]],
    ]);

    const providers = getToolProviders([
      "claude",
      "cursor",
      "roocode",
      "gemini",
    ]);
    const results = await syncSkills(providers, tmpDir, presetSkills);

    // Only holdout tools (claude, cursor) get 2 skills; native tools get 0
    const claudeResult = results.find((r) => r.tool === "claude");
    const cursorResult = results.find((r) => r.tool === "cursor");
    expect(claudeResult?.skillCount).toBe(2);
    expect(cursorResult?.skillCount).toBe(2);

    const roocodeResult = results.find((r) => r.tool === "roocode");
    const geminiResult = results.find((r) => r.tool === "gemini");
    expect(roocodeResult?.skillCount).toBe(0);
    expect(geminiResult?.skillCount).toBe(0);

    // Verify correct content in holdout tools (flat namespace separator --)
    for (const toolDir of [".claude/skills", ".cursor/skills"]) {
      const xContent = await readFile(
        path.join(tmpDir, toolDir, "x-team--build", "SKILL.md"),
        "utf-8",
      );
      expect(xContent).toContain("Build X");

      const yContent = await readFile(
        path.join(tmpDir, toolDir, "y-team--build", "SKILL.md"),
        "utf-8",
      );
      expect(yContent).toContain("Build Y");
    }
  });
});
