/**
 * Init Command Implementation
 * Initializes AgentSync in a project
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { select, checkbox, confirm } from '@inquirer/prompts';
import picocolors from 'picocolors';
import { ConfigError, FileSystemError, ErrorCategory, ErrorSeverity } from '../core/errors.js';
import AuditLogger, { AuditEventType } from '../core/audit.js';
import type { InitOptions, ToolName } from '../types/index.js';

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
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error('Could not find package.json in any parent directory');
}

/**
 * Get package root using require.resolve as fallback
 * This works well for production npm installs
 */
function getPackageRootViaRequire(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve('agentsync/package.json');
    return path.dirname(packageJsonPath);
  } catch {
    return null;
  }
}

// Available templates
const TEMPLATES = {
  default: 'default.md',
  'typescript-react': 'typescript-react.md',
  'python-fastapi': 'python-fastapi.md',
};

// Tool configuration paths
const TOOL_CONFIGS: Record<ToolName, string[]> = {
  cursor: ['.cursor/agents.md', '.cursor/AGENTS.md'],
  claude: ['.claude/AGENTS.md', 'claude_project.md'],
  cline: ['.cline/AGENTS.md', '.cline/instructions.md'],
  windsurf: ['.windsurf/AGENTS.md', '.windsurf/instructions.md'],
  copilot: ['.github/copilot/AGENTS.md', '.github/copilot-instructions.md'],
};

export class InitCommand {
  private audit = AuditLogger.getInstance();

