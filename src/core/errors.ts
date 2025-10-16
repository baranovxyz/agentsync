/**
 * Centralized Error Handling Framework
 * Provides type-safe, traceable error management with security focus
 */

import { z } from 'zod';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for better classification
export enum ErrorCategory {
  SECURITY = 'security',
  VALIDATION = 'validation',
  FILE_SYSTEM = 'filesystem',
  NETWORK = 'network',
  PARSE = 'parse',
  CONFIG = 'config',
  SYNC = 'sync',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

// Base error metadata interface
export interface ErrorMetadata {
  timestamp: Date;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  stackTrace?: string;
  suggestion?: string;
  code?: string;
}

/**
 * Base AgentSync Error Class
 */
export class AgentSyncError extends Error {
  public readonly metadata: ErrorMetadata;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.originalError = originalError;

    this.metadata = {
      timestamp: new Date(),
      category,
      severity,
      context,
      stackTrace: this.stack,
    };

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    if (this.metadata.suggestion) {
      return `${this.message}\n💡 Suggestion: ${this.metadata.suggestion}`;
    }
    return this.message;
  }

  /**
   * Get detailed error information for logging
   */
  getDetails(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      ...this.metadata,
      originalError: this.originalError?.message,
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.metadata.severity !== ErrorSeverity.CRITICAL;
  }
}

/**
 * Security-related errors
 */
