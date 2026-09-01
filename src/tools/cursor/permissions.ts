import type { z } from "zod";
import type { PermissionsConfigSchema } from "../../types/schemas.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type PermissionProjection = { token: string } | { reason: string };

const PERMISSION_TOOLS: Readonly<Record<string, string>> = {
  Bash: "Shell",
  Shell: "Shell",
  Read: "Read",
  Edit: "Write",
  Write: "Write",
  WebFetch: "WebFetch",
  MCP: "Mcp",
};

function permissionToken(tool: string, pattern = "*"): PermissionProjection {
  const cursorTool = PERMISSION_TOOLS[tool];
  if (!cursorTool) {
    return { reason: `tool '${tool}' has no Cursor CLI permission token` };
  }
  if (tool === "MCP") {
    if (pattern === "*") return { token: `${cursorTool}(*:*)` };
    const parts = pattern.split(":");
    return parts.length === 2 && parts.every((part) => part.length > 0)
      ? { token: `${cursorTool}(${pattern})` }
      : {
          reason:
            `MCP pattern '${pattern}' is invalid; Cursor CLI requires ` +
            "server:tool (or *:* for all MCP tools)",
        };
  }
  if (cursorTool !== "Shell") return { token: `${cursorTool}(${pattern})` };

  const shellPattern = pattern.match(/^(\S+)(?:\s+(.+))?$/);
  const cursorPattern = shellPattern?.[2]
    ? `${shellPattern[1]}:${shellPattern[2]}`
    : pattern;
  return { token: `${cursorTool}(${cursorPattern})` };
}

export function projectCursorPermissions(
  permissions: NonNullable<PermissionsConfig>,
): { value: { allow: string[]; deny: string[] }; warnings: string[] } {
  const value: { allow: string[]; deny: string[] } = { allow: [], deny: [] };
  const warnings: string[] = [];

  for (const rule of permissions.rules ?? []) {
    if (rule.decision === "ask") {
      warnings.push(
        `permissions.rule ${rule.id}: explicit ask rule dropped on cursor — ` +
          "Cursor CLI prompts by default but has no project ask list.",
      );
      continue;
    }

    const projection = permissionToken(rule.tool, rule.pattern);
    if ("reason" in projection) {
      warnings.push(
        `permissions.rule ${rule.id} dropped on cursor — ${projection.reason}.`,
      );
    } else {
      value[rule.decision].push(projection.token);
    }
  }

  if (permissions.default && permissions.default !== "ask") {
    warnings.push(
      `permissions.default="${permissions.default}" dropped on cursor — ` +
        "Cursor CLI has no project-wide default decision token.",
    );
  }
  return { value, warnings };
}

export async function writeCursorPermissions(
  permissions: NonNullable<PermissionsConfig>,
  _cwd: string,
): Promise<{ warnings: string[] }> {
  return { warnings: projectCursorPermissions(permissions).warnings };
}
