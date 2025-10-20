/**
 * Init Command Implementation
 * Initializes AgentSync in a project
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { select, checkbox, confirm } from '@inquirer/prompts';
import picocolors from 'picocolors';
import { ConfigError, FileSystemError, ErrorCategory, ErrorSeverity } from '../core/errors.js';
import AuditLogger, { AuditEventType } from '../core/audit.js';
import type { InitOptions, ToolName } from '../types/index.js';

const pc = picocolors;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  async execute(options: InitOptions): Promise<void> {
    console.log(pc.blue('🚀 Initializing AgentSync...\n'));

    try {
      // Check if AGENTS.md already exists
      const agentsPath = path.join(process.cwd(), 'AGENTS.md');
      if (await fs.pathExists(agentsPath) && !options.force) {
        throw new ConfigError(
          'AGENTS.md already exists',
          agentsPath,
          'Use --force to overwrite or manually backup the existing file'
        );
      }

      // Interactive setup if no options provided
      const config = await this.interactiveSetup(options);

      // Create AGENTS.md from template
      await this.createAgentsMd(config.template);

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
      console.log(pc.gray('Next steps:'));
      console.log(pc.gray('  1. Edit AGENTS.md to match your project'));
      console.log(pc.gray('  2. Run "agentsync validate" to check configuration'));
      console.log(pc.gray('  3. Run "agentsync sync" to sync with your tools'));
      console.log(pc.gray('  4. Run "agentsync watch" to enable auto-sync'));
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

    // Find templates directory relative to the bundled code location
    // In production: dist/init-*.js -> ../../templates
    // The __dirname is the directory of the bundled init file
    let templatePath = path.join(__dirname, '../../templates', templateFile);

    // Fallback: try relative to cli.js location
    if (!await fs.pathExists(templatePath)) {
      // Go up from dist/ to root
      templatePath = path.join(path.dirname(process.argv[1]), '../templates', templateFile);
    }

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