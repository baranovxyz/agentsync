import type { HookSpec } from "../../types/schemas.js";
import {
  type HookCommandProjection,
  hookTimeoutSeconds,
  materializeProjectedHookCommand,
  previewHookCommandFiles,
  projectHookCommand,
} from "../hook-helpers.js";

export const CLAUDE_HOOK_ARTIFACTS = "claude:hooks";
const HOOK_SCRIPTS_DIR = ".claude/hooks/scripts";

interface ClaudeHooksProjection {
  value: Record<string, Array<Record<string, unknown>>>;
  dropped: Array<{ event: string; id: string; reason: string }>;
  generatedFiles: string[];
  commands: HookCommandProjection[];
}

/** Exact Claude hook config and artifacts shared by preview/write/receipt. */
export async function projectClaudeHooks(
  hooks: Record<string, HookSpec[]>,
  cwd: string,
): Promise<ClaudeHooksProjection> {
  await previewHookCommandFiles(
    Object.values(hooks)
      .flat()
      .map((hook) => hook.command),
    cwd,
    HOOK_SCRIPTS_DIR,
  );

  const value: ClaudeHooksProjection["value"] = {};
  const commands: HookCommandProjection[] = [];
  for (const [event, specs] of Object.entries(hooks)) {
    const entries: Array<Record<string, unknown>> = [];
    for (const spec of specs) {
      const command = await projectHookCommand(
        spec.command,
        cwd,
        HOOK_SCRIPTS_DIR,
      );
      const handler: Record<string, unknown> = {
        type: "command",
        command: command.command,
        ...(spec.timeout ? { timeout: hookTimeoutSeconds(spec.timeout) } : {}),
      };
      entries.push({
        hooks: [handler],
        ...(spec.matcher ? { matcher: spec.matcher } : {}),
      });
      commands.push(command);
    }
    value[event] = entries;
  }

  return {
    value,
    dropped: [],
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

export async function writeClaudeHooks(
  hooks: Record<string, HookSpec[]>,
  cwd: string,
): Promise<{
  dropped: ClaudeHooksProjection["dropped"];
  generatedFiles: string[];
}> {
  const projection = await projectClaudeHooks(hooks, cwd);
  for (const command of projection.commands) {
    await materializeProjectedHookCommand(command, cwd, HOOK_SCRIPTS_DIR);
  }
  return {
    dropped: projection.dropped,
    generatedFiles: projection.generatedFiles,
  };
}
