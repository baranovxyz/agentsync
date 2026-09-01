import type { z } from "zod";
import type { PermissionsConfigSchema } from "../../types/schemas.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type PermissionRule = NonNullable<
  NonNullable<PermissionsConfig>["rules"]
>[number];
type PermissionRuleProjection =
  | { value: string; warning?: string }
  | { warning: string };

const PATH_PERMISSION_TOOLS: Readonly<Record<string, string>> = {
  Write: "Edit",
  NotebookEdit: "Edit",
  MultiEdit: "Edit",
  Glob: "Read",
};

function projectMcpRule(rule: PermissionRule): PermissionRuleProjection {
  const pattern = rule.pattern ?? "*";
  if (pattern === "*" || pattern === "*:*") {
    if (rule.decision !== "allow") return { value: "mcp__*" };
    return {
      warning:
        `permissions.rule ${rule.id} dropped on claude — MCP allow pattern '${pattern}' ` +
        "has no safe Claude equivalent; Claude Code skips allow globs without a literal " +
        "mcp__<server>__ prefix.",
    };
  }

  const parts = pattern.split(":");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    return {
      warning:
        `permissions.rule ${rule.id} dropped on claude — MCP pattern '${pattern}' is invalid; ` +
        "expected server:tool (or *:* for all MCP tools).",
    };
  }

  const [server, tool] = parts;
  if (rule.decision === "allow" && /[*?[\]]/.test(server)) {
    return {
      warning:
        `permissions.rule ${rule.id} dropped on claude — MCP allow pattern '${pattern}' ` +
        "has no safe Claude equivalent; Claude Code requires a literal server prefix " +
        "for allow globs.",
    };
  }
  return { value: `mcp__${server}__${tool}` };
}

function projectRule(rule: PermissionRule): PermissionRuleProjection {
  if (rule.tool === "MCP") return projectMcpRule(rule);

  const pattern = rule.pattern;
  if (pattern === undefined || pattern === "*") return { value: rule.tool };

  if (rule.tool === "WebFetch") {
    const domain = pattern.startsWith("domain:")
      ? pattern
      : `domain:${pattern}`;
    return { value: `WebFetch(${domain})` };
  }

  const pathTool = PATH_PERMISSION_TOOLS[rule.tool];
  if (!pathTool) return { value: `${rule.tool}(${pattern})` };

  return {
    value: `${pathTool}(${pattern})`,
    warning:
      `permissions.rule ${rule.id}: ${rule.tool}(${pattern}) translated to ` +
      `${pathTool}(${pattern}) on claude — Claude Code consults path rules only on Edit and Read.`,
  };
}

export function projectClaudePermissions(
  permissions: NonNullable<PermissionsConfig>,
): { value: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const decisions: Record<PermissionRule["decision"], string[]> = {
    allow: [],
    ask: [],
    deny: [],
  };

  for (const rule of permissions.rules ?? []) {
    const projection = projectRule(rule);
    if (projection.warning) warnings.push(projection.warning);
    if ("value" in projection) decisions[rule.decision].push(projection.value);
  }

  const value: Record<string, unknown> = decisions;
  if (permissions.default === "ask") {
    value.defaultMode = "default";
  } else if (permissions.default === "allow") {
    warnings.push(
      'permissions.default="allow" dropped on claude — Claude Code has no equivalent default mode; ' +
        "add explicit allow rules for actions that may run without prompting.",
    );
  } else if (permissions.default === "deny") {
    value.defaultMode = "dontAsk";
    warnings.push(
      'permissions.default="deny" mapped to Claude Code defaultMode="dontAsk" — ' +
        "unmatched and explicit ask rules are denied, but built-in read-only Bash commands " +
        "and PreToolUse-hook-approved calls may still run.",
    );
  }

  return { value, warnings };
}

export async function writeClaudePermissions(
  permissions: NonNullable<PermissionsConfig>,
  _cwd: string,
): Promise<{ warnings: string[] }> {
  return { warnings: projectClaudePermissions(permissions).warnings };
}
