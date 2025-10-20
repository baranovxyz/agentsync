import { describe, it, expect, beforeEach } from "vitest";
import { spawn } from "child_process";
import { processTracker } from "../../utils/process-tracker.js";

describe("ProcessTracker", () => {
  beforeEach(async () => {
    // Ensure clean state
    await processTracker.killAll();
  });

  describe("track()", () => {
    it("should track spawned processes", () => {
      const proc = spawn("sleep", ["10"]);
      processTracker.track(proc);

      expect(processTracker.count).toBe(1);
      expect(processTracker.isEmpty).toBe(false);
      expect(processTracker.pids).toContain(proc.pid);

      // Cleanup
      proc.kill();
    });

    it("should auto-remove processes when they exit", async () => {
      const proc = spawn("echo", ["test"]);
      processTracker.track(proc);

      expect(processTracker.count).toBe(1);

      // Wait for process to exit
      await new Promise((resolve) => proc.on("exit", resolve));

      // Should be auto-removed
      expect(processTracker.count).toBe(0);
      expect(processTracker.isEmpty).toBe(true);
    });

    it("should return the same process for chaining", () => {
      const proc = spawn("sleep", ["10"]);
      const returned = processTracker.track(proc);

      expect(returned).toBe(proc);

      // Cleanup
      proc.kill();
    });
  });

  describe("killAll()", () => {
    it("should kill all tracked processes", async () => {
      const proc1 = processTracker.track(spawn("sleep", ["10"]));
      const proc2 = processTracker.track(spawn("sleep", ["10"]));
      const proc3 = processTracker.track(spawn("sleep", ["10"]));

      expect(processTracker.count).toBe(3);

      await processTracker.killAll();

      expect(processTracker.count).toBe(0);
      expect(processTracker.isEmpty).toBe(true);
      expect(proc1.killed).toBe(true);
      expect(proc2.killed).toBe(true);
      expect(proc3.killed).toBe(true);
    });

    it("should use SIGTERM by default", async () => {
      const proc = processTracker.track(spawn("sleep", ["10"]));

      let exitSignal: NodeJS.Signals | null = null;
      proc.on("exit", (_code, signal) => {
        exitSignal = signal;
      });

      await processTracker.killAll();

      // SIGTERM should have been used
      expect(exitSignal).toBe("SIGTERM");
    });

    it("should force kill with SIGKILL if process doesn't exit", async () => {
      // Create a process that ignores SIGTERM
      const proc = processTracker.track(
        spawn("sh", ["-c", "trap '' TERM; sleep 100"])
      );

      // Use very short timeout to force SIGKILL
      await processTracker.killAll("SIGTERM", 100);

      expect(proc.killed).toBe(true);
      expect(processTracker.count).toBe(0);
    });

    it("should handle already dead processes gracefully", async () => {
      const proc = spawn("echo", ["test"]);
      processTracker.track(proc);

      // Wait for process to exit naturally
      await new Promise((resolve) => proc.on("exit", resolve));

      // Should not throw when killing dead process
      await expect(processTracker.killAll()).resolves.toBeUndefined();
    });

    it("should clear all processes after killing", async () => {
      processTracker.track(spawn("sleep", ["10"]));
      processTracker.track(spawn("sleep", ["10"]));

      await processTracker.killAll();

      expect(processTracker.count).toBe(0);
      expect(processTracker.pids).toEqual([]);
    });
  });

  describe("count and isEmpty", () => {
    it("should return 0 count when no processes tracked", () => {
      expect(processTracker.count).toBe(0);
      expect(processTracker.isEmpty).toBe(true);
    });

    it("should return correct count when processes tracked", () => {
      const proc1 = spawn("sleep", ["10"]);
      const proc2 = spawn("sleep", ["10"]);

      processTracker.track(proc1);
      expect(processTracker.count).toBe(1);
      expect(processTracker.isEmpty).toBe(false);

      processTracker.track(proc2);
      expect(processTracker.count).toBe(2);
      expect(processTracker.isEmpty).toBe(false);

      // Cleanup
      proc1.kill();
      proc2.kill();
    });
  });

  describe("pids", () => {
    it("should return empty array when no processes", () => {
      expect(processTracker.pids).toEqual([]);
    });

    it("should return all process IDs", () => {
      const proc1 = processTracker.track(spawn("sleep", ["10"]));
      const proc2 = processTracker.track(spawn("sleep", ["10"]));

      const pids = processTracker.pids;

      expect(pids).toHaveLength(2);
      expect(pids).toContain(proc1.pid);
      expect(pids).toContain(proc2.pid);

      // Cleanup
      proc1.kill();
      proc2.kill();
    });
  });
});
