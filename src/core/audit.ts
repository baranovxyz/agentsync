/**
 * Audit Logging System
 * Provides comprehensive logging and monitoring for security and operations
 */

import fse from 'fs-extra';
import { readFile } from 'node:fs/promises';

const { ensureDir, appendFile, readdir, stat, remove } = fse;
import * as path from 'path';
import { homedir } from 'os';
import { ErrorCategory, ErrorSeverity } from './errors';

export enum AuditEventType {
  // Security Events
  SECURITY_SCAN = 'SECURITY_SCAN',
  UNICODE_DETECTION = 'UNICODE_DETECTION',
  SECRET_DETECTED = 'SECRET_DETECTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // File Operations
  FILE_READ = 'FILE_READ',
  FILE_WRITE = 'FILE_WRITE',
  FILE_DELETE = 'FILE_DELETE',
  FILE_BACKUP = 'FILE_BACKUP',

  // Sync Operations
  SYNC_START = 'SYNC_START',
  SYNC_SUCCESS = 'SYNC_SUCCESS',
  SYNC_FAILURE = 'SYNC_FAILURE',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  CONFLICT_RESOLVED = 'CONFLICT_RESOLVED',

  // Configuration Changes
  CONFIG_LOAD = 'CONFIG_LOAD',
  CONFIG_UPDATE = 'CONFIG_UPDATE',
  CONFIG_VALIDATE = 'CONFIG_VALIDATE',

  // System Events
  STARTUP = 'STARTUP',
  SHUTDOWN = 'SHUTDOWN',
  ERROR = 'ERROR',
  WARNING = 'WARNING',

  // User Actions
  COMMAND_EXECUTED = 'COMMAND_EXECUTED',
  INIT_WORKSPACE = 'INIT_WORKSPACE',
  WATCH_START = 'WATCH_START',
  WATCH_STOP = 'WATCH_STOP',
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: AuditEventType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  stackTrace?: string;
  duration?: number; // for performance tracking
}

export interface AuditOptions {
  logDir?: string;
  maxFileSize?: number; // in bytes
  maxFiles?: number;
  logLevel?: 'debug' | 'info' | 'warning' | 'error';
  enableConsole?: boolean;
  enableFile?: boolean;
  enableRemote?: boolean;
  remoteEndpoint?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private options: Required<AuditOptions>;
  private currentLogFile: string;
  private sessionId: string;
  private eventQueue: AuditEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  private constructor(options?: AuditOptions) {
    this.options = {
      logDir: options?.logDir || path.join(homedir(), '.agentsync', 'logs'),
      maxFileSize: options?.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options?.maxFiles || 30,
      logLevel: options?.logLevel || 'info',
      enableConsole: options?.enableConsole ?? false,
      enableFile: options?.enableFile ?? true,
      enableRemote: options?.enableRemote ?? false,
      remoteEndpoint: options?.remoteEndpoint || '',
    };

    this.sessionId = this.generateSessionId();
    this.currentLogFile = this.getLogFileName();
  }

