import { describe, expect, it } from "vitest";
import {
  CleanDataSchema,
  CliErrorSchema,
  CliResultSchema,
  ConfigAddDataSchema,
  ConfigRmDataSchema,
  DoctorDataSchema,
  InitDataSchema,
  jsonStringify,
  projectFields,
  SyncDataSchema,
} from "../../../src/types/output.js";

describe("jsonStringify", () => {
  const data = { name: "test", count: 42 };

  it("returns minified JSON when pretty=false", () => {
    const result = jsonStringify(data, false);
    expect(result).toBe('{"name":"test","count":42}');
    expect(result).not.toContain("\n");
  });

  it("returns indented JSON when pretty=true", () => {
    const result = jsonStringify(data, true);
    expect(result).toContain("\n");
    expect(result).toContain("  ");
    expect(JSON.parse(result)).toEqual(data);
  });

  it("preserves all data through round-trip", () => {
    const complex = {
      version: "1.0",
      status: "success",
      data: { tools: ["cursor", "claude"], skills: 5 },
      warnings: ["some warning"],
    };
    expect(JSON.parse(jsonStringify(complex, false))).toEqual(complex);
    expect(JSON.parse(jsonStringify(complex, true))).toEqual(complex);
  });

  it("handles undefined pretty by falling back to isTTY", () => {
    // When pretty is undefined, jsonStringify checks process.stdout.isTTY
    // In test environment, isTTY may be true or false — just verify it's valid JSON
    const result = jsonStringify(data);
    expect(JSON.parse(result)).toEqual(data);
  });

  it("handles null and primitive values", () => {
    expect(jsonStringify(null, false)).toBe("null");
    expect(jsonStringify(42, false)).toBe("42");
    expect(jsonStringify("hello", false)).toBe('"hello"');
  });

  it("handles empty objects and arrays", () => {
    expect(jsonStringify({}, false)).toBe("{}");
    expect(jsonStringify([], false)).toBe("[]");
  });

  it("defaults to minified when pretty is undefined", () => {
    const result = jsonStringify(data);
    // Should be minified (no newlines) regardless of TTY
    expect(result).not.toContain("\n");
    expect(JSON.parse(result)).toEqual(data);
  });
});

describe("projectFields", () => {
  const data = { tools: ["cursor"], skills: 5, commands: 3 };
  const validFields = ["tools", "skills", "commands"] as const;

  it("trims whitespace from field names", () => {
    const result = projectFields(data, "tools , skills", validFields);
    expect(result).toEqual({ tools: ["cursor"], skills: 5 });
  });

  it("filters empty segments from trailing commas", () => {
    const result = projectFields(data, "tools,", validFields);
    expect(result).toEqual({ tools: ["cursor"] });
  });
});

describe("Per-command Zod data schemas", () => {
  it("SyncDataSchema validates correct sync data", () => {
    const data = {
      tools: ["cursor"],
      skills: 2,
      commands: 1,
      agents: 0,
      mcpServers: 1,
      details: [
        {
          tool: "cursor",
          skills: ["my-skill"],
          commands: ["my-cmd"],
          agents: [],
          mcp: ["github"],
        },
      ],
    };
    expect(SyncDataSchema.parse(data)).toEqual(data);
  });

  it("SyncDataSchema rejects missing fields", () => {
    expect(() => SyncDataSchema.parse({ tools: ["cursor"] })).toThrow();
  });

  it("InitDataSchema validates correct init data", () => {
    const data = {
      action: "created",
      configPath: "/test/.agents/agentsync.toml",
      tools: ["cursor"],
    };
    expect(InitDataSchema.parse(data)).toEqual(data);
  });

  it("DoctorDataSchema validates correct doctor data", () => {
    const data = {
      config: { found: true, valid: true },
      tools: [{ name: "cursor" }],
      skills: { count: 3, synced: true },
      mcp: [],
      presets: [],
      drift: [{ tool: "cursor", status: "ok" }],
      contentDrift: [{ file: ".cursor/skills/foo/SKILL.md", status: "ok" }],
    };
    expect(DoctorDataSchema.parse(data)).toEqual(data);
  });

  it("CleanDataSchema validates correct clean data", () => {
    const data = {
      dryRun: false,
      results: [{ tool: "cursor", removedFiles: ["a.md"], removedDirs: [] }],
      summary: { files: 1, directories: 0 },
    };
    expect(CleanDataSchema.parse(data)).toEqual(data);
  });

  it("ConfigAddDataSchema validates correct config add data", () => {
    expect(
      ConfigAddDataSchema.parse({
        type: "tool",
        name: "cursor",
        action: "added",
      }),
    ).toBeDefined();
  });

  it("ConfigRmDataSchema validates correct config rm data", () => {
    expect(
      ConfigRmDataSchema.parse({
        type: "tool",
        name: "cursor",
        action: "removed",
      }),
    ).toBeDefined();
  });

  it("CliErrorSchema accepts retryable field", () => {
    const err = { code: "TEST", message: "test", retryable: true };
    expect(CliErrorSchema.parse(err)).toEqual(err);
  });

  it("CliErrorSchema allows missing retryable", () => {
    const err = { code: "TEST", message: "test" };
    expect(CliErrorSchema.parse(err)).toEqual(err);
  });

  it("CliResultSchema.strict() rejects unexpected top-level fields", () => {
    const withExtra = {
      version: "1.0",
      status: "success",
      command: "test",
      data: {},
      unexpectedField: "should be rejected",
    };
    const result = CliResultSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("SyncDataSchema.strict() rejects unexpected fields in data", () => {
    const withExtra = {
      tools: ["cursor"],
      skills: 1,
      commands: 0,
      agents: 0,
      mcpServers: 0,
      details: [],
      bonus: "unexpected",
    };
    const result = SyncDataSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("InitDataSchema.strict() rejects unexpected fields", () => {
    const withExtra = {
      action: "created",
      configPath: "/test",
      tools: [],
      extra: true,
    };
    const result = InitDataSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("DoctorDataSchema.strict() rejects unexpected fields", () => {
    const withExtra = {
      config: { found: true, valid: true },
      tools: [],
      skills: { count: 0, synced: false },
      mcp: [],
      presets: [],
      drift: [],
      contentDrift: [],
      rogue: 42,
    };
    const result = DoctorDataSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("CleanDataSchema.strict() rejects unexpected fields", () => {
    const withExtra = {
      dryRun: false,
      results: [],
      summary: { files: 0, directories: 0 },
      sneaky: "nope",
    };
    const result = CleanDataSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });
});
