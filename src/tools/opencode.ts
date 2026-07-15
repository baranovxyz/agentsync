/**
 * OpenCode Tool Provider
 *
 * OpenCode MCP config lives inside opencode.json under the "mcp" key.
 * It uses "environment" (not "env") and "command" as an array.
 * Ref: https://opencode.ai/docs/mcp-servers/
 */

import * as path from "node:path";
import yaml from "js-yaml";
import type { z } from "zod";
import type { MCP } from "../core/mcp/tokens.js";
import type { PermissionsConfigSchema } from "../types/schemas.js";
import { mergeIntoSettings } from "./mcp-helpers.js";
import type { AgentContentTransform, ToolProvider } from "./types.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

/** True for an OpenCode-native `tools: { name: boolean }` record. */
function isBooleanRecord(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(
      (v) => typeof v === "boolean",
    )
  );
}

/**
 * Translate a canonical agentsync agent .md into OpenCode-valid frontmatter.
 *
 * OpenCode parses each `.opencode/agents/<name>.md`'s frontmatter against a
 * strict schema and treats one bad file as a FATAL boot error. agentsync's
 * canonical frontmatter trips it on the `tools` field (a comma-scalar / list
 * where OpenCode demands `Record<string, boolean>`). This rewrites the file
 * OpenCode reads:
 *
 *  - `tools` allowlist (scalar/array) → dropped + warned. OpenCode's tools map
 *    is deny-by-explicit-`false` (not allowlist-by-omission) and is deprecated
 *    in favour of `permission`, so a positive translation would not restrict
 *    anything. An already-valid boolean record is kept as-authored.
 *  - bare `model` alias (no provider prefix) → dropped + warned. OpenCode
 *    resolves `provider/model` ids; an unqualified alias fails at runtime, so
 *    we fall back to the session's configured default. Qualified ids are kept.
 *  - `capability` / `skill_tags` (AgentSync-only) → dropped (meaningless to
 *    OpenCode; would otherwise land in `options`).
 *  - `mode` → defaulted to `subagent` when absent (OpenCode's canonical shape
 *    for a non-default role); an explicit mode is preserved.
 *
 * Files without parseable frontmatter pass through untouched.
 */
function translateOpenCodeAgentContent(
  content: string,
  name: string,
): { content: string; warnings: string[] } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { content, warnings: [] };

  let fm: Record<string, unknown>;
  try {
    const parsed = yaml.load(match[1]);
    if (!parsed || typeof parsed !== "object") return { content, warnings: [] };
    fm = parsed as Record<string, unknown>;
  } catch {
    return { content, warnings: [] };
  }

  const body = match[2];
  const warnings: string[] = [];

  // Rebuild the frontmatter in one pass, omitting keys OpenCode can't accept.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    // AgentSync-only keys — no meaning to OpenCode.
    if (key === "capability" || key === "skill_tags") continue;

    // The agentsync `tools` allowlist (scalar/array) — drop unless it is
    // already a native OpenCode boolean record.
    if (key === "tools" && !isBooleanRecord(value)) {
      warnings.push(
        `[opencode] agent '${name}': dropped 'tools' allowlist — OpenCode does not enforce tool allowlists via the agent file (its tools map is deny-by-explicit-false; use 'permission' to restrict)`,
      );
      continue;
    }

    // A bare/unqualified model alias — OpenCode needs a provider-qualified id.
    if (key === "model" && typeof value === "string" && !value.includes("/")) {
      warnings.push(
        `[opencode] agent '${name}': dropped unqualified model '${value}' — OpenCode needs a provider-qualified id (e.g. anthropic/claude-...); falling back to the configured default`,
      );
      continue;
    }

    out[key] = value;
  }

  // Default mode to subagent (canonical shape for an injected role).
  if (!("mode" in out)) out.mode = "subagent";

  const serialized = yaml.dump(out, { lineWidth: -1 }).trimEnd();
  return { content: `---\n${serialized}\n---\n${body}`, warnings };
}

const agentContentTransform: AgentContentTransform = {
  transform: translateOpenCodeAgentContent,
};

const DECISION_STRICTNESS: Record<string, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
};
const STRICTNESS_TO_DECISION = ["allow", "ask", "deny"] as const;

