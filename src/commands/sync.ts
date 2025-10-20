/**
 * Main sync command - orchestrates library loading and syncing
 */

import picocolors from 'picocolors';
import ora from 'ora';
import { RegistryOrchestrator } from '../core/registry/registry-orchestrator.js';
import { RulesSyncTarget } from '../targets/rules-sync-target.js';
import { CommandsSyncTarget } from '../targets/commands-sync-target.js';
import { syncMCP } from './mcp/sync.js';
import AuditLogger, { AuditEventType } from '../core/audit.js';
import { validateConfig } from '../types/schemas.js';
import { ErrorCategory, ErrorSeverity } from '../core/errors.js';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

const pc = picocolors;

export interface SyncOptions {
  update?: boolean; // Update GitHub caches
  dryRun?: boolean; // Preview without writing
  tool?: string; // Specific tool (or undefined for all)
}

export class SyncCommand {
  private registryOrchestrator = new RegistryOrchestrator();
  private rulesTarget = new RulesSyncTarget();
  private commandsTarget = new CommandsSyncTarget();
  private audit = AuditLogger.getInstance();

  async execute(options: SyncOptions = {}): Promise<void> {
    console.log(pc.blue('🔄 Syncing AgentSync configuration...\n'));

    try {
      const cwd = process.cwd();

      // 1. Load config
      const spinner = ora('Loading configuration...').start();
      const configPath = path.join(cwd, '.agentsync', 'config.json');
      const configContent = await readFile(configPath, 'utf-8');
      const config = validateConfig(JSON.parse(configContent));
      spinner.succeed('Configuration loaded');

      // 2. Load and merge libraries
      if (config.extends && config.extends.length > 0) {
        spinner.start(
          `Resolving ${config.extends.length} librar${config.extends.length === 1 ? 'y' : 'ies'}...`
        );

        const merged = await this.registryOrchestrator.loadAndMerge(cwd, {
          update: options.update,
        });

        spinner.succeed(
          `Resolved ${config.extends.length} librar${config.extends.length === 1 ? 'y' : 'ies'}`
        );

        // Show what was loaded
        console.log(pc.gray(`  Commands: ${merged.commands.size}`));
        console.log(pc.gray(`  Rules: ${merged.rules.size}`));
        console.log(pc.gray(`  MCPs: ${Object.keys(merged.mcps).length}`));

        if (options.dryRun) {
          console.log(pc.yellow('\n⚠️  Dry-run mode - not writing files\n'));
          this.previewSync(merged, config);
          return;
        }

        // 3. Sync rules
        if (merged.rules.size > 0) {
          spinner.start('Syncing rules...');
          await this.rulesTarget.sync(merged.rules, config.tools, cwd);
          spinner.succeed(`Synced ${merged.rules.size} rules`);
        }

        // 4. Sync commands
        if (merged.commands.size > 0) {
          spinner.start('Syncing commands...');
          await this.commandsTarget.sync(merged.commands, config.tools, cwd);
          spinner.succeed(`Synced ${merged.commands.size} commands`);
        }
      }

      // 5. Sync MCPs (existing system)
      if (config.mcpServers) {
        const mcpCount = Array.isArray(config.mcpServers)
          ? config.mcpServers.length
          : Object.keys(config.mcpServers).length;

        if (mcpCount > 0) {
          ora('Syncing MCP servers...').start();
          await syncMCP({
            dryRun: options.dryRun,
            tool: options.tool,
          });
          ora().succeed('Synced MCP servers');
        }
      }

      // 6. Log success
      await this.audit.log({
        type: AuditEventType.SYNC_SUCCESS,
        severity: 'info',
        category: 'sync',
        message: 'Sync completed successfully',
        metadata: { tools: config.tools },
      });

      console.log(pc.green('\n✅ Sync complete!\n'));

      // Show next steps
      console.log(pc.gray('Your AI tools are now configured with:'));
      console.log(pc.gray(`  • Rules from team libraries`));
      console.log(pc.gray(`  • Commands from team libraries`));
      console.log(pc.gray(`  • MCP servers for context optimization\n`));
    } catch (error) {
      await this.audit.logError(error as Error, ErrorCategory.SYNC, ErrorSeverity.HIGH);
      throw error;
    }
  }

  /**
   * Preview what would be synced (dry-run)
   */
  private previewSync(merged: any, config: any): void {
    console.log(pc.bold('Would sync:\n'));

    if (merged.rules.size > 0) {
      console.log(pc.cyan('Rules:'));
      for (const [filename] of merged.rules) {
        console.log(pc.gray(`  • ${filename}`));
      }
    }

    if (merged.commands.size > 0) {
      console.log(pc.cyan('\nCommands:'));
      for (const [filename] of merged.commands) {
        console.log(pc.gray(`  • ${filename}`));
      }
    }

    console.log(pc.cyan('\nTools:'));
    for (const tool of config.tools) {
      console.log(pc.gray(`  • ${tool}`));
    }
  }
}

export async function sync(options: SyncOptions): Promise<void> {
  const command = new SyncCommand();
  return command.execute(options);
}
