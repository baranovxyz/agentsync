import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandsSyncTarget } from '../../src/targets/commands-sync-target.js';
import * as fs from 'fs-extra'; // TODO: migrate to native
import * as path from 'path';
import * as os from 'os';

describe('CommandsSyncTarget Integration', () => {
  let tempDir: string;
  let target: CommandsSyncTarget;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-test-'));
    target = new CommandsSyncTarget();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('sync to Cursor', () => {
    it('syncs commands to Cursor', async () => {
      const commands = new Map([
        ['team:commit.md', '# Generate Commit\n\nCreate conventional commit.'],
        ['company:test.md', '# Run Tests\n\nExecute test suite.'],
      ]);

      await target.sync(commands, ['cursor'], tempDir);

      const cursorCommandsDir = path.join(tempDir, '.cursor', 'commands');
      expect(await fs.pathExists(path.join(cursorCommandsDir, 'team:commit.md'))).toBe(true);
      expect(await fs.pathExists(path.join(cursorCommandsDir, 'company:test.md'))).toBe(true);

      const content = await fs.readFile(
        path.join(cursorCommandsDir, 'team:commit.md'),
        'utf-8'
      );
      expect(content).toBe('# Generate Commit\n\nCreate conventional commit.');
    });

    it('creates directory if it does not exist', async () => {
      const commands = new Map([['team:deploy.md', '# Deploy']]);

      await target.sync(commands, ['cursor'], tempDir);

      const cursorCommandsDir = path.join(tempDir, '.cursor', 'commands');
      expect(await fs.pathExists(cursorCommandsDir)).toBe(true);
    });
  });

  describe('sync to Claude', () => {
    it('syncs commands to Claude', async () => {
      const commands = new Map([
        ['team:review.md', '# Code Review\n\nReview checklist.'],
      ]);

      await target.sync(commands, ['claude'], tempDir);

      const claudeCommandsDir = path.join(tempDir, '.claude', 'commands');
      expect(await fs.pathExists(path.join(claudeCommandsDir, 'team:review.md'))).toBe(true);

      const content = await fs.readFile(
        path.join(claudeCommandsDir, 'team:review.md'),
        'utf-8'
      );
      expect(content).toBe('# Code Review\n\nReview checklist.');
    });
  });

  describe('sync to multiple tools', () => {
    it('syncs to both Cursor and Claude', async () => {
      const commands = new Map([['team:shared.md', '# Shared Command']]);

      await target.sync(commands, ['cursor', 'claude'], tempDir);

      expect(
        await fs.pathExists(path.join(tempDir, '.cursor', 'commands', 'team:shared.md'))
      ).toBe(true);
      expect(
        await fs.pathExists(path.join(tempDir, '.claude', 'commands', 'team:shared.md'))
      ).toBe(true);
    });
  });

  describe('empty commands', () => {
    it('handles empty commands map', async () => {
      const commands = new Map();

      await target.sync(commands, ['cursor', 'claude'], tempDir);

      // Should not error, just create no files
      const cursorDir = path.join(tempDir, '.cursor', 'commands');
      const claudeDir = path.join(tempDir, '.claude', 'commands');

      if (await fs.pathExists(cursorDir)) {
        const files = await fs.readdir(cursorDir);
        expect(files.length).toBe(0);
      }
    });
  });
});