  /**
   * Show current AgentSync setup status with helpful next steps
   */
  private async showCurrentStatus(): Promise<void> {
    console.log(pc.cyan('✓ AgentSync is already initialized\n'));

    // Check what's configured
    const agentsMdPath = path.join(process.cwd(), 'AGENTS.md');
    const agentsMdExists = await fs.pathExists(agentsMdPath);

    const mcpConfigPath = await this.getMCPConfigPath();
    const mcpConfigExists = mcpConfigPath !== null;

    let mcpCount = 0;
    if (mcpConfigExists && mcpConfigPath) {
      try {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(mcpConfigPath, 'utf-8');
        const config = JSON.parse(content);
        if (Array.isArray(config.mcpServers)) {
          mcpCount = config.mcpServers.length;
        } else if (typeof config.mcpServers === 'object') {
          mcpCount = Object.keys(config.mcpServers).length;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    const configPath = path.join(process.cwd(), '.agentsync', 'config.json');
    let tools: string[] = [];
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      tools = config.tools || [];
    } catch {
      // Ignore parsing errors
    }

    // Display status
    console.log(pc.bold('Current setup:'));
    console.log(
      pc.gray('  AGENTS.md sync: '),
      agentsMdExists ? pc.green('✓ Configured') : pc.yellow('✗ Not set up')
    );
    console.log(
      pc.gray('  MCP servers:    '),
      mcpConfigExists
        ? pc.green(`✓ ${mcpCount} server${mcpCount !== 1 ? 's' : ''} configured`)
        : pc.yellow('✗ Not configured')
    );
    console.log(
      pc.gray('  Tools syncing:  '),
      tools.length > 0 ? pc.green(tools.join(', ')) : pc.gray('None')
    );

    // Show next steps
    console.log();
    console.log(pc.bold('What you can do:'));

    if (!mcpConfigExists) {
      console.log(pc.gray('  • Set up MCP servers: ') + pc.cyan('agentsync mcp add <server>'));
      console.log(pc.gray('  • View MCP options:   ') + pc.cyan('agentsync mcp list'));
    } else if (mcpCount === 0) {
      console.log(pc.gray('  • Add an MCP server:  ') + pc.cyan('agentsync mcp add github'));
      console.log(pc.gray('  • View MCP options:   ') + pc.cyan('agentsync mcp list'));
    } else {
      console.log(pc.gray('  • Sync MCP changes:   ') + pc.cyan('agentsync mcp sync'));
      console.log(pc.gray('  • Manage MCPs:        ') + pc.cyan('agentsync mcp list'));
    }

    console.log(pc.gray('  • Re-initialize:      ') + pc.cyan('agentsync init --force'));
    console.log();
  }

  /**
   * Get MCP config file path (checks multiple locations)
   */
  private async getMCPConfigPath(): Promise<string | null> {
    const cwd = process.cwd();
    const paths = [
      path.join(cwd, 'agentsync.local.json'),
      path.join(cwd, '.agentsync', 'config.local.json'),
      path.join(cwd, '.agentsync', 'config.json'),
    ];

    for (const p of paths) {
      if (await fs.pathExists(p)) {
        return p;
      }
    }

    return null;
  }

  async execute(options: InitOptions): Promise<void> {
    console.log(pc.blue('🚀 Initializing AgentSync...\n'));

    try {
      // Check if .agentsync/config.json already exists (source of truth)
      const configPath = path.join(process.cwd(), '.agentsync', 'config.json');
      if (await fs.pathExists(configPath) && !options.force) {
        // Show helpful status instead of blocking error
        await this.showCurrentStatus();
        return;
      }

      // Interactive setup if no options provided
      const config = await this.interactiveSetup(options);

      // Create AGENTS.md from template (skip if already exists unless forced)
      const agentsPath = path.join(process.cwd(), 'AGENTS.md');
      const shouldCreateAgentsMd = !await fs.pathExists(agentsPath) || options.force;
      if (shouldCreateAgentsMd) {
        await this.createAgentsMd(config.template);
      } else {
        console.log(pc.gray('  AGENTS.md already exists, skipping template creation...'));
      }

      // Create .agentsync directory
      await this.createAgentSyncDir();

      // Setup tool configurations
      if (config.tools && config.tools.length > 0) {
        await this.setupTools(config.tools, config.useSymlinks);
      }

      // Update .gitignore
      if (config.updateGitignore) {
        await this.updateGitignore();
      }

      // Optional MCP setup (only in interactive mode)
      const mcpConfigPath = await this.getMCPConfigPath();
      if (!mcpConfigPath && !options.template && !options.tools) {
        await this.optionalMCPSetup();
      }

      // Log success
      await this.audit.log({
        type: AuditEventType.INIT_WORKSPACE,
        severity: 'info',
        category: 'init',
        message: 'AgentSync initialized successfully',
        metadata: config,
      });

      // Success message
      console.log(pc.green('\n✅ AgentSync initialized successfully!\n'));

      const mcpConfigAfter = await this.getMCPConfigPath();
      if (mcpConfigAfter) {
        console.log(pc.gray('Next steps:'));
        console.log(pc.gray('  1. Edit AGENTS.md to match your project'));
        console.log(pc.gray('  2. Add MCP servers: ') + pc.cyan('agentsync mcp add <server>'));
        console.log(pc.gray('  3. Sync to tools:   ') + pc.cyan('agentsync mcp sync'));
      } else {
        console.log(pc.gray('Next steps:'));
        console.log(pc.gray('  1. Edit AGENTS.md to match your project'));
        console.log(pc.gray('  2. (Optional) Set up MCP servers:'));
        console.log(pc.gray('     - Run ') + pc.cyan('agentsync mcp list') + pc.gray(' to see options'));
        console.log(pc.gray('     - Run ') + pc.cyan('agentsync mcp add <server>') + pc.gray(' to add MCPs'));
      }
    } catch (error) {
      await this.audit.logError(
        error as Error,
        ErrorCategory.CONFIG,
        ErrorSeverity.HIGH,
        { command: 'init', options }
      );
      throw error;
    }
  }

  /**
   * Optional MCP setup workflow
   */
  private async optionalMCPSetup(): Promise<void> {
    console.log();

    // Check if we're in an interactive environment
    const isInteractive = process.stdin.isTTY;
    if (!isInteractive) {
      return;
    }

    try {
      const setupMCP = await confirm({
        message: 'Would you like to set up MCP servers now? (Recommended for reducing AI context)',
        default: false,
      });

      if (setupMCP) {
        console.log(pc.gray('\n  Creating agentsync.local.json...'));

        await fs.outputFile(
          path.join(process.cwd(), 'agentsync.local.json'),
          JSON.stringify({ mcpServers: [] }, null, 2) + '\n',
          'utf-8'
        );

        console.log(pc.green('  ✓ Created agentsync.local.json'));
        console.log(pc.gray('\n  MCP servers help reduce AI context by loading only what you need.'));
        console.log(pc.gray('  This makes responses faster and reduces token costs.\n'));
      }
    } catch (error) {
      // User cancelled or error - continue silently
      return;
    }
  }

  /**
   * Interactive setup wizard
   */
  private async interactiveSetup(options: InitOptions): Promise<{
    template: string;
    tools: ToolName[];
    useSymlinks: boolean;
    updateGitignore: boolean;
  }> {
    // Skip interactive if all options provided
    if (options.template && options.tools) {
      return {
        template: options.template,
        tools: options.tools,
        useSymlinks: options.useSymlinks ?? true,
        updateGitignore: true,
      };
    }

    // Check if we're in an interactive environment
    const isInteractive = process.stdin.isTTY;
    if (!isInteractive && (!options.template || !options.tools)) {
      throw new ConfigError(
        'Non-interactive environment detected',
        '',
        'Please provide all required options: --template <name> --tools <tool1,tool2>'
      );
    }

    try {
      // Template selection
      const template = options.template || await select({
        message: 'Select a template:',
        choices: [
          { name: 'Default (General Purpose)', value: 'default' },
          { name: 'TypeScript React', value: 'typescript-react' },
          { name: 'Python FastAPI', value: 'python-fastapi' },
        ],
        default: 'default',
      });

      // Tool selection
      const tools = options.tools || await checkbox({
        message: 'Which AI tools do you use?',
        choices: [
          { name: 'Cursor', value: 'cursor', checked: true },
          { name: 'Claude Code', value: 'claude', checked: true },
          { name: 'Cline', value: 'cline' },
          { name: 'Windsurf', value: 'windsurf' },
          { name: 'GitHub Copilot', value: 'copilot' },
        ],
      }) as ToolName[];

      // Symlink option
      const useSymlinks = await confirm({
        message: 'Use symlinks for tool configurations? (recommended)',
        default: true,
      });

      // Gitignore update option
      const updateGitignore = await confirm({
        message: 'Add AgentSync entries to .gitignore?',
        default: true,
      });

      return {
        template,
        tools,
        useSymlinks,
        updateGitignore,
      };
    } catch (error) {
      // Handle Ctrl+C cancellation
      if (error instanceof Error && error.message.includes('User force closed')) {
        throw new ConfigError('Setup cancelled', '', 'Run "agentsync init" again to start over');
      }
      throw error;
    }
  }

  /**
   * Create AGENTS.md from template
   */
  private async createAgentsMd(templateName: string): Promise<void> {
    console.log(pc.gray(`  Creating AGENTS.md from ${templateName} template...`));

    const templateFile = TEMPLATES[templateName as keyof typeof TEMPLATES] || TEMPLATES.default;

    // Find package root using multiple strategies for maximum reliability
    let packageRoot: string | null = null;

    // Strategy 1: Traverse up from current module location (works in dev and bundled)
    try {
      packageRoot = await findPackageRoot(__dirname);
    } catch (error) {
      // Strategy 2: Use require.resolve (works in production npm installs)
      packageRoot = getPackageRootViaRequire();
    }

    if (!packageRoot) {
      throw new FileSystemError(
        'Could not locate agentsync package root directory',
        __dirname,
        new Error('All package root detection strategies failed')
      );
    }

    const templatePath = path.join(packageRoot, 'templates', templateFile);
    const targetPath = path.join(process.cwd(), 'AGENTS.md');

    try {
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      await fs.writeFile(targetPath, templateContent);
      console.log(pc.green('  ✓ Created AGENTS.md'));
    } catch (error) {
      throw new FileSystemError(
        `Failed to create AGENTS.md from template`,
        templatePath,
        error as Error
      );
    }
  }

  /**
   * Create .agentsync directory structure
   */
  private async createAgentSyncDir(): Promise<void> {
    console.log(pc.gray('  Creating .agentsync directory...'));

    const agentSyncDir = path.join(process.cwd(), '.agentsync');
    const dirs = [
      agentSyncDir,
      path.join(agentSyncDir, 'logs'),
      path.join(agentSyncDir, 'backups'),
      path.join(agentSyncDir, 'cache'),
    ];

    try {
      for (const dir of dirs) {
        await fs.ensureDir(dir);
      }

      // Create config file
      const config = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        tools: [],
      };

      await fs.outputFile(
        path.join(agentSyncDir, 'config.json'),
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
      );

      console.log(pc.green('  ✓ Created .agentsync directory'));
    } catch (error) {
      throw new FileSystemError(
        'Failed to create .agentsync directory',
        agentSyncDir,
        error as Error
      );
    }
  }

  /**
   * Setup tool configurations
   */
  private async setupTools(tools: ToolName[], useSymlinks: boolean): Promise<void> {
    console.log(pc.gray(`  Setting up tool configurations...`));

    const agentsPath = path.join(process.cwd(), 'AGENTS.md');

    for (const tool of tools) {
      const configPaths = TOOL_CONFIGS[tool];
      if (!configPaths) continue;

      for (const configPath of configPaths) {
        const fullPath = path.join(process.cwd(), configPath);
        const dir = path.dirname(fullPath);

        try {
          // Create directory if needed
          await fs.ensureDir(dir);

          // Create symlink or copy
          if (useSymlinks) {
            // Check if symlink already exists
            const exists = await fs.pathExists(fullPath);
            if (!exists) {
              await fs.symlink(
                path.relative(dir, agentsPath),
                fullPath
              );
              console.log(pc.green(`  ✓ Created symlink for ${tool}: ${configPath}`));
            }
          } else {
            await fs.copy(agentsPath, fullPath);
            console.log(pc.green(`  ✓ Created copy for ${tool}: ${configPath}`));
          }
        } catch (error) {
          console.log(pc.yellow(`  ⚠ Could not create ${configPath}: ${(error as Error).message}`));
        }
      }
    }
  }

  /**
   * Update .gitignore
   */
  private async updateGitignore(): Promise<void> {
    console.log(pc.gray('  Updating .gitignore...'));

    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const entries = [
      '',
      '# AgentSync',
      '.agentsync/logs/',
      '.agentsync/cache/',
      '.agentsync/backups/',
      '*.backup',
      'agentsync.local.json',
      '.agentsync/config.local.json',
    ];

    try {
      let content = '';
      if (await fs.pathExists(gitignorePath)) {
        content = await fs.readFile(gitignorePath, 'utf-8');
      }

      // Check if already has AgentSync section
      if (!content.includes('# AgentSync')) {
        content += '\n' + entries.join('\n') + '\n';
        await fs.writeFile(gitignorePath, content);
        console.log(pc.green('  ✓ Updated .gitignore'));
      } else {
        console.log(pc.gray('  ✓ .gitignore already contains AgentSync entries'));
      }
    } catch (error) {
      console.log(pc.yellow(`  ⚠ Could not update .gitignore: ${(error as Error).message}`));
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