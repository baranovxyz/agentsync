/**
 * Codex CLI Tool Provider
 *
 * MCP is configured via TOML in the project-scoped `.codex/config.toml`.
 * Set `AGENTSYNC_CODEX_HOME_MCP=1` to also merge the servers into the
 * user-level `~/.codex/config.toml`.
 *
 * Codex discovers repo-local `.agents/skills/` while walking toward the
 * project root and discovers user-level `~/.agents/skills/` directly.
 * Ref: https://developers.openai.com/codex/mcp
 * Ref: https://developers.openai.com/codex/skills/
 */

import {
  codexAgentsPostSync,
  preflightCodexAgents,
  projectCodexAgent,
  validateCodexRolePaths,
} from "./codex/agents.js";
import {
  codexOutputStyleProjection,
  codexPermissionWarnings,
  codexStatuslineWarnings,
  preflightCodexExtensions,
  reconcileCodexExtensions,
  writeCodexOutputStyle,
  writeCodexPermissions,
  writeCodexStatusline,
} from "./codex/extensions.js";
import {
  cleanCodexGeneratedState,
  hasCodexGeneratedState,
} from "./codex/lifecycle.js";
import {
  applyCodexHomeMcp,
  preflightCodexHomeMcp,
  writeCodexProjectMcp,
} from "./codex/mcp.js";
import type { ToolProvider } from "./types.js";

export const codexProvider: ToolProvider = {
  name: "codex",
  displayName: "Codex CLI",
  paths: {
    skillsDir: ".agents/skills", // Codex reads from .agents/ shared directory
    generatedPresetSkillsDir: ".codex/skills",
    commandsDir: null, // Commands and skills have different invocation semantics.
    agentsDir: ".codex/agents",
    mcpConfigPath: ".codex/config.toml",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: false,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
    hooks: false,
    permissions: true,
    statusline: true,
    outputStyle: true,
  },
  // Role Markdown is one member of a receipt-owned Markdown + TOML + config
  // group. Generic per-file ownership must never split that group.
  manifestCleanSurfaces: ["skills"],
  validateGeneratedPresetSkillName(name) {
    return [...name].length > 64
      ? `Codex accepts skill names up to 64 characters (received ${
          [...name].length
        })`
      : undefined;
  },
  readsGlobalAgentsDir: true,
  agentFileExtension: ".md",
  agentContentTransform: {
    transform(content, name) {
      const projection = projectCodexAgent(content, name);
      return projection.skip
        ? { skip: true, warnings: projection.warnings }
        : { content, warnings: projection.warnings };
    },
  },
  mcpFormat: {
    projectPath: "static",
    // Extension and role keys use their precise semantic receipt. Clean's MCP
    // contract therefore remains limited to the table this writer replaces.
    ownership: { kind: "owned-keys", keys: ["mcp_servers"], format: "toml" },
    preflightExternalMCP: preflightCodexHomeMcp,
    reconcileExternalMCP: applyCodexHomeMcp,
    writeProjectMCP: writeCodexProjectMcp,
  },
  docsFormat: null,
  agentsPostHook: {
    preflight: preflightCodexAgents,
    validate: validateCodexRolePaths,
    postSync: codexAgentsPostSync,
  },
  extensionsReconciler: {
    preflight: preflightCodexExtensions,
    reconcile: reconcileCodexExtensions,
  },
  hasGeneratedState: hasCodexGeneratedState,
  cleanGeneratedState: cleanCodexGeneratedState,
  permissionsFormat: {
    previewPermissions: async (permissions) => ({
      warnings: codexPermissionWarnings(permissions),
    }),
    writePermissions: writeCodexPermissions,
  },
  statuslineFormat: {
    previewStatusline: async (statusline) => ({
      warnings: codexStatuslineWarnings(statusline),
    }),
    writeStatusline: writeCodexStatusline,
  },
  outputStyleFormat: {
    previewOutputStyle: async (outputStyle) => ({
      warnings: codexOutputStyleProjection(outputStyle).warnings,
    }),
    writeOutputStyle: writeCodexOutputStyle,
  },
};
