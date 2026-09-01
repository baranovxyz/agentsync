/**
 * Filesystem Preset E2E Tests
 *
 * Filesystem sources use the same canonical preset layout as remote presets:
 * skills/, commands/, and agents/. Any unrelated mcp.json file is ignored. The source is
 * read-only; holdout providers receive namespaced copies.
 */

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sync } from "../../src/commands/sync.js";

describe("Filesystem Preset E2E", () => {
  let projectDir: string;
  let sourceRoot: string;
  let tempHome: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(
      path.join(tmpdir(), "agentsync-filesystem-preset-project-"),
    );
    sourceRoot = await mkdtemp(
      path.join(tmpdir(), "agentsync-filesystem-preset-source-"),
    );
    tempHome = await mkdtemp(
      path.join(tmpdir(), "agentsync-filesystem-preset-home-"),
    );
    await mkdir(path.join(projectDir, ".agents"), { recursive: true });

    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("USERPROFILE", tempHome);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await Promise.all(
      [projectDir, sourceRoot, tempHome].map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  });

  function configForSources(sources: string[]): string {
    return `tools = ["claude"]\nextends = [${sources
      .map((source) => JSON.stringify(`fs:${source}`))
      .join(", ")}]\n`;
  }

  it("materializes namespaced preset content without changing the source", async () => {
    const presetDir = path.join(sourceRoot, "team-preset");
    const skillPath = path.join(presetDir, "skills", "tdd", "SKILL.md");
    const commandPath = path.join(presetDir, "commands", "deploy.md");
    const agentPath = path.join(presetDir, "agents", "reviewer.md");
    const mcpPath = path.join(presetDir, "mcp.json");

    const skillContent =
      "---\nname: tdd\ndescription: Test-driven development\n---\n\n# TDD\nWrite tests first.\n";
    const commandContent =
      "---\ndescription: Deploy safely\n---\n\n# Deploy\nShip the release.\n";
    const agentContent =
      "---\ndescription: Reviews changes\n---\n\n# Reviewer\nCheck every change.\n";
    const mcpContent = `${JSON.stringify(
      {
        mcpServers: {
          presetDocs: {
            command: "node",
            args: ["preset-docs.js"],
          },
        },
      },
      null,
      2,
    )}\n`;

    await Promise.all([
      mkdir(path.dirname(skillPath), { recursive: true }),
      mkdir(path.dirname(commandPath), { recursive: true }),
      mkdir(path.dirname(agentPath), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(skillPath, skillContent),
      writeFile(commandPath, commandContent),
      writeFile(agentPath, agentContent),
      writeFile(mcpPath, mcpContent),
      writeFile(
        path.join(projectDir, ".agents", "agentsync.toml"),
        configForSources([presetDir]),
      ),
    ]);

    await sync({ cwd: projectDir, json: true });

    expect(
      await readFile(
        path.join(
          projectDir,
          ".claude",
          "skills",
          "team-preset--tdd",
          "SKILL.md",
        ),
        "utf-8",
      ),
    ).toBe(
      "---\nname: team-preset--tdd\ndescription: Test-driven development\n---\n\n# TDD\nWrite tests first.\n",
    );
    expect(
      await readFile(
        path.join(projectDir, ".claude", "commands", "team-preset--deploy.md"),
        "utf-8",
      ),
    ).toBe(commandContent);
    expect(
      await readFile(
        path.join(projectDir, ".claude", "agents", "team-preset--reviewer.md"),
        "utf-8",
      ),
    ).toBe(
      "---\nname: team-preset--reviewer\ndescription: Reviews changes\n---\n\n# Reviewer\nCheck every change.\n",
    );
    // MCP activation is config-driven; an unrelated mcp.json is ignored.
    await expect(access(path.join(projectDir, ".mcp.json"))).rejects.toThrow();

    expect(await readFile(skillPath, "utf-8")).toBe(skillContent);
    expect(await readFile(commandPath, "utf-8")).toBe(commandContent);
    expect(await readFile(agentPath, "utf-8")).toBe(agentContent);
    expect(await readFile(mcpPath, "utf-8")).toBe(mcpContent);
  });

  it("isolates same-named content from multiple filesystem presets", async () => {
    const sourceFiles: Array<{ path: string; content: string }> = [];
    const presets = new Map([
      ["alpha", "Alpha review"],
      ["beta", "Beta review"],
    ]);

    for (const [namespace, marker] of presets) {
      const skillPath = path.join(
        sourceRoot,
        namespace,
        "skills",
        "review",
        "SKILL.md",
      );
      const content = `---\nname: review\ndescription: ${marker}\n---\n\n# Review\n${marker}.\n`;
      await mkdir(path.dirname(skillPath), { recursive: true });
      await writeFile(skillPath, content);
      sourceFiles.push({ path: skillPath, content });
    }

    await writeFile(
      path.join(projectDir, ".agents", "agentsync.toml"),
      configForSources([
        path.join(sourceRoot, "alpha"),
        path.join(sourceRoot, "beta"),
      ]),
    );

    await sync({ cwd: projectDir, json: true });

    const alphaOutput = await readFile(
      path.join(projectDir, ".claude", "skills", "alpha--review", "SKILL.md"),
      "utf-8",
    );
    const betaOutput = await readFile(
      path.join(projectDir, ".claude", "skills", "beta--review", "SKILL.md"),
      "utf-8",
    );

    expect(alphaOutput).toContain("name: alpha--review");
    expect(alphaOutput).toContain("Alpha review.");
    expect(betaOutput).toContain("name: beta--review");
    expect(betaOutput).toContain("Beta review.");
    await Promise.all(
      sourceFiles.map(async (source) => {
        expect(await readFile(source.path, "utf-8")).toBe(source.content);
      }),
    );
  });
});
