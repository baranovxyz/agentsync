/**
 * MCP Add Command Tests
 * Tests adding MCP server to project config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { addMCP } from '../../../../src/commands/mcp/add.js';
import * as fs from 'fs-extra'; // TODO: migrate to native
import * as path from 'path';
import * as os from 'os';

describe('addMCP', () => {
  let tempDir: string;
  let tempHomeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-add-'));
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

    // Setup global registry
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
      },
      linear: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-linear'],
      },
    };

    const agentsyncDir = path.join(tempHomeDir, '.agentsync');
    await fs.ensureDir(agentsyncDir);
    await fs.writeJson(path.join(agentsyncDir, 'mcp.json'), globalRegistry);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Restore USERPROFILE on Windows
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    }

    await fs.remove(tempDir);
    await fs.remove(tempHomeDir);
  });

  it('adds MCP to existing array config', async () => {
    const projectConfig = {
      mcpServers: ['github'],
    };
    await fs.writeJson('agentsync.local.json', projectConfig);

    await addMCP('postgres');

    const updated = await fs.readJson('agentsync.local.json');
    expect(updated.mcpServers).toEqual(['github', 'postgres']);
  });

  it('does not add duplicate MCP', async () => {
    const projectConfig = {
      mcpServers: ['github', 'postgres'],
    };
    await fs.writeJson('agentsync.local.json', projectConfig);

    await addMCP('github');

    const updated = await fs.readJson('agentsync.local.json');
    expect(updated.mcpServers).toEqual(['github', 'postgres']); // No duplicate
  });

  it('creates agentsync.local.json if it does not exist', async () => {
    await addMCP('github');

    const exists = await fs.pathExists('agentsync.local.json');
    expect(exists).toBe(true);

    const config = await fs.readJson('agentsync.local.json');
    expect(config.mcpServers).toEqual(['github']);
  });

  it('throws error if MCP not in global registry', async () => {
    const projectConfig = {
      mcpServers: ['github'],
    };
    await fs.writeJson('agentsync.local.json', projectConfig);

    await expect(addMCP('nonexistent')).rejects.toThrow(
      /MCP server 'nonexistent' not found in global registry/
    );
  });

  it('returns info about required environment variables', async () => {
    const projectConfig = {
      mcpServers: ['postgres'],
    };
    await fs.writeJson('agentsync.local.json', projectConfig);

    const result = await addMCP('github');

    expect(result.added).toBe(true);
    expect(result.requiredEnv).toContain('GITHUB_TOKEN');
  });

  it('handles object format config', async () => {
    const projectConfig = {
      mcpServers: {
        github: true,
      },
    };
    await fs.writeJson('agentsync.local.json', projectConfig);

    await addMCP('postgres');

    const updated = await fs.readJson('agentsync.local.json');
    expect(updated.mcpServers.github).toBe(true);
    expect(updated.mcpServers.postgres).toBe(true);
  });
});
