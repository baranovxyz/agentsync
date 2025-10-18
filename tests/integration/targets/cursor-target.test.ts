/**
 * Cursor Target Integration Tests
 * Tests Cursor MCP target implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CursorTarget } from '../../../src/targets/cursor.js';
import type { MCP } from '../../../src/core/mcp/tokens.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('CursorTarget', () => {
  let tempDir: string;
  let originalCwd: string;
  let target: CursorTarget;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsync-cursor-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    target = new CursorTarget();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it('has name "cursor"', () => {
    expect(target.name).toBe('cursor');
  });

  it('detect() returns false when .cursor directory does not exist', async () => {
    const detected = await target.detect();
    expect(detected).toBe(false);
  });

  it('detect() returns true when .cursor directory exists', async () => {
    await fs.ensureDir('.cursor');

    const detected = await target.detect();
    expect(detected).toBe(true);
  });

  it('syncMCP() creates .cursor directory if not exists', async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_TOKEN: 'ghp_test123',
        },
      },
    };

    await target.syncMCP(mcps);

    const dirExists = await fs.pathExists('.cursor');
    expect(dirExists).toBe(true);
  });

  it('syncMCP() writes mcp.json with mcpServers wrapper', async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_TOKEN: 'ghp_test123',
        },
      },
      postgres: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
          POSTGRES_URL: 'postgresql://localhost/db',
        },
      },
    };

    await target.syncMCP(mcps);

    const mcpPath = path.join('.cursor', 'mcp.json');
    const content = await fs.readJson(mcpPath);

    expect(content).toHaveProperty('mcpServers');
    expect(content.mcpServers).toEqual(mcps);
  });

  it('syncMCP() formats JSON with 2-space indentation', async () => {
    const mcps: Record<string, MCP> = {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
    };

    await target.syncMCP(mcps);

    const mcpPath = path.join('.cursor', 'mcp.json');
    const content = await fs.readFile(mcpPath, 'utf-8');

    // Check for 2-space indentation
    expect(content).toContain('  "mcpServers"');
    expect(content).toContain('    "github"');
  });

  it('syncMCP() overwrites existing mcp.json', async () => {
    await fs.ensureDir('.cursor');
    await fs.writeJson(path.join('.cursor', 'mcp.json'), { old: 'data' });

    const mcps: Record<string, MCP> = {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
    };

    await target.syncMCP(mcps);

    const content = await fs.readJson(path.join('.cursor', 'mcp.json'));
    expect(content).not.toHaveProperty('old');
    expect(content.mcpServers.github).toBeDefined();
  });

  it('syncMCP() handles empty MCPs', async () => {
    const mcps: Record<string, MCP> = {};

    await target.syncMCP(mcps);

    const content = await fs.readJson(path.join('.cursor', 'mcp.json'));
    expect(content.mcpServers).toEqual({});
  });
});
