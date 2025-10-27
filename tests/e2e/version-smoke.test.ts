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
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

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
    });

    it("should contain correct version in package.json", async () => {
      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(
        await readFile(packageJsonPath, "utf-8")
      );

      expect(packageJson.version).toBe(version);
    });

    it("should have executable CLI file", async () => {
      const cliPath = path.join(projectRoot, "dist/cli.js");
      const stats = await stat(cliPath);

      // Should be executable (readable for all, executable for owner)
      expect(stats.isFile()).toBe(true);
      expect(stats.mode & parseInt("111", 8)).toBe(parseInt("111", 8)); // executable by all
    });

    it("should have proper shebang", async () => {
      const cliPath = path.join(projectRoot, "dist/cli.js");
      const firstLine = (await readFile(cliPath, "utf-8")).split("\n")[0];

      expect(firstLine).toBe("#!/usr/bin/env node");
    });
  });

  describe("Local Installation and Execution", () => {
    it("should work with npx execution after npm install", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install locally
        execSync(`npm install "${packagePath}"`, {
          cwd: tempDir,
          stdio: "inherit"
        });

        // Test npx execution
        const result = execSync("npx agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        });

        expect(result.trim()).toBe(version);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });

    it("should work with direct binary execution after npm install", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install locally
        execSync(`npm install "${packagePath}"`, {
          cwd: tempDir,
          stdio: "inherit"
        });

        // Test direct binary execution
        const result = execSync("./node_modules/.bin/agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        });

        expect(result.trim()).toBe(version);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });

    it("should work consistently across execution methods", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install locally
        execSync(`npm install "${packagePath}"`, {
          cwd: tempDir,
          stdio: "inherit"
        });

        // Test all execution methods
        const npxResult = execSync("npx agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        }).trim();

        const binaryResult = execSync("./node_modules/.bin/agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        }).trim();

        // All methods should return the same version
        expect(npxResult).toBe(version);
        expect(binaryResult).toBe(version);
        expect(npxResult).toBe(binaryResult);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });
  });

  describe("Symlink Resolution", () => {
    it("should resolve node_modules/.bin/ symlinks correctly", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install locally
        execSync(`npm install "${packagePath}"`, {
          cwd: tempDir,
          stdio: "inherit"
        });

        // Verify the symlink exists and points to the right place
        const binPath = path.join(tempDir, "node_modules/.bin/agentsync");
        const linkTarget = execSync(`readlink "${binPath}"`, {
          encoding: "utf8"
        }).trim();

        expect(linkTarget).toBe("../agentsync/dist/cli.js");

        // Test that the symlink execution works
        const result = execSync(`"${binPath}" --version`, {
          cwd: tempDir,
          encoding: "utf8"
        });

        expect(result.trim()).toBe(version);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });
  });

  describe("Global Installation (Real-World Scenario)", () => {
    it("should work with pnpm global install from different directory", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install globally with pnpm
        execSync(`pnpm install -g "${packagePath}"`, {
          cwd: projectRoot,
          stdio: "inherit"
        });

        // Test from a completely different directory (not project root)
        const result = execSync("agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        });

        expect(result.trim()).toBe(version);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });

    it("should work with npm global install from different directory", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install globally with npm
        execSync(`npm install -g "${packagePath}"`, {
          cwd: projectRoot,
          stdio: "inherit"
        });

        // Test from a completely different directory (not project root)
        const result = execSync("agentsync --version", {
          cwd: tempDir,
          encoding: "utf8"
        });

        expect(result.trim()).toBe(version);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });

    it("should work when executed via PATH from any directory", async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));

      try {
        // Build and pack
        execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
        execSync("npm pack", { cwd: projectRoot, stdio: "inherit" });

        // Install globally
        execSync(`pnpm install -g "${packagePath}"`, {
          cwd: projectRoot,
          stdio: "inherit"
        });

        // Test from multiple different directories
        const testDirs = [
          tempDir,
          os.tmpdir(),
          os.homedir()
        ];

        for (const dir of testDirs) {
          const result = execSync("agentsync --version", {
            cwd: dir,
            encoding: "utf8"
          });

          expect(result.trim()).toBe(version);
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true });
        await rm(packagePath, { force: true });
      }
    });
  });
});
