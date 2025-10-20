/**
 * E2E test using real GitHub library
 * Tests the full workflow with baranovxyz/agentsync-example-typescript
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { execa } from 'execa';

describe('Real GitHub Library Integration', () => {
  let testDir: string;
  let cliPath: string;

  beforeAll(async () => {
    // Create temp test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-e2e-github-'));

    // Use built CLI
    cliPath = path.join(process.cwd(), 'dist', 'cli.js');

    // Verify CLI exists
    expect(await fs.pathExists(cliPath)).toBe(true);
  });

  afterAll(async () => {
    // Cleanup
    await fs.remove(testDir);
  });

  it('should sync real library from GitHub', async () => {
    // 1. Create config extending real example library
    const configDir = path.join(testDir, '.agentsync');
    await fs.ensureDir(configDir);
    await fs.outputFile(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        version: '1.0',
        extends: ['github:baranovxyz/agentsync-example-typescript'],
        tools: ['cursor'],
        useSymlinks: false,
      }, null, 2),
      'utf-8'
    );

    // 2. Run sync command
    const { stdout, stderr } = await execa('node', [cliPath, 'sync'], {
      cwd: testDir,
      timeout: 60000, // 60s for GitHub clone
    });

    // 3. Verify sync completed
    expect(stdout).toContain('Sync complete');

    // 4. Verify rules were created (namespace from library.json: typescript-example)
    const cursorRulesDir = path.join(testDir, '.cursor', 'rules');
    expect(await fs.pathExists(cursorRulesDir)).toBe(true);

    const rules = await fs.readdir(cursorRulesDir);
    expect(rules).toContain('typescript-example:typescript-strict.mdc');
    expect(rules).toContain('typescript-example:testing.mdc');
    expect(rules).toContain('typescript-example:api-design.mdc');

    // 5. Verify commands were created
    const cursorCommandsDir = path.join(testDir, '.cursor', 'commands');
    expect(await fs.pathExists(cursorCommandsDir)).toBe(true);

    const commands = await fs.readdir(cursorCommandsDir);
    expect(commands).toContain('typescript-example:commit.md');
    expect(commands).toContain('typescript-example:review.md');
    expect(commands).toContain('typescript-example:test.md');

    // 6. Verify content is correct
    const ruleContent = await fs.readFile(
      path.join(cursorRulesDir, 'typescript-example:typescript-strict.mdc'),
      'utf-8'
    );
    expect(ruleContent).toContain('TypeScript Strict Mode');
    expect(ruleContent).toContain('"strict"'); // JSON has quotes

    // 7. Verify library cache was created
    const cacheDir = path.join(os.homedir(), '.agentsync', 'cache');
    const cachedLibs = await fs.readdir(cacheDir).catch(() => []);
    const hasTypescriptExample = cachedLibs.some(dir =>
      dir.includes('baranovxyz') && dir.includes('agentsync-example-typescript')
    );
    expect(hasTypescriptExample).toBe(true);
  }, 90000); // 90s timeout for GitHub operations

  it('should update library cache with --update flag', async () => {
    // 1. Config already exists from previous test

    // 2. Run sync with --update
    const { stdout } = await execa('node', [cliPath, 'sync', '--update'], {
      cwd: testDir,
      timeout: 60000,
    });

    // 3. Verify sync completed
    expect(stdout).toContain('Sync complete');

    // 4. Verify files still exist (re-synced)
    const cursorRulesDir = path.join(testDir, '.cursor', 'rules');
    const rules = await fs.readdir(cursorRulesDir);
    expect(rules.length).toBeGreaterThan(0);
  }, 90000);

  it('should preview changes with --dry-run', async () => {
    // 1. Create fresh directory
    const dryRunDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-dry-'));

    try {
      // 2. Create config
      const configDir = path.join(dryRunDir, '.agentsync');
      await fs.ensureDir(configDir);
      await fs.outputFile(
        path.join(configDir, 'config.json'),
        JSON.stringify({
          version: '1.0',
          extends: ['github:baranovxyz/agentsync-example-typescript'],
          tools: ['cursor'],
        }, null, 2),
        'utf-8'
      );

      // 3. Run with --dry-run
      const { stdout } = await execa('node', [cliPath, 'sync', '--dry-run'], {
        cwd: dryRunDir,
        timeout: 60000,
      });

      // 4. Verify preview message
      expect(stdout).toContain('Dry run');

      // 5. Verify NO files were created
      const cursorDir = path.join(dryRunDir, '.cursor');
      expect(await fs.pathExists(cursorDir)).toBe(false);
    } finally {
      await fs.remove(dryRunDir);
    }
  }, 90000);

  it('should list library with cache metadata', async () => {
    // Run library list command
    const { stdout } = await execa('node', [cliPath, 'library', 'list'], {
      cwd: testDir,
      timeout: 10000,
    });

    // Verify library is shown
    expect(stdout).toContain('baranovxyz/agentsync-example-typescript');
    expect(stdout).toContain('Namespace:'); // Has namespace field
    expect(stdout).toContain('Cached');
  }, 30000);
});