export class SecurityError extends AgentSyncError {
  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.HIGH,
    context?: Record<string, unknown>
  ) {
    super(message, ErrorCategory.SECURITY, severity, undefined, context);
    this.metadata.code = 'SECURITY_VIOLATION';
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
    context?: Record<string, unknown>
  ) {
    super(message, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, undefined, context);
    this.validationErrors = validationErrors;
    this.metadata.code = 'VALIDATION_FAILED';

    if (validationErrors) {
      this.metadata.context = {
        ...this.metadata.context,
        validationIssues: validationErrors.issues,
      };
    }
  }

  /**
   * Get formatted validation errors
   */
  getFormattedErrors(): string[] {
    if (!this.validationErrors) return [];

    return this.validationErrors.issues.map(issue => {
      const path = issue.path.join('.');
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
    originalError?: Error
  ) {
    super(
      message,
      ErrorCategory.FILE_SYSTEM,
      ErrorSeverity.MEDIUM,
      originalError,
      filePath ? { filePath } : undefined
    );
    this.metadata.code = 'FS_ERROR';
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends AgentSyncError {
  constructor(
    message: string,
    configPath?: string,
    suggestion?: string
  ) {
    super(
      message,
      ErrorCategory.CONFIG,
      ErrorSeverity.MEDIUM,
      undefined,
      configPath ? { configPath } : undefined
    );
    this.metadata.code = 'CONFIG_ERROR';
    this.metadata.suggestion = suggestion;
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
    originalError?: Error
  ) {
    super(
      message,
      ErrorCategory.PARSE,
      ErrorSeverity.MEDIUM,
      originalError,
      { filePath, line, column }
    );
    this.metadata.code = 'PARSE_ERROR';
  }
}

/**
 * Permission errors
 */
export class PermissionError extends AgentSyncError {
  constructor(
    message: string,
    resource?: string,
    requiredPermission?: string
  ) {
    super(
      message,
      ErrorCategory.PERMISSION,
      ErrorSeverity.HIGH,
      undefined,
      { resource, requiredPermission }
    );
    this.metadata.code = 'PERMISSION_DENIED';
  }
}

/**
 * Network/Sync errors
 */
export class SyncError extends AgentSyncError {
  constructor(
    message: string,
    endpoint?: string,
    statusCode?: number,
    originalError?: Error
  ) {
    super(
      message,
      ErrorCategory.SYNC,
      ErrorSeverity.MEDIUM,
      originalError,
      { endpoint, statusCode }
    );
    this.metadata.code = 'SYNC_FAILED';
  }
}

/**
 * Error handler utility class
 */
export class ErrorHandler {
  private static readonly MAX_STACK_DEPTH = 10;

  /**
   * Wrap an error with additional context
   */
  static wrap(
    error: unknown,
    message: string,
    category?: ErrorCategory,
    context?: Record<string, unknown>
  ): AgentSyncError {
    if (error instanceof AgentSyncError) {
      // Add additional context to existing error
      error.metadata.context = {
        ...error.metadata.context,
        ...context,
        wrappedMessage: message,
      };
      return error;
    }

    if (error instanceof Error) {
      return new AgentSyncError(
        `${message}: ${error.message}`,
        category || ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        error,
        context
      );
    }

    // Handle non-Error objects
    return new AgentSyncError(
      `${message}: ${String(error)}`,
      category || ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      undefined,
      { ...context, originalValue: error }
    );
  }

  /**
   * Check if an error is a specific type
   */
  static isErrorType<T extends AgentSyncError>(
    error: unknown,
    errorClass: new (...args: any[]) => T
  ): error is T {
    return error instanceof errorClass;
  }

  /**
   * Get root cause of an error chain
   */
  static getRootCause(error: AgentSyncError): Error {
    let current: Error | undefined = error;
    let depth = 0;

    while (current instanceof AgentSyncError && current.originalError && depth < this.MAX_STACK_DEPTH) {
      current = current.originalError;
      depth++;
    }

    return current || error;
  }

  /**
   * Format error for console output
   */
  static format(error: AgentSyncError, verbose: boolean = false): string {
    const lines: string[] = [];

    // Main error message
    lines.push(`❌ ${error.getUserMessage()}`);

    // Add category and severity
    if (verbose) {
      lines.push(`   Category: ${error.metadata.category}`);
      lines.push(`   Severity: ${error.metadata.severity}`);

      // Add context if available
      if (error.metadata.context) {
        lines.push('   Context:');
        Object.entries(error.metadata.context).forEach(([key, value]) => {
          lines.push(`     ${key}: ${JSON.stringify(value)}`);
        });
      }

      // Add validation errors if present
      if (error instanceof ValidationError && error.validationErrors) {
        lines.push('   Validation Errors:');
        error.getFormattedErrors().forEach(err => {
          lines.push(`     - ${err}`);
        });
      }

      // Add stack trace
      if (error.stack) {
        lines.push('   Stack Trace:');
        lines.push(error.stack.split('\n').map(line => `     ${line}`).join('\n'));
      }
    }

    return lines.join('\n');
  }

  /**
   * Create a safe error object for serialization
   */
  static serialize(error: AgentSyncError): Record<string, unknown> {
    return {
      name: error.name,
      message: error.message,
      metadata: {
        ...error.metadata,
        timestamp: error.metadata.timestamp.toISOString(),
        stackTrace: undefined, // Don't include stack in serialization
      },
      originalError: error.originalError ? {
        name: error.originalError.name,
        message: error.originalError.message,
      } : undefined,
    };
  }
}

/**
 * Error recovery strategies
 */
export interface RecoveryStrategy {
  canRecover(error: AgentSyncError): boolean;
  recover(error: AgentSyncError): Promise<void>;
  description: string;
}

/**
 * Retry strategy for recoverable errors
 */
export class RetryStrategy implements RecoveryStrategy {
  constructor(
    private maxRetries: number = 3,
    private delayMs: number = 1000,
    private backoffMultiplier: number = 2
  ) {}

  canRecover(error: AgentSyncError): boolean {
    return error.isRecoverable() &&
           [ErrorCategory.NETWORK, ErrorCategory.SYNC, ErrorCategory.FILE_SYSTEM]
             .includes(error.metadata.category);
  }

  async recover(error: AgentSyncError): Promise<void> {
    let delay = this.delayMs;

    for (let i = 0; i < this.maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= this.backoffMultiplier;

      // Recovery logic would be implemented by the caller
      throw new Error('Retry logic must be implemented by caller');
    }
  }

  get description(): string {
    return `Retry up to ${this.maxRetries} times with exponential backoff`;
  }
}

export default {
  AgentSyncError,
  SecurityError,
  ValidationError,
  FileSystemError,
  ConfigError,
  ParseError,
  PermissionError,
  SyncError,
  ErrorHandler,
  ErrorSeverity,
  ErrorCategory,
  RetryStrategy,
};