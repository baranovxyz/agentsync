/**
 * E2E Tests for Global Config and Onboarding
 * Tests complete workflows for global + project config initialization
 */

import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfigHierarchy } from "../../src/core/config/hierarchy.js";
import { ConfigError } from "../../src/core/errors.js";
import { ensureDir, outputFile } from "../../src/utils/fs.js";

describe("Global Config E2E", () => {
  let tempRoot: string;
  let tempDir: string;
  let tempHome: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentsync-global-e2e-"));
    tempDir = path.join(tempRoot, "project");
    tempHome = path.join(tempRoot, "home");
    await ensureDir(tempDir);
    await ensureDir(tempHome);

    // Mock home directory
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("USERPROFILE", tempHome);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempRoot, { recursive: true, force: true });
  });

  describe("hierarchy loading", () => {
    it("merges global and project presets correctly", async () => {
      // Setup global config with personal preset
      const globalDir = path.join(tempHome, ".agents");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.toml"),
        `tools = ["cursor"]
extends = ["github:personal/dotfiles"]

[mcp.filesystem]
command = "npx"
args = ["-y", "mcp-fs"]
`,
      );

      // Setup project config as TOML
      await ensureDir(path.join(tempDir, ".agents"));
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        `tools = ["cursor", "claude"]
extends = ["github:company/standards"]

[mcp.github]
command = "npx"
args = ["-y", "mcp-github"]
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Verify merging
      expect(merged.tools).toEqual(["cursor", "claude"]); // project wins
      expect(merged.extends).toHaveLength(2); // both presets
      // Project MCP servers win (merged with global)
      expect(merged.mcp).toHaveProperty("github");
      expect(merged.mcp).toHaveProperty("filesystem");
      expect(merged._sources.global).toBeDefined();
      expect(merged._sources.chain[0]).toBeDefined();
    });

    it("deduplicates overlapping presets during hierarchy merge", async () => {
      // Setup global config
      const globalDir = path.join(tempHome, ".agents");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.toml"),
        'tools = []\nextends = ["github:company/standards"]\n',
      );

      // Setup project config with same preset
      await ensureDir(path.join(tempDir, ".agents"));
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        `tools = []
extends = ["github:company/standards"]
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Should deduplicate - project version wins (same string)
      expect(merged.extends).toHaveLength(1);
      expect(merged.extends![0]).toBe("github:company/standards");
      expect(merged._deduplicationLog).toHaveLength(1);
      expect(merged._deduplicationLog[0].kept).toBe("project");
    });

    it("deduplicates same preset string from global and project", async () => {
      // Setup global config
      const globalDir = path.join(tempHome, ".agents");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.toml"),
        'tools = []\nextends = ["github:company/standards"]\n',
      );

      // Setup project config with same source string
      await ensureDir(path.join(tempDir, ".agents"));
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        `tools = []
extends = ["github:company/standards"]
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Same string in both levels → deduplicated to one
      expect(merged.extends).toHaveLength(1);
      expect(merged._deduplicationLog).toHaveLength(1);
      expect(merged.extends![0]).toBe("github:company/standards");
    });

    it("applies local MCP overrides over project config", async () => {
      // Setup project config (defined = enabled)
      await ensureDir(path.join(tempDir, ".agents"));
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        `tools = []

[mcp.github]
command = "npx"
args = ["-y", "mcp-github"]

[mcp.postgres]
command = "docker"
args = ["exec", "pg"]
`,
      );

      // Setup local override: adds filesystem, disables postgres
      await outputFile(
        path.join(tempDir, "agentsync.local.toml"),
        `mcp_disabled = ["postgres"]

[mcp.filesystem]
command = "npx"
args = ["-y", "mcp-fs"]
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Local MCP servers should be merged in, postgres should be removed
      expect(merged.mcp).toHaveProperty("filesystem");
      expect(merged.mcp).toHaveProperty("github");
      expect(merged.mcp).not.toHaveProperty("postgres");
    });

    it("merges different extends from global and project", async () => {
      // Setup global config with personal preset
      const globalDir = path.join(tempHome, ".agents");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.toml"),
        'tools = []\nextends = ["github:personal/rules"]\n',
      );

      // Setup project config with company preset
      await ensureDir(path.join(tempDir, ".agents"));
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        `tools = []
extends = ["github:company/rules"]
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Both should be present (different sources, no deduplication)
      expect(merged.extends).toHaveLength(2);
      expect(merged.extends).toContain("github:personal/rules");
      expect(merged.extends).toContain("github:company/rules");
    });

    it("preserves strict errors from an invalid global config", async () => {
      await outputFile(
        path.join(tempHome, ".agents", "config.toml"),
        'tools = ["claude"]\nunexpected = true\n',
      );
      await outputFile(
        path.join(tempDir, ".agents", "agentsync.toml"),
        'tools = ["claude"]\n',
      );

      try {
        await loadConfigHierarchy(tempDir);
        throw new Error("Expected invalid global config to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        if (!(error instanceof ConfigError)) throw error;
        expect(error.message).toContain("Unrecognized key");
        expect(error.message).toContain("unexpected");
        expect(error.suggestion).toContain("Use current top-level tools");
      }
    });
  });
});
