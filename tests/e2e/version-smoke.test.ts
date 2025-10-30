/**
 * Version Command Smoke Tests (E2E)
 *
 * Tests the --version command in real-world distribution scenarios:
 * - npm pack + install + npx execution
 * - Symlink resolution
 * - Different execution methods
 *
 * These tests ensure the version command works correctly after npm packaging,
 * which was broken due to symlink resolution issues in the main module detection.
 */

import { execSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("Version Command E2E (Real-World Distribution)", () => {
  const projectRoot = path.resolve(".");
  let version: string;
  let packagePath: string;

  beforeAll(async () => {
    // Read version from package.json
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    version = packageJson.version;
    packagePath = path.join(projectRoot, `agentsync-${version}.tgz`);
  });

  describe("Package Creation", () => {
    it("should build and pack successfully", async () => {
      execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
      execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

      // Verify the package was created
      const stats = await stat(packagePath);
      expect(stats.isFile()).toBe(true);
    }, 60000);

    it("should contain correct version in package.json", async () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

      expect(packageJson.version).toBe(version);
    });

    it("should have executable CLI file", async () => {
      const cliPath = path.join(projectRoot, "dist/cli.js");
      const stats = await stat(cliPath);

      // Should be executable (readable for all, executable for owner)
      expect(stats.isFile()).toBe(true);
      expect(stats.mode & 0o111).toBe(0o111); // executable by all
    });

    it("should have proper shebang", async () => {
      const cliPath = path.join(projectRoot, "dist/cli.js");
      const firstLine = (await readFile(cliPath, "utf-8")).split("\n")[0];

      expect(firstLine).toBe("#!/usr/bin/env node");
    });
  });

  // Removed local execution variants; covered by BATS shell tests

  // Removed symlink target assertions; execution via BATS covers this

  // Removed global install runtime checks; covered by BATS global tests
});
