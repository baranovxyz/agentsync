/**
 * Exit Code Mapping and Safety Net Formatting Tests
 * Validates 0-4 exit code scheme and formatSafetyNetError()
 */
import { describe, expect, it } from "vitest";
import {
  AgentSyncError,
  ConfigError,
  ErrorCategory,
  ExitCode,
  FileSystemError,
  formatSafetyNetError,
  ParseError,
  SourceResolutionError,
  SyncError,
  statusToExitCode,
  ValidationError,
} from "../../../src/core/errors.js";
import { CliResultSchema } from "../../../src/types/output.js";

describe("AgentSyncError simplified shape", () => {
  it("exposes flat properties instead of metadata object", () => {
    const error = new AgentSyncError("test", ErrorCategory.CONFIG);
    expect(error.message).toBe("test");
    expect(error.category).toBe(ErrorCategory.CONFIG);
    expect(error.code).toBeUndefined();
    expect(error.suggestion).toBeUndefined();
    expect(error.originalError).toBeUndefined();
  });

  it("accepts optional code, suggestion, originalError", () => {
    const orig = new Error("cause");
    const error = new AgentSyncError("test", ErrorCategory.SYNC, {
      code: "SYNC_FAILED",
      suggestion: "retry",
      originalError: orig,
    });
    expect(error.code).toBe("SYNC_FAILED");
    expect(error.suggestion).toBe("retry");
    expect(error.originalError).toBe(orig);
  });
});

describe("ExitCode constants", () => {
  it("defines 0-4 agent-optimized codes", () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.PARTIAL).toBe(1);
    expect(ExitCode.USER_ERROR).toBe(2);
    expect(ExitCode.SYSTEM_ERROR).toBe(3);
    expect(ExitCode.TRANSIENT_ERROR).toBe(4);
  });
});

describe("statusToExitCode", () => {
  it("maps success status to 0", () => {
    expect(statusToExitCode("success")).toBe(0);
  });

  it("maps partial status to 1", () => {
    expect(statusToExitCode("partial")).toBe(1);
  });

  it("maps error status with ConfigError to 2 (user error)", () => {
    expect(
      statusToExitCode(
        "error",
        new ConfigError("bad config", "/path", "fix it"),
      ),
    ).toBe(2);
  });

  it("maps error status with ValidationError to 2", () => {
    expect(
      statusToExitCode("error", new ValidationError("invalid input")),
    ).toBe(2);
  });

  it("maps error status with ParseError to 2", () => {
    expect(
      statusToExitCode("error", new ParseError("bad parse", "/file.toml")),
    ).toBe(2);
  });

  it("maps error status with FileSystemError to 3 (system error)", () => {
    expect(
      statusToExitCode(
        "error",
        new FileSystemError("file not found", "/missing.toml"),
      ),
    ).toBe(3);
  });

  it("maps error status with FileSystemError (non-transient) to 3", () => {
    expect(
      statusToExitCode(
        "error",
        new FileSystemError("access denied", "/etc/secret"),
      ),
    ).toBe(3);
  });

  it("maps error status with SyncError to 4 (transient)", () => {
    expect(
      statusToExitCode(
        "error",
        new SyncError("network failed", "https://example.com"),
      ),
    ).toBe(4);
  });

  it("maps error status with SourceResolutionError to 4", () => {
    expect(
      statusToExitCode(
        "error",
        new SourceResolutionError("preset unreachable", "github:org/repo"),
      ),
    ).toBe(4);
  });

  it("maps error status with generic AgentSyncError to 3", () => {
    expect(
      statusToExitCode("error", new AgentSyncError("something broke")),
    ).toBe(3);
  });

  it("maps error status with plain Error to 3", () => {
    expect(statusToExitCode("error", new Error("untyped"))).toBe(3);
  });

  it("maps error status with non-Error values to 3", () => {
    expect(statusToExitCode("error", "string error")).toBe(3);
    expect(statusToExitCode("error", 42)).toBe(3);
    expect(statusToExitCode("error", null)).toBe(3);
  });

  it("maps error status with no error argument to 3", () => {
    expect(statusToExitCode("error")).toBe(3);
  });
});

describe("formatSafetyNetError", () => {
  describe("human mode (isJson=false)", () => {
    it("uses getUserMessage() for AgentSyncError with suggestion", () => {
      const err = new ConfigError(
        "No config found",
        "/path",
        "Run: agentsync init",
      );
      const output = formatSafetyNetError(err, false);
      expect(output).toContain("No config found");
      expect(output).toContain("Suggestion:");
      expect(output).toContain("agentsync init");
    });

    it("falls back to Fatal: for plain Error", () => {
      const err = new Error("something broke");
      const output = formatSafetyNetError(err, false);
      expect(output).toContain("Fatal: something broke");
    });

    it("handles non-Error values", () => {
      const output = formatSafetyNetError("raw string error", false);
      expect(output).toContain("Fatal: raw string error");
    });
  });

  describe("JSON mode (isJson=true)", () => {
    it("produces valid CliResult envelope with error", () => {
      const err = new ConfigError(
        "No config found",
        "/path",
        "Run: agentsync init",
      );
      const output = formatSafetyNetError(err, true);
      const parsed = JSON.parse(output);
      const validation = CliResultSchema.safeParse(parsed);
      expect(validation.success).toBe(true);
      expect(parsed.status).toBe("error");
      expect(parsed.errors[0].code).toBe("CONFIG_ERROR");
      expect(parsed.errors[0].message).toBe("No config found");
      expect(parsed.errors[0].suggestion).toBe("Run: agentsync init");
    });

    it("handles plain Error with UNKNOWN_ERROR code", () => {
      const err = new Error("untyped crash");
      const output = formatSafetyNetError(err, true);
      const parsed = JSON.parse(output);
      expect(parsed.status).toBe("error");
      expect(parsed.errors[0].code).toBe("UNKNOWN_ERROR");
    });

    it("handles non-Error values", () => {
      const output = formatSafetyNetError("string value", true);
      const parsed = JSON.parse(output);
      expect(parsed.status).toBe("error");
      expect(parsed.errors[0].code).toBe("UNKNOWN_ERROR");
      expect(parsed.errors[0].message).toBe("string value");
    });
  });
});
