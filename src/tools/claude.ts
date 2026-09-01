/** Claude Code tool provider. */

import { realpath } from "node:fs/promises";
import * as path from "node:path";
import type { MCP } from "../core/mcp/tokens.js";
import type { StructuredStateClaim } from "../sync/structured-state.js";
import { outputFile } from "../utils/fs.js";
import { toPosixPath } from "../utils/path-normalization.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import { claudeAgentContentTransform } from "./claude/agents.js";
import {
  CLAUDE_HOOK_ARTIFACTS,
  projectClaudeHooks,
  writeClaudeHooks,
} from "./claude/hooks.js";
import {
  CLAUDE_OUTPUT_STYLE_ARTIFACTS,
  projectClaudeOutputStyle,
  writeClaudeOutputStyle,
} from "./claude/output-style.js";
import {
  projectClaudePermissions,
  writeClaudePermissions,
} from "./claude/permissions.js";
import {
  CLAUDE_STATUSLINE_ARTIFACTS,
  projectClaudeStatusline,
  writeClaudeStatusline,
} from "./claude/statusline.js";
import { writeMcpJson } from "./mcp-helpers.js";
import type { CanonicalRule, ToolProvider } from "./types.js";

/**
 * Claude Code's rules format is canonical, so each rule is written verbatim.
 * The realpath check avoids rewriting a source through a `.claude/rules`
 * symlink that already points at `.agents/rules`.
 */
async function writeClaudeRules(
  rules: CanonicalRule[],
  cwd: string,
): Promise<{ written: string[]; warnings: string[] }> {
  const written: string[] = [];
  for (const rule of rules) {
    const destination = path.join(cwd, ".claude", "rules", rule.relPath);
    if (!(await isSameFile(rule.sourcePath, destination))) {
      await assertSafeProjectOutputPath(cwd, destination);
      await outputFile(destination, rule.raw, { encoding: "utf-8" });
    }
    written.push(rule.name);
  }
  return { written, warnings: [] };
}

async function isSameFile(left: string, right: string): Promise<boolean> {
  try {
    return (await realpath(left)) === (await realpath(right));
  } catch {
    return false;
  }
}

const claudeStructuredConfig: NonNullable<ToolProvider["structuredConfig"]> = {
  declarations: [
    {
      path: ".claude/settings.json",
      format: "json",
      context: "claude settings",
      keys: [
        { key: "hooks", dependencies: [CLAUDE_HOOK_ARTIFACTS] },
        { key: "permissions" },
        { key: "statusLine", dependencies: [CLAUDE_STATUSLINE_ARTIFACTS] },
        {
          key: "outputStyle",
          dependencies: [CLAUDE_OUTPUT_STYLE_ARTIFACTS],
        },
      ],
    },
  ],
  artifactDependencies: [
    CLAUDE_HOOK_ARTIFACTS,
    CLAUDE_OUTPUT_STYLE_ARTIFACTS,
    CLAUDE_STATUSLINE_ARTIFACTS,
  ],
  async project(input, cwd) {
    const claims: StructuredStateClaim[] = [];
    if (
      input.extensions.hooks &&
      Object.keys(input.extensions.hooks).length > 0
    ) {
      const hooks = await projectClaudeHooks(input.extensions.hooks, cwd);
      claims.push({
        kind: "key",
        path: ".claude/settings.json",
        key: "hooks",
        value: hooks.value,
      });
    }
    if (input.extensions.permissions) {
      claims.push({
        kind: "key",
        path: ".claude/settings.json",
        key: "permissions",
        value: projectClaudePermissions(input.extensions.permissions).value,
      });
    }
    if (input.extensions.statusline) {
      const statusline = await projectClaudeStatusline(
        input.extensions.statusline,
        cwd,
      );
      claims.push({
        kind: "key",
        path: ".claude/settings.json",
        key: "statusLine",
        value: statusline.value,
      });
    }
    if (input.extensions.outputStyle) {
      const outputStyle = await projectClaudeOutputStyle(
        input.extensions.outputStyle,
        cwd,
      );
      if (outputStyle.value) {
        claims.push({
          kind: "key",
          path: ".claude/settings.json",
          key: "outputStyle",
          value: outputStyle.value,
        });
      }
    }
    return { claims };
  },
};

