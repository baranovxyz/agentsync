/**
 * Integration tests for interactive selection workflow
 * Tests the actual file system operations without mocks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import * as path from "path";
import * as os from "os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { mkdir } from "node:fs/promises";

// Helper functions for file operations
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function outputFile(file: string, data: string): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  await writeFile(file, data, "utf-8");
}

async function remove(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

describe("Interactive Selection Workflow (Integration)", () => {
  let tempDir: string;
  let cliPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-selection-"));
    cliPath = path.join(process.cwd(), "dist", "cli.js");

    // Create real config
    await ensureDir(path.join(tempDir, ".agentsync"));
    await outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: ["github:company/standards"],
        tools: ["cursor"],
      })
    );
  });

  afterEach(async () => {
    await remove(tempDir);
  });

  it("should list presets with selections", async () => {
    // Setup config with selection
    await outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: {
              rules: { include: ["*.md"] },
              commands: { include: ["commit.md"] },
            },
          },
        ],
        tools: ["cursor"],
      })
    );

    // Run list command
    const { stdout } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // Verify output shows selections
    expect(stdout).toContain("github:company/standards");
    expect(stdout).toContain("Rules: *.md");
    expect(stdout).toContain("Commands: commit.md");
  });

  it("should merge project and local configs", async () => {
    // Setup project config
    await outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:company/standards",
            select: { rules: { include: ["*.md"] } },
          },
        ],
        tools: ["cursor"],
      })
    );

    // Setup local config
    await outputFile(
      path.join(tempDir, "agentsync.local.json"),
      JSON.stringify({
        version: "1.0",
        extends: [
          {
            source: "github:personal/rules",
            select: { commands: { include: ["*.sh"] } },
          },
        ],
      })
    );

    // Run list command
    const { stdout } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // Verify both presets shown
    expect(stdout).toContain("github:company/standards");
    expect(stdout).toContain("github:personal/rules");
  });

  it("should handle empty selections gracefully", async () => {
    // Setup config with no selections
    await outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
      JSON.stringify({
        version: "1.0",
        extends: ["github:company/standards"],
        tools: ["cursor"],
      })
    );

    // Run list command
    const { stdout } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });

    // Should not show selections section
    expect(stdout).toContain("github:company/standards");
    expect(stdout).not.toContain("Selections:");
  });

  it("should validate config schema", async () => {
    // Create config with selections
    await outputFile(
      path.join(tempDir, ".agentsync", "config.json"),
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
      })
    );

    // Run list command (should not throw)
    const { exitCode } = await execa("node", [cliPath, "preset", "list"], {
      cwd: tempDir,
    });
    expect(exitCode).toBe(0);
  });

  it("should handle missing config file", async () => {
    // Remove config file
    const configPath = path.join(tempDir, ".agentsync", "config.json");
    await remove(configPath);

    // Run list command
    const { stdout, exitCode } = await execa(
      "node",
      [cliPath, "preset", "list"],
      {
        cwd: tempDir,
      }
    );

    // Verify error message
    expect(exitCode).toBe(0); // Should not exit with error
    expect(stdout).toContain("AgentSync not initialized");
    expect(stdout).toContain("Run: agentsync init");
  });
});