  /**
   * Get singleton instance
   */
  static getInstance(options?: AuditOptions): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(options);
    }
    return AuditLogger.instance;
  }

  /**
   * Initialize the audit logger
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create log directory
    await ensureDir(this.options.logDir);

    // Rotate old logs if necessary
    await this.rotateLogs();

    // Start flush interval
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error);
    }, 5000); // Flush every 5 seconds

    this.isInitialized = true;

    // Log startup event
    await this.log({
      type: AuditEventType.STARTUP,
      severity: 'info',
      category: 'system',
      message: 'AgentSync audit logging initialized',
      metadata: {
        sessionId: this.sessionId,
        logDir: this.options.logDir,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
    });
  }

  /**
   * Shutdown the audit logger
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    // Log shutdown event
    await this.log({
      type: AuditEventType.SHUTDOWN,
      severity: 'info',
      category: 'system',
      message: 'AgentSync audit logging shutting down',
    });

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining events
    await this.flush();

    this.isInitialized = false;
  }

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp' | 'sessionId'>): Promise<void> {
    const fullEvent: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      sessionId: this.sessionId,
      ...event,
    };

    // Check log level
    if (!this.shouldLog(fullEvent.severity)) {
      return;
    }

    // Add to queue
    this.eventQueue.push(fullEvent);

    // Console output
    if (this.options.enableConsole) {
      this.logToConsole(fullEvent);
    }

    // Flush if queue is getting large
    if (this.eventQueue.length >= 100) {
      await this.flush();
    }
  }

  /**
   * Log a security event
   */
  async logSecurity(
    message: string,
    severity: 'warning' | 'error' | 'critical',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      type: AuditEventType.SECRET_DETECTED,
      severity,
      category: 'security',
      message,
      metadata,
    });
  }

  /**
   * Log a file operation
   */
  async logFileOperation(
    operation: 'read' | 'write' | 'delete' | 'backup',
    filePath: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const typeMap = {
      read: AuditEventType.FILE_READ,
      write: AuditEventType.FILE_WRITE,
      delete: AuditEventType.FILE_DELETE,
      backup: AuditEventType.FILE_BACKUP,
    };

    await this.log({
      type: typeMap[operation],
      severity: success ? 'info' : 'error',
      category: 'file',
      message: `File ${operation}: ${filePath}`,
      metadata: {
        filePath,
        success,
        ...metadata,
      },
    });
  }

  /**
   * Log a command execution
   */
  async logCommand(
    command: string,
    args: string[],
    success: boolean,
    duration: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      type: AuditEventType.COMMAND_EXECUTED,
      severity: success ? 'info' : 'error',
      category: 'command',
      message: `Command: ${command} ${args.join(' ')}`,
      duration,
      metadata: {
        command,
        args,
        success,
        ...metadata,
      },
    });
  }

  /**
   * Log an error
   */
  async logError(
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      type: AuditEventType.ERROR,
      severity: this.mapErrorSeverity(severity),
      category: category,
      message: error.message,
      stackTrace: error.stack,
      metadata: {
        errorName: error.name,
        ...metadata,
      },
    });
  }

  /**
   * Flush event queue to storage
   */
  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    // Write to file
    if (this.options.enableFile) {
      await this.writeToFile(events);
    }

    // Send to remote endpoint
    if (this.options.enableRemote && this.options.remoteEndpoint) {
      await this.sendToRemote(events);
    }
  }

  /**
   * Write events to file
   */
  private async writeToFile(events: AuditEvent[]): Promise<void> {
    const logFile = path.join(this.options.logDir, this.currentLogFile);

    // Check if we need to rotate
    try {
      const stats = await stat(logFile);
      if (stats.size > this.options.maxFileSize) {
        await this.rotateLogs();
        this.currentLogFile = this.getLogFileName();
      }
    } catch {
      // File doesn't exist yet, that's fine
    }

    // Write events as NDJSON
    const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
    await appendFile(logFile, lines, 'utf-8');
  }

  /**
   * Send events to remote endpoint
   */
  private async sendToRemote(events: AuditEvent[]): Promise<void> {
    if (!this.options.remoteEndpoint) return;

    try {
      // This would be implemented with your actual remote logging service
      // For now, it's a placeholder
      console.log(`Would send ${events.length} events to ${this.options.remoteEndpoint}`);
    } catch (error) {
      console.error('Failed to send audit logs to remote:', error);
    }
  }

  /**
   * Rotate log files
   */
  private async rotateLogs(): Promise<void> {
    const files = await readdir(this.options.logDir);
    const logFiles = files
      .filter(f => f.startsWith('audit-') && f.endsWith('.log'))
      .sort()
      .reverse();

    // Remove old files if we have too many
    if (logFiles.length >= this.options.maxFiles) {
      const filesToDelete = logFiles.slice(this.options.maxFiles - 1);
      for (const file of filesToDelete) {
        await remove(path.join(this.options.logDir, file));
      }
    }
  }

  /**
   * Get current log file name
   */
  private getLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timestamp = date.getTime();
    return `audit-${dateStr}-${timestamp}.log`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if event should be logged based on level
   */
  private shouldLog(severity: 'info' | 'warning' | 'error' | 'critical'): boolean {
    const levels = {
      debug: 0,
      info: 1,
      warning: 2,
      error: 3,
      critical: 4,
    };

    const eventLevel = levels[severity as keyof typeof levels] || 1;
    const configLevel = levels[this.options.logLevel];

    return eventLevel >= configLevel;
  }

  /**
   * Map error severity to audit severity
   */
  private mapErrorSeverity(severity: ErrorSeverity): 'info' | 'warning' | 'error' | 'critical' {
    const map = {
      [ErrorSeverity.LOW]: 'info' as const,
      [ErrorSeverity.MEDIUM]: 'warning' as const,
      [ErrorSeverity.HIGH]: 'error' as const,
      [ErrorSeverity.CRITICAL]: 'critical' as const,
    };
    return map[severity];
  }

  /**
   * Log to console
   */
  private logToConsole(event: AuditEvent): void {
    const timestamp = event.timestamp.toISOString();
    const level = event.severity.toUpperCase().padEnd(8);
    const category = event.category.padEnd(10);

    const prefix = `[${timestamp}] ${level} ${category}`;
    const message = `${prefix} ${event.message}`;

    switch (event.severity) {
      case 'critical':
      case 'error':
        console.error(message);
        break;
      case 'warning':
        console.warn(message);
        break;
      default:
        console.log(message);
    }

    if (event.metadata && Object.keys(event.metadata).length > 0) {
      console.log(`${' '.repeat(prefix.length)} Metadata:`, event.metadata);
    }
  }

  /**
   * Query audit logs
   */
  async query(options: {
    startDate?: Date;
    endDate?: Date;
    types?: AuditEventType[];
    severity?: ('info' | 'warning' | 'error' | 'critical')[];
    limit?: number;
  }): Promise<AuditEvent[]> {
    const results: AuditEvent[] = [];
    const files = await readdir(this.options.logDir);
    const logFiles = files
      .filter(f => f.startsWith('audit-') && f.endsWith('.log'))
      .sort()
      .reverse();

    for (const file of logFiles) {
      const filePath = path.join(this.options.logDir, file);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          event.timestamp = new Date(event.timestamp);

          // Apply filters
          if (options.startDate && event.timestamp < options.startDate) continue;
          if (options.endDate && event.timestamp > options.endDate) continue;
          if (options.types && !options.types.includes(event.type)) continue;
          if (options.severity && !options.severity.includes(event.severity)) continue;

          results.push(event);

          if (options.limit && results.length >= options.limit) {
            return results;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return results;
  }

  /**
   * Generate audit report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<string> {
    const events = await this.query({ startDate, endDate });

    const report: string[] = [];
    report.push('📊 Audit Report');
    report.push('=' .repeat(50));
    report.push(`Period: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    report.push(`Total Events: ${events.length}`);
    report.push('');

    // Group by type
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const event of events) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    }

    report.push('Events by Type:');
    for (const [type, count] of Object.entries(byType)) {
      report.push(`  ${type}: ${count}`);
    }

    report.push('');
    report.push('Events by Severity:');
    for (const [severity, count] of Object.entries(bySeverity)) {
      report.push(`  ${severity}: ${count}`);
    }

    // Security events
    const securityEvents = events.filter(e => e.category === 'security');
    if (securityEvents.length > 0) {
      report.push('');
      report.push(`⚠️  Security Events: ${securityEvents.length}`);
      for (const event of securityEvents.slice(0, 10)) {
        report.push(`  ${event.timestamp.toISOString()}: ${event.message}`);
      }
    }

    // Errors
    const errors = events.filter(e => e.severity === 'error' || e.severity === 'critical');
    if (errors.length > 0) {
      report.push('');
      report.push(`❌ Errors: ${errors.length}`);
      for (const event of errors.slice(0, 10)) {
        report.push(`  ${event.timestamp.toISOString()}: ${event.message}`);
      }
    }

    return report.join('\n');
  }
}

export default AuditLogger;