/**
 * Centralized Error Handling Framework
 * Provides type-safe, traceable error management with security focus
 */

import type { z } from "zod";

// Actively used — imported by source-resolver.ts and used in error constructors
export enum ErrorCategory {
  SECURITY = "security",
  VALIDATION = "validation",
  FILE_SYSTEM = "filesystem",
  NETWORK = "network",
  PARSE = "parse",
  CONFIG = "config",
  SYNC = "sync",
  PERMISSION = "permission",
  UNKNOWN = "unknown",
}

/**
 * Base AgentSync Error Class
 */
export class AgentSyncError extends Error {
  public readonly category: ErrorCategory;
  public code?: string;
  public suggestion?: string;
  public readonly originalError?: Error;
  public context?: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    options?: {
      code?: string;
      suggestion?: string;
      originalError?: Error;
      context?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.code = options?.code;
    this.suggestion = options?.suggestion;
    this.originalError = options?.originalError;
    this.context = options?.context;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AgentSyncError {
  public readonly validationErrors?: z.ZodError;

  constructor(
    message: string,
    validationErrors?: z.ZodError,
    context?: Record<string, unknown>,
  ) {
    super(message, ErrorCategory.VALIDATION, {
      code: "VALIDATION_FAILED",
      context,
    });
    this.validationErrors = validationErrors;
    if (validationErrors) {
      this.context = {
        ...this.context,
        validationIssues: validationErrors.issues,
      };
    }
  }

  /**
   * Get formatted validation errors
   */
  getFormattedErrors(): string[] {
    if (!this.validationErrors) return [];

    return this.validationErrors.issues.map((issue) => {
      const path = issue.path.join(".");
      return `${path}: ${issue.message}`;
    });
  }
}

/**
 * File system errors
 */
export class FileSystemError extends AgentSyncError {
  constructor(
    message: string,
    filePath?: string,
    originalError?: Error,
    suggestion?: string,
  ) {
    super(message, ErrorCategory.FILE_SYSTEM, {
      code: "FS_ERROR",
      originalError,
      suggestion:
        suggestion ??
        (filePath
          ? `Check that "${filePath}" exists and is readable`
          : undefined),
      context: filePath ? { filePath } : undefined,
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends AgentSyncError {
  constructor(message: string, configPath?: string, suggestion?: string) {
    super(message, ErrorCategory.CONFIG, {
      code: "CONFIG_ERROR",
      suggestion,
      context: configPath ? { configPath } : undefined,
    });
  }
}

/**
 * Parse errors
 */
export class ParseError extends AgentSyncError {
  constructor(
    message: string,
    filePath?: string,
    line?: number,
    column?: number,
    originalError?: Error,
    suggestion?: string,
  ) {
    super(message, ErrorCategory.PARSE, {
      code: "PARSE_ERROR",
      originalError,
      suggestion:
        suggestion ??
        (filePath
          ? `Check the syntax of "${filePath}"${line ? ` at line ${line}` : ""}`
          : undefined),
      context: { filePath, line, column },
    });
  }
}

/**
 * Network/Sync errors
 */
// Never instantiated directly — used only in instanceof checks for exit code classification
export class SyncError extends AgentSyncError {
  constructor(
    message: string,
    endpoint?: string,
    statusCode?: number,
    originalError?: Error,
    suggestion?: string,
  ) {
    super(message, ErrorCategory.SYNC, {
      code: "SYNC_FAILED",
      originalError,
      suggestion:
        suggestion ??
        "Check network connectivity and retry with: agentsync sync",
      context: { endpoint, statusCode },
    });
  }
}

/**
 * Source resolution errors
 */
export class SourceResolutionError extends AgentSyncError {
  constructor(
    message: string,
    source?: string,
    originalError?: Error,
    suggestion?: string,
  ) {
    super(message, ErrorCategory.NETWORK, {
      code: "SOURCE_RESOLUTION_FAILED",
      originalError,
      suggestion:
        suggestion ??
        (source
          ? `Check network connectivity, or remove with: agentsync config rm preset ${source}`
          : "Verify the source URL and your network connection"),
      context: { source, originalError: originalError?.message },
    });
  }
}

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Error handler utility - wrap error with additional context
 */
export function wrapError(
  error: unknown,
  message: string,
  category?: ErrorCategory,
  context?: Record<string, unknown>,
): AgentSyncError {
  if (error instanceof AgentSyncError) {
    const wrapped = new AgentSyncError(message, error.category, {
      originalError: error,
      context: {
        ...(error.context || {}),
        ...context,
        wrappedMessage: message,
      },
    });
    wrapped.code = error.code;
    wrapped.suggestion = error.suggestion;
    return wrapped;
  }

  if (error instanceof Error) {
    return new AgentSyncError(
      `${message}: ${error.message}`,
      category || ErrorCategory.UNKNOWN,
      { originalError: error, context },
    );
  }

  // Handle non-Error objects
  return new AgentSyncError(
    `${message}: ${String(error)}`,
    category || ErrorCategory.UNKNOWN,
    { context: { ...context, originalValue: error } },
  );
}

/**
 * Agent-optimized exit codes (0-4).
 * Agents read $? as fast path, then parse JSON for details.
 *
 * 0 = success, 1 = partial (some work done), 2 = user error (bad input),
 * 3 = system error (filesystem, internal), 4 = transient (network, retry safe)
 */
export const ExitCode = {
  SUCCESS: 0,
  PARTIAL: 1,
  USER_ERROR: 2,
  SYSTEM_ERROR: 3,
  TRANSIENT_ERROR: 4,
} as const;

/**
 * Map a status + optional error to an exit code.
 * Used by the CLI error boundary to set process.exitCode.
 */
export function statusToExitCode(
  status: "success" | "partial" | "error",
  error?: unknown,
): number {
  if (status === "success") return ExitCode.SUCCESS;
  if (status === "partial") return ExitCode.PARTIAL;
  // status === "error" — classify by error type
  if (error instanceof ConfigError) return ExitCode.USER_ERROR;
  if (error instanceof ValidationError) return ExitCode.USER_ERROR;
  if (error instanceof ParseError) return ExitCode.USER_ERROR;
  if (error instanceof SyncError) return ExitCode.TRANSIENT_ERROR;
  if (error instanceof SourceResolutionError) return ExitCode.TRANSIENT_ERROR;
  return ExitCode.SYSTEM_ERROR;
}

/**
 * Format an error for the process safety net handlers (uncaughtException,
 * unhandledRejection). Uses CliResult envelope in JSON mode.
 */
export function formatSafetyNetError(error: unknown, isJson: boolean): string {
  if (isJson) {
    const errorObj = {
      version: "1.0" as const,
      status: "error" as const,
      command: "unknown",
      data: {},
      errors: [
        {
          code:
            error instanceof AgentSyncError
              ? error.code || "UNKNOWN_ERROR"
              : "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : String(error),
          suggestion:
            error instanceof AgentSyncError ? error.suggestion : undefined,
          retryable:
            error instanceof SyncError ||
            error instanceof SourceResolutionError,
        },
      ],
    };
    return JSON.stringify(errorObj);
  }

  if (error instanceof AgentSyncError && error.suggestion) {
    return `\n${error.message}\nSuggestion: ${error.suggestion}\n`;
  }
  if (error instanceof Error) {
    return `\nFatal: ${error.message}\n`;
  }
  return `\nFatal: ${String(error)}\n`;
}
