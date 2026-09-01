import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { init } from "../../../src/commands/init.js";
import { ConfigError } from "../../../src/core/errors.js";
import { syncAgents } from "../../../src/sync/agents.js";
import { syncCommands } from "../../../src/sync/commands.js";
import {
  type ExtensionsInput,
  syncExtensions,
} from "../../../src/sync/extensions.js";
import { syncRules } from "../../../src/sync/rules.js";
import { applyStructuredLifecyclePlan } from "../../../src/sync/structured-lifecycle.js";
import {
  planToolStructuredLifecycle,
  refreshToolStructuredLifecycle,
} from "../../../src/sync/structured-providers.js";
import { getToolProvider } from "../../../src/tools/index.js";
import type { ToolProvider } from "../../../src/tools/types.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";

async function expectConfigError(
  operation: Promise<unknown>,
): Promise<ConfigError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    if (error instanceof ConfigError) return error;
  }
  throw new Error("Expected a ConfigError");
}

describe("project output path safety", () => {
  let sandbox: string;
  let project: string;
  let outside: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "agentsync-output-safety-"));
    project = path.join(sandbox, "project");
    outside = path.join(sandbox, "outside");
    await Promise.all([
      mkdir(project, { recursive: true }),
      mkdir(outside, { recursive: true }),
    ]);
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  async function initProject(): Promise<void> {
    const previousCwd = process.cwd();
    process.chdir(project);
    try {
      await init({ json: true, tools: ["claude"] });
    } finally {
      process.chdir(previousCwd);
    }
  }

  async function syncStructuredExtensions(
    providers: ToolProvider[],
    input: ExtensionsInput,
  ): Promise<void> {
    const request = {
      cwd: project,
      providers,
      desired: { extensions: input, rules: [] },
      preserveUnselected: true,
    };
    const lifecycle = await planToolStructuredLifecycle(request);
    await syncExtensions(providers, input, project, {
      protectedDependencies: lifecycle.protectedDependencies,
    });
    const refreshed = await refreshToolStructuredLifecycle(request, lifecycle);
    await applyStructuredLifecyclePlan(refreshed);
  }

  it.runIf(process.platform !== "win32")(
    "rejects an escaping .agents symlink before init creates sibling output",
    async () => {
      await symlink(outside, path.join(project, ".agents"), "dir");

      const error = await expectConfigError(initProject());

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await pathExists(path.join(project, "AGENTS.md"))).toBe(false);
      expect(await pathExists(path.join(outside, "agentsync.toml"))).toBe(
        false,
      );
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not write init's AGENTS.md through a dangling external symlink",
    async () => {
      const externalDocument = path.join(outside, "generated-AGENTS.md");
      await symlink(externalDocument, path.join(project, "AGENTS.md"));

      const error = await expectConfigError(initProject());

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await pathExists(externalDocument)).toBe(false);
      expect(await pathExists(path.join(project, ".agents"))).toBe(false);
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not follow a Cursor hooks.json leaf symlink outside the project",
    async () => {
      const externalConfig = path.join(outside, "hooks.json");
      const original = '{"sentinel":"outside"}\n';
      await outputFile(externalConfig, original);
      await mkdir(path.join(project, ".cursor"), { recursive: true });
      await symlink(
        externalConfig,
        path.join(project, ".cursor", "hooks.json"),
      );

      const error = await expectConfigError(
        syncStructuredExtensions([getToolProvider("cursor")], {
          hooks: {
            PreToolUse: [{ id: "audit", command: "audit-command" }],
          },
        }),
      );

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await readFile(externalConfig, "utf-8")).toBe(original);
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not follow a Cursor cli.json ancestor symlink outside the project",
    async () => {
      const externalConfig = path.join(outside, "cli.json");
      const original = '{"sentinel":"outside"}\n';
      await outputFile(externalConfig, original);
      await symlink(outside, path.join(project, ".cursor"), "dir");

      const error = await expectConfigError(
        syncStructuredExtensions([getToolProvider("cursor")], {
          permissions: { default: "deny" },
        }),
      );

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await readFile(externalConfig, "utf-8")).toBe(original);
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not write Cursor rules through an external directory symlink",
    async () => {
      await outputFile(
        path.join(project, ".agents", "rules", "safety.md"),
        "Keep generated output inside the project.\n",
      );
      const externalRule = path.join(outside, "safety.mdc");
      const original = "outside rule\n";
      await outputFile(externalRule, original);
      await mkdir(path.join(project, ".cursor"), { recursive: true });
      await symlink(outside, path.join(project, ".cursor", "rules"), "dir");

      const error = await expectConfigError(
        syncRules([getToolProvider("cursor")], project),
      );

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await readFile(externalRule, "utf-8")).toBe(original);
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not replace a generic command output symlink outside the project",
    async () => {
      await outputFile(
        path.join(project, ".agents", "commands", "review.md"),
        "Review the change.\n",
      );
      const externalCommand = path.join(outside, "review.md");
      const original = "outside command\n";
      await outputFile(externalCommand, original);
      await mkdir(path.join(project, ".claude", "commands"), {
        recursive: true,
      });
      await symlink(
        externalCommand,
        path.join(project, ".claude", "commands", "review.md"),
      );

      const error = await expectConfigError(
        syncCommands([getToolProvider("claude")], project),
      );

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await readFile(externalCommand, "utf-8")).toBe(original);
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not write a transformed agent through an external ancestor",
    async () => {
      await outputFile(
        path.join(project, ".agents", "agents", "planner.md"),
        "# Planner\n",
      );
      const externalAgent = path.join(outside, "agents", "planner.md");
      const original = "outside agent\n";
      await outputFile(externalAgent, original);
      await symlink(outside, path.join(project, ".opencode"), "dir");

      const error = await expectConfigError(
        syncAgents([getToolProvider("opencode")], project),
      );

      expect(error.suggestion).toContain("Replace the symlink");
      expect(await readFile(externalAgent, "utf-8")).toBe(original);
    },
  );

  it("preserves malformed Cursor shared JSON and reports recovery guidance", async () => {
    const settingsPath = path.join(project, ".cursor", "cli.json");
    const malformed = "{ invalid json";
    await outputFile(settingsPath, malformed);

    const error = await expectConfigError(
      syncStructuredExtensions([getToolProvider("cursor")], {
        permissions: { default: "ask" },
      }),
    );

    expect(error.suggestion).toContain("Repair the existing JSON");
    expect(await readFile(settingsPath, "utf-8")).toBe(malformed);
  });
});
