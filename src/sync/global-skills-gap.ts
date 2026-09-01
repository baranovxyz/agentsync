/**
 * Global Skills Gap — shared helpers
 *
 * A native `.agents/` reader can cover the PROJECT scope
 * (`capabilities.nativeSkillsDiscovery: true`) while being verified NOT to cover the GLOBAL
 * scope (`readsGlobalAgentsDir: false`, see `src/tools/types.ts`). When
 * that's true and `~/.agents/skills` is non-empty, skills placed there
 * never reach the tool — silently, because the sync result still reports
 * `skillCount: 0`, which is indistinguishable from "native tool, nothing
 * needed".
 *
 * This module is the single place that decides whether a provider is
 * gap-prone and composes the message/remedy text, so `src/sync/skills.ts`
 * (the sync-time warning) and `src/commands/doctor/checks.ts` (the standing
 * check) stay in sync with each other.
 */

import type { ToolProvider } from "../tools/types.js";

/**
 * True when a provider reads the project `.agents/` directly but has been
 * verified NOT to also read the global `~/.agents/`.
 */
export function hasGlobalSkillsGap(provider: ToolProvider): boolean {
  return (
    provider.capabilities.nativeSkillsDiscovery &&
    provider.readsGlobalAgentsDir === false
  );
}

/**
 * Absolute filesystem path where the remedy symlink (or a real directory
 * standing in for it) is expected to live: `<tool's own global skills
 * dir>/shared`. Returns undefined when the provider hasn't documented its
 * own global skills directory yet.
 */
export function globalSkillsRemedyPath(
  provider: ToolProvider,
  home: string,
): string | undefined {
  if (!provider.globalSkillsHome) return undefined;
  const expanded = provider.globalSkillsHome.replace(/^~(?=[/\\]|$)/, home);
  return `${expanded.replace(/[/\\]+$/, "")}/shared`;
}

/** Human-facing remedy command, always shown with `~` (never resolved to an absolute path). */
export function globalSkillsRemedyCommand(
  provider: ToolProvider,
): string | undefined {
  if (!provider.globalSkillsHome) return undefined;
  return `ln -s ~/.agents/skills ${provider.globalSkillsHome}/shared`;
}

/** Actionable message naming what wasn't delivered and to whom. */
export function globalSkillsGapMessage(
  provider: ToolProvider,
  skillNames: string[],
): string {
  const count = skillNames.length;
  const list = skillNames.join(", ");
  return (
    `${provider.displayName} reads the project .agents/skills but not the global ` +
    `~/.agents/skills — ${count} global skill${count === 1 ? "" : "s"} (${list}) ` +
    `will not reach it.`
  );
}

/** Actionable fix text — the symlink command when the tool's global skills dir is known. */
export function globalSkillsGapFix(provider: ToolProvider): string {
  const cmd = globalSkillsRemedyCommand(provider);
  return cmd
    ? `Symlink your global skills into ${provider.displayName}'s own global skills dir: ${cmd}`
    : `Symlink ~/.agents/skills into ${provider.displayName}'s own global skills directory ` +
        `(not documented yet — see docs/tool-capabilities.md).`;
}
