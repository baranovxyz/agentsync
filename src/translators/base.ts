/**
 * Base Translator Abstract Class
 * Provides common functionality for all tool-specific translators
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { FileSystemError, ValidationError } from '../core/errors.js';
import type {
  Translator,
  ToolName,
  FileOperation,
  SyncOperation,
  TranslateResult,
  AgentsMd,
} from '../types/index.js';
import AuditLogger, { AuditEventType } from '../core/audit.js';

/**
 * Tool-specific path configurations
 */
export interface ToolPaths {
  configDir: string;
  mainConfig: string;
  alternativeConfigs?: string[];
  supportsSymlinks: boolean;
}

/**
 * Abstract base class for all translators
 */
export abstract class BaseTranslator implements Translator {
  protected audit: AuditLogger;

  constructor(public readonly name: ToolName) {
    this.audit = AuditLogger.getInstance();
  }

  /**
   * Translate AGENTS.md to tool-specific format
   * Must be implemented by each translator
   */
  abstract translate(agentsMd: AgentsMd, targetDir: string): Promise<TranslateResult>;

  /**
   * Get list of current tool configuration files
   */
  async getCurrentFiles(targetDir: string): Promise<string[]> {
    const paths = this.getToolPaths();
    const files: string[] = [];

    // Check main config
    const mainPath = path.join(targetDir, paths.mainConfig);
    if (await fs.pathExists(mainPath)) {
      files.push(mainPath);
    }

    // Check config directory
    const configDirPath = path.join(targetDir, paths.configDir);
    if (await fs.pathExists(configDirPath)) {
      const dirFiles = await fs.readdir(configDirPath);
      files.push(...dirFiles.map(f => path.join(configDirPath, f)));
    }

    // Check alternative configs
    if (paths.alternativeConfigs) {
      for (const altConfig of paths.alternativeConfigs) {
        const altPath = path.join(targetDir, altConfig);
        if (await fs.pathExists(altPath)) {
          files.push(altPath);
        }
      }
    }

    return files;
  }

  /**
   * Perform a dry run without making changes
   */
  async dryRun(agentsMd: AgentsMd, targetDir: string): Promise<TranslateResult> {
    // Call translate in dry-run mode (doesn't write files)
    const result = await this.translate(agentsMd, targetDir);

    // Mark all operations as dry-run
    if (result.operations) {
      result.operations = result.operations.map(op => ({
        ...op,
        dryRun: true,
      } as FileOperation));
    }

    return result;
  }

  /**
   * Clean up tool-specific configurations
   */
  async cleanup(targetDir: string): Promise<void> {
    const files = await this.getCurrentFiles(targetDir);

    for (const file of files) {
      try {
        await fs.remove(file);
        await this.audit.logEvent(
          AuditEventType.FILE_DELETE,
          { tool: this.name, file },
          'success'
        );
      } catch (error) {
        await this.audit.logError(
          error as Error,
          'FILE_SYSTEM',
          'MEDIUM',
          { tool: this.name, file }
        );
        throw new FileSystemError(
          `Failed to cleanup ${file}`,
          file,
          error as Error
        );
      }
    }
  }

  /**
   * Get tool-specific paths
   * Must be implemented by each translator
   */
  protected abstract getToolPaths(): ToolPaths;

  /**
   * Create a symlink with cross-platform support
   */
  protected async createSymlink(source: string, target: string): Promise<void> {
    try {
      // Ensure target directory exists
      await fs.ensureDir(path.dirname(target));

      // Remove existing file/symlink if exists
      if (await fs.pathExists(target)) {
        await fs.remove(target);
      }

      // Try to create symlink
      try {
        await fs.symlink(source, target);
      } catch (symlinkError) {
        // Fallback to pointer file if symlink fails
        const pointerContent = `# AgentSync Pointer File\n# This file points to: ${source}\n\n` +
          `Please refer to ${path.relative(path.dirname(target), source)} for the actual configuration.`;
        await fs.writeFile(target, pointerContent);

        await this.audit.logEvent(
          AuditEventType.CONFIG_CHANGE,
          {
            tool: this.name,
            action: 'symlink_fallback',
            source,
            target,
            reason: (symlinkError as Error).message
          },
          'warning'
        );
      }
    } catch (error) {
      throw new FileSystemError(
        `Failed to create symlink from ${source} to ${target}`,
        target,
        error as Error
      );
    }
  }

