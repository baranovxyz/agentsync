/**
 * End-to-end tests for the complete interactive selection workflow
 * Tests the full user journey from selection to sync
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import * as fs from "node:fs/promises";
import * as path from "path";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "os";

describe("Interactive Selection Workflow E2E", () => {
  let tempDir: string;
  let agentsyncBin: string;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-e2e-"));

    // Get path to built CLI
    agentsyncBin = path.join(process.cwd(), "dist", "cli.js");

    // Ensure CLI is built
    try {
      await fs.access(agentsyncBin);
    } catch {
      throw new Error("CLI not built. Run 'pnpm build' first.");
    }
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Complete interactive selection workflow", () => {
    it("should handle full workflow from init to sync with selections", async () => {
      // 1. Initialize project
      const { exitCode: initExitCode } = await execa(agentsyncBin, ["init"], {
        cwd: tempDir,
      });
      expect(initExitCode).toBe(0);

      // Verify config exists
      const configExists = await fs
        .access(path.join(tempDir, ".agentsync", "config.json"))
        .then(() => true)
        .catch(() => false);
      expect(configExists).toBe(true);

      // 2. Add a preset to config
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards"];
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // 3. Create mock preset content in cache
      const cacheDir = path.join(
        tempDir,
        ".agentsync",
        "cache",
        "github",
        "example",
        "standards"
      );
      await fs.mkdir(cacheDir, { recursive: true });

      // Create mock AGENTS.md
      await fs.writeFile(
        path.join(cacheDir, "AGENTS.md"),
        `# Project Overview

## Build Commands
- build: npm run build

## Test Commands
- test: npm test

## Code Style
- Use 2 space indentation
- No console.log

## MCP Servers
- github: GitHub integration
- filesystem: File system access
`
      );

      // Create mock rules and commands directories
      const rulesDir = path.join(cacheDir, "rules");
      const commandsDir = path.join(cacheDir, "commands");
      await fs.mkdir(rulesDir, { recursive: true });
      await fs.mkdir(commandsDir, { recursive: true });

      // Create mock rule files
      await fs.writeFile(
        path.join(rulesDir, "eslint.md"),
        "# ESLint Rules\n\nNo console.log statements"
      );
      await fs.writeFile(
        path.join(rulesDir, "style.md"),
        "# Style Guide\n\nUse 2 space indentation"
      );
      await fs.writeFile(
        path.join(rulesDir, "security.md"),
        "# Security Rules\n\nNo eval() statements"
      );

      // Create mock command files
      await fs.writeFile(
        path.join(commandsDir, "build.md"),
        "# Build Commands\n\n- npm run build"
      );
      await fs.writeFile(
        path.join(commandsDir, "test.md"),
        "# Test Commands\n\n- npm test"
      );
      await fs.writeFile(
        path.join(commandsDir, "deploy.md"),
        "# Deploy Commands\n\n- npm run deploy"
      );

      // 4. Create interactive selection with preset selections
      const interactiveSelectionConfig = {
        version: "2.0",
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["*.md"],
                exclude: ["security.md"],
              },
              commands: {
                include: ["build.md", "test.md"],
              },
              mcps: ["github"],
            },
          },
        },
      };

      const selectionConfigPath = path.join(
        tempDir,
        ".agentsync",
        "config.json"
      );
      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(
        selectionConfigPath,
        JSON.stringify(updatedConfig, null, 2)
      );

      // 5. Run sync with selections
      const { exitCode: syncExitCode, stdout: syncOutput } = await execa(
        agentsyncBin,
        ["sync"],
        {
          cwd: tempDir,
        }
      );
      expect(syncExitCode).toBe(0);

      // 6. Verify only selected files were synced
      const cursorDir = path.join(tempDir, ".cursor");
      const cursorExists = await fs
        .access(cursorDir)
        .then(() => true)
        .catch(() => false);

      if (
        config.tools?.includes("cursor") ||
        config.tools?.includes("claude")
      ) {
        expect(cursorExists).toBe(true);

        // Check that only selected rule files exist
        const eslintExists = await fs
          .access(path.join(cursorDir, "rules", "eslint.md"))
          .then(() => true)
          .catch(() => false);
        const styleExists = await fs
          .access(path.join(cursorDir, "rules", "style.md"))
          .then(() => true)
          .catch(() => false);
        const securityExists = await fs
          .access(path.join(cursorDir, "rules", "security.md"))
          .then(() => true)
          .catch(() => false);

        expect(eslintExists).toBe(true);
        expect(styleExists).toBe(true);
        expect(securityExists).toBe(false); // Should be excluded

        // Check that only selected command files exist
        const buildExists = await fs
          .access(path.join(cursorDir, "commands", "build.md"))
          .then(() => true)
          .catch(() => false);
        const testExists = await fs
          .access(path.join(cursorDir, "commands", "test.md"))
          .then(() => true)
          .catch(() => false);
        const deployExists = await fs
          .access(path.join(cursorDir, "commands", "deploy.md"))
          .then(() => true)
          .catch(() => false);

        expect(buildExists).toBe(true);
        expect(testExists).toBe(true);
        expect(deployExists).toBe(false); // Should not be included
      }
    });

    it("should handle workflow with multiple presets and selections", async () => {
      // 1. Initialize project
      const { exitCode: initExitCode } = await execa(agentsyncBin, ["init"], {
        cwd: tempDir,
      });
      expect(initExitCode).toBe(0);

      // 2. Configure multiple presets
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards", "github:company/backend"];
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // 3. Create mock preset content for both presets
      for (const preset of ["standards", "backend"]) {
        const cacheDir = path.join(
          tempDir,
          ".agentsync",
          "cache",
          "github",
          preset === "standards" ? "example" : "company",
          preset
        );
        await fs.mkdir(cacheDir, { recursive: true });

        // Create mock AGENTS.md
        await fs.writeFile(
          path.join(cacheDir, "AGENTS.md"),
          `# Project Overview for ${preset}

## Build Commands
- build: npm run build

## Test Commands
- test: npm test

## Code Style
- Use 2 space indentation
- No console.log

## MCP Servers
- github: GitHub integration
- filesystem: File system access
`
        );

        // Create mock rules and commands directories
        const rulesDir = path.join(cacheDir, "rules");
        const commandsDir = path.join(cacheDir, "commands");
        await fs.mkdir(rulesDir, { recursive: true });
        await fs.mkdir(commandsDir, { recursive: true });

        // Create preset-specific files
        await fs.writeFile(
          path.join(rulesDir, `${preset}-rule.md`),
          `# ${preset} Rule\n\nSpecific to ${preset}`
        );
        await fs.writeFile(
          path.join(commandsDir, `${preset}-cmd.md`),
          `# ${preset} Command\n\nSpecific to ${preset}`
        );
      }

      // 4. Create interactive selection with different selections for each preset
      const interactiveSelectionConfig = {
        version: "2.0",
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["standards-rule.md"],
              },
              commands: {
                include: ["standards-cmd.md"],
              },
              mcps: ["github"],
            },
            "github:company/backend": {
              rules: {
                include: ["backend-rule.md"],
              },
              commands: {
                include: ["backend-cmd.md"],
              },
              mcps: ["filesystem"],
            },
          },
        },
      };

      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // 5. Run sync with selections
      const { exitCode: syncExitCode } = await execa(agentsyncBin, ["sync"], {
        cwd: tempDir,
      });
      expect(syncExitCode).toBe(0);

      // 6. Verify files from both presets were synced correctly
      const cursorDir = path.join(tempDir, ".cursor");
      const cursorExists = await fs
        .access(cursorDir)
        .then(() => true)
        .catch(() => false);

      if (
        config.tools?.includes("cursor") ||
        config.tools?.includes("claude")
      ) {
        expect(cursorExists).toBe(true);

        // Check files from first preset
        const standardsRuleExists = await fs
          .access(path.join(cursorDir, "rules", "standards-rule.md"))
          .then(() => true)
          .catch(() => false);
        const standardsCmdExists = await fs
          .access(path.join(cursorDir, "commands", "standards-cmd.md"))
          .then(() => true)
          .catch(() => false);

        // Check files from second preset
        const backendRuleExists = await fs
          .access(path.join(cursorDir, "rules", "backend-rule.md"))
          .then(() => true)
          .catch(() => false);
        const backendCmdExists = await fs
          .access(path.join(cursorDir, "commands", "backend-cmd.md"))
          .then(() => true)
          .catch(() => false);

        expect(standardsRuleExists).toBe(true);
        expect(standardsCmdExists).toBe(true);
        expect(backendRuleExists).toBe(true);
        expect(backendCmdExists).toBe(true);
      }
    });

    it("should handle workflow with user-level and project-level selections", async () => {
      // 1. Initialize project
      const { exitCode: initExitCode } = await execa(agentsyncBin, ["init"], {
        cwd: tempDir,
      });
      expect(initExitCode).toBe(0);

      // 2. Configure preset
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards"];
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // 3. Create mock preset content
      const cacheDir = path.join(
        tempDir,
        ".agentsync",
        "cache",
        "github",
        "example",
        "standards"
      );
      await fs.mkdir(cacheDir, { recursive: true });

      await fs.writeFile(
        path.join(cacheDir, "AGENTS.md"),
        `# Project Overview

## Build Commands
- build: npm run build

## Test Commands
- test: npm test

## Code Style
- Use 2 space indentation
- No console.log

## MCP Servers
- github: GitHub integration
- filesystem: File system access
`
      );

      // Create mock rules and commands directories
      const rulesDir = path.join(cacheDir, "rules");
      const commandsDir = path.join(cacheDir, "commands");
      await fs.mkdir(rulesDir, { recursive: true });
      await fs.mkdir(commandsDir, { recursive: true });

      // Create mock files
      await fs.writeFile(
        path.join(rulesDir, "common.md"),
        "# Common Rules\n\nShared rules"
      );
      await fs.writeFile(
        path.join(rulesDir, "project-specific.md"),
        "# Project Specific Rules\n\nProject rules"
      );
      await fs.writeFile(
        path.join(commandsDir, "build.md"),
        "# Build Commands\n\n- npm run build"
      );

      // 4. Create interactive selection with both user and project levels
      const interactiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:example/standards"],
          defaultSelections: {
            "github:example/standards": {
              rules: {
                include: ["common.md"],
              },
            },
          },
        },
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["project-specific.md"], // Should override user
              },
              commands: {
                include: ["build.md"],
              },
              mcps: ["github"],
            },
          },
        },
      };

      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // 5. Run sync with selections
      const { exitCode: syncExitCode } = await execa(agentsyncBin, ["sync"], {
        cwd: tempDir,
      });
      expect(syncExitCode).toBe(0);

      // 6. Verify merged selections were applied correctly
      const cursorDir = path.join(tempDir, ".cursor");
      const cursorExists = await fs
        .access(cursorDir)
        .then(() => true)
        .catch(() => false);

      if (
        config.tools?.includes("cursor") ||
        config.tools?.includes("claude")
      ) {
        expect(cursorExists).toBe(true);

        // User-level common rules should be overridden by project-level
        const commonExists = await fs
          .access(path.join(cursorDir, "rules", "common.md"))
          .then(() => true)
          .catch(() => false);
        const projectSpecificExists = await fs
          .access(path.join(cursorDir, "rules", "project-specific.md"))
          .then(() => true)
          .catch(() => false);
        const buildExists = await fs
          .access(path.join(cursorDir, "commands", "build.md"))
          .then(() => true)
          .catch(() => false);

        // Project-level should override user-level for rules
        expect(commonExists).toBe(false);
        expect(projectSpecificExists).toBe(true);
        // Project-level commands should be included
        expect(buildExists).toBe(true);
      }
    });
  });

  describe("Interactive selection with different tools", () => {
    it("should work correctly with Cursor tool", async () => {
      // 1. Initialize project with Cursor
      const { exitCode: initExitCode } = await execa(
        agentsyncBin,
        ["init", "--tools", "cursor"],
        {
          cwd: tempDir,
        }
      );
      expect(initExitCode).toBe(0);

      // 2. Configure preset and selection
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards"];

      const interactiveSelectionConfig = {
        version: "2.0",
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["*.md"],
              },
            },
          },
        },
      };

      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // 3. Create mock preset content
      const cacheDir = path.join(
        tempDir,
        ".agentsync",
        "cache",
        "github",
        "example",
        "standards"
      );
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.mkdir(path.join(cacheDir, "rules"), { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "rules", "test.md"),
        "# Test Rule\n\nContent"
      );

      // 4. Run sync
      const { exitCode: syncExitCode } = await execa(agentsyncBin, ["sync"], {
        cwd: tempDir,
      });
      expect(syncExitCode).toBe(0);

      // 5. Verify Cursor directory was created
      const cursorDir = path.join(tempDir, ".cursor");
      const cursorExists = await fs
        .access(cursorDir)
        .then(() => true)
        .catch(() => false);
      expect(cursorExists).toBe(true);
    });

    it("should work correctly with Claude tool", async () => {
      // 1. Initialize project with Claude
      const { exitCode: initExitCode } = await execa(
        agentsyncBin,
        ["init", "--tools", "claude"],
        {
          cwd: tempDir,
        }
      );
      expect(initExitCode).toBe(0);

      // 2. Configure preset and selection
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards"];

      const interactiveSelectionConfig = {
        version: "2.0",
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["*.md"],
              },
            },
          },
        },
      };

      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // 3. Create mock preset content
      const cacheDir = path.join(
        tempDir,
        ".agentsync",
        "cache",
        "github",
        "example",
        "standards"
      );
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.mkdir(path.join(cacheDir, "rules"), { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "rules", "test.md"),
        "# Test Rule\n\nContent"
      );

      // 4. Run sync
      const { exitCode: syncExitCode } = await execa(agentsyncBin, ["sync"], {
        cwd: tempDir,
      });
      expect(syncExitCode).toBe(0);

      // 5. Verify Claude directory was created
      const claudeDir = path.join(tempDir, ".claude");
      const claudeExists = await fs
        .access(claudeDir)
        .then(() => true)
        .catch(() => false);
      expect(claudeExists).toBe(true);
    });

    it("should work correctly with multiple tools", async () => {
      // 1. Initialize project with multiple tools
      const { exitCode: initExitCode } = await execa(
        agentsyncBin,
        ["init", "--tools", "cursor,claude"],
        {
          cwd: tempDir,
        }
      );
      expect(initExitCode).toBe(0);

      // 2. Configure preset and selection
      const configPath = path.join(tempDir, ".agentsync", "config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      config.extends = ["github:example/standards"];

      const interactiveSelectionConfig = {
        version: "2.0",
        project: {
          selections: {
            "github:example/standards": {
              rules: {
                include: ["*.md"],
              },
            },
          },
        },
      };

      const updatedConfig = {
        ...config,
        interactiveSelection: interactiveSelectionConfig,
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));

      // 3. Create mock preset content
      const cacheDir = path.join(
        tempDir,
        ".agentsync",
        "cache",
        "github",
        "example",
        "standards"
      );
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.mkdir(path.join(cacheDir, "rules"), { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "rules", "test.md"),
        "# Test Rule\n\nContent"
      );

      // 4. Run sync
      const { exitCode: syncExitCode } = await execa(agentsyncBin, ["sync"], {
        cwd: tempDir,
      });
      expect(syncExitCode).toBe(0);

      // 5. Verify both directories were created
      const cursorDir = path.join(tempDir, ".cursor");
      const claudeDir = path.join(tempDir, ".claude");
      const cursorExists = await fs
        .access(cursorDir)
        .then(() => true)
        .catch(() => false);
      const claudeExists = await fs
        .access(claudeDir)
        .then(() => true)
        .catch(() => false);
      expect(cursorExists).toBe(true);
      expect(claudeExists).toBe(true);
    });
  });
});
