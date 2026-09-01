import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  outputFile,
  parseJsonValidated,
  readJsonValidated,
} from "../../../src/utils/fs.js";

const ExampleSchema = z.object({ enabled: z.boolean() }).strict();

describe("validated JSON helpers", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-json-helper-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("parses strings only when their runtime shape matches", () => {
    expect(parseJsonValidated('{"enabled":true}', ExampleSchema)).toEqual({
      enabled: true,
    });
    expect(() =>
      parseJsonValidated('{"enabled":"yes"}', ExampleSchema),
    ).toThrow(/boolean/i);
  });

  it("rejects malformed JSON before validation", () => {
    expect(() => parseJsonValidated("{", ExampleSchema)).toThrow(SyntaxError);
  });

  it("reads and validates a JSON file", async () => {
    const file = path.join(tmpDir, "settings.json");
    await outputFile(file, '{"enabled":false}');
    await expect(readJsonValidated(file, ExampleSchema)).resolves.toEqual({
      enabled: false,
    });
  });
});
