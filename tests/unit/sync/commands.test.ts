import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { previewCommands, syncCommands } from "../../../src/sync/commands.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { splitFrontmatter } from "../../../src/utils/frontmatter.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Commands Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-cmds-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("copies commands to tool directories", async () => {
    const cmdsDir = path.join(tmpDir, ".agents", "commands");
    await ensureDir(cmdsDir);
    await outputFile(
      path.join(cmdsDir, "commit.md"),
      "---\ndescription: Commit changes\n---\n# Commit",
    );

    const providers = [getToolProvider("claude"), getToolProvider("cursor")];
    const results = await syncCommands(providers, tmpDir);

    expect(results).toHaveLength(2);
    expect(results[0].commandCount).toBe(1);

    const claudeCmd = path.join(tmpDir, ".claude", "commands", "commit.md");
    expect(await pathExists(claudeCmd)).toBe(true);
    const content = await readFile(claudeCmd, "utf-8");
    expect(content).toContain("# Commit");
  });

  it("skips tools that do not support commands", async () => {
    const cmdsDir = path.join(tmpDir, ".agents", "commands");
    await ensureDir(cmdsDir);
    await outputFile(path.join(cmdsDir, "test.md"), "# Test");

    // Codex doesn't support commands
    const providers = [getToolProvider("codex")];
    const results = await syncCommands(providers, tmpDir);

    expect(results[0].commandCount).toBe(0);
    expect(results[0].warnings).toEqual([
      "codex does not support commands; 1 command skipped",
    ]);
  });

  it("handles empty commands directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].commandCount).toBe(0);
  });

  it("prefixes only the first segment of a nested preset command", async () => {
    const presetDir = path.join(tmpDir, "preset-commands");
    await outputFile(
      path.join(presetDir, "nested", "review.md"),
      "# Nested review",
    );

    const results = await syncCommands(
      [getToolProvider("claude")],
      tmpDir,
      new Map([["company", [presetDir]]]),
    );

    const relativePath = path.join("company--nested", "review.md");
    expect(results[0].commands).toEqual([relativePath]);
    expect(
      await readFile(
        path.join(tmpDir, ".claude", "commands", relativePath),
        "utf-8",
      ),
    ).toContain("# Nested review");
  });

  it("does not warn an unsupported tool when no commands exist", async () => {
    const providers = [getToolProvider("codex")];
    const results = await syncCommands(providers, tmpDir);

    expect(results[0].warnings).toEqual([]);
  });

  it("uses current Amp and Augment command contracts without mutating canonical input", async () => {
    const canonical = path.join(tmpDir, ".agents", "commands", "local.md");
    const globalDir = path.join(tmpDir, "global-commands");
    const presetDir = path.join(tmpDir, "preset-commands");
    await outputFile(canonical, "# Local\n");
    await outputFile(path.join(globalDir, "global.md"), "# Global\n");
    await outputFile(path.join(presetDir, "preset.md"), "# Preset\n");

    const providers = [getToolProvider("amp"), getToolProvider("augment")];
    const presets = new Map([["company", [presetDir]]]);
    const options = { globalDirs: [globalDir] };
    const preview = await previewCommands(providers, tmpDir, presets, options);
    const written = await syncCommands(providers, tmpDir, presets, options);

    expect(written).toEqual(preview);
    expect(written[0]).toEqual({
      tool: "amp",
      commandCount: 0,
      commands: [],
      warnings: ["amp does not support commands; 3 commands skipped"],
    });
    expect(written[1]).toMatchObject({
      tool: "augment",
      commandCount: 3,
      commands: ["global.md", "company--preset.md", "local.md"],
      warnings: [],
    });
    expect(await readFile(canonical, "utf-8")).toBe("# Local\n");
    expect(
      await pathExists(path.join(tmpDir, ".agents", "commands", "global.md")),
    ).toBe(false);
    expect(
      await pathExists(
        path.join(tmpDir, ".agents", "commands", "company--preset.md"),
      ),
    ).toBe(false);
    for (const relativePath of written[1].commands) {
      expect(
        await pathExists(
          path.join(tmpDir, ".augment", "commands", relativePath),
        ),
      ).toBe(true);
    }
  });

  it("projects only stable OpenCode command fields with preview/write parity", async () => {
    const body = "Run the release workflow.\r\nKeep this body unchanged.\r\n";
    const content = [
      "---",
      "description: Prepare the release",
      "agent: reviewer",
      "model: anthropic/claude-sonnet-4-20250514",
      "variant: high",
      "subtask: true",
      "argument-hint: <version>",
      "allowed-tools: [Read, Bash]",
      "---",
      body,
    ].join("\r\n");
    const source = path.join(tmpDir, ".agents", "commands", "release.md");
    await outputFile(source, content);

    const [preview] = await previewCommands(
      [getToolProvider("opencode")],
      tmpDir,
    );
    expect(
      await pathExists(
        path.join(tmpDir, ".opencode", "commands", "release.md"),
      ),
    ).toBe(false);

    const [written] = await syncCommands([getToolProvider("opencode")], tmpDir);
    const projected = splitFrontmatter(
      await readFile(
        path.join(tmpDir, ".opencode", "commands", "release.md"),
        "utf-8",
      ),
    );

    expect(written).toEqual(preview);
    expect(written.commandCount).toBe(1);
    expect(projected.fm).toEqual({
      description: "Prepare the release",
      agent: "reviewer",
      model: "anthropic/claude-sonnet-4-20250514",
      variant: "high",
      subtask: true,
    });
    expect(projected.body).toBe(body);
    expect(projected.eol).toBe("\r\n");
    expect(written.warnings).toEqual([
      expect.stringContaining(
        "dropped unsupported frontmatter fields: allowed-tools, argument-hint",
      ),
    ]);
  });

  it("skips OpenCode commands with invalid stable field types", async () => {
    await outputFile(
      path.join(tmpDir, ".agents", "commands", "invalid.md"),
      [
        "---",
        "description: [invalid]",
        "agent: [invalid]",
        "model: 42",
        "variant: false",
        "subtask: 'yes'",
        "---",
        "Invalid command.",
      ].join("\n"),
    );

    const [preview] = await previewCommands(
      [getToolProvider("opencode")],
      tmpDir,
    );
    const [written] = await syncCommands([getToolProvider("opencode")], tmpDir);

    expect(written).toEqual(preview);
    expect(written.commandCount).toBe(0);
    expect(written.commands).toEqual([]);
    const warning = written.warnings.join("\n");
    for (const field of [
      "agent",
      "description",
      "model",
      "subtask",
      "variant",
    ]) {
      expect(warning).toContain(`'${field}'`);
    }
    expect(warning).toContain("skipped");
    expect(
      await pathExists(
        path.join(tmpDir, ".opencode", "commands", "invalid.md"),
      ),
    ).toBe(false);
  });

  it.runIf(process.platform !== "win32")(
    "keeps link mode for unchanged providers and copies transformed commands",
    async () => {
      const content = "# Review\n\nReview the change.\n";
      await outputFile(
        path.join(tmpDir, ".agents", "commands", "review.md"),
        content,
      );

      await syncCommands(
        [getToolProvider("claude"), getToolProvider("opencode")],
        tmpDir,
        undefined,
        { mode: "link" },
      );

      const claudePath = path.join(tmpDir, ".claude", "commands", "review.md");
      const openCodePath = path.join(
        tmpDir,
        ".opencode",
        "commands",
        "review.md",
      );
      expect((await lstat(claudePath)).isSymbolicLink()).toBe(true);
      expect((await lstat(openCodePath)).isSymbolicLink()).toBe(false);
      expect(await readFile(openCodePath, "utf-8")).toBe(content);
    },
  );
});
