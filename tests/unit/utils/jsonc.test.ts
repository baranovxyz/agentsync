import { describe, expect, it } from "vitest";
import { ToolSettingsSchema } from "../../../src/types/schemas.js";
import {
  editJsoncArraySlice,
  editJsoncTopLevelKey,
  hasJsoncComments,
  parseJsoncValidated,
} from "../../../src/utils/jsonc.js";

describe("OpenCode JSONC utilities", () => {
  it("accepts only an exact zero-byte config as an empty object", () => {
    expect(parseJsoncValidated("", ToolSettingsSchema)).toEqual({});
    expect(() => parseJsoncValidated(" \n", ToolSettingsSchema)).toThrow(
      /Invalid JSONC/,
    );
    expect(() =>
      parseJsoncValidated("// comment only\n", ToolSettingsSchema),
    ).toThrow(/Invalid JSONC/);
  });

  it("parses comments and trailing commas with root validation", () => {
    const source = `{
  // OpenCode accepts JSONC
  "theme": "system",
}
`;

    expect(parseJsoncValidated(source, ToolSettingsSchema)).toEqual({
      theme: "system",
    });
    expect(hasJsoncComments(source)).toBe(true);
  });

  it("rejects malformed JSONC instead of accepting the recovery parse", () => {
    expect(() =>
      parseJsoncValidated('{ "theme":, }', ToolSettingsSchema),
    ).toThrow(/ValueExpected/);
    expect(() => parseJsoncValidated("[]", ToolSettingsSchema)).toThrow(
      /root must be an object/i,
    );
  });

  it("updates one top-level key without reserializing unrelated JSONC", () => {
    const source =
      "{\r\n" +
      "\t// user setting\r\n" +
      '\t"theme": "system", // keep inline\r\n' +
      '\t"permission": { "bash": "ask" },\r\n' +
      "}\r\n";
    const permission = {
      "github_*": "ask",
      github_search: "allow",
    };

    const edited = editJsoncTopLevelKey(
      source,
      "permission",
      permission,
      ToolSettingsSchema,
    );

    expect(edited).toContain("\t// user setting\r\n");
    expect(edited).toContain('\t"theme": "system", // keep inline\r\n');
    expect(edited).not.toMatch(/(^|[^\r])\n/);
    expect(edited).toMatch(/"permission": \{\r\n\t\t"github_\*"/);
    expect(edited).toMatch(/\r\n\t\},\r\n\}/);
    expect(parseJsoncValidated(edited, ToolSettingsSchema)).toMatchObject({
      theme: "system",
      permission,
    });
  });

  it("replaces only managed instruction indexes and retains comments", () => {
    const source = `{
  "instructions": [
    "README.md", // user entry
    // generated entries follow
    ".agents/rules/old-a.md",
    "CONTRIBUTING.md",
    ".agents/rules/old-b.md",
  ],
  "theme": "system",
}
`;

    const edited = editJsoncArraySlice(
      source,
      {
        key: "instructions",
        desiredOwned: [".agents/rules/new-a.md", ".agents/rules/new-b.md"],
        isOwned: (value) =>
          typeof value === "string" && value.startsWith(".agents/rules/"),
      },
      ToolSettingsSchema,
    );

    expect(edited).toContain('"README.md"');
    expect(edited.match(/\/\/ user entry/g)).toHaveLength(1);
    expect(edited).toContain("// generated entries follow");
    expect(edited).toContain('"CONTRIBUTING.md"');
    expect(edited).toContain('  "theme": "system",\n}\n');
    expect(
      parseJsoncValidated(edited, ToolSettingsSchema).instructions,
    ).toEqual([
      "README.md",
      ".agents/rules/new-a.md",
      ".agents/rules/new-b.md",
      "CONTRIBUTING.md",
    ]);
  });

  it("retains an inline comment when replacing its owned instruction", () => {
    const source = `{
  "instructions": [
    "README.md",
    ".agents/rules/old.md", // KEEP INLINE
    "CONTRIBUTING.md",
  ],
}
`;

    const edited = editJsoncArraySlice(
      source,
      {
        key: "instructions",
        desiredOwned: [".agents/rules/new.md"],
        isOwned: (value) =>
          typeof value === "string" && value.startsWith(".agents/rules/"),
      },
      ToolSettingsSchema,
    );

    expect(edited.match(/\/\/ KEEP INLINE/g)).toHaveLength(1);
    expect(
      parseJsoncValidated(edited, ToolSettingsSchema).instructions,
    ).toEqual(["README.md", ".agents/rules/new.md", "CONTRIBUTING.md"]);
  });

  it("retains an owned instruction comment when its empty array property is withdrawn", () => {
    const source = `{
  "instructions": [
    ".agents/rules/old.md", // KEEP INLINE
  ],
}
`;
    const withoutOwned = editJsoncArraySlice(
      source,
      {
        key: "instructions",
        desiredOwned: [],
        isOwned: (value) =>
          typeof value === "string" && value.startsWith(".agents/rules/"),
      },
      ToolSettingsSchema,
    );

    const edited = editJsoncTopLevelKey(
      withoutOwned,
      "instructions",
      undefined,
      ToolSettingsSchema,
    );

    expect(parseJsoncValidated(edited, ToolSettingsSchema)).toEqual({});
    expect(edited.match(/\/\/ KEEP INLINE/g)).toHaveLength(1);
  });

  it("removes an only managed key while retaining a file-level comment", () => {
    const source = `{
  "mcp": {
    "tracker": { "type": "local" }
  }
  // Keep this OpenCode note.
}
`;

    const edited = editJsoncTopLevelKey(
      source,
      "mcp",
      undefined,
      ToolSettingsSchema,
    );

    expect(parseJsoncValidated(edited, ToolSettingsSchema)).toEqual({});
    expect(edited).toContain("// Keep this OpenCode note.");
    expect(hasJsoncComments(edited)).toBe(true);
  });

  it("removes a sole trailing-comma property without consuming adjacent comments", () => {
    const source = `{
  // KEEP BEFORE MCP
  "mcp": {
    "tracker": { "type": "local" }
  }, // KEEP INLINE
}
`;

    const edited = editJsoncTopLevelKey(
      source,
      "mcp",
      undefined,
      ToolSettingsSchema,
    );

    expect(parseJsoncValidated(edited, ToolSettingsSchema)).toEqual({});
    expect(edited).toContain("// KEEP BEFORE MCP");
    expect(edited).toContain("// KEEP INLINE");
  });
});
