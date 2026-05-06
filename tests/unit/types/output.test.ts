import { describe, expect, it } from "vitest";
import {
  CliResultSchema,
  cliError,
  cliResult,
  projectFields,
} from "../../../src/types/output.js";

describe("cliResult", () => {
  it("produces a success envelope with defaults", () => {
    const result = cliResult("sync", {
      tools: ["cursor"],
      skills: 1,
      commands: 0,
      agents: 0,
      mcpServers: 0,
    });
    expect(result).toEqual({
      version: "1.0",
      status: "success",
      command: "sync",
      data: {
        tools: ["cursor"],
        skills: 1,
        commands: 0,
        agents: 0,
        mcpServers: 0,
      },
    });
  });

  it("includes warnings without changing status", () => {
    const result = cliResult(
      "sync",
      { tools: [], skills: 0, commands: 0, agents: 0, mcpServers: 0 },
      {
        warnings: ["Transitive extends not supported"],
      },
    );
    expect(result.status).toBe("success");
    expect(result.warnings).toEqual(["Transitive extends not supported"]);
  });

  it("allows explicit partial status", () => {
    const result = cliResult(
      "sync",
      { tools: ["cursor"], skills: 1, commands: 0, agents: 0, mcpServers: 0 },
      {
        status: "partial",
        errors: [
          { code: "PRESET_UNREACHABLE", message: "Failed to resolve preset" },
        ],
      },
    );
    expect(result.status).toBe("partial");
    expect(result.errors).toHaveLength(1);
  });

  it("omits errors and warnings when empty", () => {
    const result = cliResult("init", {
      action: "created" as const,
      configPath: "/p",
      tools: [],
    });
    expect(result.errors).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });
});

describe("cliError", () => {
  it("produces an error envelope with data and errors array", () => {
    const result = cliError(
      "sync",
      { tools: [], skills: 0, commands: 0, agents: 0, mcpServers: 0 },
      {
        code: "CONFIG_NOT_FOUND",
        message: "No config found",
        suggestion: "agentsync init",
      },
    );
    expect(result.status).toBe("error");
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("CONFIG_NOT_FOUND");
    expect(result.data.tools).toEqual([]);
  });

  it("accepts an array of errors", () => {
    const result = cliError(
      "sync",
      { tools: [], skills: 0, commands: 0, agents: 0, mcpServers: 0 },
      [
        { code: "ERR_1", message: "first" },
        { code: "ERR_2", message: "second" },
      ],
    );
    expect(result.errors).toHaveLength(2);
  });
});

describe("CliResultSchema", () => {
  it("validates a well-formed result", () => {
    const input = {
      version: "1.0",
      status: "success",
      command: "init",
      data: { action: "created", configPath: "/p", tools: [] },
    };
    expect(CliResultSchema.safeParse(input).success).toBe(true);
  });

  it("rejects missing version", () => {
    const input = { status: "success", command: "init", data: {} };
    expect(CliResultSchema.safeParse(input).success).toBe(false);
  });

  it("rejects invalid status", () => {
    const input = {
      version: "1.0",
      status: "unknown",
      command: "init",
      data: {},
    };
    expect(CliResultSchema.safeParse(input).success).toBe(false);
  });
});

describe("projectFields", () => {
  const data = {
    tools: ["cursor"],
    mcp: { github: {} },
    presets: ["x"],
    skills: ["y"],
    commands: ["z"],
  };
  const validFields = [
    "tools",
    "mcp",
    "presets",
    "skills",
    "commands",
  ] as const;

  it("returns full data when fields is undefined", () => {
    expect(projectFields(data, undefined, validFields)).toEqual(data);
  });

  it("projects a single field", () => {
    expect(projectFields(data, "tools", validFields)).toEqual({
      tools: ["cursor"],
    });
  });

  it("projects multiple comma-separated fields", () => {
    const result = projectFields(data, "tools,mcp", validFields);
    expect(result).toEqual({ tools: ["cursor"], mcp: { github: {} } });
  });

  it("throws ValidationError on invalid field", () => {
    expect(() => projectFields(data, "bogus", validFields)).toThrow(
      "Invalid field",
    );
  });

  it("throws ValidationError listing valid fields in suggestion", () => {
    try {
      projectFields(data, "bogus", validFields);
    } catch (e: unknown) {
      expect((e as Error).message).toContain("Valid fields:");
    }
  });

  it("returns empty partial for field with no data in source", () => {
    const sparse = { tools: ["cursor"] } as Record<string, unknown>;
    const result = projectFields(sparse, "tools,mcp", validFields);
    expect(result).toEqual({ tools: ["cursor"] });
    expect("mcp" in result).toBe(false);
  });
});
