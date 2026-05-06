/**
 * Init Command Implementation
 * Initializes AgentSync in a project
 */

import { chmod, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import picocolors from "picocolors";
import { DEFAULT_TOOLS } from "../constants.js";
import { FileSystemError, getErrorMessage } from "../core/errors.js";
import type { InitOptions, ToolName } from "../types/index.js";
import { cliResult, type InitData, jsonStringify } from "../types/output.js";
import { ensureDir, outputFile, pathExists } from "../utils/fs.js";

// Short alias used throughout this file
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

  throw new FileSystemError(
    "Could not find package.json in any parent directory",
    startDir,
    new Error("Traversed to filesystem root without finding package.json"),
  );
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
        if (mcpConfigPath.endsWith(".toml")) {
          const { parseTomlConfig } = await import("../config/toml-loader.js");
          const toml = parseTomlConfig(content);
          if (toml.mcp_servers) {
            mcpCount = Object.keys(toml.mcp_servers).length;
          }
        } else {
          const { validateLocalConfig } = await import("../types/schemas.js");
          const config = validateLocalConfig(JSON.parse(content));
          if (config.mcp && typeof config.mcp === "object") {
            mcpCount = Object.keys(config.mcp).length;
          }
        }
      } catch {
        // Ignore parsing errors
      }
    }

    const configPath = path.join(process.cwd(), ".agents", "agentsync.toml");
    let tools: string[] = [];
    try {
      const content = await readFile(configPath, "utf-8");
      const { parseTomlConfig } = await import("../config/toml-loader.js");
      const toml = parseTomlConfig(content);
      if (toml.tools) {
        tools = toml.tools;
      }
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

    if (!mcpConfigExists || mcpCount === 0) {
      console.log(
        pc.gray("  • Add an MCP server:  ") +
          pc.cyan(
            'agentsync config add mcp github --mcp-config \'{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}\'',
          ),
      );
      console.log(
        pc.gray("  • List MCP servers:   ") +
          pc.cyan("agentsync config ls mcp"),
      );
    } else {
      console.log(
        pc.gray("  • Apply changes:       ") + pc.cyan("agentsync sync"),
      );
      console.log(
        pc.gray("  • List MCP servers:   ") +
          pc.cyan("agentsync config ls mcp"),
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
      path.join(cwd, ".agents", "agentsync.toml"), // Primary: team config
      path.join(cwd, "agentsync.local.toml"), // Override: personal config
    ];

    for (const p of paths) {
      if (await pathExists(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Core init logic — creates files, returns structured result.
   * When log is omitted (JSON mode), helper methods stay silent.
   */
  private async performInit(
    tools: ToolName[],
    log?: (msg: string) => void,
  ): Promise<InitData> {
    const cfgPath = path.join(process.cwd(), ".agents", "agentsync.toml");
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    const hasExisting = await pathExists(agentsPath);

    if (!hasExisting) {
      await this.createAgentsMd("default", log);
    } else {
      log?.(pc.green("  ✓ Using existing AGENTS.md"));
    }

    await this.createAgentsDir(tools, log);
    await this.updateGitignore(tools, log);
    await this.installGitHook(log);

    return { action: "created", configPath: cfgPath, tools };
  }

  async execute(options: InitOptions): Promise<void> {
    // JSON mode: structured output, no human-readable text
    if (options.json) {
      await this.executeJson(options);
      return;
    }

    console.log(pc.blue("🚀 Initializing AgentSync...\n"));

    const configPath = path.join(process.cwd(), ".agents", "agentsync.toml");

    // Check if .agents/agentsync.toml already exists (source of truth)
    if (await pathExists(configPath)) {
      // Show helpful status instead of blocking error
      await this.showCurrentStatus();
      return;
    }

    const tools: ToolName[] = options.tools || [...DEFAULT_TOOLS];
    await this.performInit(tools, console.log);

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
        pc.cyan("agentsync config add mcp <name> --mcp-config '{...}'") +
        pc.gray(" to add MCPs"),
    );
  }

  /**
   * JSON mode: non-interactive init with structured output only.
   * No human-readable text, spinners, or colors are emitted.
   */
  private async executeJson(options: InitOptions): Promise<void> {
    const configPath = path.join(process.cwd(), ".agents", "agentsync.toml");

    if (await pathExists(configPath)) {
      const data: InitData = {
        action: "already_initialized",
        configPath,
        tools: [],
      };
      console.log(jsonStringify(cliResult("init", data), options.pretty));
      return;
    }

    const tools: ToolName[] = options.tools || [...DEFAULT_TOOLS];
    const data = await this.performInit(tools);
    console.log(jsonStringify(cliResult("init", data), options.pretty));
  }

  /**
   * Create AGENTS.md from template
   */
  private async createAgentsMd(
    templateName: string,
    log?: (msg: string) => void,
  ): Promise<void> {
    log?.(pc.gray(`  Creating AGENTS.md from ${templateName} template...`));

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
      log?.(pc.green("  ✓ Created AGENTS.md"));
    } catch (error) {
      // Enhanced error message with debugging info
      const templateError =
        error instanceof Error ? error : new Error(String(error));
      const errorMessage = [
        `Failed to create AGENTS.md from template`,
        `  Template path: ${templatePath}`,
        `  Package root: ${packageRoot}`,
        `  Template exists: ${await pathExists(templatePath)}`,
        `  Error: ${templateError.message}`,
      ].join("\n");

      throw new FileSystemError(errorMessage, templatePath, templateError);
    }
  }

  /**
   * Create .agents directory structure
   */
  private async createAgentsDir(
    tools: ToolName[],
    log?: (msg: string) => void,
  ): Promise<void> {
    log?.(pc.gray("  Creating .agents directory..."));

    const agentsDir = path.join(process.cwd(), ".agents");
    const dirs = [
      agentsDir,
      path.join(agentsDir, "skills"),
      path.join(agentsDir, "commands"),
      path.join(agentsDir, "agents"),
      path.join(agentsDir, "backups"),
    ];

    try {
      for (const dir of dirs) {
        await ensureDir(dir);
      }

      // Create config file using shared utility
      const { ensureProjectConfig } = await import(
        "../utils/config-creation.js"
      );
      await ensureProjectConfig(undefined, { tools });

      log?.(pc.green("  ✓ Created .agents directory"));
    } catch (error) {
      throw new FileSystemError(
        "Failed to create .agents directory",
        agentsDir,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Find the .git directory by walking up from CWD.
   * Returns null if no .git directory is found.
   */
  private async findGitDir(): Promise<string | null> {
    let current = process.cwd();
    const root = path.parse(current).root;

    while (current !== root) {
      const gitDir = path.join(current, ".git");
      if (await pathExists(gitDir)) {
        return gitDir;
      }
      current = path.dirname(current);
    }

    return null;
  }

  /**
   * Install a post-merge git hook that runs `npx agentsync sync --quiet`
   * after every `git pull`. Non-destructive: appends to existing hooks
   * or skips if the agentsync line is already present.
   */
  private async installGitHook(log?: (msg: string) => void): Promise<void> {
    log?.(pc.gray("  Installing post-merge git hook..."));

    const HOOK_COMMAND = "npx agentsync sync --quiet 2>/dev/null || true";
    const MARKER = "# AgentSync:";

    try {
      const gitDir = await this.findGitDir();
      if (!gitDir) {
        log?.(pc.yellow("  ⚠ No .git directory found, skipping git hook"));
        return;
      }

      const hooksDir = path.join(gitDir, "hooks");
      await ensureDir(hooksDir);

      const hookPath = path.join(hooksDir, "post-merge");

      if (await pathExists(hookPath)) {
        const content = await readFile(hookPath, "utf-8");

        if (content.includes(HOOK_COMMAND)) {
          log?.(pc.green("  ✓ post-merge hook already has agentsync sync"));
          return;
        }

        // Append to existing hook
        const appendContent = `\n${MARKER} auto-sync tool configs after pull\n${HOOK_COMMAND}\n`;
        await outputFile(hookPath, content + appendContent);
        await chmod(hookPath, 0o755);
        log?.(
          pc.green("  ✓ Appended agentsync sync to existing post-merge hook"),
        );
      } else {
        // Create new hook
        const hookContent = [
          "#!/bin/sh",
          `${MARKER} auto-sync tool configs after pull`,
          HOOK_COMMAND,
          "",
        ].join("\n");
        await outputFile(hookPath, hookContent);
        await chmod(hookPath, 0o755);
        log?.(pc.green("  ✓ Created post-merge git hook"));
      }
    } catch (error) {
      log?.(
        pc.yellow(`  ⚠ Could not install git hook: ${getErrorMessage(error)}`),
      );
    }
  }

  /**
   * Update .gitignore
   */
  private async updateGitignore(
    tools: ToolName[],
    log?: (msg: string) => void,
  ): Promise<void> {
    log?.(pc.gray("  Updating .gitignore..."));

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
        log?.(pc.green("  ✓ Updated .gitignore (AgentSync section)"));
      } else {
        const agentSyncContent = generateGitignoreContent(tools);
        content += `\n${agentSyncContent}`;
        await outputFile(gitignorePath, content);
        log?.(pc.green("  ✓ Updated .gitignore"));
      }
    } catch (error) {
      log?.(
        pc.yellow(`  ⚠ Could not update .gitignore: ${getErrorMessage(error)}`),
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
