/**
 * RooCode Commands Sync Tests
 * Deep tests for RooCode command syncing to .roo/commands/
 * Multiple commands, frontmatter preservation, namespace prefix from presets
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands } from "../../../src/sync/commands.js";
import { generateHeader } from "../../../src/sync/header.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("RooCode Commands Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-roocode-cmd-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const provider = getToolProvider("roocode");

  it("confirms roocode supports commands", () => {
    expect(provider.capabilities.commands).toBe(true);
    expect(provider.paths.commandsDir).toBe(".roo/commands");
  });

  it("copies single command to .roo/commands/", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      "---\ndescription: Create a commit\n---\n# Commit\n\nCreate a conventional commit.",
    );

    const results = await syncCommands([provider], tmpDir);

    expect(results[0].commandCount).toBe(1);
    expect(results[0].commands).toContain("commit.md");

    const output = path.join(tmpDir, ".roo", "commands", "commit.md");
    expect(await pathExists(output)).toBe(true);

    const content = await readFile(output, "utf-8");
    expect(content).toContain("description: Create a commit");
    expect(content).toContain("# Commit");
  });

  it("copies multiple commands", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));

    const commands = [
      {
        name: "commit.md",
        content:
          "---\ndescription: Commit changes\n---\n# Commit\n\nCreate a commit.",
      },
      {
        name: "review.md",
        content:
          "---\ndescription: Review code\nargument-hint: <PR number>\n---\n# Review\n\nReview a pull request.",
      },
      {
        name: "test.md",
        content:
          "---\ndescription: Run tests\n---\n# Test\n\nRun the test suite.",
      },
      {
        name: "deploy.md",
        content:
          "---\ndescription: Deploy application\nargument-hint: <env>\n---\n# Deploy\n\nDeploy to environment.",
      },
    ];

    for (const cmd of commands) {
      await outputFile(
        path.join(tmpDir, ".agents", "commands", cmd.name),
        cmd.content,
      );
    }

    const results = await syncCommands([provider], tmpDir);

    expect(results[0].commandCount).toBe(4);

    for (const cmd of commands) {
      const output = path.join(tmpDir, ".roo", "commands", cmd.name);
      expect(await pathExists(output)).toBe(true);
    }
  });

  it("preserves full frontmatter including description and argument-hint", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    const content =
      "---\ndescription: Authenticate user\nargument-hint: <provider> [scopes]\n---\n# Auth\n\nAuthenticate using OAuth.";
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "auth.md"),
      content,
    );

    await syncCommands([provider], tmpDir);

    const output = await readFile(
      path.join(tmpDir, ".roo", "commands", "auth.md"),
      "utf-8",
    );

    expect(output).toContain("description: Authenticate user");
    expect(output).toContain("argument-hint: <provider> [scopes]");
    expect(output).toContain("# Auth");
    const header = generateHeader(".agents/commands/auth.md");
    expect(output).toBe(header + content);
  });

  it("syncs preset commands with namespace prefix", async () => {
    const presetDir = path.join(tmpDir, "preset-cmds");
    await ensureDir(presetDir);
    await outputFile(
      path.join(presetDir, "lint.md"),
      "---\ndescription: Run linter\n---\n# Lint\n\nRun eslint.",
    );
    await outputFile(
      path.join(presetDir, "format.md"),
      "---\ndescription: Format code\n---\n# Format\n\nRun prettier.",
    );

    const presetCommands = new Map([["company", [presetDir]]]);
    const results = await syncCommands([provider], tmpDir, presetCommands);

    expect(results[0].commandCount).toBe(2);

    // Namespaced as company/lint.md
    const lintPath = path.join(
      tmpDir,
      ".roo",
      "commands",
      "company",
      "lint.md",
    );
    expect(await pathExists(lintPath)).toBe(true);

    const formatPath = path.join(
      tmpDir,
      ".roo",
      "commands",
      "company",
      "format.md",
    );
    expect(await pathExists(formatPath)).toBe(true);

    const lintContent = await readFile(lintPath, "utf-8");
    expect(lintContent).toContain("Run eslint");
  });

  it("project and preset commands coexist", async () => {
    // Project command
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "local-cmd.md"),
      "---\ndescription: Local\n---\n# Local Command",
    );

    // Preset command
    const presetDir = path.join(tmpDir, "preset");
    await ensureDir(presetDir);
    await outputFile(
      path.join(presetDir, "preset-cmd.md"),
      "---\ndescription: Preset\n---\n# Preset Command",
    );

    const presets = new Map([["team", [presetDir]]]);
    const results = await syncCommands([provider], tmpDir, presets);

    expect(results[0].commandCount).toBe(2);

    // Project command at root level
    expect(
      await pathExists(path.join(tmpDir, ".roo", "commands", "local-cmd.md")),
    ).toBe(true);

    // Preset command in namespace directory
    expect(
      await pathExists(
        path.join(tmpDir, ".roo", "commands", "team", "preset-cmd.md"),
      ),
    ).toBe(true);
  });

  it("handles empty commands directory gracefully", async () => {
    const results = await syncCommands([provider], tmpDir);

    expect(results[0].commandCount).toBe(0);
    expect(results[0].commands).toHaveLength(0);
    // .roo/commands dir should NOT be created
    expect(await pathExists(path.join(tmpDir, ".roo", "commands"))).toBe(false);
  });

  it("preserves markdown content exactly as-is", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    const complexContent = [
      "---",
      "description: Complex command",
      "---",
      "",
      "# Complex Command",
      "",
      "## Usage",
      "",
      "```bash",
      "agentsync complex --flag value",
      "```",
      "",
      "## Options",
      "",
      "| Flag | Description |",
      "|------|------------|",
      "| --flag | Some flag |",
      "",
      "Special chars: <>&\"'`[]{}()",
    ].join("\n");

    await outputFile(
      path.join(tmpDir, ".agents", "commands", "complex.md"),
      complexContent,
    );

    await syncCommands([provider], tmpDir);

    const output = await readFile(
      path.join(tmpDir, ".roo", "commands", "complex.md"),
      "utf-8",
    );
    const header = generateHeader(".agents/commands/complex.md");
    expect(output).toBe(header + complexContent);
  });
});
