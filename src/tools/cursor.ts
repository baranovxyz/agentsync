/** Cursor project configuration, shared by the IDE and Cursor Agent CLI. */

import * as path from "node:path";
import yaml from "js-yaml";
import type { MCP } from "../core/mcp/tokens.js";
import type { StructuredStateClaim } from "../sync/structured-state.js";
import type { SyncMode } from "../sync/write-file.js";
import { outputFile } from "../utils/fs.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import { cursorAgentContentTransform } from "./cursor/agents.js";
import {
  CURSOR_HOOK_ARTIFACTS,
  projectCursorHooks,
  writeCursorHooks,
} from "./cursor/hooks.js";
import {
  projectCursorPermissions,
  writeCursorPermissions,
} from "./cursor/permissions.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { CanonicalRule, ToolProvider } from "./types.js";

/**
 * Translate a canonical rule into Cursor's `.mdc` format. Cursor represents
 * unconditional and path-scoped rules with `alwaysApply` plus `globs`; YAML
 * serialization keeps descriptions containing punctuation valid.
 */
export function toCursorMdc(rule: CanonicalRule): string {
  const frontmatter: Record<string, unknown> = {};
  if (rule.description) frontmatter.description = rule.description;
  if (rule.paths) {
    frontmatter.globs = rule.paths.join(",");
    frontmatter.alwaysApply = false;
  } else {
    frontmatter.alwaysApply = true;
  }
  const block = yaml.dump(frontmatter, { lineWidth: -1 }).trimEnd();
  return `---\n${block}\n---\n\n${rule.body.replace(/^\n+/, "")}`;
}

async function writeCursorRules(
  rules: CanonicalRule[],
  cwd: string,
  _mode: SyncMode,
): Promise<{ written: string[]; warnings: string[] }> {
  // Cursor's `.mdc` is a translation, never byte-identical to the canonical
  // source — it always materializes real content, regardless of sync mode.
  const written: string[] = [];
  for (const rule of rules) {
    const destination = path.join(
      cwd,
      ".cursor",
      "rules",
      `${rule.relPath.replace(/\.md$/, "")}.mdc`,
    );
    await assertSafeProjectOutputPath(cwd, destination);
    await outputFile(destination, toCursorMdc(rule), { encoding: "utf-8" });
    written.push(rule.name);
  }
  return { written, warnings: [] };
}

const cursorStructuredConfig: NonNullable<ToolProvider["structuredConfig"]> = {
  declarations: [
    {
      path: ".cursor/hooks.json",
      format: "json",
      context: "cursor hooks",
      keys: [
        {
          key: "version",
          dependencies: [CURSOR_HOOK_ARTIFACTS],
          withdrawalGroup: "hooks-config",
        },
        {
          key: "hooks",
          dependencies: [CURSOR_HOOK_ARTIFACTS],
          withdrawalGroup: "hooks-config",
        },
      ],
    },
    {
      path: ".cursor/cli.json",
      format: "json",
      context: "cursor cli settings",
      keys: [{ key: "permissions" }],
    },
  ],
  artifactDependencies: [CURSOR_HOOK_ARTIFACTS],
  async project(input, cwd) {
    const claims: StructuredStateClaim[] = [];
    if (
      input.extensions.hooks &&
      Object.keys(input.extensions.hooks).length > 0
    ) {
      const projection = await projectCursorHooks(input.extensions.hooks, cwd);
      if (projection.value) {
        claims.push(
          {
            kind: "key",
            path: ".cursor/hooks.json",
            key: "version",
            value: projection.value.version,
          },
          {
            kind: "key",
            path: ".cursor/hooks.json",
            key: "hooks",
            value: projection.value.hooks,
          },
        );
      }
    }
    if (input.extensions.permissions) {
      claims.push({
        kind: "key",
        path: ".cursor/cli.json",
        key: "permissions",
        value: projectCursorPermissions(input.extensions.permissions).value,
      });
    }
    return { claims };
  },
};

export const cursorProvider: ToolProvider = {
  name: "cursor",
  displayName: "Cursor",
  paths: {
    skillsDir: ".agents/skills",
    generatedPresetSkillsDir: ".cursor/skills",
    commandsDir: ".cursor/commands",
    agentsDir: ".cursor/agents",
    mcpConfigPath: ".cursor/mcp.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
    hooks: true,
    permissions: true,
    rules: true,
  },
  manifestCleanSurfaces: [
    "skills",
    "commands",
    "agents",
    "rules",
    "extension-files",
  ],
  extensionFileOutputs: [
    {
      kind: "tree",
      root: ".cursor/hooks",
      dependency: CURSOR_HOOK_ARTIFACTS,
    },
  ],
  validateGeneratedPresetSkillName(name) {
    return /^[a-z0-9-]+$/.test(name)
      ? undefined
      : "Cursor skill names allow lowercase letters, numbers, and hyphens only";
  },
  readsGlobalAgentsDir: true,
  agentFileExtension: ".md",
  agentContentTransform: cursorAgentContentTransform,
  structuredConfig: cursorStructuredConfig,
  mcpFormat: {
    projectPath: "static",
    ownership: { kind: "whole-file" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      await writeMcpJson(
        path.join(cwd, ".cursor", "mcp.json"),
        mcps,
        cwd,
        "mcpServers",
      );
    },
  },
  docsFormat: null,
  hooksFormat: {
    artifactDependency: CURSOR_HOOK_ARTIFACTS,
    previewHooks: projectCursorHooks,
    writeHooks: writeCursorHooks,
  },
  permissionsFormat: {
    previewPermissions: async (permissions) => ({
      warnings: projectCursorPermissions(permissions).warnings,
    }),
    writePermissions: writeCursorPermissions,
  },
  rulesFormat: {
    fileOutput: { root: ".cursor/rules", extension: ".mdc" },
    previewRules: (rules) => ({
      written: rules.map((rule) => rule.name),
      warnings: [],
    }),
    writeRules: writeCursorRules,
  },
};

export { projectCursorHooks, projectCursorPermissions };
