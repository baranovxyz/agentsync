/**
 * Command Frontmatter Preservation Test
 * Tests that command .md files with YAML frontmatter (description, argument-hint)
 * pass through sync without modification.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands } from "../../../src/sync/commands.js";
import { generateHeader } from "../../../src/sync/header.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Command Frontmatter Preservation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-cmd-frontmatter-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("preserves description and argument-hint frontmatter", async () => {
    const commandContent = `---
description: Create a conventional commit
argument-hint: [message]
---

# Commit Command

Create a commit following conventional commits format.`;

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "commit.md"),
      commandContent,
    );

    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir);

    const outputPath = path.join(tmpDir, ".claude", "commands", "commit.md");
    expect(await pathExists(outputPath)).toBe(true);
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/commands/commit.md");
    expect(written).toBe(header + commandContent);
  });

  it("preserves complex frontmatter with multiple fields", async () => {
    const commandContent = `---
description: Run comprehensive test suite
argument-hint: <test-pattern> [--coverage] [--watch]
model: claude-sonnet-4-20250514
allowed-tools:
  - Bash
  - Read
disable-model-invocation: true
---

# Test Command

Run tests with optional coverage and watch mode.

## Usage

\`\`\`bash
/test src/**/*.test.ts --coverage
\`\`\``;

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "test.md"),
      commandContent,
    );

    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir);

    const outputPath = path.join(tmpDir, ".claude", "commands", "test.md");
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/commands/test.md");
    expect(written).toBe(header + commandContent);
  });

  it("preserves command without frontmatter", async () => {
    const commandContent = "# Simple Command\n\nDo something simple.";

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "simple.md"),
      commandContent,
    );

    const providers = [getToolProvider("opencode")];
    await syncCommands(providers, tmpDir);

    const outputPath = path.join(tmpDir, ".opencode", "commands", "simple.md");
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/commands/simple.md");
    expect(written).toBe(header + commandContent);
  });

  it("preserves frontmatter across multiple tools simultaneously", async () => {
    const commandContent = `---
description: Deploy to staging environment
argument-hint: <environment> [--force]
---

# Deploy

Deploy the application to the specified environment.`;

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "deploy.md"),
      commandContent,
    );

    const providers = [
      getToolProvider("claude"),
      getToolProvider("opencode"),
      getToolProvider("roocode"),
    ];
    await syncCommands(providers, tmpDir);

    const header = generateHeader(".agents/commands/deploy.md");
    for (const tool of ["claude", "opencode", "roocode"]) {
      const toolDir = tool === "roocode" ? ".roo" : `.${tool}`;
      const outputPath = path.join(tmpDir, toolDir, "commands", "deploy.md");
      expect(
        await pathExists(outputPath),
        `${tool} should have deploy.md`,
      ).toBe(true);
      const written = await readFile(outputPath, "utf-8");
      expect(written).toBe(header + commandContent);
    }
  });

  it("skips tools that do not support commands", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "test.md"),
      "# Test",
    );

    const providers = [
      getToolProvider("cursor"),
      getToolProvider("codex"),
      getToolProvider("copilot"),
      getToolProvider("gemini"),
    ];
    const results = await syncCommands(providers, tmpDir);

    for (const result of results) {
      expect(result.commandCount).toBe(0);
    }
  });

  it("preserves multiple command files with different frontmatter", async () => {
    await ensureDir(path.join(tmpDir, ".agents", "commands"));

    const commands = [
      {
        name: "commit.md",
        content:
          "---\ndescription: Commit changes\nargument-hint: [message]\n---\n\n# Commit",
      },
      {
        name: "review.md",
        content:
          "---\ndescription: Review code\nargument-hint: <file-path>\n---\n\n# Review",
      },
      {
        name: "deploy.md",
        content: "---\ndescription: Deploy app\n---\n\n# Deploy",
      },
    ];

    for (const cmd of commands) {
      await outputFile(
        path.join(tmpDir, ".agents", "commands", cmd.name),
        cmd.content,
      );
    }

    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir);

    for (const cmd of commands) {
      const outputPath = path.join(tmpDir, ".claude", "commands", cmd.name);
      expect(await pathExists(outputPath)).toBe(true);
      const written = await readFile(outputPath, "utf-8");
      const header = generateHeader(`.agents/commands/${cmd.name}`);
      expect(written).toBe(header + cmd.content);
    }
  });

  it("preserves frontmatter with special characters in values", async () => {
    const commandContent = `---
description: "Handle errors: timeout, 404, & connection reset"
argument-hint: "<url> [--timeout=30s]"
---

# Error Handler

Handle various error scenarios.`;

    await ensureDir(path.join(tmpDir, ".agents", "commands"));
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "error-handler.md"),
      commandContent,
    );

    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir);

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "commands",
      "error-handler.md",
    );
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader(".agents/commands/error-handler.md");
    expect(written).toBe(header + commandContent);
  });

  it("preserves preset commands with namespace and frontmatter", async () => {
    const commandContent = `---
description: Company deploy process
argument-hint: <env>
---

# Company Deploy`;

    const presetDir = path.join(tmpDir, "preset-commands");
    await ensureDir(presetDir);
    await outputFile(path.join(presetDir, "deploy.md"), commandContent);

    const presetCommands = new Map([["company", [presetDir]]]);
    const providers = [getToolProvider("claude")];
    await syncCommands(providers, tmpDir, presetCommands);

    const outputPath = path.join(
      tmpDir,
      ".claude",
      "commands",
      "company",
      "deploy.md",
    );
    expect(await pathExists(outputPath)).toBe(true);
    const written = await readFile(outputPath, "utf-8");
    const header = generateHeader("preset:company/deploy.md");
    expect(written).toBe(header + commandContent);
  });
});
