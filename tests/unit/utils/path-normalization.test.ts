import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  toPosixPath,
  validateSyncNamespace,
} from "../../../src/utils/path-normalization.js";

describe("toPosixPath", () => {
  it("normalizes Windows separators for generated config values", () => {
    const windowsPath = path.win32.join(
      ".claude",
      "hooks",
      "scripts",
      "log.sh",
    );
    expect(toPosixPath(windowsPath)).toBe(".claude/hooks/scripts/log.sh");
  });

  it("normalizes a Windows-relative Codex agent path", () => {
    expect(toPosixPath(path.win32.join("agents", "reviewer.md"))).toBe(
      "agents/reviewer.md",
    );
  });

  it("preserves an existing POSIX path", () => {
    expect(toPosixPath("agents/reviewer.toml")).toBe("agents/reviewer.toml");
  });
});

describe("validateSyncNamespace", () => {
  it("accepts valid alphanumeric namespace", () => {
    expect(() => validateSyncNamespace("company")).not.toThrow();
  });

  it("accepts hyphens and underscores", () => {
    expect(() => validateSyncNamespace("my-team_rules")).not.toThrow();
  });

  it("accepts single character namespace", () => {
    expect(() => validateSyncNamespace("a")).not.toThrow();
  });

  it("rejects forward slash (path traversal)", () => {
    expect(() => validateSyncNamespace("company/evil")).toThrow(
      "path-unsafe characters",
    );
  });

  it("rejects backslash (path traversal)", () => {
    expect(() => validateSyncNamespace("company\\evil")).toThrow(
      "path-unsafe characters",
    );
  });

  it("rejects double-dot (parent directory traversal)", () => {
    expect(() => validateSyncNamespace("..")).toThrow("path-unsafe characters");
  });

  it("rejects embedded double-dot", () => {
    expect(() => validateSyncNamespace("foo..bar")).toThrow(
      "path-unsafe characters",
    );
  });

  it("rejects null bytes", () => {
    expect(() => validateSyncNamespace("company\0evil")).toThrow(
      "path-unsafe characters",
    );
  });

  it("rejects spaces", () => {
    expect(() => validateSyncNamespace("my namespace")).toThrow(
      "invalid characters",
    );
  });

  it("rejects dots (not alphanumeric/hyphen/underscore)", () => {
    expect(() => validateSyncNamespace("my.namespace")).toThrow(
      "invalid characters",
    );
  });

  it("rejects empty string", () => {
    expect(() => validateSyncNamespace("")).toThrow("invalid characters");
  });

  it("rejects special characters", () => {
    expect(() => validateSyncNamespace("company@evil")).toThrow(
      "invalid characters",
    );
  });
});
