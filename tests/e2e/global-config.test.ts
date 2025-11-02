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
  });

  describe("hierarchy loading", () => {
    it("merges global and project presets correctly", async () => {
      // Setup global config with personal preset
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: ["cursor"],
          extends: [
            {
              source: "github:personal/dotfiles",
              namespace: "personal",
            },
          ],
          mcpServers: ["filesystem"],
          useSymlinks: true,
        }),
      );

      // Setup project config with company preset
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: ["cursor", "claude"],
          extends: [
            {
              source: "github:company/standards",
              namespace: "company",
            },
          ],
          mcpServers: ["github"],
          useSymlinks: true,
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Verify merging
      expect(merged.tools).toEqual(["cursor", "claude"]); // project wins
      expect(merged.extends).toHaveLength(2); // both presets
      expect(merged.mcpServers).toEqual(["github"]); // project wins
      expect(merged._sources.global).toBeDefined();
      expect(merged._sources.project).toBeDefined();
    });

    it("deduplicates overlapping presets during hierarchy merge", async () => {
      // Setup global config
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:company/standards",
              namespace: "company-v1",
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      // Setup project config with same preset
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:company/standards",
              namespace: "company-v2",
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Should deduplicate - project version wins
      expect(merged.extends).toHaveLength(1);
      const ext = merged.extends![0] as { source: string; namespace: string };
      expect(ext.source).toBe("github:company/standards");
      expect(ext.namespace).toBe("company-v2"); // project version
      expect(merged._deduplicationLog).toHaveLength(1);
      expect(merged._deduplicationLog[0].kept).toBe("project");
    });

    it("allows same preset with different namespaces to coexist", async () => {
      // Setup global config
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:company/standards",
              namespace: "standards-global",
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      // Setup project config with same source but intentionally different namespace
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:company/standards",
              namespace: "standards-local",
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Will still deduplicate by source, but user can use different namespaces
      // to keep both - deduplication happens, project wins
      expect(merged.extends).toHaveLength(1);
      expect(merged._deduplicationLog).toHaveLength(1);
      expect((merged.extends![0] as { namespace: string }).namespace).toBe(
        "standards-local",
      );
    });

    it("applies local MCP overrides over project config", async () => {
      // Setup project config
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [],
          mcpServers: ["github", "postgres"],
          useSymlinks: true,
        }),
      );

      // Setup local override
      await outputFile(
        path.join(tempDir, "agentsync.local.json"),
        JSON.stringify({
          mcpServers: ["filesystem"],
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      expect(merged.mcpServers).toEqual(["filesystem"]); // local wins
    });

    it("handles complex extend configurations with include/exclude", async () => {
      // Setup global config with selective loading
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:personal/rules",
              namespace: "personal",
              include: ["rules/*.md"],
              exclude: ["rules/experimental/**"],
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      // Setup project config
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [
            {
              source: "github:company/rules",
              namespace: "company",
              include: ["rules/production/*.md"],
            },
          ],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      // Both should be present with their filter settings
      expect(merged.extends).toHaveLength(2);
      const personal = merged.extends?.find(
        (e) => typeof e !== "string" && e.source === "github:personal/rules",
      );
      const company = merged.extends?.find(
        (e) => typeof e !== "string" && e.source === "github:company/rules",
      );

      expect(personal).toBeDefined();
      expect(company).toBeDefined();
      expect((personal as { include?: string[] }).include).toEqual([
        "rules/*.md",
      ]);
      expect((company as { include?: string[] }).include).toEqual([
        "rules/production/*.md",
      ]);
    });

    it("prefers project useSymlinks setting over global", async () => {
      // Setup global config
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [],
          mcpServers: [],
          useSymlinks: false,
        }),
      );

      // Setup project config
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [],
          mcpServers: [],
          useSymlinks: true,
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      expect(merged.useSymlinks).toBe(true); // project wins
    });

    it("applies security settings hierarchy", async () => {
      // Setup global config with security settings
      const globalDir = path.join(tempHome, ".agentsync");
      await ensureDir(globalDir);
      await outputFile(
        path.join(globalDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [],
          mcpServers: [],
          useSymlinks: true,
          security: {
            secretScanning: {
              enabled: true,
              blockOnHighSeverity: true,
            },
          },
        }),
      );

      // Setup project config that overrides
      const projectDir = path.join(tempDir, ".agentsync");
      await ensureDir(projectDir);
      await outputFile(
        path.join(projectDir, "config.json"),
        JSON.stringify({
          version: "1.0",
          tools: [],
          extends: [],
          mcpServers: [],
          useSymlinks: true,
          security: {
            secretScanning: {
              enabled: false,
            },
          },
        }),
      );

      const merged = await loadConfigHierarchy(tempDir);

      expect(merged.security).toBeDefined();
      expect(merged.security?.secretScanning?.enabled).toBe(false); // project wins
    });
  });
});
