import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../../src/cli.js";
import { init } from "../../../src/commands/init.js";
import { ConfigError } from "../../../src/core/errors.js";
import { CliResultSchema, InitDataSchema } from "../../../src/types/output.js";
import { outputFile, parseJsonValidated } from "../../../src/utils/fs.js";

describe("init current status", () => {
  let project: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (project) await rm(project, { recursive: true, force: true });
  });

  it("counts servers from the canonical mcp table", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["claude"]\n\n[mcp.release]\ncommand = "release-server"\n',
    );
    vi.spyOn(process, "cwd").mockReturnValue(project);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await init({});

    expect(log.mock.calls.flat().join(" ")).toContain("1 server configured");
  });

  it("reports projected tools from a read-only foreign config", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'default_agents = ["claude"]\n',
    );
    vi.spyOn(process, "cwd").mockReturnValue(project);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await init({});

    expect(log.mock.calls.flat().join(" ")).toContain("claude");
  });

  it.each([
    ["current", 'tools = ["claude", "codex"]\n', ["claude", "codex"]],
    ["foreign", 'default_agents = ["cursor"]\n', ["cursor"]],
  ])("returns %s existing tools in JSON status", async (_kind, config, tools) => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    await outputFile(path.join(project, ".agents", "agentsync.toml"), config);
    vi.spyOn(process, "cwd").mockReturnValue(project);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await init({ json: true });

    const output = log.mock.calls
      .flat()
      .find((value) => String(value).startsWith("{"));
    const envelope = parseJsonValidated(String(output), CliResultSchema);
    expect(InitDataSchema.parse(envelope.data).tools).toEqual(tools);
  });

  it.each([
    ["human", {}],
    ["JSON", { json: true }],
  ])("rejects an invalid config in %s mode", async (_mode, options) => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    const configPath = path.join(project, ".agents", "agentsync.toml");
    const original = 'tools = ["claude"]\nunexpected = true\n';
    await outputFile(configPath, original);
    vi.spyOn(process, "cwd").mockReturnValue(project);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(init(options)).rejects.toBeInstanceOf(ConfigError);
    expect(await readFile(configPath, "utf-8")).toBe(original);
  });

  it("propagates init failures through the CLI action", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    await outputFile(
      path.join(project, ".agents", "agentsync.toml"),
      'tools = ["claude"]\nunexpected = true\n',
    );
    vi.spyOn(process, "cwd").mockReturnValue(project);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const program = createProgram({ exitOverride: true });
    await expect(
      program.parseAsync(["init", "--json"], { from: "user" }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("rejects unsupported --tools values before writing files", async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-init-status-"));
    vi.spyOn(process, "cwd").mockReturnValue(project);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const program = createProgram({ exitOverride: true });
    await expect(
      program.parseAsync(["init", "--tools", "windsurf", "--json"], {
        from: "user",
      }),
    ).rejects.toBeInstanceOf(ConfigError);
    await expect(
      readFile(path.join(project, ".agents", "agentsync.toml"), "utf-8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
