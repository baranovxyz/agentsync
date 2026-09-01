import type { HookSpec } from "../../types/schemas.js";
import {
  type HookCommandProjection,
  hookTimeoutSeconds,
  materializeProjectedHookCommand,
  previewHookCommandFiles,
  projectHookCommand,
} from "../hook-helpers.js";

export const CURSOR_HOOK_ARTIFACTS = "cursor:hooks";
const HOOKS_DIR = ".cursor/hooks";

const HOOK_EVENTS: Readonly<Record<string, string>> = {
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  PostToolUseFailure: "postToolUseFailure",
  UserPromptSubmit: "beforeSubmitPrompt",
  SessionStart: "sessionStart",
  SessionEnd: "sessionEnd",
  Stop: "stop",
  SubagentStart: "subagentStart",
  SubagentStop: "subagentStop",
  PreCompact: "preCompact",
};
const HOOK_TOOLS: Readonly<Record<string, string>> = {
  Bash: "Shell",
  Shell: "Shell",
  Read: "Read",
  Edit: "Write",
  Write: "Write",
  Grep: "Grep",
  Delete: "Delete",
  Task: "Task",
};
const UNSUPPORTED_CLAUDE_TOOLS = new Set(["Glob", "WebFetch", "WebSearch"]);
const TOOL_MATCHER_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
]);
const SUBAGENT_MATCHER_EVENTS = new Set(["SubagentStart", "SubagentStop"]);

type DroppedHook = { event: string; id: string; reason: string };
type HookProjection =
  | { cursorEvent: string; matcher?: string; warnings: string[] }
  | { reason: string };
type AcceptedHookProjection = Exclude<HookProjection, { reason: string }>;
interface AcceptedHook {
  spec: HookSpec;
  projection: AcceptedHookProjection;
}
interface CollectedHooks {
  accepted: AcceptedHook[];
  dropped: DroppedHook[];
  warnings: string[];
}

function projectMatcherToken(token: string): {
  value?: string;
  warning?: string;
} {
  const mapped = HOOK_TOOLS[token];
  if (mapped) return { value: mapped };
  if (token.startsWith("MCP:") && token.length > "MCP:".length) {
    return { value: token };
  }

  if (token.startsWith("mcp__")) {
    const parts = token.split("__");
    const toolName = parts.slice(2).join("__");
    if (parts[1] && toolName) {
      return {
        value: `MCP:${toolName}`,
        warning:
          `matcher token '${token}' translated to 'MCP:${toolName}' on cursor; ` +
          "Cursor matches MCP tool names without Claude's server qualifier",
      };
    }
  }

  const reason = UNSUPPORTED_CLAUDE_TOOLS.has(token)
    ? "is not supported by Cursor hooks"
    : "is not a documented Cursor tool matcher";
  return {
    warning: `matcher token '${token || "<empty>"}' dropped on cursor — ${reason}`,
  };
}

function projectMatcher(
  matcher: string,
): { matcher?: string; warnings: string[] } | { reason: string } {
  const tokens = matcher.split("|").map((token) => token.trim());
  if (tokens.some((token) => token === "*" || token === ".*")) {
    return { warnings: [] };
  }

  const projected: string[] = [];
  const warnings: string[] = [];
  for (const token of tokens) {
    const projection = projectMatcherToken(token);
    if (projection.value) projected.push(projection.value);
    if (projection.warning) warnings.push(projection.warning);
  }

  const unique = [...new Set(projected)];
  return unique.length === 0
    ? { reason: `matcher '${matcher}' has no Cursor-supported tool tokens` }
    : { matcher: unique.join("|"), warnings };
}

function projectHook(event: string, spec: HookSpec): HookProjection {
  const cursorEvent = HOOK_EVENTS[event];
  if (!cursorEvent) return { reason: `Cursor has no ${event} hook event` };
  if (!spec.matcher) return { cursorEvent, warnings: [] };

  if (TOOL_MATCHER_EVENTS.has(event)) {
    const matcher = projectMatcher(spec.matcher);
    return "reason" in matcher
      ? matcher
      : {
          cursorEvent,
          matcher: matcher.matcher,
          warnings: matcher.warnings.map(
            (warning) => `hook '${spec.id}' for ${event}: ${warning}`,
          ),
        };
  }
  if (SUBAGENT_MATCHER_EVENTS.has(event)) {
    return { cursorEvent, matcher: spec.matcher, warnings: [] };
  }
  return {
    cursorEvent,
    warnings: [
      `hook '${spec.id}' for ${event}: matcher '${spec.matcher}' omitted on cursor — ` +
        `${cursorEvent} does not filter by tool name`,
    ],
  };
}

function collectHooks(hooks: Record<string, HookSpec[]>): CollectedHooks {
  const result: CollectedHooks = { accepted: [], dropped: [], warnings: [] };
  for (const [event, specs] of Object.entries(hooks)) {
    for (const spec of specs) {
      const projection = projectHook(event, spec);
      if ("reason" in projection) {
        result.dropped.push({ event, id: spec.id, reason: projection.reason });
      } else {
        result.accepted.push({ spec, projection });
        result.warnings.push(...projection.warnings);
      }
    }
  }
  return result;
}

function hookEntry(
  spec: HookSpec,
  command: string,
  matcher?: string,
): Record<string, unknown> {
  return {
    command,
    ...(matcher ? { matcher } : {}),
    ...(spec.timeout ? { timeout: hookTimeoutSeconds(spec.timeout) } : {}),
  };
}

export async function projectCursorHooks(
  hooks: Record<string, HookSpec[]>,
  cwd: string,
): Promise<{
  value?: {
    version: number;
    hooks: Record<string, Array<Record<string, unknown>>>;
  };
  dropped: DroppedHook[];
  warnings: string[];
  generatedFiles: string[];
  commands: HookCommandProjection[];
}> {
  const collected = collectHooks(hooks);
  if (collected.accepted.length === 0) {
    return {
      dropped: collected.dropped,
      warnings: collected.warnings,
      generatedFiles: [],
      commands: [],
    };
  }

  await previewHookCommandFiles(
    collected.accepted.map(({ spec }) => spec.command),
    cwd,
    HOOKS_DIR,
  );
  const projected: Record<string, Array<Record<string, unknown>>> = {};
  const commands: HookCommandProjection[] = [];
  for (const { spec, projection } of collected.accepted) {
    const command = await projectHookCommand(spec.command, cwd, HOOKS_DIR);
    commands.push(command);
    const entries = projected[projection.cursorEvent] ?? [];
    entries.push(hookEntry(spec, command.command, projection.matcher));
    projected[projection.cursorEvent] = entries;
  }

  return {
    value: { version: 1, hooks: projected },
    dropped: collected.dropped,
    warnings: collected.warnings,
    generatedFiles: [
      ...new Set(
        commands.flatMap(({ generatedFile }) =>
          generatedFile ? [generatedFile] : [],
        ),
      ),
    ],
    commands,
  };
}

export async function writeCursorHooks(
  hooks: Record<string, HookSpec[]>,
  cwd: string,
): Promise<{
  dropped: DroppedHook[];
  warnings: string[];
  generatedFiles: string[];
}> {
  const projection = await projectCursorHooks(hooks, cwd);
  for (const command of projection.commands) {
    await materializeProjectedHookCommand(command, cwd, HOOKS_DIR);
  }
  return {
    dropped: projection.dropped,
    warnings: projection.warnings,
    generatedFiles: projection.generatedFiles,
  };
}
