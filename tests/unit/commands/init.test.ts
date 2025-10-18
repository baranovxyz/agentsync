/**
 * Tests for Init Command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import prompts from 'prompts';
import { InitCommand } from '../../../src/commands/init.js';
import { ConfigError } from '../../../src/core/errors.js';
import type { InitOptions } from '../../../src/types/index.js';

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    ensureDir: vi.fn(),
    writeJson: vi.fn(),
    symlink: vi.fn(),
    copy: vi.fn(),
  },
  pathExists: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  ensureDir: vi.fn(),
  writeJson: vi.fn(),
  symlink: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('prompts');

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

      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      // Should succeed without prompts
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should handle user cancellation properly', async () => {
      // Mock prompts to simulate user cancellation
      const cancelError = new ConfigError(
        'Setup cancelled',
        '',
        'Run "agentsync init" again to start over'
      );

      vi.mocked(prompts).mockRejectedValue(cancelError);

      const options: InitOptions = {};

      await expect(initCommand.execute(options)).rejects.toThrow('Setup cancelled');
    });

    it('should skip interactive setup when all options provided', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor', 'claude'],
        force: false,
      };

      await initCommand.execute(options);

      // prompts should not be called when all options are provided
      expect(prompts).not.toHaveBeenCalled();
    });

    it('should use prompts when options are not provided', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      vi.mocked(prompts).mockResolvedValue({
        template: 'default',
        tools: ['cursor'],
        useSymlinks: true,
        updateGitignore: true,
      });

      const options: InitOptions = {};

      await initCommand.execute(options);

      expect(prompts).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          onCancel: expect.any(Function),
        })
      );
    });

    it('should throw ConfigError when AGENTS.md exists without force flag', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        force: false,
      };

      await expect(initCommand.execute(options)).rejects.toThrow(ConfigError);
      await expect(initCommand.execute(options)).rejects.toThrow('AGENTS.md already exists');
    });

    it('should overwrite AGENTS.md when force flag is set', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        force: true,
      };

      await initCommand.execute(options);

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('template selection', () => {
    it('should use default template when specified', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# Default Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('default.md'),
        'utf-8'
      );
    });

    it('should use typescript-react template when specified', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# TypeScript React Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();

      const options: InitOptions = {
        template: 'typescript-react',
        tools: ['cursor'],
      };

      await initCommand.execute(options);

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('typescript-react.md'),
        'utf-8'
      );
    });
  });

  describe('tool setup', () => {
    beforeEach(() => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();
      vi.mocked(fs.symlink).mockResolvedValue();
      vi.mocked(fs.copy).mockResolvedValue();
    });

    it('should create symlinks when useSymlinks is true', async () => {
      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
        useSymlinks: true,
      };

      await initCommand.execute(options);

      expect(fs.symlink).toHaveBeenCalled();
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
      expect(fs.symlink).not.toHaveBeenCalled();
    });

    it('should setup multiple tools', async () => {
      const options: InitOptions = {
        template: 'default',
        tools: ['cursor', 'claude', 'cline'],
        useSymlinks: true,
      };

      await initCommand.execute(options);

      // Each tool has 2 config paths, so 6 symlinks total
      expect(fs.symlink).toHaveBeenCalledTimes(6);
    });
  });

  describe('gitignore update', () => {
    beforeEach(() => {
      vi.mocked(fs.readFile).mockResolvedValue('# Template');
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.ensureDir).mockResolvedValue();
      vi.mocked(fs.writeJson).mockResolvedValue();
    });

    it('should add AgentSync entries to .gitignore', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) return '# Existing content\n';
        return '# Template';
      });

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      vi.mocked(prompts).mockResolvedValue({
        updateGitignore: true,
        useSymlinks: true,
      });

      await initCommand.execute(options);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('# AgentSync')
      );
    });

    it('should skip updating .gitignore if already has AgentSync section', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) return true;
        return false;
      });

      vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
        if (path.toString().includes('.gitignore')) {
          return '# Existing content\n# AgentSync\n.agentsync/logs/\n';
        }
        return '# Template';
      });

      const writeFileSpy = vi.mocked(fs.writeFile);

      const options: InitOptions = {
        template: 'default',
        tools: ['cursor'],
      };

      vi.mocked(prompts).mockResolvedValue({
        updateGitignore: true,
        useSymlinks: true,
      });

      await initCommand.execute(options);

      // Should write AGENTS.md but not .gitignore
      const gitignoreWrites = writeFileSpy.mock.calls.filter(call =>
        call[0].toString().includes('.gitignore')
      );
      expect(gitignoreWrites).toHaveLength(0);
    });
  });
});
