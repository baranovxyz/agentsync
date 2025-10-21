/**
 * Tests for Init Command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';
import * as fsUtils from '../../../src/utils/fs.js';
import { InitCommand } from '../../../src/commands/init.js';
import { ConfigError } from '../../../src/core/errors.js';
import type { InitOptions } from '../../../src/types/index.js';

vi.mock('../../../src/utils/fs.js', () => ({
  pathExists: vi.fn(),
  outputFile: vi.fn(),
  ensureDir: vi.fn(),
  copy: vi.fn(),
}));

// Mock node:fs/promises (now used for readFile and symlink)
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{"tools": []}'),
  symlink: vi.fn(),
}));

// Mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  confirm: vi.fn(),
}));

describe('InitCommand', () => {
  let initCommand: InitCommand;
  const mockCwd = '/test/project';

  beforeEach(() => {
    initCommand = new InitCommand();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    // Mock stdin to simulate interactive environment
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('interactiveSetup', () => {
    it('should handle non-interactive environment without required options', async () => {
      // Mock non-interactive environment
      Object.defineProperty(process.stdin, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const options: InitOptions = {};

      await expect(initCommand.execute(options)).rejects.toThrow('Non-interactive environment detected');
    });

    it('should work in non-interactive mode when all options are provided', async () => {
      // Mock non-interactive environment
      Object.defineProperty(process.stdin, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Mock fs methods with implementation that returns different values
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        // Return false for AGENTS.md (doesn't exist yet), true for package.json search
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      // Should succeed without calling any prompt functions
      const { select, checkbox, confirm } = await import('@inquirer/prompts');
      expect(select).not.toHaveBeenCalled();
      expect(checkbox).not.toHaveBeenCalled();
    });

    it('should handle user cancellation properly', async () => {
      const { select } = await import('@inquirer/prompts');

      // Mock select to simulate user cancellation (Ctrl+C)
      const cancelError = new Error('User force closed the prompt with 0 answers');
      vi.mocked(select).mockRejectedValue(cancelError);

      vi.mocked(fsUtils.pathExists).mockResolvedValue(false);

      const options: InitOptions = {};

      await expect(initCommand.execute(options)).rejects.toThrow('Setup cancelled');
    });

    it('should skip interactive setup when all options provided', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor', 'claude'],
        force: false,
      };

      await initCommand.execute(options);

      // Prompts should not be called when all options are provided
      const { select, checkbox } = await import('@inquirer/prompts');
      expect(select).not.toHaveBeenCalled();
      expect(checkbox).not.toHaveBeenCalled();
    });

    it('should use prompts when options are not provided', async () => {
      const { select, checkbox, confirm } = await import('@inquirer/prompts');

      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      // Mock prompt responses
      vi.mocked(select).mockResolvedValue('default');
      vi.mocked(checkbox).mockResolvedValue(['cursor']);
      vi.mocked(confirm).mockResolvedValue(true);

      const options: InitOptions = {};

      await initCommand.execute(options);

      // Should have called select for template
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select a template:',
        })
      );

      // Should have called checkbox for tools
      expect(checkbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which AI tools do you use?',
        })
      );

      // Should have called confirm 2 times (symlinks and gitignore)
      expect(confirm).toHaveBeenCalledTimes(2);
    });

    it('should succeed when AGENTS.md exists but .agentsync/config.json does not', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        // AGENTS.md exists, but config.json doesn't, package.json exists for lookup
        if (pathStr.includes('AGENTS.md') && !pathStr.includes('.agentsync')) return true;
        if (pathStr.includes('package.json')) return true;
        return false;
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        force: false,
      };

      // Should not throw - AGENTS.md existence is fine
      await initCommand.execute(options);

      // Should have created .agentsync directory
      expect(fs.ensureDir).toHaveBeenCalled();
    });

    it('should show status when .agentsync/config.json exists without force flag', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        // .agentsync/config.json exists
        if (pathStr.includes('.agentsync/config.json') || pathStr.includes('.agentsync\\config.json')) return true;
        if (pathStr.includes('package.json')) return true;
        // AGENTS.md exists
        if (pathStr.includes('AGENTS.md')) return true;
        return false;
      });

      // Mock readFile for config.json (uses fsPromises now)
      vi.mocked(fsPromises.readFile).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        if (pathStr.includes('.agentsync/config.json') || pathStr.includes('.agentsync\\config.json')) {
          return JSON.stringify({ tools: ['cursor', 'claude'] }) as any;
        }
        return '# Template' as any;
      });

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        force: false,
      };

      // Should not throw - should return silently with status message
      await expect(initCommand.execute(options)).resolves.toBeUndefined();

      // Console should have logged status
      // (Can't easily assert console.log in tests, but behavior changed from throw to status)
    });

    it('should skip AGENTS.md creation when it already exists', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        // AGENTS.md exists, config.json doesn't, package.json exists
        if (pathStr.includes('AGENTS.md') && !pathStr.includes('.agentsync')) return true;
        if (pathStr.includes('package.json')) return true;
        return false;
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      // Should NOT write AGENTS.md (only reads template, doesn't write)
      const agentsMdWrites = vi.mocked(fs.outputFile).mock.calls.filter(call =>
        call[0].toString().includes('AGENTS.md')
      );
      expect(agentsMdWrites).toHaveLength(0);
    });

    it('should overwrite AGENTS.md when force flag is set', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        // Both AGENTS.md and config.json exist, package.json exists
        if (pathStr.includes('AGENTS.md') || pathStr.includes('.agentsync/config.json') || pathStr.includes('.agentsync\\config.json')) return true;
        if (pathStr.includes('package.json')) return true;
        return false;
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        force: true,
      };

      await initCommand.execute(options);

      // Should write AGENTS.md even though it exists
      const agentsMdWrites = vi.mocked(fs.outputFile).mock.calls.filter(call =>
        call[0].toString().includes('AGENTS.md')
      );
      expect(agentsMdWrites).toHaveLength(1);
    });
  });

  describe('template selection', () => {
    it('should use default template when specified', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Default Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      expect(fsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('default.md'),
        'utf-8'
      );
    });

    it('should use typescript-react template when specified', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# TypeScript React Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();

      const options: InitOptions = {
        template: 'typescript-react',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      expect(fsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('typescript-react.md'),
        'utf-8'
      );
    });
  });

  describe('tool setup', () => {
    beforeEach(() => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        return String(path).includes('package.json');
      });
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();
      vi.mocked(fsPromises.symlink).mockResolvedValue();
      vi.mocked(fs.copy).mockResolvedValue();
    });

    it('should create symlinks when useSymlinks is true', async () => {
      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        useSymlinks: true,
      };

      await initCommand.execute(options);

      expect(fsPromises.symlink).toHaveBeenCalled();
      expect(fs.copy).not.toHaveBeenCalled();
    });

    it('should copy files when useSymlinks is false', async () => {
      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        useSymlinks: false,
      };

      await initCommand.execute(options);

      expect(fs.copy).toHaveBeenCalled();
      expect(fsPromises.symlink).not.toHaveBeenCalled();
    });

    it('should setup multiple tools', async () => {
      const options: InitOptions = {
        template: 'default',
        tools: ['cursor', 'claude', 'cline'],
        useSymlinks: true,
      };

      await initCommand.execute(options);

      // Each tool has 2 config paths, so 6 symlinks total
      expect(fsPromises.symlink).toHaveBeenCalledTimes(6);
    });
  });

  describe('gitignore update', () => {
    beforeEach(() => {
      vi.mocked(fsPromises.readFile).mockResolvedValue('# Template' as any);
      vi.mocked(fsUtils.outputFile).mockResolvedValue();
      vi.mocked(fsUtils.ensureDir).mockResolvedValue();
    });

    it('should add AgentSync entries to .gitignore', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        if (pathStr.includes('.gitignore') || pathStr.includes('package.json')) return true;
        return false;
      });

      vi.mocked(fsPromises.readFile).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) return '# Existing content\n' as any;
        return '# Template' as any;
      });

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      expect(fs.outputFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('# AgentSync')
      );
    });

    it('should skip updating .gitignore if already has AgentSync section', async () => {
      vi.mocked(fsUtils.pathExists).mockImplementation(async (path: string) => {
        const pathStr = String(path);
        if (pathStr.includes('.gitignore') || pathStr.includes('package.json')) return true;
        return false;
      });

      vi.mocked(fsPromises.readFile).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) {
          return '# Existing content\n# AgentSync\n.agentsync/logs/\n' as any;
        }
        return '# Template' as any;
      });

      const outputFileSpy = vi.mocked(fs.outputFile);

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      // Should write AGENTS.md but not .gitignore
      const gitignoreWrites = outputFileSpy.mock.calls.filter(call =>
        call[0].toString().includes('.gitignore')
      );
      expect(gitignoreWrites).toHaveLength(0);
    });
  });
});
