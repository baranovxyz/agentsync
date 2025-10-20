/**
 * MCP Remove Command Tests
 * Tests removing MCP server from project config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { removeMCP } from '../../../../src/commands/mcp/remove.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('removeMCP', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-remove-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it('removes MCP from array config', async () => {
    const projectConfig = {
      mcpServers: ['github', 'postgres', 'linear'],
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    await removeMCP('postgres');

    const updated = await fs.readJson('.agentsync.json');
    expect(updated.mcpServers).toEqual(['github', 'linear']);
  });

  it('does nothing if MCP not in config', async () => {
    const projectConfig = {
      mcpServers: ['github'],
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    await removeMCP('postgres');

    const updated = await fs.readJson('.agentsync.json');
    expect(updated.mcpServers).toEqual(['github']); // Unchanged
  });

  it('throws error if .agentsync.json does not exist', async () => {
    await expect(removeMCP('github')).rejects.toThrow(/Project configuration not found/);
  });

  it('allows removing last MCP, resulting in empty array', async () => {
    const projectConfig = {
      mcpServers: ['github'],
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    const result = await removeMCP('github');

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe('github');

    const updated = await fs.readJson('.agentsync.json');
    expect(updated.mcpServers).toEqual([]);
  });

  it('handles object format config', async () => {
    const projectConfig = {
      mcpServers: {
        github: true,
        postgres: true,
      },
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    await removeMCP('postgres');

    const updated = await fs.readJson('.agentsync.json');
    expect(updated.mcpServers.github).toBe(true);
    expect(updated.mcpServers.postgres).toBeUndefined();
  });

  it('returns result with removed status', async () => {
    const projectConfig = {
      mcpServers: ['github', 'postgres'],
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    const result = await removeMCP('postgres');

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe('postgres');
  });

  it('allows removing last MCP in object format, resulting in empty object', async () => {
    const projectConfig = {
      mcpServers: {
        github: true,
      },
    };
    await fs.writeJson('.agentsync.json', projectConfig);

    const result = await removeMCP('github');

    expect(result.removed).toBe(true);
    expect(result.serverName).toBe('github');

    const updated = await fs.readJson('.agentsync.json');
    expect(updated.mcpServers).toEqual({});
  });
});
