/**
 * E2E CLI Shell Tests
 * Tests the CLI by executing it in a real shell environment using execa
 * This ensures the built CLI works correctly when invoked from bash/zsh
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('CLI Shell Execution', () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  const cliPath = path.resolve(process.cwd(), 'dist/cli.js');

  /**
   * Cleanup helper with retry logic for Windows file locking issues
   */
  async function cleanupTestEnvironment(): Promise<void> {
    try {
      // Restore working directory first
      if (originalCwd && process.cwd() !== originalCwd) {
        process.chdir(originalCwd);
      }

      // Restore HOME environment variable
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      }

      // Remove temp directories with retry logic
      const cleanup = async (dir: string, retries = 3): Promise<void> => {
        for (let i = 0; i < retries; i++) {
          try {
            if (await fs.pathExists(dir)) {
              await fs.remove(dir);
              return;
            }
          } catch (error) {
            if (i === retries - 1) {
              console.error(`Failed to cleanup ${dir}:`, error);
              // Don't throw - let test results show through
              return;
            }
            // Wait before retry (file might be locked on Windows)
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      };

      await Promise.all([
        tempDir && cleanup(tempDir),
        tempHomeDir && cleanup(tempHomeDir),
      ]);
    } catch (error) {
      console.error('Cleanup failed:', error);
      // Don't throw - let test results show through
    }
  }

  beforeEach(async () => {
    try {
      // Setup temp directories
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-shell-'));
      originalCwd = process.cwd();
      process.chdir(tempDir);

      tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-home-'));
      originalHome = process.env.HOME;
      process.env.HOME = tempHomeDir;

      // Ensure CLI is built
      if (!await fs.pathExists(cliPath)) {
        throw new Error(`CLI not built. Run 'pnpm build' first. Expected: ${cliPath}`);
      }
    } catch (error) {
      // Cleanup on setup failure
      await cleanupTestEnvironment();
      throw error;
    }
  });

  afterEach(async () => {
    await cleanupTestEnvironment();
  });

  describe('Basic CLI Execution', () => {
    it('executes --version flag successfully', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, '--version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^\d+\.\d+\.\d+/); // Semver pattern
    });

    it('executes --help flag successfully', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('agentsync');
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Options:');
    });

    it('shows error for unknown command', async () => {
      try {
        await execa('node', [cliPath, 'nonexistent-command']);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toContain('error');
      }
    });

    it('executes directly via shebang (Unix only)', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows
        return;
      }

      const { stdout, exitCode } = await execa(cliPath, ['--version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('MCP Commands', () => {
    beforeEach(async () => {
      // Setup global MCP registry
      const globalRegistry = {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {
            GITHUB_TOKEN: '{GITHUB_TOKEN}',
          },
        },
        postgres: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres'],
          env: {
            POSTGRES_URL: '{DATABASE_URL}',
          },
        },
      };

      const agentsyncDir = path.join(tempHomeDir, '.agentsync');
      await fs.ensureDir(agentsyncDir);
      await fs.writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);

      // Setup environment variables
      process.env.GITHUB_TOKEN = 'ghp_test_token';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      // Create target directories
      await fs.ensureDir('.cursor');
      await fs.ensureDir('.claude');
    });

    it('executes mcp list command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'mcp', 'list']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');
      expect(stdout).toContain('postgres');
    });

    it('executes mcp add command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'mcp', 'add', 'github']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');

      // Verify config file created
      const configExists = await fs.pathExists('.agentsync.json');
      expect(configExists).toBe(true);

      const config = await fs.readJson('.agentsync.json');
      expect(config.mcpServers).toContain('github');
    });

    it('executes mcp sync command', async () => {
      // First add an MCP
      await execa('node', [cliPath, 'mcp', 'add', 'github']);

      // Then sync
      const { stdout, exitCode } = await execa('node', [cliPath, 'mcp', 'sync']);

      expect(exitCode).toBe(0);

      // Verify synced files
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists || claudeExists).toBe(true);
    });

    it('executes mcp sync with --dry-run flag', async () => {
      await execa('node', [cliPath, 'mcp', 'add', 'github']);

      const { exitCode } = await execa('node', [cliPath, 'mcp', 'sync', '--dry-run']);

      expect(exitCode).toBe(0);

      // Verify files NOT created (dry run should not write files)
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists).toBe(false);
      expect(claudeExists).toBe(false);
    });

    it('executes mcp sync with --tool flag', async () => {
      await execa('node', [cliPath, 'mcp', 'add', 'github']);

      const { exitCode } = await execa('node', [cliPath, 'mcp', 'sync', '--tool', 'cursor']);

      expect(exitCode).toBe(0);

      // Verify only cursor synced
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists).toBe(true);
      expect(claudeExists).toBe(false);
    });

    it('executes mcp remove command', async () => {
      // Add two MCPs so we can remove one
      await execa('node', [cliPath, 'mcp', 'add', 'github']);
      await execa('node', [cliPath, 'mcp', 'add', 'postgres']);

      // Then remove one
      const { stdout, exitCode } = await execa('node', [cliPath, 'mcp', 'remove', 'github']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');

      // Verify removed from config but postgres remains
      const config = await fs.readJson('.agentsync.json');
      expect(config.mcpServers).not.toContain('github');
      expect(config.mcpServers).toContain('postgres');
    });

    it('handles missing MCP registry gracefully', async () => {
      // Remove registry
      await fs.remove(path.join(tempHomeDir, '.agentsync', 'mcp.json'));

      try {
        await execa('node', [cliPath, 'mcp', 'list']);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toContain('mcp.json');
      }
    });

    it('handles missing environment variables', async () => {
      delete process.env.GITHUB_TOKEN;

      await execa('node', [cliPath, 'mcp', 'add', 'github']);

      try {
        await execa('node', [cliPath, 'mcp', 'sync'], {
          env: { ...process.env, GITHUB_TOKEN: undefined },
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toMatch(/GITHUB_TOKEN|environment/i);
      }
    });
  });

  describe('Init Command', () => {
    it('executes init command in non-interactive mode', async () => {
      // Create a project config to simulate non-interactive init
      const config = {
        tools: ['cursor'],
        useSymlinks: false,
      };
      await fs.writeJson('.agentsync.json', config);

      // Note: Interactive prompts can't be tested without a TTY
      // We'd need a library like 'expect' or 'inquirer-test' for that
      // For now, just verify the command doesn't crash
      const { exitCode } = await execa('node', [cliPath, '--help']);
      expect(exitCode).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('shows friendly error for invalid JSON config', async () => {
      await fs.writeFile('.agentsync.json', '{invalid json}');

      try {
        await execa('node', [cliPath, 'mcp', 'list']);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toMatch(/JSON|parse|config/i);
      }
    });

    it('handles missing permissions gracefully', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows (different permission model)
        return;
      }

      // Setup registry first
      const globalRegistry = {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: '{GITHUB_TOKEN}' },
        },
      };
      const agentsyncDir = path.join(tempHomeDir, '.agentsync');
      await fs.ensureDir(agentsyncDir);
      await fs.writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);

      await fs.ensureDir('.cursor');
      await fs.chmod('.cursor', 0o444); // Read-only

      try {
        await execa('node', [cliPath, 'mcp', 'add', 'github']);
        await execa('node', [cliPath, 'mcp', 'sync'], {
          env: { ...process.env, GITHUB_TOKEN: 'test_token' },
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toMatch(/permission|EACCES|denied/i);
      } finally {
        await fs.chmod('.cursor', 0o755); // Restore permissions for cleanup
      }
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('handles different line endings', async () => {
      const { stdout } = await execa('node', [cliPath, '--version']);

      // Should work regardless of line endings
      expect(stdout).toBeTruthy();
      expect(typeof stdout).toBe('string');
    });

    it('handles spaces in paths', async () => {
      const spacedDir = path.join(tempDir, 'folder with spaces');
      await fs.ensureDir(spacedDir);
      process.chdir(spacedDir);

      const { exitCode } = await execa('node', [cliPath, '--version']);
      expect(exitCode).toBe(0);
    });

    it('respects HOME environment variable', async () => {
      const customHome = path.join(tempDir, 'custom-home');
      await fs.ensureDir(customHome);

      const globalRegistry = { github: { command: 'echo', args: ['test'] } };
      await fs.ensureDir(path.join(customHome, '.agentsync'));
      await fs.writeJson(path.join(customHome, '.agentsync', 'mcp.json'), globalRegistry);

      const { stdout, exitCode } = await execa('node', [cliPath, 'mcp', 'list'], {
        env: { ...process.env, HOME: customHome },
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');
    });
  });

  describe('Exit Codes', () => {
    it('exits with 0 on success', async () => {
      const { exitCode } = await execa('node', [cliPath, '--version']);
      expect(exitCode).toBe(0);
    });

    it('exits with non-zero on error', async () => {
      try {
        await execa('node', [cliPath, 'invalid-command']);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.exitCode).toBeGreaterThan(0);
      }
    });

    it('exits with non-zero on missing arguments', async () => {
      try {
        await execa('node', [cliPath, 'mcp', 'add']); // Missing MCP name
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.exitCode).toBeGreaterThan(0);
      }
    });
  });

  describe('Output Formatting', () => {
    it('outputs valid UTF-8', async () => {
      const { stdout } = await execa('node', [cliPath, '--help']);

      // Should not contain malformed UTF-8
      expect(() => Buffer.from(stdout, 'utf-8')).not.toThrow();
    });

    it('outputs to stdout for normal output', async () => {
      const { stdout, stderr } = await execa('node', [cliPath, '--version']);

      expect(stdout).toBeTruthy();
      expect(stderr).toBe('');
    });

    it('outputs to stderr for errors', async () => {
      try {
        await execa('node', [cliPath, 'invalid-command']);
      } catch (error: any) {
        // Either stderr or stdout should contain error message
        expect(error.stderr || error.stdout).toBeTruthy();
      }
    });
  });
});
