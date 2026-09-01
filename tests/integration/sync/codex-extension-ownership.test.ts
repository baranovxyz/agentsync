import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ExtensionsInput,
  previewExtensions,
  syncExtensions,
} from "../../../src/sync/extensions.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile } from "../../../src/utils/fs.js";

interface ExtensionCollisionCase {
  name: string;
  input: ExtensionsInput;
  identical: string;
  modified: string;
}

const cases: ExtensionCollisionCase[] = [
  {
    name: "default permissions",
    input: { permissions: { default: "ask" } },
    identical: 'default_permissions = ":workspace"\n',
    modified: 'default_permissions = ":read-only"\n',
  },
  {
    name: "status line",
    input: { statusline: { items: ["model"] } },
    identical: '[tui]\nstatus_line = ["model"]\n',
    modified: '[tui]\nstatus_line = ["current-dir"]\n',
  },
  {
    name: "personality",
    input: { outputStyle: { tone: "pragmatic" } },
    identical: 'personality = "pragmatic"\n',
    modified: 'personality = "friendly"\n',
  },
];

describe("Codex extension ownership", () => {
  let project: string;
  let configPath: string;
  const provider = getToolProvider("codex");

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-cx-extension-"));
    configPath = path.join(project, ".codex", "config.toml");
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it.each(
    cases,
  )("rejects occupied unowned $name even when the value is identical", async (testCase) => {
    await outputFile(configPath, testCase.identical);

    await expect(
      previewExtensions([provider], testCase.input, project),
    ).rejects.toThrow("unowned Codex extension value");
    await expect(
      syncExtensions([provider], testCase.input, project),
    ).rejects.toThrow("unowned Codex extension value");

    expect(await readFile(configPath, "utf-8")).toBe(testCase.identical);
  });

  it.each(
    cases,
  )("rejects a modified receipt-owned $name in preview and execution", async (testCase) => {
    await syncExtensions([provider], testCase.input, project);
    await outputFile(configPath, testCase.modified);

    await expect(
      previewExtensions([provider], testCase.input, project),
    ).rejects.toThrow("modified Codex extension value");
    await expect(
      syncExtensions([provider], testCase.input, project),
    ).rejects.toThrow("modified Codex extension value");

    expect(await readFile(configPath, "utf-8")).toBe(testCase.modified);
  });
});
