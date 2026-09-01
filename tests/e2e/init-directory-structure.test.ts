/**
 * Init Directory Structure E2E Test
 * Tests that init creates the current directory structure:
 * .agents/skills/, commands/, agents/, rules/.
 * Tests agentsync.toml creation with default tools.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../../src/commands/init.js";
import { parseTomlConfig } from "../../src/config/toml-loader.js";
import type { ToolName } from "../../src/constants.js";

describe("Init Directory Structure E2E", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-init-structure-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function runInit(tools?: ToolName[]): Promise<void> {
    await init({ json: true, ...(tools ? { tools } : {}) });
  }

  it("creates exactly the current .agents entries", async () => {
    await runInit(["claude"]);

    const entries = await readdir(path.join(tmpDir, ".agents"));
    expect(entries.sort()).toEqual([
      "agents",
      "agentsync.toml",
      "commands",
      "rules",
      "skills",
    ]);
  });

  it("creates agentsync.toml with specified tools", async () => {
    const tools: ToolName[] = ["claude", "cursor", "gemini"];
    await runInit(tools);

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(tools);
  });

  it("creates agentsync.toml with default tools when none specified", async () => {
    await runInit();

    const configPath = path.join(tmpDir, ".agents", "agentsync.toml");
    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content);
    expect(toml.tools).toEqual(["claude", "opencode", "codex"]);
  });
});
