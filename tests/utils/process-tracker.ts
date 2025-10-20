/**
 * Process Tracker Utility
 * Ensures all spawned processes are cleaned up after tests
 * Prevents zombie processes and resource leaks
 */

import { ChildProcess } from "child_process";

class ProcessTracker {
  private processes: Set<ChildProcess> = new Set();

  /**
   * Track a child process for cleanup
   * @param process - The child process to track
   * @returns The same process for chaining
   */
  track(process: ChildProcess): ChildProcess {
    this.processes.add(process);

    // Auto-remove when process exits naturally
    process.on("exit", () => {
      this.processes.delete(process);
    });

    return process;
  }

  /**
   * Kill all tracked processes
   * @param signal - Signal to send (default: SIGTERM)
   * @param timeout - Timeout before force kill in ms (default: 5000)
   */
  async killAll(
    signal: NodeJS.Signals = "SIGTERM",
    timeout = 5000
  ): Promise<void> {
    const killPromises = Array.from(this.processes).map((proc) =>
      this.killProcess(proc, signal, timeout)
    );

    await Promise.all(killPromises);
    this.processes.clear();
  }

  /**
   * Kill a single process gracefully, with force kill fallback
   */
  private async killProcess(
    proc: ChildProcess,
    signal: NodeJS.Signals,
    timeout: number
  ): Promise<void> {
    if (proc.killed || !proc.pid) {
      return;
    }

    return new Promise<void>((resolve) => {
      // Send initial signal (graceful)
      try {
        proc.kill(signal);
      } catch (error) {
        // Process already dead
        resolve();
        return;
      }

      // Set timeout for force kill
      const timer = setTimeout(() => {
        // Force kill if still alive
        if (!proc.killed && proc.pid) {
          try {
            proc.kill("SIGKILL");
          } catch (error) {
            // Process already dead
          }
        }
        resolve();
      }, timeout);

      // Clear timeout if process exits gracefully
      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      // Also listen for error event
      proc.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Get the number of currently tracked processes
   */
  get count(): number {
    return this.processes.size;
  }

  /**
   * Check if any processes are being tracked
   */
  get isEmpty(): boolean {
    return this.processes.size === 0;
  }

  /**
   * Get all tracked process IDs
   */
  get pids(): number[] {
    return Array.from(this.processes)
      .filter((proc) => proc.pid !== undefined)
      .map((proc) => proc.pid!);
  }
}

// Export singleton instance
export const processTracker = new ProcessTracker();
