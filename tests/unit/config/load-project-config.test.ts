import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("loadProjectConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-config-shim-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads TOML config when present", async () => {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      'tools = ["cursor", "claude"]\n',
    );

    const { loadProjectConfig } = await import(
      "../../../src/config/load-project-config.js"
    );
    const result = await loadProjectConfig(tmpDir);

    expect(result.config.tools).toContain("cursor");
  });

  it("loads TOML config with multiple tools", async () => {
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(
      path.join(tmpDir, ".agents", "agentsync.toml"),
      'tools = ["cursor", "claude"]\n',
    );

    const { loadProjectConfig } = await import(
      "../../../src/config/load-project-config.js"
    );
    const result = await loadProjectConfig(tmpDir);

    expect(result.config.tools).toContain("cursor");
    expect(result.config.tools).toContain("claude");
  });

  it("throws ConfigError when no config found", async () => {
    const { loadProjectConfig } = await import(
      "../../../src/config/load-project-config.js"
    );

    await expect(loadProjectConfig(tmpDir)).rejects.toThrow(
      /No .* configuration found/,
    );
  });
});