  /**
   * Write file with atomic operation
   */
  protected async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));

      // Write to temp file first
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, content, 'utf-8');

      // Rename atomically
      await fs.rename(tempPath, filePath);

      await this.audit.logEvent(
        AuditEventType.FILE_MODIFY,
        { tool: this.name, file: filePath },
        'success'
      );
    } catch (error) {
      throw new FileSystemError(
        `Failed to write file ${filePath}`,
        filePath,
        error as Error
      );
    }
  }

  /**
   * Ensure directory exists
   */
  protected async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.ensureDir(dirPath);
    } catch (error) {
      throw new FileSystemError(
        `Failed to create directory ${dirPath}`,
        dirPath,
        error as Error
      );
    }
  }

  /**
   * Validate operations before execution
   */
  protected validateOperations(operations: FileOperation[]): void {
    // Check for duplicate paths
    const paths = new Set<string>();
    for (const op of operations) {
      if (paths.has(op.path)) {
        throw new ValidationError(
          `Duplicate operation on path: ${op.path}`,
          `Remove duplicate operations for ${op.path}`
        );
      }
      paths.add(op.path);
    }

    // Validate operation types
    for (const op of operations) {
      if (!['create', 'write', 'modify', 'delete', 'symlink', 'create_dir'].includes(op.type)) {
        throw new ValidationError(
          `Invalid operation type: ${op.type}`,
          'Use a valid operation type'
        );
      }

      // Validate required fields
      if (op.type === 'write' || op.type === 'create' || op.type === 'modify') {
        if (!op.content) {
          throw new ValidationError(
            `Operation ${op.type} requires content for ${op.path}`,
            'Provide content for write operations'
          );
        }
      }

      if (op.type === 'symlink' && !op.target) {
        throw new ValidationError(
          `Symlink operation requires target for ${op.path}`,
          'Provide target for symlink operations'
        );
      }
    }
  }

  /**
   * Convert file operations to sync operations
   */
  protected toSyncOperations(operations: FileOperation[]): SyncOperation[] {
    return operations.map(op => ({
      ...op,
      tool: this.name,
      status: 'pending' as const,
    }));
  }

  /**
   * Check if platform supports symlinks
   */
  protected async supportsSymlinks(): Promise<boolean> {
    // Windows requires admin rights or developer mode for symlinks
    if (process.platform === 'win32') {
      try {
        // Try to create a test symlink
        const testDir = path.join(process.cwd(), '.agentsync', 'test');
        const testSource = path.join(testDir, 'source.txt');
        const testTarget = path.join(testDir, 'target.txt');

        await fs.ensureDir(testDir);
        await fs.writeFile(testSource, 'test');

        try {
          await fs.symlink(testSource, testTarget);
          await fs.remove(testTarget);
          return true;
        } catch {
          return false;
        } finally {
          await fs.remove(testDir);
        }
      } catch {
        return false;
      }
    }

    // Unix-like systems generally support symlinks
    return true;
  }

  /**
   * Get relative path for symlink
   */
  protected getRelativePath(from: string, to: string): string {
    return path.relative(path.dirname(from), to);
  }

  /**
   * Sanitize file path for the target system
   */
  protected sanitizePath(filePath: string): string {
    // Remove any dangerous characters
    const sanitized = filePath
      .replace(/\.\./g, '') // Prevent directory traversal
      .replace(/[<>:"|?*]/g, '_'); // Remove invalid Windows characters

    return sanitized;
  }
}

export default BaseTranslator;