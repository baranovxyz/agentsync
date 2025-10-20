/**
 * E2E Production Package Installation Test
 *
 * This test validates the production package by:
 * 1. Creating a tarball with `pnpm pack`
 * 2. Installing it globally with `npm install -g`
 * 3. Running real-world workflows (add → sync → remove)
 * 4. Cleaning up after tests
 *
 * This replaces the manual QA agent testing and catches:
 * - Packaging issues (missing files in tarball)
 * - Bin linking problems
 * - Global installation issues
 * - Production workflow bugs
 *
 * Run: pnpm test tests/e2e/install-test.test.ts
 *
 * Note: This test takes ~30-60s due to global install/uninstall
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Production Package Installation', () => {
  let tarballPath: string;
  let packageName: string;
  let packageVersion: string;

  /**
   * Helper to write JSON files (replacement for fs.writeJson which doesn't exist in fs-extra v11)
   */
  async function writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.outputFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
  let tempTestDir: string;
  let tempHomeDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeAll(async () => {
    // Get package info
    const pkg = await fs.readJson(path.join(process.cwd(), 'package.json'));
    packageName = pkg.name;
    packageVersion = pkg.version;

    // Ensure clean build
    await execa('pnpm', ['build']);

    // Pack tarball
    console.log('Creating production tarball...');
    const { stdout } = await execa('pnpm', ['pack']);

    // Parse tarball filename from output
    const lines = stdout.trim().split('\n');
    tarballPath = lines[lines.length - 1];

    if (!tarballPath || !tarballPath.endsWith('.tgz')) {
      throw new Error(`Failed to find tarball in pnpm pack output: ${stdout}`);
    }

    // Verify tarball exists
    const fullTarballPath = path.join(process.cwd(), tarballPath);
    if (!await fs.pathExists(fullTarballPath)) {
      throw new Error(`Tarball not found at: ${fullTarballPath}`);
    }

    console.log(`Tarball created: ${tarballPath}`);

    // Install globally
    console.log(`Installing ${packageName} globally...`);
    await execa('npm', ['install', '-g', fullTarballPath]);
    console.log('Global installation complete');

    // Setup test environment
    tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-install-test-'));
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-home-'));
    originalHome = process.env.HOME;

    // On Windows, also backup USERPROFILE
    if (process.platform === 'win32') {
      originalUserProfile = process.env.USERPROFILE;
    }
  }, 120000); // 2 minute timeout for install

  afterAll(async () => {
    try {
      // Uninstall global package
      console.log(`Uninstalling ${packageName}...`);
      try {
        await execa('npm', ['uninstall', '-g', packageName]);
      } catch (error) {
        console.warn('Failed to uninstall global package:', error);
      }

      // Remove tarball
      const fullTarballPath = path.join(process.cwd(), tarballPath);
      if (await fs.pathExists(fullTarballPath)) {
        await fs.remove(fullTarballPath);
      }

      // Restore environment
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      }
      if (originalUserProfile !== undefined) {
        process.env.USERPROFILE = originalUserProfile;
      }

      // Cleanup temp directories
      await fs.remove(tempTestDir);
      await fs.remove(tempHomeDir);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }, 60000); // 1 minute timeout for cleanup

  describe('Basic CLI Validation', () => {
    it('should be globally executable', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['--version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
      expect(stdout).toContain(packageVersion);
    });

    it('should show help text', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('AgentSync');
      expect(stdout).toContain('mcp');
    });

    it('should show MCP command help', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['mcp', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('sync');
      expect(stdout).toContain('list');
      expect(stdout).toContain('add');
      expect(stdout).toContain('remove');
    });

    it('should handle invalid commands gracefully', async () => {
      try {
        await execa('agentsync', ['invalid-command']);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        // Error message should appear in either stdout or stderr
        const output = error.stdout || error.stderr;
        expect(output).toBeTruthy();
      }
    });
  });

  describe('MCP Workflow - No Registry', () => {
    it('should show helpful error when registry missing', async () => {
      // Set temp HOME (no registry)
      process.env.HOME = tempHomeDir;
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempHomeDir;
      }

      try {
        await execa('agentsync', ['mcp', 'list'], { cwd: tempTestDir });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        const output = error.stdout || error.stderr;
        expect(output).toContain('.agentsync/mcp.json');
      }
    });
  });

  describe('MCP Workflow - Basic Happy Path', () => {
    beforeAll(async () => {
      // Setup global registry
      const agentsyncDir = path.join(tempHomeDir, '.agentsync');
      await fs.ensureDir(agentsyncDir);

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
            DATABASE_URL: '{DATABASE_URL}',
          },
        },
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      };

      await writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);

      // Set HOME to temp
      process.env.HOME = tempHomeDir;
      if (process.platform === 'win32') {
        process.env.USERPROFILE = tempHomeDir;
      }

      // Create target directories
      await fs.ensureDir(path.join(tempTestDir, '.cursor'));
      await fs.ensureDir(path.join(tempTestDir, '.claude'));

      // Create .env file
      await fs.writeFile(
        path.join(tempTestDir, '.env'),
        'GITHUB_TOKEN=ghp_test_token_12345\nDATABASE_URL=postgresql://localhost:5432/testdb'
      );
    });

    it('should list available MCPs', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['mcp', 'list'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');
      expect(stdout).toContain('postgres');
      expect(stdout).toContain('filesystem');
    });

    it('should add MCP to project', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['mcp', 'add', 'github'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github');

      // Verify config created
      const config = await fs.readJson(path.join(tempTestDir, '.agentsync.json'));
      expect(config.mcpServers).toContain('github');
    });

    it('should add second MCP', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['mcp', 'add', 'filesystem'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);

      // Verify both in config
      const config = await fs.readJson(path.join(tempTestDir, '.agentsync.json'));
      expect(config.mcpServers).toContain('github');
      expect(config.mcpServers).toContain('filesystem');
    });

    it('should preview sync with --dry-run', async () => {
      const { exitCode } = await execa('agentsync', ['mcp', 'sync', '--dry-run'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);

      // Verify NO files created (the key test for dry-run)
      const cursorExists = await fs.pathExists(path.join(tempTestDir, '.cursor/mcp.json'));
      const claudeExists = await fs.pathExists(path.join(tempTestDir, '.claude/mcp.json'));

      expect(cursorExists).toBe(false);
      expect(claudeExists).toBe(false);
    });

    it('should sync MCPs to targets', async () => {
      const { exitCode } = await execa('agentsync', ['mcp', 'sync'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);

      // Verify files created
      const cursorExists = await fs.pathExists(path.join(tempTestDir, '.cursor/mcp.json'));
      const claudeExists = await fs.pathExists(path.join(tempTestDir, '.claude/mcp.json'));

      expect(cursorExists).toBe(true);
      expect(claudeExists).toBe(true);
    });

    it('should substitute environment tokens', async () => {
      // Read synced configs
      const cursorConfig = await fs.readJson(path.join(tempTestDir, '.cursor/mcp.json'));
      const claudeConfig = await fs.readJson(path.join(tempTestDir, '.claude/mcp.json'));

      // Cursor format has mcpServers wrapper
      expect(cursorConfig.mcpServers.github.env.GITHUB_TOKEN).toBe('ghp_test_token_12345');
      expect(cursorConfig.mcpServers.github.env.GITHUB_TOKEN).not.toContain('{');

      // Claude format is direct
      expect(claudeConfig.github.env.GITHUB_TOKEN).toBe('ghp_test_token_12345');
      expect(claudeConfig.github.env.GITHUB_TOKEN).not.toContain('{');
    });

    it('should sync only to specific tool with --tool flag', async () => {
      // Remove existing configs
      await fs.remove(path.join(tempTestDir, '.cursor/mcp.json'));
      await fs.remove(path.join(tempTestDir, '.claude/mcp.json'));

      // Sync only to cursor
      const { exitCode } = await execa('agentsync', ['mcp', 'sync', '--tool', 'cursor'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);

      // Verify only cursor synced
      const cursorExists = await fs.pathExists(path.join(tempTestDir, '.cursor/mcp.json'));
      const claudeExists = await fs.pathExists(path.join(tempTestDir, '.claude/mcp.json'));

      expect(cursorExists).toBe(true);
      expect(claudeExists).toBe(false);
    });

    it('should remove MCP from project', async () => {
      const { stdout, exitCode } = await execa('agentsync', ['mcp', 'remove', 'github'], {
        cwd: tempTestDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('github') || expect(stdout).toContain('Removed');

      // Verify config updated
      const config = await fs.readJson(path.join(tempTestDir, '.agentsync.json'));
      expect(config.mcpServers).not.toContain('github');
      expect(config.mcpServers).toContain('filesystem');
    });

    it('should update targets after removal', async () => {
      // Re-add .claude/mcp.json for this test
      await execa('agentsync', ['mcp', 'sync'], {
        cwd: tempTestDir,
      });

      // Read updated configs
      const cursorConfig = await fs.readJson(path.join(tempTestDir, '.cursor/mcp.json'));
      const claudeConfig = await fs.readJson(path.join(tempTestDir, '.claude/mcp.json'));

      // Github should be removed
      expect(cursorConfig.mcpServers.github).toBeUndefined();
      expect(claudeConfig.github).toBeUndefined();

      // Filesystem should still be there
      expect(cursorConfig.mcpServers.filesystem).toBeDefined();
      expect(claudeConfig.filesystem).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent MCP gracefully', async () => {
      try {
        await execa('agentsync', ['mcp', 'add', 'nonexistent-server'], {
          cwd: tempTestDir,
        });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        const output = error.stdout || error.stderr;
        expect(output).toContain('not found') || expect(output).toContain('available');
      }
    });

    it('should handle removing non-existent MCP', async () => {
      try {
        await execa('agentsync', ['mcp', 'remove', 'not-in-project'], {
          cwd: tempTestDir,
        });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
      }
    });

    it('should handle missing environment variables as error', async () => {
      // Add postgres (requires DATABASE_URL)
      await execa('agentsync', ['mcp', 'add', 'postgres'], {
        cwd: tempTestDir,
      });

      // Remove .env to cause missing var
      await fs.remove(path.join(tempTestDir, '.env'));

      // Sync should fail with missing env var
      try {
        await execa('agentsync', ['mcp', 'sync'], {
          cwd: tempTestDir,
        });
        expect.fail('Should have thrown error for missing env var');
      } catch (error: any) {
        expect(error.exitCode).not.toBe(0);
        const output = error.stdout || error.stderr;
        expect(output).toContain('DATABASE_URL');
      }
    });
  });

  describe('Init Command - Production Package', () => {
    it('should initialize project with all templates', async () => {
      const templates = ['default', 'typescript-react', 'python-fastapi'];

      for (const template of templates) {
        const testDir = await fs.mkdtemp(path.join(os.tmpdir(), `agentsync-init-${template}-`));

        try {
          // Run init command with template (non-interactive)
          const { exitCode, stdout } = await execa(
            'agentsync',
            ['init', '--template', template, '--tools', 'cursor'],
            { cwd: testDir }
          );

          expect(exitCode).toBe(0);
          expect(stdout).toContain('✓ Created AGENTS.md');
          expect(stdout).toContain('✅ AgentSync initialized successfully!');

          // Verify AGENTS.md was actually created with correct content
          const agentsPath = path.join(testDir, 'AGENTS.md');
          expect(await fs.pathExists(agentsPath)).toBe(true);

          const content = await fs.readFile(agentsPath, 'utf-8');
          expect(content).toContain('# AGENTS.md');
          expect(content.length).toBeGreaterThan(100); // Real template, not empty/mock

          // Verify template-specific content
          if (template === 'typescript-react') {
            expect(content).toContain('TypeScript React');
            expect(content).toContain('pnpm');
          } else if (template === 'python-fastapi') {
            expect(content).toContain('FastAPI');
            expect(content).toContain('poetry');
          }

          // Verify tool configurations were created
          expect(await fs.pathExists(path.join(testDir, '.cursor'))).toBe(true);
          expect(await fs.pathExists(path.join(testDir, '.agentsync'))).toBe(true);

          console.log(`✓ Template '${template}' validated successfully`);
        } finally {
          // Cleanup test directory
          await fs.remove(testDir);
        }
      }
    });

    it('should handle missing template gracefully', async () => {
      const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-init-invalid-'));

      try {
        // Try to init with non-existent template (should fall back to default)
        const { exitCode } = await execa(
          'agentsync',
          ['init', '--template', 'nonexistent', '--tools', 'cursor'],
          { cwd: testDir }
        );

        expect(exitCode).toBe(0);

        // Should still create AGENTS.md (using default template as fallback)
        const agentsPath = path.join(testDir, 'AGENTS.md');
        expect(await fs.pathExists(agentsPath)).toBe(true);
      } finally {
        await fs.remove(testDir);
      }
    });
  });

  describe('Package Quality', () => {
    it('should have reasonable tarball size', async () => {
      const fullTarballPath = path.join(process.cwd(), tarballPath);
      const stats = await fs.stat(fullTarballPath);
      const sizeMB = stats.size / (1024 * 1024);

      // Tarball should be < 5MB (reasonable for CLI tool)
      expect(sizeMB).toBeLessThan(5);
      console.log(`Tarball size: ${sizeMB.toFixed(2)}MB`);
    });

    it('should include all required files in tarball', async () => {
      const fullTarballPath = path.join(process.cwd(), tarballPath);
      const { stdout } = await execa('tar', ['-tzf', fullTarballPath]);

      // Check for essential files
      expect(stdout).toContain('package/dist/');
      expect(stdout).toContain('package/package.json');
      expect(stdout).toContain('package/templates/');

      // Should NOT include dev files
      expect(stdout).not.toContain('node_modules/');
      expect(stdout).not.toContain('.git/');
      expect(stdout).not.toContain('tests/');
    });
  });
});
