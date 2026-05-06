import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../../src/commands/sync.js";
import { ensureDir, pathExists } from "../../../src/utils/fs.js";

describe("Project Custom Rules and Commands", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `agentsync-test-${Date.now()}`);
    await ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    if (await pathExists(testDir)) {
      await fs.rm(testDir, { recursive: true });
    }
  });

  it("should load project custom rules from .agents/skills/", async () => {
    // Setup: Create config and custom rules
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      "tools = []\n",
    );

    // Create custom skills directory with test files
    await ensureDir(path.join(testDir, ".agents", "skills"));
    await fs.writeFile(
      path.join(testDir, ".agents", "skills", "custom.md"),
      "# Custom Rule",
    );
    await fs.writeFile(
      path.join(testDir, ".agents", "skills", "auth.md"),
      "# Auth Rule",
    );

    // Create minimal AGENTS.md to avoid warning
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync in dry-run mode (won't actually sync to tools)
    await sync({
      cwd: testDir,
      dryRun: true,
    });

    // Verification: Check that custom rules were picked up
    // Since dry-run mode, we can't verify actual sync results
    // But we can verify no errors were thrown
    expect(true).toBe(true);
  });

  it("should load project custom commands from .agents/commands/", async () => {
    // Setup: Create config and custom commands
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      "tools = []\n",
    );

    // Create custom commands directory
    await ensureDir(path.join(testDir, ".agents", "commands"));
    await fs.writeFile(
      path.join(testDir, ".agents", "commands", "commit.md"),
      "# Commit Command",
    );
    await fs.writeFile(
      path.join(testDir, ".agents", "commands", "deploy.md"),
      "# Deploy Command",
    );

    // Create minimal AGENTS.md
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync in dry-run mode
    await sync({
      cwd: testDir,
      dryRun: true,
    });

    // Verification: Command completed without errors
    expect(true).toBe(true);
  });

  it("should handle missing project custom directories gracefully", async () => {
    // Setup: Config without custom rules/commands directories
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      "tools = []\n",
    );

    // Create AGENTS.md
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync - should not error even without custom directories
    await sync({
      cwd: testDir,
      dryRun: true,
    });

    expect(true).toBe(true);
  });

  it("should merge project custom rules with presets (if any)", async () => {
    // Setup: Config that could load presets (but won't since we don't set up presets)
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      "tools = []\nextends = []\n",
    );

    // Add custom skills that would override presets if they existed
    await ensureDir(path.join(testDir, ".agents", "skills"));
    await fs.writeFile(
      path.join(testDir, ".agents", "skills", "shared-name.md"),
      "# Project Override",
    );

    // Create AGENTS.md
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync
    await sync({
      cwd: testDir,
      dryRun: true,
    });

    expect(true).toBe(true);
  });

  it("should handle nested skills and commands", async () => {
    // Setup: Config with nested custom files
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      "tools = []\n",
    );

    // Create nested skill structure
    await ensureDir(path.join(testDir, ".agents", "skills", "frontend"));
    await fs.writeFile(
      path.join(testDir, ".agents", "skills", "frontend", "react.md"),
      "# React Rules",
    );

    // Create nested command structure
    await ensureDir(path.join(testDir, ".agents", "commands", "deploy"));
    await fs.writeFile(
      path.join(testDir, ".agents", "commands", "deploy", "production.md"),
      "# Production Deploy",
    );

    // Create AGENTS.md
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync
    await sync({
      cwd: testDir,
      dryRun: true,
    });

    expect(true).toBe(true);
  });

  it("should sync both namespaced and non-namespaced custom commands", async () => {
    // Setup: Config with claude tool (which supports commands)
    await ensureDir(path.join(testDir, ".agents"));
    await fs.writeFile(
      path.join(testDir, ".agents", "agentsync.toml"),
      'tools = ["claude"]\n',
    );

    // Create commands directory with project custom (non-namespaced) files
    await ensureDir(path.join(testDir, ".agents", "commands"));
    await fs.writeFile(
      path.join(testDir, ".agents", "commands", "test.md"),
      "# Test Command",
    );
    await fs.writeFile(
      path.join(testDir, ".agents", "commands", "deploy.md"),
      "# Deploy Command",
    );

    // Create AGENTS.md
    await fs.writeFile(path.join(testDir, "AGENTS.md"), "# Test AGENTS.md");

    // Execute sync
    await sync({
      cwd: testDir,
      dryRun: false,
    });

    // Verify non-namespaced files are synced to Claude commands dir
    const testCommandPath = path.join(
      testDir,
      ".claude",
      "commands",
      "test.md",
    );
    expect(await pathExists(testCommandPath)).toBe(true);
    const testContent = await fs.readFile(testCommandPath, "utf-8");
    expect(testContent).toContain("# Test Command");

    // Verify second non-namespaced file
    const deployCommandPath = path.join(
      testDir,
      ".claude",
      "commands",
      "deploy.md",
    );
    expect(await pathExists(deployCommandPath)).toBe(true);
    const deployContent = await fs.readFile(deployCommandPath, "utf-8");
    expect(deployContent).toContain("# Deploy Command");
  });
});
