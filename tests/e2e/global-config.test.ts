/**
 * E2E Tests for Global Config and Onboarding
 * Tests complete workflows for global + project config initialization
 */

import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfigHierarchy } from "../../src/core/config/hierarchy.js";
import { ensureDir, outputFile } from "../../src/utils/fs.js";

describe("Global Config E2E", () => {
  let tempDir: string;
  let tempHome: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `agentsync-e2e-${Date.now()}`);
    tempHome = path.join(os.tmpdir(), `agentsync-home-e2e-${Date.now()}`);
    await ensureDir(tempDir);
    await ensureDir(tempHome);

    // Mock home directory
    vi.stubEnv("HOME", tempHome);
    vi.stubEnv("USERPROFILE", tempHome);
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

[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "github:company/standards"
namespace = "company"

[mcp_servers.github]
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
      expect(merged._sources.project).toBeDefined();
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

[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "github:company/standards"
namespace = "company"
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

[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "github:company/standards"
namespace = "company"
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

[mcp_servers.github]
command = "npx"
args = ["-y", "mcp-github"]

[mcp_servers.postgres]
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

[agentsync]
version = "1.0"

[[agentsync.presets]]
source = "github:company/rules"
namespace = "company"
`,
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Both should be present (different sources, no deduplication)
      expect(merged.extends).toHaveLength(2);
      expect(merged.extends).toContain("github:personal/rules");
      expect(merged.extends).toContain("github:company/rules");
    });
  });
});
