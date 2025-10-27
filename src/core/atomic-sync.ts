/**
 * Atomic Sync Engine
 * Provides transaction-based synchronization with automatic rollback on failure
 */

import { EventEmitter } from "node:events";
import { symlink } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SecurityScanner } from "../security/scanner.js";
import { UnicodeDetector } from "../security/unicode-detector.js";
import type {
  AgentsMd,
  SyncOperation,
  SyncOptions,
  ToolName,
  Translator,
} from "../types/index.js";
import { validateAgentsMd } from "../types/schemas.js";
import {
  access,
  constants,
  copy,
  ensureDir,
  pathExists,
  remove,
  writeFile,
} from "../utils/fs.js";
import AuditLogger, { AuditEventType } from "./audit.js";
import {
  ErrorCategory,
  ErrorSeverity,
  FileSystemError,
  SecurityError,
  SyncError,
  ValidationError,
} from "./errors.js";

/**
 * Sync result with detailed information
 */
export interface AtomicSyncResult {
  success: boolean;
  operations: SyncOperation[];
  backupDir?: string;
  errors?: Error[];
  warnings?: string[];
  stats: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    duration: number;
  };
}

/**
 * Backup manifest for rollback
 */
interface BackupManifest {
  timestamp: Date;
  files: Array<{
    originalPath: string;
    backupPath: string;
    existed: boolean;
    checksum?: string;
  }>;
}

/**
 * Atomic Sync Engine with transaction support
 */
export class AtomicSyncEngine extends EventEmitter {
  private audit: AuditLogger;
  private securityScanner: SecurityScanner;
  private unicodeDetector: UnicodeDetector;
  private backupDir?: string;
  private backupManifest?: BackupManifest;
  private translators: Map<ToolName, Translator>;

  constructor() {
    super();
    this.audit = AuditLogger.getInstance();
    this.securityScanner = new SecurityScanner();
    this.unicodeDetector = new UnicodeDetector();
    this.translators = new Map();
  }

  /**
   * Register a translator for a tool
   */
  registerTranslator(tool: ToolName, translator: Translator): void {
    this.translators.set(tool, translator);
  }

