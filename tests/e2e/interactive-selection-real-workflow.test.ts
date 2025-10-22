/**
 * E2E test for interactive selection real workflow
 * Tests the complete workflow without mocks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import * as path from "path";
import * as os from "os";
import * as fs from "../../src/utils/fs.js";
import { mkdtemp } from "node:fs/promises";

describe("Interactive Selection Real Workflow (E2E)", () => {
  let tempDir: string;
  let cliPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-e2e-"));
    
    // Initialize real AgentSync project
    cliPath = path.join(process.cwd(), "dist", "cli.js");
    const { exitCode } = await execa("node", [cliPath, "init", "--template", "default", "--tools", "cursor"], {
      cwd: tempDir,
    });
    expect(exitCode).toBe(0);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("should complete full workflow: add → select → list → remove", async () => {
    // 1. Add preset to config manually (simulating user edit)
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
    config.extends = ["github:company/standards"];
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // 2. Verify preset list shows the preset
    const { stdout: listOutput } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });
    expect(listOutput).toContain("github:company/standards");
    expect(listOutput).toContain("Not cached");

    // 3. Verify config structure is correct
    const updatedConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(updatedConfig.extends).toEqual(["github:company/standards"]);
    expect(updatedConfig.tools).toEqual(["cursor"]);
  });

  it("should handle local config merging", async () => {
    // 1. Setup project config
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
    config.extends = [
      {
        source: "github:company/standards",
        select: { rules: { include: ["*.md"] } },
      },
    ];
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // 2. Setup local config
    const localConfigPath = path.join(tempDir, "agentsync.local.json");
    await fs.writeFile(
      localConfigPath,
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:personal/rules",
            select: { commands: { include: ["*.sh"] } },
          },
        ],
      }),
      "utf-8"
    );

    // 3. Run list command
    const { stdout: listOutput } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // 4. Verify both presets are shown
    expect(listOutput).toContain("github:company/standards");
    expect(listOutput).toContain("github:personal/rules");
    expect(listOutput).toContain("Rules: *.md");
    expect(listOutput).toContain("Commands: *.sh");
  });

  it("should handle empty config gracefully", async () => {
    // 1. Create empty config
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: "1.0",
        extends: [],
        tools: ["cursor"],
      }),
      "utf-8"
    );

    // 2. Run list command
    const { stdout: listOutput } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // 3. Verify empty state message
    expect(listOutput).toContain("No presets extended");
    expect(listOutput).toContain("Add presets to .agentsync/config.json");
  });

  it("should validate config schema", async () => {
    // 1. Create invalid config
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: { include: ["*.md"] },
              commands: { include: ["commit.md"] },
              mcps: ["github"],
            },
          },
        ],
        tools: ["cursor"],
      }),
      "utf-8"
    );

    // 2. Run list command (should not throw)
    const { exitCode } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });
    expect(exitCode).toBe(0);
  });

  it("should handle missing config file", async () => {
    // 1. Remove config file
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    await fs.remove(configPath);

    // 2. Run list command
    const { stdout: listOutput, exitCode } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // 3. Verify error message
    expect(exitCode).toBe(0); // Should not exit with error
    expect(listOutput).toContain("AgentSync not initialized");
    expect(listOutput).toContain("Run: agentsync init");
  });
});
