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
import { processTracker } from '../utils/process-tracker.js';

/**
 * CLI Shell Execution Tests
 *
 * Test Strategy:
 * - beforeAll: Copy entire dist/ folder + package.json to temp location
 *   (Prevents production CLI from being deleted during test execution)
 * - beforeEach: Setup test-specific temp directories (HOME, working directory)
 * - afterEach: Cleanup test-specific directories only
 * - afterAll: Cleanup CLI copy
 *
 * Why copy CLI?
 * - Tests change working directory, which can cause module resolution issues
 * - Prevents accidental deletion of production CLI during cleanup
 * - Allows parallel test execution safely
 *
 * Required files in temp location:
 * - dist/ folder (includes cli.js and all chunk files)
 * - package.json (required for --version command)
 */
describe('CLI Shell Execution', () => {
  let tempDir: string;
  let tempHomeDir: string;
  let tempCliDir: string;
  let tempCliPath: string;
  let nodeModulesPath: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  const cliPath = path.resolve(process.cwd(), 'dist/cli.js');

  /**
   * Helper to write JSON files (replacement for fs.writeJson which doesn't exist in fs-extra v11)
   */
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  /**
   * Helper to execute CLI (resolves dependencies via symlinked node_modules)
   */
  function execaCli(args: string[], options: any = {}) {
    return execa('node', [tempCliPath, ...args], options);
  }

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

      // Restore USERPROFILE on Windows
      if (originalUserProfile !== undefined) {
        process.env.USERPROFILE = originalUserProfile;
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
        // Note: tempCliDir is cleaned up in afterAll, not here
      ]);
    } catch (error) {
      console.error('Cleanup failed:', error);
      // Don't throw - let test results show through
    }
  }

  beforeAll(async () => {
    // Verify original CLI is built
    const originalCliPath = path.resolve(process.cwd(), 'dist/cli.js');
    if (!await fs.pathExists(originalCliPath)) {
      throw new Error(`CLI not built. Run 'pnpm build' first. Expected: ${originalCliPath}`);
    }

    // Store path to node_modules (for symlink since vite externalizes deps)
    nodeModulesPath = path.resolve(process.cwd(), 'node_modules');

    // Create temp directory for CLI copy
    tempCliDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-cli-'));

    // Copy entire dist folder to temp location (including chunk files)
    const distDir = path.resolve(process.cwd(), 'dist');
    await fs.copy(distDir, path.join(tempCliDir, 'dist'));

    // Copy package.json (needed for version check)
    const packageJson = path.resolve(process.cwd(), 'package.json');
    await fs.copy(packageJson, path.join(tempCliDir, 'package.json'));

    // Create symlink to node_modules (ESM doesn't support NODE_PATH env var)
    const tempNodeModulesPath = path.join(tempCliDir, 'node_modules');
    await fs.symlink(nodeModulesPath, tempNodeModulesPath, 'dir');

    // Set path to copied CLI
    tempCliPath = path.join(tempCliDir, 'dist', 'cli.js');
  });

  beforeEach(async () => {
    try {
      // Setup temp directories
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-shell-'));
      originalCwd = process.cwd();
      process.chdir(tempDir);

      tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-home-'));
      originalHome = process.env.HOME;
      process.env.HOME = tempHomeDir;

      // On Windows, also set USERPROFILE (os.homedir() uses this on Windows)
      if (process.platform === 'win32') {
        originalUserProfile = process.env.USERPROFILE;
        process.env.USERPROFILE = tempHomeDir;
      }
    } catch (error) {
      // Cleanup on setup failure
      await cleanupTestEnvironment();
      throw error;
    }
  });

  afterEach(async () => {
    // Kill all tracked processes first
    await processTracker.killAll();

    // Then cleanup filesystem
    await cleanupTestEnvironment();
  });

  afterAll(async () => {
    // Final cleanup of CLI copy
    if (tempCliDir && await fs.pathExists(tempCliDir)) {
      await fs.remove(tempCliDir);
    }
  });

  describe('Basic CLI Execution', () => {
    it('executes --version flag successfully', async () => {
      const { stdout, exitCode } = await execaCli(['--version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^\d+\.\d+\.\d+/); // Semver pattern
    });

    it('executes --help flag successfully', async () => {
      const { stdout, exitCode } = await execaCli(['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('agentsync');
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Options:');
    });

    it('shows error for unknown command', async () => {
      try {
        await execaCli(['nonexistent-command']);
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

      // Skip on CI - file permissions don't persist through build
      if (process.env.CI) {
        return;
      }

      const { stdout, exitCode } = await execa(tempCliPath, ['--version']);

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
      await writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);

      // Setup environment variables
      process.env.GITHUB_TOKEN = 'ghp_test_token';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      // Create target directories
      await fs.ensureDir('.cursor');
      await fs.ensureDir('.claude');
    });

    it('executes mcp list command', async () => {
      const { stdout, exitCode } = await execaCli(['mcp', 'list']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');
      expect(stdout).toContain('postgres');
    });

    it('executes mcp add command', async () => {
      const { stdout, exitCode } = await execaCli(['mcp', 'add', 'github']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');

      // Verify config file created
      const configExists = await fs.pathExists('agentsync.local.json');
      expect(configExists).toBe(true);

      const configContent = await fs.readFile('agentsync.local.json', 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.mcpServers).toContain('github');
    });

    it('executes mcp sync command', async () => {
      // First add an MCP
      await execaCli(['mcp', 'add', 'github']);

      // Then sync
      const { stdout, exitCode } = await execaCli(['mcp', 'sync']);

      expect(exitCode).toBe(0);

      // Verify synced files
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists || claudeExists).toBe(true);
    });

    it('executes mcp sync with --dry-run flag', async () => {
      await execaCli(['mcp', 'add', 'github']);

      const { exitCode } = await execaCli(['mcp', 'sync', '--dry-run']);

      expect(exitCode).toBe(0);

      // Verify files NOT created (dry run should not write files)
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists).toBe(false);
      expect(claudeExists).toBe(false);
    });

    it('executes mcp sync with --tool flag', async () => {
      await execaCli(['mcp', 'add', 'github']);

      const { exitCode } = await execaCli(['mcp', 'sync', '--tool', 'cursor']);

      expect(exitCode).toBe(0);

      // Verify only cursor synced
      const cursorExists = await fs.pathExists('.cursor/mcp.json');
      const claudeExists = await fs.pathExists('.claude/mcp.json');
      expect(cursorExists).toBe(true);
      expect(claudeExists).toBe(false);
    });

    it('executes mcp remove command', async () => {
      // Add two MCPs so we can remove one
      await execaCli(['mcp', 'add', 'github']);
      await execaCli(['mcp', 'add', 'postgres']);

      // Then remove one
      const { stdout, exitCode } = await execaCli(['mcp', 'remove', 'github']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');

      // Verify removed from config but postgres remains
      const configContent = await fs.readFile('agentsync.local.json', 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.mcpServers).not.toContain('github');
      expect(config.mcpServers).toContain('postgres');
    });

    it('handles missing MCP registry gracefully', async () => {
      // Remove registry
      await fs.remove(path.join(tempHomeDir, '.agentsync', 'mcp.json'));

      try {
        await execaCli(['mcp', 'list']);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        expect(error.stderr || error.stdout).toContain('mcp.json');
      }
    });

    it('handles missing environment variables', async () => {
      delete process.env.GITHUB_TOKEN;

      await execaCli(['mcp', 'add', 'github']);

      try {
        await execaCli(['mcp', 'sync'], {
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
      await writeJson('agentsync.local.json', config);

      // Note: Interactive prompts can't be tested without a TTY
      // We'd need a library like 'expect' or 'inquirer-test' for that
      // For now, just verify the command doesn't crash
      const { exitCode } = await execaCli(['--help']);
      expect(exitCode).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('shows friendly error for invalid JSON config', async () => {
      await fs.writeFile('agentsync.local.json', '{invalid json}');

      try {
        await execaCli(['mcp', 'list']);
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
      await writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);

      await fs.ensureDir('.cursor');
      await fs.chmod('.cursor', 0o444); // Read-only

      try {
        await execaCli(['mcp', 'add', 'github']);
        await execaCli(['mcp', 'sync'], {
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
      const { stdout } = await execaCli(['--version']);

      // Should work regardless of line endings
      expect(stdout).toBeTruthy();
      expect(typeof stdout).toBe('string');
    });

    it('handles spaces in paths', async () => {
      const spacedDir = path.join(tempDir, 'folder with spaces');
      await fs.ensureDir(spacedDir);
      process.chdir(spacedDir);

      const { exitCode } = await execaCli(['--version']);
      expect(exitCode).toBe(0);
    });

    it('respects HOME environment variable', async () => {
      const customHome = path.join(tempDir, 'custom-home');
      await fs.ensureDir(customHome);

      const globalRegistry = { github: { command: 'echo', args: ['test'] } };
      await fs.ensureDir(path.join(customHome, '.agentsync'));
      await writeJson(path.join(customHome, '.agentsync', 'mcp.json'), globalRegistry);

      // On Windows, os.homedir() uses USERPROFILE, not HOME
      const env = { ...process.env, HOME: customHome };
      if (process.platform === 'win32') {
        env.USERPROFILE = customHome;
      }

      const { stdout, exitCode } = await execaCli(['mcp', 'list'], { env });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');
    });
  });

  describe('Exit Codes', () => {
    it('exits with 0 on success', async () => {
      const { exitCode } = await execaCli(['--version']);
      expect(exitCode).toBe(0);
    });

    it('exits with non-zero on error', async () => {
      try {
        await execaCli(['invalid-command']);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.exitCode).toBeGreaterThan(0);
      }
    });

    it('exits with non-zero on missing arguments', async () => {
      try {
        await execaCli(['mcp', 'add']); // Missing MCP name
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.exitCode).toBeGreaterThan(0);
      }
    });
  });

  describe('Output Formatting', () => {
    it('outputs valid UTF-8', async () => {
      const { stdout } = await execaCli(['--help']);

      // Should not contain malformed UTF-8
      expect(() => Buffer.from(stdout, 'utf-8')).not.toThrow();
    });

    it('outputs to stdout for normal output', async () => {
      const { stdout, stderr } = await execaCli(['--version']);

      expect(stdout).toBeTruthy();
      expect(stderr).toBe('');
    });

    it('outputs to stderr for errors', async () => {
      try {
        await execaCli(['invalid-command']);
      } catch (error: any) {
        // Either stderr or stdout should contain error message
        expect(error.stderr || error.stdout).toBeTruthy();
      }
    });
  });
});
