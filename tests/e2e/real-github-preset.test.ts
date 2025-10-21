/**
 * E2E test using real GitHub preset
 * Tests the full workflow with baranovxyz/agentsync-example-typescript
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "../../src/utils/fs.js";
import { mkdtemp } from "node:fs/promises";
import { execa } from "execa";

describe("Real GitHub Preset Integration", () => {
  let testDir: string;
  let cliPath: string;

  beforeAll(async () => {
    // Create temp test directory
    testDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-e2e-github-"));

    // Use built CLI
    cliPath = path.join(process.cwd(), "dist", "cli.js");

    // Verify CLI exists
    expect(await fs.pathExists(cliPath)).toBe(true);
  });

  afterAll(async () => {
    // Cleanup
    await fs.remove(testDir);
  });

  it("should sync real preset from GitHub", async () => {
    // 1. Create config extending real example preset
    const configDir = path.join(testDir, ".agentsync");
    await fs.ensureDir(configDir);
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify(
        {
          version: "1.0",
          extends: ["github:baranovxyz/agentsync-example-typescript"],
          tools: ["cursor"],
          useSymlinks: false,
        },
        null,
        2
      ),
      "utf-8"
    );

    // 2. Run sync command
    const { stdout, stderr } = await execa("node", [cliPath, "sync"], {
      cwd: testDir,
      timeout: 60000, // 60s for GitHub clone
    });

    // 3. Verify sync completed
    expect(stdout).toContain("Sync complete");

    // 4. Verify rules were created (namespace from preset.json: typescript-example)
    const cursorRulesDir = path.join(testDir, ".cursor", "rules");
    expect(await fs.pathExists(cursorRulesDir)).toBe(true);

    const rules = await fs.readdir(cursorRulesDir);
    expect(rules).toContain("baranovxyz:typescript-strict.mdc");
    expect(rules).toContain("baranovxyz:testing.mdc");
    expect(rules).toContain("baranovxyz:api-design.mdc");

    // 5. Verify commands were created
    const cursorCommandsDir = path.join(testDir, ".cursor", "commands");
    expect(await fs.pathExists(cursorCommandsDir)).toBe(true);

    const commands = await fs.readdir(cursorCommandsDir);
    expect(commands).toContain("baranovxyz:commit.md");
    expect(commands).toContain("baranovxyz:review.md");
    expect(commands).toContain("baranovxyz:test.md");

    // 6. Verify content is correct
    const ruleContent = await fs.readFile(
      path.join(cursorRulesDir, "baranovxyz:typescript-strict.mdc"),
      "utf-8"
    );
    expect(ruleContent).toContain("TypeScript Strict Mode");
    expect(ruleContent).toContain('"strict"'); // JSON has quotes

    // 7. Verify preset cache was created
    const cacheDir = path.join(os.homedir(), ".agentsync", "cache");
    const cachedPresets = await fs.readdir(cacheDir).catch(() => []);
    const hasTypescriptExample = cachedPresets.some(
      (dir) =>
        dir.includes("baranovxyz") &&
        dir.includes("agentsync-example-typescript")
    );
    expect(hasTypescriptExample).toBe(true);
  }, 90000); // 90s timeout for GitHub operations

  it("should update preset cache with --update flag", async () => {
    // 1. Config already exists from previous test

    // 2. Run sync with --update
    try {
      const { stdout } = await execa("node", [cliPath, "sync", "--update"], {
        cwd: testDir,
        timeout: 60000,
      });

      // 3. Verify sync completed
      expect(stdout).toContain("Sync complete");

      // 4. Verify files still exist (re-synced)
      const cursorRulesDir = path.join(testDir, ".cursor", "rules");
      const rules = await fs.readdir(cursorRulesDir);
      expect(rules.length).toBeGreaterThan(0);
    } catch (error) {
      // If GitHub update fails due to network/auth issues, skip test gracefully
      if (
        error instanceof Error &&
        error.message.includes("Failed to update")
      ) {
        console.warn(
          "Skipping GitHub update test due to network/authentication issues"
        );
        return;
      }
      throw error;
    }
  }, 90000);

  it("should preview changes with --dry-run", async () => {
    // 1. Create fresh directory
    const dryRunDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-dry-"));

    try {
      // 2. Create config
      const configDir = path.join(dryRunDir, ".agentsync");
      await fs.ensureDir(configDir);
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify(
          {
            version: "1.0",
            extends: ["github:baranovxyz/agentsync-example-typescript"],
            tools: ["cursor"],
          },
          null,
          2
        ),
        "utf-8"
      );

      // 3. Run with --dry-run
      const { stdout } = await execa("node", [cliPath, "sync", "--dry-run"], {
        cwd: dryRunDir,
        timeout: 60000,
      });

      // 4. Verify preview message
      expect(stdout).toContain("Dry run");

      // 5. Verify NO files were created
      const cursorDir = path.join(dryRunDir, ".cursor");
      expect(await fs.pathExists(cursorDir)).toBe(false);
    } finally {
      await fs.remove(dryRunDir);
    }
  }, 90000);

  it("should list preset with cache metadata", async () => {
    // Run preset list command
    const { stdout } = await execa("node", [cliPath, "preset", "list"], {
      cwd: testDir,
      timeout: 10000,
    });

    // Verify preset is shown
    expect(stdout).toContain("baranovxyz/agentsync-example-typescript");
    expect(stdout).toContain("Namespace:"); // Has namespace field
    expect(stdout).toContain("Cached");
  }, 30000);
});