export const claudeProvider: ToolProvider = {
  name: "claude",
  displayName: "Claude Code",
  paths: {
    skillsDir: ".claude/skills",
    commandsDir: ".claude/commands",
    agentsDir: ".claude/agents",
    mcpConfigPath: ".mcp.json",
    docsFile: "CLAUDE.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: false,
    nativeSkillsDiscovery: false,
    hooks: true,
    permissions: true,
    statusline: true,
    outputStyle: true,
    rules: true,
  },
  readsGlobalAgentsDir: false,
  manifestCleanSurfaces: [
    "skills",
    "commands",
    "agents",
    "docs",
    "rules",
    "extension-files",
  ],
  extensionFileOutputs: [
    {
      kind: "tree",
      root: ".claude/hooks/scripts",
      dependency: CLAUDE_HOOK_ARTIFACTS,
    },
    {
      kind: "exact",
      path: ".claude/statusline/render.sh",
      dependency: CLAUDE_STATUSLINE_ARTIFACTS,
    },
    {
      kind: "tree",
      root: ".claude/statusline/custom",
      extension: ".sh",
      dependency: CLAUDE_STATUSLINE_ARTIFACTS,
    },
    {
      kind: "tree",
      root: ".claude/output-styles",
      extension: ".md",
      dependency: CLAUDE_OUTPUT_STYLE_ARTIFACTS,
    },
  ],
  agentFileExtension: ".md",
  agentContentTransform: claudeAgentContentTransform,
  structuredConfig: claudeStructuredConfig,
  mcpFormat: {
    projectPath: "static",
    ownership: { kind: "whole-file" },
    async writeProjectMCP(
      mcps: Record<string, MCP>,
      cwd: string,
    ): Promise<void> {
      await writeMcpJson(path.join(cwd, ".mcp.json"), mcps, cwd);
    },
  },
  docsFormat: {
    async writeDocs(agentsMdPath: string, cwd: string): Promise<void> {
      const claudeMd = path.join(cwd, "CLAUDE.md");
      const relPath = toPosixPath(path.relative(cwd, agentsMdPath));
      await assertSafeProjectOutputPath(cwd, claudeMd);
      await outputFile(claudeMd, `@${relPath}\n`, { encoding: "utf-8" });
    },
  },
  hooksFormat: {
    artifactDependency: CLAUDE_HOOK_ARTIFACTS,
    previewHooks: projectClaudeHooks,
    writeHooks: writeClaudeHooks,
  },
  permissionsFormat: {
    previewPermissions: async (permissions) => ({
      warnings: projectClaudePermissions(permissions).warnings,
    }),
    writePermissions: writeClaudePermissions,
  },
  statuslineFormat: {
    artifactDependency: CLAUDE_STATUSLINE_ARTIFACTS,
    previewStatusline: projectClaudeStatusline,
    writeStatusline: writeClaudeStatusline,
  },
  outputStyleFormat: {
    artifactDependency: CLAUDE_OUTPUT_STYLE_ARTIFACTS,
    previewOutputStyle: projectClaudeOutputStyle,
    writeOutputStyle: writeClaudeOutputStyle,
  },
  rulesFormat: {
    fileOutput: { root: ".claude/rules", extension: ".md" },
    previewRules: (rules) => ({
      written: rules.map((rule) => rule.name),
      warnings: [],
    }),
    writeRules: writeClaudeRules,
  },
};

export {
  projectClaudeHooks,
  projectClaudeOutputStyle,
  projectClaudePermissions,
  projectClaudeStatusline,
};
