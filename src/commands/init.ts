/**
 * Init Command Implementation
 * Initializes AgentSync in a project
 */

import { readFile, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { checkbox, confirm, select } from "@inquirer/prompts";
import { execa } from "execa";
import picocolors from "picocolors";
import AuditLogger, { AuditEventType } from "../core/audit.js";
import {
  ConfigError,
  ErrorCategory,
  ErrorSeverity,
  FileSystemError,
} from "../core/errors.js";
import type { InitOptions, ToolName } from "../types/index.js";
import { ensureDir, outputFile, pathExists } from "../utils/fs.js";

const pc = picocolors;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find the package root directory by traversing up until we find package.json
 * This works reliably regardless of bundling, distribution, or execution context
 */
async function findPackageRoot(startDir: string): Promise<string> {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (await pathExists(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error("Could not find package.json in any parent directory");
}

/**
 * Get package root using require.resolve as fallback
 * This works well for production npm installs
 */
function getPackageRootViaRequire(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("agentsync/package.json");
    return path.dirname(packageJsonPath);
  } catch {
    return null;
  }
}

// Available templates
const TEMPLATES = {
  default: "default.md",
  "typescript-react": "typescript-react.md",
  "python-fastapi": "python-fastapi.md",
};

export class InitCommand {
  private audit = AuditLogger.getInstance();

  /**
   * Show current AgentSync setup status with helpful next steps
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex status display logic
  private async showCurrentStatus(): Promise<void> {
    console.log(pc.cyan("✓ AgentSync is already initialized\n"));

    // Check what's configured
    const agentsMdPath = path.join(process.cwd(), "AGENTS.md");
    const agentsMdExists = await pathExists(agentsMdPath);

    const mcpConfigPath = await this.getMCPConfigPath();
    const mcpConfigExists = mcpConfigPath !== null;

    let mcpCount = 0;
    if (mcpConfigExists && mcpConfigPath) {
      try {
        const content = await readFile(mcpConfigPath, "utf-8");
        const config = JSON.parse(content);
        if (Array.isArray(config.mcpServers)) {
          mcpCount = config.mcpServers.length;
        } else if (typeof config.mcpServers === "object") {
          mcpCount = Object.keys(config.mcpServers).length;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    const configPath = path.join(process.cwd(), ".agentsync", "config.json");
    let tools: string[] = [];
    try {
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content);
      tools = config.tools || [];
    } catch {
      // Ignore parsing errors
    }

    // Display status
    console.log(pc.bold("Current setup:"));
    console.log(
      pc.gray("  AGENTS.md sync: "),
      agentsMdExists ? pc.green("✓ Configured") : pc.yellow("✗ Not set up"),
    );
    console.log(
      pc.gray("  MCP servers:    "),
      mcpConfigExists
        ? pc.green(
            `✓ ${mcpCount} server${mcpCount !== 1 ? "s" : ""} configured`,
          )
        : pc.yellow("✗ Not configured"),
    );
    console.log(
      pc.gray("  Tools syncing:  "),
      tools.length > 0 ? pc.green(tools.join(", ")) : pc.gray("None"),
    );

    // Show next steps
    console.log();
    console.log(pc.bold("What you can do:"));

    if (!mcpConfigExists) {
      console.log(
        pc.gray("  • Set up MCP servers: ") +
          pc.cyan("agentsync mcp add <server>"),
      );
      console.log(
        pc.gray("  • View MCP options:   ") + pc.cyan("agentsync mcp list"),
      );
    } else if (mcpCount === 0) {
      console.log(
        pc.gray("  • Add an MCP server:  ") +
          pc.cyan("agentsync mcp add github"),
      );
      console.log(
        pc.gray("  • View MCP options:   ") + pc.cyan("agentsync mcp list"),
      );
    } else {
      console.log(
        pc.gray("  • Apply changes:       ") + pc.cyan("agentsync sync"),
      );
      console.log(
        pc.gray("  • Manage MCPs:        ") + pc.cyan("agentsync mcp list"),
      );
    }

    console.log();
  }

  /**
   * Get MCP config file path (checks multiple locations with team config primary)
   */
  private async getMCPConfigPath(): Promise<string | null> {
    const cwd = process.cwd();
    const paths = [
      path.join(cwd, ".agentsync", "config.json"), // Primary: team config
      path.join(cwd, "agentsync.local.json"), // Override: personal config
    ];

    for (const p of paths) {
      if (await pathExists(p)) {
        return p;
      }
    }

    return null;
  }

  async execute(options: InitOptions): Promise<void> {
    console.log(pc.blue("🚀 Initializing AgentSync...\n"));

    try {
      // Check if .agentsync/config.json already exists (source of truth)
      const configPath = path.join(process.cwd(), ".agentsync", "config.json");
      if (await pathExists(configPath)) {
        // Show helpful status instead of blocking error
        await this.showCurrentStatus();
        return;
      }

      // Interactive setup if no options provided
      const config = await this.interactiveSetup(options);

      // Create AGENTS.md from template (skip if using existing or if already exists)
      const agentsPath = path.join(process.cwd(), "AGENTS.md");
      const shouldCreateAgentsMd =
        config.template &&
        !(await pathExists(agentsPath)) &&
        !config.useExistingAgentsMd;

      if (shouldCreateAgentsMd) {
        await this.createAgentsMd(config.template!);
      } else if (config.useExistingAgentsMd || (await pathExists(agentsPath))) {
        console.log(pc.green("  ✓ Using existing AGENTS.md"));
      }

      // Create .agentsync directory
      await this.createAgentSyncDir(config.tools);

      // Update .gitignore
      if (config.updateGitignore) {
        await this.updateGitignore(config.tools);
      }

      // Log success
      await this.audit.log({
        type: AuditEventType.INIT_WORKSPACE,
        severity: "info",
        category: "init",
        message: "AgentSync initialized successfully",
        metadata: config,
      });

      // Success message
      console.log(pc.green("\n✅ AgentSync initialized successfully!\n"));
      console.log(pc.gray("Next steps:"));
      console.log(pc.gray("  1. Edit AGENTS.md to match your project"));
      console.log(
        pc.gray("  2. Run ") +
          pc.cyan("agentsync sync") +
          pc.gray(" to generate tool configs"),
      );
      console.log(pc.gray("  3. (Optional) Set up MCP servers:"));
      console.log(
        pc.gray("     - Run ") +
          pc.cyan("agentsync mcp list") +
          pc.gray(" to see available MCPs"),
      );
      console.log(
        pc.gray("     - Run ") +
          pc.cyan("agentsync mcp add <server>") +
          pc.gray(" to add MCPs"),
      );
    } catch (error) {
      await this.audit.logError(
        error as Error,
        ErrorCategory.CONFIG,
        ErrorSeverity.HIGH,
        { command: "init", options },
      );
      throw error;
    }
  }

  /**
   * Check if current directory is a git repository
   */
  private async isGitRepository(): Promise<boolean> {
    const gitDir = path.join(process.cwd(), ".git");
    return await pathExists(gitDir);
  }

  /**
   * Check for existing AGENTS.md or CLAUDE.md files
   * Returns the state and path if found
   */
  private async checkExistingAgentsFiles(): Promise<{
    hasAgentsMd: boolean;
    hasClaudeMd: boolean;
    agentsMdPath: string;
    claudeMdPath: string;
  }> {
    const agentsMdPath = path.join(process.cwd(), "AGENTS.md");
    const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");

    return {
      hasAgentsMd: await pathExists(agentsMdPath),
      hasClaudeMd: await pathExists(claudeMdPath),
      agentsMdPath,
      claudeMdPath,
    };
  }

  /**
   * Handle CLAUDE.md rename with user choice
   * Returns true if renamed, false if user chose manual/ignore
   */
  private async handleClaudeMdRename(): Promise<boolean> {
    const isGit = await this.isGitRepository();
    const gitCommand = isGit ? "git mv" : "mv";

    const choice = await select({
      message: "Found CLAUDE.md. What would you like to do?",
      choices: [
        {
          name: `Rename to AGENTS.md (using ${gitCommand})`,
          value: "rename",
        },
        { name: "I'll rename it manually", value: "manual" },
        { name: "Ignore and create from template", value: "template" },
      ],
      default: "rename",
    });

    if (choice === "rename") {
      try {
        if (isGit) {
          // Use git mv to preserve history
          await execa("git", ["mv", "CLAUDE.md", "AGENTS.md"], {
            cwd: process.cwd(),
          });
          console.log(
            pc.green(
              "  ✓ Renamed CLAUDE.md → AGENTS.md (git history preserved)",
            ),
          );
        } else {
          // Regular rename
          await rename(
            path.join(process.cwd(), "CLAUDE.md"),
            path.join(process.cwd(), "AGENTS.md"),
          );
          console.log(pc.green("  ✓ Renamed CLAUDE.md → AGENTS.md"));
        }
        return true;
      } catch (error) {
        console.log(
          pc.yellow(
            `  ⚠ Could not rename automatically: ${(error as Error).message}`,
          ),
        );
        console.log(
          pc.gray(
            `  You can rename manually with: ${gitCommand} CLAUDE.md AGENTS.md`,
          ),
        );
        return false;
      }
    } else if (choice === "manual") {
      console.log(
        pc.gray(
          `  You can rename manually with: ${gitCommand} CLAUDE.md AGENTS.md`,
        ),
      );
      return false;
    }

    // choice === "template" - will proceed to template selection
    return false;
  }

  /**
   * Interactive setup wizard
   */
  private async interactiveSetup(options: InitOptions): Promise<{
    template: string | null;
    tools: ToolName[];
    updateGitignore: boolean;
    useExistingAgentsMd: boolean;
  }> {
    // Check for existing AGENTS.md or CLAUDE.md files first
    const { hasAgentsMd, hasClaudeMd } = await this.checkExistingAgentsFiles();
    let useExistingAgentsMd = false;

    // Handle existing AGENTS.md
    if (hasAgentsMd) {
      console.log(
        pc.cyan(
          "  ℹ Found existing AGENTS.md - will use it instead of template",
        ),
      );
      useExistingAgentsMd = true;
    }
    // Handle existing CLAUDE.md
    else if (hasClaudeMd && !hasAgentsMd) {
      const renamed = await this.handleClaudeMdRename();
      if (renamed) {
        useExistingAgentsMd = true;
      }
      // If user chose "template", will create from default template
    }

    // Skip interactive if all options provided
    if (options.tools) {
      return {
        template: useExistingAgentsMd ? null : "default",
        tools: options.tools,
        updateGitignore: true,
        useExistingAgentsMd,
      };
    }

    // Check if we're in an interactive environment
    const isInteractive = process.stdin.isTTY;
    if (!(isInteractive || options.tools)) {
      throw new ConfigError(
        "Non-interactive environment detected",
        "",
        "Please provide all required options: --tools <tool1,tool2>",
      );
    }

    try {
      // Tool selection (always required)
      const tools =
        options.tools ||
        ((await checkbox({
          message: "Which AI tools do you use?",
          choices: [
            { name: "Cursor", value: "cursor", checked: true },
            { name: "Claude Code", value: "claude", checked: true },
            { name: "Cline", value: "cline" },
            { name: "RooCode", value: "roocode" },
          ],
        })) as ToolName[]);

      // Gitignore update option
      const updateGitignore = await confirm({
        message: "Add AgentSync entries to .gitignore?",
        default: true,
      });

      return {
        template: useExistingAgentsMd ? null : "default",
        tools,
        updateGitignore,
        useExistingAgentsMd,
      };
    } catch (error) {
      // Handle Ctrl+C cancellation
      if (
        error instanceof Error &&
        error.message.includes("User force closed")
      ) {
        throw new ConfigError(
          "Setup cancelled",
          "",
          'Run "agentsync init" again to start over',
        );
      }
      throw error;
    }
  }

  /**
   * Create AGENTS.md from template
   */
  private async createAgentsMd(templateName: string): Promise<void> {
    console.log(
      pc.gray(`  Creating AGENTS.md from ${templateName} template...`),
    );

    const templateFile =
      TEMPLATES[templateName as keyof typeof TEMPLATES] || TEMPLATES.default;

    // Find package root using multiple strategies for maximum reliability
    let packageRoot: string | null = null;

    // Strategy 1: Traverse up from current module location (works in dev and bundled)
    try {
      packageRoot = await findPackageRoot(__dirname);
    } catch (_error) {
      // Strategy 2: Use require.resolve (works in production npm installs)
      packageRoot = getPackageRootViaRequire();
    }

    if (!packageRoot) {
      throw new FileSystemError(
        "Could not locate agentsync package root directory",
        __dirname,
        new Error("All package root detection strategies failed"),
      );
    }

    const templatePath = path.join(packageRoot, "templates", templateFile);
    const targetPath = path.join(process.cwd(), "AGENTS.md");

    try {
      // Use native Node.js readFile (fs-extra v11+ removed readFile/writeFile)
      const templateContent = await readFile(templatePath, "utf-8");
      // Use fs-extra's outputFile to ensure parent directory exists
      await outputFile(targetPath, templateContent);
      console.log(pc.green("  ✓ Created AGENTS.md"));
    } catch (error) {
      // Enhanced error message with debugging info
      const errorMessage = [
        `Failed to create AGENTS.md from template`,
        `  Template path: ${templatePath}`,
        `  Package root: ${packageRoot}`,
        `  Template exists: ${await pathExists(templatePath)}`,
        `  Error: ${(error as Error).message}`,
      ].join("\n");

      throw new FileSystemError(errorMessage, templatePath, error as Error);
    }
  }

  /**
   * Create .agentsync directory structure
   */
  private async createAgentSyncDir(tools: ToolName[]): Promise<void> {
    console.log(pc.gray("  Creating .agentsync directory..."));

    const agentSyncDir = path.join(process.cwd(), ".agentsync");
    const dirs = [agentSyncDir, path.join(agentSyncDir, "backups")];

    try {
      for (const dir of dirs) {
        await ensureDir(dir);
      }

      // Create config file using shared utility
      const { ensureProjectConfig } = await import(
        "../utils/config-creation.js"
      );
      await ensureProjectConfig(undefined, { tools });

      console.log(pc.green("  ✓ Created .agentsync directory"));
    } catch (error) {
      throw new FileSystemError(
        "Failed to create .agentsync directory",
        agentSyncDir,
        error as Error,
      );
    }
  }

  /**
   * Update .gitignore
   */
  private async updateGitignore(tools: ToolName[]): Promise<void> {
    console.log(pc.gray("  Updating .gitignore..."));

    const gitignorePath = path.join(process.cwd(), ".gitignore");

    try {
      let content = "";
      if (await pathExists(gitignorePath)) {
        content = await readFile(gitignorePath, "utf-8");
      }

      const {
        hasAgentSyncSection,
        updateAgentSyncSection,
        generateGitignoreContent,
      } = await import("../utils/gitignore.js");

      if (hasAgentSyncSection(content)) {
        content = updateAgentSyncSection(content, tools);
        await outputFile(gitignorePath, content);
        console.log(pc.green("  ✓ Updated .gitignore (AgentSync section)"));
      } else {
        const agentSyncContent = generateGitignoreContent(tools);
        content += `\n${agentSyncContent}`;
        await outputFile(gitignorePath, content);
        console.log(pc.green("  ✓ Updated .gitignore"));
      }
    } catch (error) {
      console.log(
        pc.yellow(
          `  ⚠ Could not update .gitignore: ${(error as Error).message}`,
        ),
      );
    }
  }
}

/**
 * Factory function
 */
export async function init(options: InitOptions): Promise<void> {
  const command = new InitCommand();
  return command.execute(options);
}