const OC_TOOL_MAP: Record<string, string> = {
  Bash: "bash",
  Edit: "edit",
  Write: "write",
  WebFetch: "webfetch",
};

type PermissionRule = NonNullable<
  NonNullable<PermissionsConfig>["rules"]
>[number];

interface CollapsedRules {
  byTool: Map<string, number>;
  allowRulesByTool: Map<string, string[]>;
  patternWarnings: string[];
}

function collapseRules(rules: readonly PermissionRule[]): CollapsedRules {
  const byTool = new Map<string, number>();
  const allowRulesByTool = new Map<string, string[]>();
  const patternWarnings: string[] = [];

  for (const rule of rules) {
    if (rule.pattern && rule.pattern !== "*") {
      patternWarnings.push(
        `permissions.rule ${rule.id}: pattern "${rule.pattern}" dropped on opencode — ` +
          "oc supports only tool-level coarse decisions.",
      );
    }
    const ocTool = OC_TOOL_MAP[rule.tool] ?? rule.tool.toLowerCase();
    const next = DECISION_STRICTNESS[rule.decision];
    if (next > (byTool.get(ocTool) ?? -1)) byTool.set(ocTool, next);
    if (rule.decision === "allow") {
      const list = allowRulesByTool.get(ocTool) ?? [];
      list.push(rule.id);
      allowRulesByTool.set(ocTool, list);
    }
  }

  return { byTool, allowRulesByTool, patternWarnings };
}

function allowLossWarnings(
  tool: string,
  strictness: number,
  allowRulesByTool: Map<string, string[]>,
): string[] {
  // strictest-wins per tool silently drops allow rules when a stricter
  // (ask/deny) rule lands on the same tool — surface each lost allow.
  if (strictness <= 0) return [];
  const decision = STRICTNESS_TO_DECISION[strictness];
  return (allowRulesByTool.get(tool) ?? []).map(
    (ruleId) =>
      `permissions.rule ${ruleId}: allow rule for tool "${tool}" dropped on opencode — ` +
      `collapsed to "${decision}" by a stricter rule on the same tool.`,
  );
}

async function writeOpenCodePermissions(
  permissions: NonNullable<PermissionsConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const { byTool, allowRulesByTool, patternWarnings } = collapseRules(
    permissions.rules ?? [],
  );
  const warnings = [...patternWarnings];
  const out: Record<string, string> = {};
  for (const [tool, strictness] of byTool) {
    out[tool] = STRICTNESS_TO_DECISION[strictness];
    warnings.push(...allowLossWarnings(tool, strictness, allowRulesByTool));
  }
  if (permissions.default && Object.keys(out).length === 0) {
    // No rules — apply default to common tools.
    for (const t of ["bash", "edit", "webfetch"]) out[t] = permissions.default;
  }
  await mergeIntoSettings(path.join(cwd, "opencode.json"), out, "permission");
  return { warnings };
}

/**
 * Convert standard MCP format to OpenCode's format
 */
function toOpenCodeMCP(mcps: Record<string, MCP>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, mcp] of Object.entries(mcps)) {
    if ("command" in mcp) {
      result[name] = {
        type: "local",
        command: [mcp.command, ...(mcp.args || [])],
        enabled: true,
        ...(mcp.env ? { environment: mcp.env } : {}),
      };
    } else if ("url" in mcp) {
      result[name] = {
        type: "remote",
        url: mcp.url,
        enabled: true,
        ...(mcp.headers ? { headers: mcp.headers } : {}),
      };
    }
  }
  return result;
}

export const opencodeProvider: ToolProvider = {
  name: "opencode",
  displayName: "OpenCode",
  paths: {
    skillsDir: ".opencode/skills",
    commandsDir: ".opencode/commands",
    agentsDir: ".opencode/agents",
    mcpConfigPath: "opencode.json",
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
    permissions: true,
  },
  readsAgentsDir: true,
  agentFileExtension: ".md",
  agentContentTransform,
  mcpFormat: {
    async writeMCP(mcps: Record<string, MCP>, cwd: string): Promise<void> {
      await mergeIntoSettings(
        path.join(cwd, "opencode.json"),
        toOpenCodeMCP(mcps),
        "mcp",
      );
    },
  },
  docsFormat: null,
  permissionsFormat: {
    writePermissions: writeOpenCodePermissions,
  },
};