  /**
   * Main sync method with atomic operations
   */
  async sync(
    agentsMd: AgentsMd,
    options: SyncOptions = {},
  ): Promise<AtomicSyncResult> {
    const startTime = Date.now();
    const operations: SyncOperation[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    // Determine target tools
    const targetTools = options.tools || this.getRegisteredTools();

    if (targetTools.length === 0) {
      throw new SyncError(
        "No tools configured for sync",
        undefined,
        undefined,
        new Error("Configure at least one tool in .agentsync/config.json"),
      );
    }

    this.emit("sync:start", { tools: targetTools, dryRun: options.dryRun });

    try {
      // 1. Pre-validation
      await this.preValidate(agentsMd, options);
      this.emit("sync:validated", { agentsMd });

      // 2. Create backup (skip in dry-run mode)
      if (!options.dryRun) {
        await this.createBackup(targetTools);
        this.emit("sync:backup", { backupDir: this.backupDir });
      }

      // 3. Generate operations for each tool
      for (const tool of targetTools) {
        try {
          const translator = this.translators.get(tool);
          if (!translator) {
            warnings.push(`No translator registered for ${tool}`);
            continue;
          }

          const result = options.dryRun
            ? await translator.dryRun(agentsMd, process.cwd())
            : await translator.translate(agentsMd, process.cwd());

          if (result.success && result.operations) {
            // Convert to sync operations
            const syncOps = result.operations.map((op) => ({
              ...op,
              tool,
              status: "pending" as const,
            }));
            operations.push(...syncOps);
          } else if (!result.success) {
            errors.push(
              new SyncError(
                `Translation failed for ${tool}`,
                undefined,
                undefined,
                new Error(`Check ${tool} translator configuration`),
              ),
            );
          }
        } catch (error) {
          errors.push(error as Error);
          this.emit("sync:tool-error", { tool, error });
        }
      }

      // 4. Execute operations (skip in dry-run mode)
      if (!options.dryRun) {
        await this.executeOperations(operations);
        this.emit("sync:executed", { operations });

        // 5. Post-validation
        await this.postValidate(operations, options);
        this.emit("sync:post-validated", { operations });

        // 6. Cleanup backup on success
        await this.cleanupBackup();
      }

      // Calculate stats
      const stats = {
        totalOperations: operations.length,
        successfulOperations: operations.filter((op) => op.status === "success")
          .length,
        failedOperations: operations.filter((op) => op.status === "failed")
          .length,
        duration: Date.now() - startTime,
      };

      // Log audit event
      await this.audit.log({
        type: AuditEventType.SYNC_SUCCESS,
        severity: errors.length > 0 ? "warning" : "info",
        category: "sync",
        message: `Sync completed with ${errors.length} errors`,
        metadata: {
          tools: targetTools,
          dryRun: options.dryRun,
          stats,
          errors: errors.map((e) => e.message),
          warnings,
        },
      });

      this.emit("sync:complete", { stats });

      return {
        success: errors.length === 0,
        operations,
        backupDir: this.backupDir,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats,
      };
    } catch (error) {
      // Rollback on any unhandled error
      if (!options.dryRun && this.backupDir) {
        await this.rollback();
        this.emit("sync:rollback", { error, backupDir: this.backupDir });
      }

      await this.audit.logError(
        error as Error,
        ErrorCategory.SYNC,
        ErrorSeverity.HIGH,
        { tools: targetTools, options },
      );

      throw new SyncError(
        "Sync failed and was rolled back",
        undefined,
        undefined,
        error as Error,
      );
    }
  }

  /**
   * Pre-validation checks
   */
  private async preValidate(
    agentsMd: AgentsMd,
    options: SyncOptions,
  ): Promise<void> {
    // 1. Validate AGENTS.md structure
    if (!options.skipValidation) {
      try {
        validateAgentsMd(agentsMd);
      } catch (error) {
        throw new ValidationError("AGENTS.md validation failed", undefined, {
          error: (error as Error).message,
          suggestion: "Fix validation errors or use --skip-validation flag",
        });
      }
    }

    // 2. Security checks
    if (!options.skipSecurity) {
      // Check for secrets
      const content = JSON.stringify(agentsMd);
      const scanResult = await this.securityScanner.scan(content);

      if (scanResult.hasSensitiveData) {
        throw new SecurityError(
          `Found ${scanResult.findingsCount} potential security issues`,
          ErrorSeverity.HIGH,
          {
            findings: scanResult.findings.slice(0, 5),
            suggestion: "Remove sensitive data before syncing",
          },
        );
      }

      // Check for Unicode attacks
      const unicodeResult = await this.unicodeDetector.detect(
        content,
        "AGENTS.md",
      );

      if (unicodeResult.findings.length > 0) {
        throw new SecurityError(
          "Detected potential Unicode attacks",
          ErrorSeverity.HIGH,
          {
            findings: unicodeResult.findings.slice(0, 5),
            suggestion: "Remove suspicious Unicode characters",
          },
        );
      }
    }

    // 3. Check file system permissions
    const configDir = path.join(process.cwd(), ".agentsync");
    try {
      await access(configDir, constants.W_OK);
    } catch {
      throw new FileSystemError(
        "No write permission for .agentsync directory",
        configDir,
        new Error("Permission denied"),
      );
    }
  }

  /**
   * Create backup of all target files
   */
  private async createBackup(targetTools: ToolName[]): Promise<void> {
    // Create backup directory
    this.backupDir = path.join(os.tmpdir(), `agentsync-backup-${Date.now()}`);
    await ensureDir(this.backupDir);

    const manifest: BackupManifest = {
      timestamp: new Date(),
      files: [],
    };

    // Backup files for each tool
    for (const tool of targetTools) {
      const translator = this.translators.get(tool);
      if (!translator) continue;

      const files = await translator.getCurrentFiles(process.cwd());

      for (const file of files) {
        const backupPath = path.join(
          this.backupDir,
          tool,
          path.relative(process.cwd(), file),
        );

        if (await pathExists(file)) {
          // Backup existing file
          await ensureDir(path.dirname(backupPath));
          await copy(file, backupPath);

          manifest.files.push({
            originalPath: file,
            backupPath,
            existed: true,
          });
        } else {
          // Record that file didn't exist
          manifest.files.push({
            originalPath: file,
            backupPath: "",
            existed: false,
          });
        }
      }
    }

    // Save manifest
    this.backupManifest = manifest;
    await writeFile(
      path.join(this.backupDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );

    await this.audit.log({
      type: AuditEventType.SYNC_START,
      severity: "info",
      category: "sync",
      message: `Sync started with backup to ${this.backupDir}`,
      metadata: {
        backupDir: this.backupDir,
        filesBackedUp: manifest.files.length,
      },
    });
  }

  /**
   * Execute sync operations
   */
  private async executeOperations(operations: SyncOperation[]): Promise<void> {
    for (const op of operations) {
      try {
        op.status = "in-progress";
        this.emit("operation:start", { operation: op });

        switch (op.type) {
          case "create_dir":
            await ensureDir(op.path);
            break;

          case "create":
          case "write":
          case "modify":
            if (!op.content) {
              throw new Error(`No content provided for ${op.type} operation`);
            }
            await ensureDir(path.dirname(op.path));
            await writeFile(op.path, op.content, { encoding: "utf-8" });
            break;

          case "delete":
            if (await pathExists(op.path)) {
              await remove(op.path);
            }
            break;

          case "symlink":
            if (!op.target) {
              throw new Error("No target provided for symlink operation");
            }
            await ensureDir(path.dirname(op.path));
            if (await pathExists(op.path)) {
              await remove(op.path);
            }
            await symlink(op.target, op.path);
            break;

          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }

        op.status = "success";
        this.emit("operation:success", { operation: op });
      } catch (error) {
        op.status = "failed";
        op.error = error as Error;
        this.emit("operation:error", { operation: op, error });
        throw error;
      }
    }
  }

  /**
   * Post-validation checks
   */
  private async postValidate(
    operations: SyncOperation[],
    _options: SyncOptions,
  ): Promise<void> {
    const errors: string[] = [];

    // Verify all files were created
    for (const op of operations) {
      if (op.type !== "delete" && op.path) {
        const exists = await pathExists(op.path);
        if (!exists) {
          errors.push(`File not created: ${op.path}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError("Post-validation failed", undefined, {
        errors,
        suggestion: "Some files were not created successfully",
      });
    }
  }

  /**
   * Rollback to backup state
   */
  private async rollback(): Promise<void> {
    if (!(this.backupDir && this.backupManifest)) {
      return;
    }

    this.emit("rollback:start", { backupDir: this.backupDir });

    for (const file of this.backupManifest.files) {
      try {
        if (file.existed) {
          // Restore backed up file
          await ensureDir(path.dirname(file.originalPath));
          await copy(file.backupPath, file.originalPath);
        } else {
          // Remove file that didn't exist before
          if (await pathExists(file.originalPath)) {
            await remove(file.originalPath);
          }
        }
      } catch (error) {
        // Log but continue rollback
        await this.audit.logError(
          error as Error,
          ErrorCategory.FILE_SYSTEM,
          ErrorSeverity.HIGH,
          { file: file.originalPath },
        );
      }
    }

    await this.audit.log({
      type: AuditEventType.SYNC_FAILURE,
      severity: "warning",
      category: "sync",
      message: `Rollback completed for ${this.backupManifest.files.length} files`,
      metadata: {
        action: "rollback",
        backupDir: this.backupDir,
        filesRestored: this.backupManifest.files.length,
      },
    });

    this.emit("rollback:complete", { backupDir: this.backupDir });
  }

  /**
   * Cleanup backup directory
   */
  private async cleanupBackup(): Promise<void> {
    if (this.backupDir) {
      try {
        await remove(this.backupDir);
        this.backupDir = undefined;
        this.backupManifest = undefined;
      } catch (error) {
        // Log but don't fail
        await this.audit.logError(
          error as Error,
          ErrorCategory.FILE_SYSTEM,
          ErrorSeverity.LOW,
          { backupDir: this.backupDir },
        );
      }
    }
  }

  /**
   * Get list of registered tools
   */
  private getRegisteredTools(): ToolName[] {
    return Array.from(this.translators.keys());
  }
}

export default AtomicSyncEngine;
