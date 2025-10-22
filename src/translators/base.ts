/**
 * Base Translator Abstract Class
 * Provides common functionality for all tool-specific translators
 */

import * as path from "node:path";
import AuditLogger, { AuditEventType } from "../core/audit.js";
import {
  ErrorCategory,
  ErrorSeverity,
  FileSystemError,
  ValidationError,
} from "../core/errors.js";
import type {
  AgentsMd,
  FileOperation,
  SyncOperation,
  ToolName,
  Translator,
} from "../types/index.js";
import type { TranslateResult } from "../types/schemas.js";
import {
  ensureDir,
  pathExists,
  readdir,
  remove,
  rename,
  symlink,
  writeFile,
} from "../utils/fs.js";

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
  abstract translate(
    agentsMd: AgentsMd,
    targetDir: string,
  ): Promise<TranslateResult>;

  /**
   * Get list of current tool configuration files
   */
  async getCurrentFiles(targetDir: string): Promise<string[]> {
    const paths = this.getToolPaths();
    const files: string[] = [];

    // Check main config
    const mainPath = path.join(targetDir, paths.mainConfig);
    if (await pathExists(mainPath)) {
      files.push(mainPath);
    }

    // Check config directory
    const configDirPath = path.join(targetDir, paths.configDir);
    if (await pathExists(configDirPath)) {
      const dirFiles = await readdir(configDirPath);
      files.push(...dirFiles.map((f) => path.join(configDirPath, f)));
    }

    // Check alternative configs
    if (paths.alternativeConfigs) {
      for (const altConfig of paths.alternativeConfigs) {
        const altPath = path.join(targetDir, altConfig);
        if (await pathExists(altPath)) {
          files.push(altPath);
        }
      }
    }

    return files;
  }

  /**
   * Perform a dry run without making changes
   */
  async dryRun(
    agentsMd: AgentsMd,
    targetDir: string,
  ): Promise<TranslateResult> {
    // Call translate in dry-run mode (doesn't write files)
    const result = await this.translate(agentsMd, targetDir);

    // Mark all operations as dry-run
    if (result.operations) {
      result.operations = result.operations.map(
        (op) =>
          ({
            ...op,
            dryRun: true,
          }) as FileOperation,
      );
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
        await remove(file);
        await this.audit.logFileOperation("delete", file, true, {
          tool: this.name,
        });
      } catch (error) {
        await this.audit.logError(
          error as Error,
          ErrorCategory.FILE_SYSTEM,
          ErrorSeverity.MEDIUM,
          { tool: this.name, file },
        );
        throw new FileSystemError(
          `Failed to cleanup ${file}`,
          file,
          error as Error,
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
      await ensureDir(path.dirname(target));

      // Remove existing file/symlink if exists
      if (await pathExists(target)) {
        await remove(target);
      }

      // Try to create symlink
      try {
        await symlink(source, target);
      } catch (symlinkError) {
        // Fallback to pointer file if symlink fails
        const pointerContent =
          `# AgentSync Pointer File\n# This file points to: ${source}\n\n` +
          `Please refer to ${path.relative(path.dirname(target), source)} for the actual configuration.`;
        await writeFile(target, pointerContent);

        await this.audit.log({
          type: AuditEventType.CONFIG_UPDATE,
          severity: "warning",
          category: "config",
          message: `Symlink fallback: created pointer file instead`,
          metadata: {
            tool: this.name,
            action: "symlink_fallback",
            source,
            target,
            reason: (symlinkError as Error).message,
          },
        });
      }
    } catch (error) {
      throw new FileSystemError(
        `Failed to create symlink from ${source} to ${target}`,
        target,
        error as Error,
      );
    }
  }

  /**
   * Write file with atomic operation
   */
  protected async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure directory exists
      await ensureDir(path.dirname(filePath));

      // Write to temp file first
      const tempPath = `${filePath}.tmp`;
      await writeFile(tempPath, content, { encoding: "utf-8" });

      // Rename atomically
      await rename(tempPath, filePath);

      await this.audit.logFileOperation("write", filePath, true, {
        tool: this.name,
      });
    } catch (error) {
      throw new FileSystemError(
        `Failed to write file ${filePath}`,
        filePath,
        error as Error,
      );
    }
  }

  /**
   * Ensure directory exists
   */
  protected async ensureDir(dirPath: string): Promise<void> {
    try {
      await ensureDir(dirPath);
    } catch (error) {
      throw new FileSystemError(
        `Failed to create directory ${dirPath}`,
        dirPath,
        error as Error,
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
          undefined,
          { suggestion: `Remove duplicate operations for ${op.path}` },
        );
      }
      paths.add(op.path);
    }

    // Validate operation types
    for (const op of operations) {
      if (
        ![
          "create",
          "write",
          "modify",
          "delete",
          "symlink",
          "create_dir",
        ].includes(op.type)
      ) {
        throw new ValidationError(
          `Invalid operation type: ${op.type}`,
          undefined,
          { suggestion: "Use a valid operation type" },
        );
      }

      // Validate required fields
      if (op.type === "write" || op.type === "create" || op.type === "modify") {
        if (!op.content) {
          throw new ValidationError(
            `Operation ${op.type} requires content for ${op.path}`,
            undefined,
            { suggestion: "Provide content for write operations" },
          );
        }
      }

      if (op.type === "symlink" && !op.target) {
        throw new ValidationError(
          `Symlink operation requires target for ${op.path}`,
          undefined,
          { suggestion: "Provide target for symlink operations" },
        );
      }
    }
  }

  /**
   * Convert file operations to sync operations
   */
  protected toSyncOperations(operations: FileOperation[]): SyncOperation[] {
    return operations.map((op) => ({
      ...op,
      tool: this.name,
      status: "pending" as const,
    }));
  }

  /**
   * Check if platform supports symlinks
   */
  protected async supportsSymlinks(): Promise<boolean> {
    // Windows requires admin rights or developer mode for symlinks
    if (process.platform === "win32") {
      try {
        // Try to create a test symlink
        const testDir = path.join(process.cwd(), ".agentsync", "test");
        const testSource = path.join(testDir, "source.txt");
        const testTarget = path.join(testDir, "target.txt");

        await ensureDir(testDir);
        await writeFile(testSource, "test");

        try {
          await symlink(testSource, testTarget);
          await remove(testTarget);
          return true;
        } catch {
          return false;
        } finally {
          await remove(testDir);
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
      .replace(/\.\./g, "") // Prevent directory traversal
      .replace(/[<>:"|?*]/g, "_"); // Remove invalid Windows characters

    return sanitized;
  }
}

export default BaseTranslator;
