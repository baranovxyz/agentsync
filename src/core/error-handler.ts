/**
 * Centralized error handling framework for AgentSync
 * Provides custom error classes with actionable remediation steps
 */

export class AgentSyncError extends Error {
  constructor(
    public code: string,
    message: string,
    public actionable: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "AgentSyncError";
  }
}

export class ValidationError extends AgentSyncError {
  constructor(message: string, actionable: string, cause?: Error) {
    super("VALIDATION_ERROR", message, actionable, cause);
    this.name = "ValidationError";
  }
}

export class SecurityError extends AgentSyncError {
  constructor(
    code: string,
    message: string,
    actionable: string,
    cause?: Error,
  ) {
    super(code, message, actionable, cause);
    this.name = "SecurityError";
  }
}

export class SyncError extends AgentSyncError {
  constructor(message: string, actionable: string, cause?: Error) {
    super("SYNC_ERROR", message, actionable, cause);
    this.name = "SyncError";
  }
}

export class ConfigError extends AgentSyncError {
  constructor(message: string, actionable: string, cause?: Error) {
    super("CONFIG_ERROR", message, actionable, cause);
    this.name = "ConfigError";
  }
}

export class FileSystemError extends AgentSyncError {
  constructor(message: string, actionable: string, cause?: Error) {
    super("FILESYSTEM_ERROR", message, actionable, cause);
    this.name = "FileSystemError";
  }
}

/**
 * Format error for CLI output
 */
export function formatError(error: Error): string {
  if (error instanceof AgentSyncError) {
    const lines: string[] = [
      `❌ ${error.name}: ${error.message}`,
      "",
      "💡 How to fix:",
      `   ${error.actionable}`,
    ];

    if (error.cause) {
      lines.push("", "🔍 Underlying cause:", `   ${error.cause.message}`);
    }

    return lines.join("\n");
  }

  // Generic error
  return `❌ Error: ${error.message}`;
}

/**
 * Global error handler for CLI
 */
export function handleError(error: Error): void {
  console.error(formatError(error));

  if (process.env.DEBUG === "true" && error.stack) {
    console.error("\n📋 Stack trace:", error.stack);
  }

  // Exit with appropriate code
  if (error instanceof SecurityError) {
    process.exit(2); // Security issue
  } else if (error instanceof ValidationError) {
    process.exit(3); // Validation issue
  } else if (error instanceof SyncError) {
    process.exit(4); // Sync failure
  } else {
    process.exit(1); // General error
  }
}
