import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configLs } from "../../../../src/commands/config/ls.js";
import { ConfigError } from "../../../../src/core/errors.js";
import { outputFile } from "../../../../src/utils/fs.js";

describe("Config List Command", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-ls-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty current config entries when no config exists", async () => {
    await expect(configLs(undefined, { cwd: tmpDir })).resolves.toEqual({
      tools: [],
      mcp: [],
      presets: [],
      skills: [],
      commands: [],
    });
  });

  it("reports an invalid config instead of treating it as empty", async () => {
    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    const original = 'tools = ["claude"]\nunexpected = true\n';
    await outputFile(configPath, original);

    await expect(configLs(undefined, { cwd: tmpDir })).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(await readFile(configPath, "utf-8")).toBe(original);
  });
});
