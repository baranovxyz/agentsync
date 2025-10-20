import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RulesSyncTarget } from '../../src/targets/rules-sync-target.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('RulesSyncTarget Integration', () => {
  let tempDir: string;
  let target: RulesSyncTarget;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-test-'));
    target = new RulesSyncTarget();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('sync to Cursor', () => {
    it('syncs rules to Cursor with .mdc extension', async () => {
      const rules = new Map([
        ['team:typescript.md', '# TypeScript Rules\n\nUse strict mode.'],
        ['company:security.md', '# Security\n\nNo secrets.'],
      ]);

      await target.sync(rules, ['cursor'], tempDir);

      // Check files created
      const cursorRulesDir = path.join(tempDir, '.cursor', 'rules');
      expect(await fs.pathExists(path.join(cursorRulesDir, 'team:typescript.mdc'))).toBe(true);
      expect(await fs.pathExists(path.join(cursorRulesDir, 'company:security.mdc'))).toBe(true);

      // Check content
      const content = await fs.readFile(
        path.join(cursorRulesDir, 'team:typescript.mdc'),
        'utf-8'
      );
      expect(content).toBe('# TypeScript Rules\n\nUse strict mode.');
    });

    it('creates directory if it does not exist', async () => {
      const rules = new Map([['team:api.md', '# API Design']]);

      await target.sync(rules, ['cursor'], tempDir);

      const cursorRulesDir = path.join(tempDir, '.cursor', 'rules');
      expect(await fs.pathExists(cursorRulesDir)).toBe(true);
    });
  });

  describe('sync to Claude', () => {
    it('syncs rules to Claude with .md extension', async () => {
      const rules = new Map([
        ['team:api.md', '# API Design\n\nRESTful patterns.'],
        ['company:testing.md', '# Testing\n\nWrite tests.'],
      ]);

      await target.sync(rules, ['claude'], tempDir);

      const claudeRulesDir = path.join(tempDir, '.claude', 'rules');
      expect(await fs.pathExists(path.join(claudeRulesDir, 'team:api.md'))).toBe(true);
      expect(await fs.pathExists(path.join(claudeRulesDir, 'company:testing.md'))).toBe(true);

      const content = await fs.readFile(
        path.join(claudeRulesDir, 'team:api.md'),
        'utf-8'
      );
      expect(content).toBe('# API Design\n\nRESTful patterns.');
    });
  });

  describe('sync to multiple tools', () => {
    it('syncs to both Cursor and Claude', async () => {
      const rules = new Map([['team:shared.md', '# Shared Rules']]);

      await target.sync(rules, ['cursor', 'claude'], tempDir);

      expect(
        await fs.pathExists(path.join(tempDir, '.cursor', 'rules', 'team:shared.mdc'))
      ).toBe(true);
      expect(
        await fs.pathExists(path.join(tempDir, '.claude', 'rules', 'team:shared.md'))
      ).toBe(true);
    });
  });

  describe('empty rules', () => {
    it('handles empty rules map', async () => {
      const rules = new Map();

      await target.sync(rules, ['cursor', 'claude'], tempDir);

      // Should not error, just create no files
      const cursorDir = path.join(tempDir, '.cursor', 'rules');
      const claudeDir = path.join(tempDir, '.claude', 'rules');

      // Directories might exist but should be empty (or not exist)
      if (await fs.pathExists(cursorDir)) {
        const files = await fs.readdir(cursorDir);
        expect(files.length).toBe(0);
      }
    });
  });
});
