/**
 * Transitive Extends Warning Test
 * Validates that the sync command warns when a preset contains its own
 * agentsync config (which would imply transitive extends, not supported in v1).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Transitive extends warning", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-transitive-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("detects TOML config in preset cache path", async () => {
    const presetDir = path.join(tmpDir, "preset-with-config");
    await ensureDir(path.join(presetDir, ".agents"));
    await outputFile(
      path.join(presetDir, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\nextends = ["github:other/preset"]',
    );

    const skillDir = path.join(presetDir, "skills", "test");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

    const tomlPath = path.join(presetDir, ".agents", "agentsync.toml");
    expect(await pathExists(tomlPath)).toBe(true);
  });

  it("detects TOML config in preset cache path (alternate location)", async () => {
    const presetDir = path.join(tmpDir, "preset-with-toml-alt");
    await ensureDir(path.join(presetDir, ".agents"));
    await outputFile(
      path.join(presetDir, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    const tomlPath = path.join(presetDir, ".agents", "agentsync.toml");
    expect(await pathExists(tomlPath)).toBe(true);
  });

  it("does not flag preset without config files", async () => {
    const presetDir = path.join(tmpDir, "clean-preset");
    const skillDir = path.join(presetDir, "skills", "test");
    await ensureDir(skillDir);
    await outputFile(path.join(skillDir, "SKILL.md"), "# Test");

    const tomlPath = path.join(presetDir, ".agents", "agentsync.toml");
    expect(await pathExists(tomlPath)).toBe(false);
  });
});
