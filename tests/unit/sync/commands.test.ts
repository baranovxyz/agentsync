import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCommands } from "../../../src/sync/commands.js";
import { getToolProvider } from "../../../src/tools/index.js";
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
  });

  it("handles empty commands directory", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncCommands(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].commandCount).toBe(0);
  });
});
