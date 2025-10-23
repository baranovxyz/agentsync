/**
 * File Watcher Module
 * Monitors AGENTS.md files for changes and triggers sync operations
 */

import { EventEmitter } from "node:events";
import * as path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { debounce } from "../utils/debounce.js";
import AuditLogger, { AuditEventType } from "./audit.js";
import { FileSystemError } from "./errors.js";

export interface WatcherOptions {
  debounce?: number;
  ignorePatterns?: string[];
  followSymlinks?: boolean;
  depth?: number;
  atomic?: boolean;
  awaitWriteFinish?:
    | boolean
    | { stabilityThreshold: number; pollInterval: number };
}

export interface FileChangeEvent {
  type: "add" | "change" | "unlink";
  path: string;
  stats?: any;
  timestamp: Date;
}

/**
 * File watcher for AGENTS.md files
 */
export class AgentsMdWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly options: Required<WatcherOptions>;
  private readonly audit = AuditLogger.getInstance();
  private isWatching = false;
  private watchedFiles = new Set<string>();
  private debouncedHandlers = new Map<string, Function>();

  constructor(options: WatcherOptions = {}) {
    super();

    this.options = {
      debounce: options.debounce ?? 500,
      ignorePatterns: options.ignorePatterns ?? [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/.agentsync/**",
        "**/coverage/**",
      ],
      followSymlinks: options.followSymlinks ?? false,
      depth: options.depth ?? 10,
      atomic: options.atomic ?? true,
      awaitWriteFinish: options.awaitWriteFinish ?? {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    };
  }

  /**
   * Start watching for file changes
   */
  async start(patterns: string | string[] = "**/AGENTS.md"): Promise<void> {
    if (this.isWatching) {
      throw new FileSystemError("Watcher is already running");
    }

    try {
      // Initialize watcher
      this.watcher = chokidar.watch(patterns, {
        ignored: this.options.ignorePatterns,
        persistent: true,
        followSymlinks: this.options.followSymlinks,
        depth: this.options.depth,
        atomic: this.options.atomic,
        awaitWriteFinish: this.options.awaitWriteFinish,
        ignoreInitial: false,
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for initial scan to complete
      await new Promise<void>((resolve, reject) => {
        this.watcher?.on("ready", () => {
          this.isWatching = true;
          resolve();
        });

        this.watcher?.on("error", (error) => {
          reject(
            new FileSystemError(
              "Failed to start file watcher",
              undefined,
              error as Error,
            ),
          );
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new FileSystemError("File watcher initialization timeout"));
        }, 10000);
      });

      // Log start event
      await this.audit.log({
        type: AuditEventType.WATCH_START,
        severity: "info",
        category: "watcher",
        message: `Started watching: ${Array.isArray(patterns) ? patterns.join(", ") : patterns}`,
        metadata: {
          patterns,
          fileCount: this.watchedFiles.size,
        },
      });

      this.emit("ready", Array.from(this.watchedFiles));
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    this.watchedFiles.clear();
    this.debouncedHandlers.clear();

    // Log stop event
    await this.audit.log({
      type: AuditEventType.WATCH_STOP,
      severity: "info",
      category: "watcher",
      message: "Stopped watching files",
    });

    this.emit("stopped");
  }

  /**
   * Setup event handlers for file changes
   */
  private setupEventHandlers(): void {
    if (!this.watcher) return;

    // File added
    this.watcher.on("add", (filePath: string, stats: any) => {
      this.watchedFiles.add(filePath);
      this.handleFileChange("add", filePath, stats);
    });

    // File changed
    this.watcher.on("change", (filePath: string, stats: any) => {
      this.handleFileChange("change", filePath, stats);
    });

    // File removed
    this.watcher.on("unlink", (filePath: string) => {
      this.watchedFiles.delete(filePath);
      this.handleFileChange("unlink", filePath);
    });

    // Error handling
    this.watcher.on("error", (error: unknown) => {
      this.emit(
        "error",
        new FileSystemError("File watcher error", undefined, error as Error),
      );
    });
  }

  /**
   * Handle file change event with debouncing
   */
  private handleFileChange(
    type: "add" | "change" | "unlink",
    filePath: string,
    stats?: any,
  ): void {
    // Get or create debounced handler for this file
    if (!this.debouncedHandlers.has(filePath)) {
      const debouncedHandler = debounce((event: FileChangeEvent) => {
        this.processFileChange(event);
      }, this.options.debounce);
      this.debouncedHandlers.set(filePath, debouncedHandler);
    }

    const handler = this.debouncedHandlers.get(filePath)!;
    const event: FileChangeEvent = {
      type,
      path: filePath,
      stats,
      timestamp: new Date(),
    };

    (handler as any)(event);
  }

  /**
   * Process a file change after debouncing
   */
  private async processFileChange(event: FileChangeEvent): Promise<void> {
    try {
      // Log the change
      await this.audit.logFileOperation(
        event.type === "unlink"
          ? "delete"
          : event.type === "add"
            ? "write"
            : "write",
        event.path,
        true,
        {
          changeType: event.type,
          timestamp: event.timestamp.toISOString(),
        },
      );

      // Emit the change event
      this.emit("change", event);

      // Emit specific event type
      this.emit(event.type, event.path, event.stats);
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Get list of watched files
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchedFiles);
  }

  /**
   * Check if a file is being watched
   */
  isWatchingFile(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    return this.watchedFiles.has(normalizedPath);
  }

  /**
   * Add a file to watch
   */
  async addFile(filePath: string): Promise<void> {
    if (!(this.watcher && this.isWatching)) {
      throw new FileSystemError("Watcher is not running");
    }

    this.watcher.add(filePath);
    this.watchedFiles.add(filePath);
  }

  /**
   * Remove a file from watch
   */
  async removeFile(filePath: string): Promise<void> {
    if (!(this.watcher && this.isWatching)) {
      throw new FileSystemError("Watcher is not running");
    }

    this.watcher.unwatch(filePath);
    this.watchedFiles.delete(filePath);
    this.debouncedHandlers.delete(filePath);
  }

  /**
   * Get watcher statistics
   */
  getStats(): {
    isWatching: boolean;
    fileCount: number;
    files: string[];
    debounceMs: number;
  } {
    return {
      isWatching: this.isWatching,
      fileCount: this.watchedFiles.size,
      files: this.getWatchedFiles(),
      debounceMs: this.options.debounce,
    };
  }

  /**
   * Pause watching (useful for batch operations)
   */
  pause(): void {
    if (this.watcher && this.isWatching) {
      this.watcher.removeAllListeners();
      this.emit("paused");
    }
  }

  /**
   * Resume watching after pause
   */
  resume(): void {
    if (this.watcher && this.isWatching) {
      this.setupEventHandlers();
      this.emit("resumed");
    }
  }
}

/**
 * Factory function to create a watcher
 */
export function createWatcher(options?: WatcherOptions): AgentsMdWatcher {
  return new AgentsMdWatcher(options);
}

export default AgentsMdWatcher;
