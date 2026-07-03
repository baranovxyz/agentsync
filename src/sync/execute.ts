/**
 * Sync Plan Executor
 * Executes a SyncPlan by calling the sync modules and writing files.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { getToolProvider } from "../tools/index.js";
import type { SyncToolDetail } from "../types/output.js";
import {
  syncAgents,
  syncCommands,
  syncDocs,
  syncExtensions,
  syncMCP,
  syncSkills,
} from "./index.js";
import { writeManifest } from "./manifest.js";
import type { SyncPlan } from "./plan.js";

interface PerToolResults {
  skills: string[];
  commands: string[];
  agents: string[];
  mcp: string[];
}

export interface SyncResult {
  totalSkills: number;
  totalCommands: number;
  totalAgents: number;
  mcpServerCount: number;
  details: SyncToolDetail[];
  warnings: string[];
}

function collectPerTool<T extends { tool: string; warnings: string[] }>(
  results: T[],
  perTool: Map<string, PerToolResults>,
  field: keyof Omit<PerToolResults, "mcp">,
  getItems: (r: T) => string[],
  warnings: string[],
): number {
  let total = 0;
  for (const r of results) {
    const items = getItems(r);
    total += items.length;
    const entry = perTool.get(r.tool);
    if (entry) entry[field] = items;
    warnings.push(...r.warnings);
  }
  return total;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential sync steps with per-tool result collection
export async function executeSyncPlan(
  plan: SyncPlan,
  options: { link?: boolean; cwd: string },
): Promise<SyncResult> {
  const warnings: string[] = [];
  const perTool = new Map<string, PerToolResults>();
  for (const p of plan.providers) {
    perTool.set(p.name, { skills: [], commands: [], agents: [], mcp: [] });
  }

  const syncMode = options.link ? "link" : "copy";

  // Skills, commands, and agents sync are independent — run in parallel
  const [skillResults, commandResults, agentResults] = await Promise.all([
    syncSkills(plan.providers, options.cwd, plan.presetSkills, {
      mode: syncMode,
      globalDirs: plan.hierarchySkillDirs,
    }),
    syncCommands(plan.providers, options.cwd, plan.presetCommands, {
      mode: syncMode,
      globalDirs: plan.hierarchyCommandDirs,
    }),
    syncAgents(plan.providers, options.cwd, plan.presetAgents, {
      mode: syncMode,
      globalDirs: plan.hierarchyAgentDirs,
    }),
  ]);

  const totalSkills = collectPerTool(
    skillResults,
    perTool,
    "skills",
    (r) => r.skills,
    warnings,
  );
  const totalCommands = collectPerTool(
    commandResults,
    perTool,
    "commands",
    (r) => r.commands,
    warnings,
  );
  const totalAgents = collectPerTool(
    agentResults,
    perTool,
    "agents",
    (r) => r.agents,
    warnings,
  );

  await syncDocs(plan.providers, options.cwd);

  // Sync extensions (hooks, permissions, statusline, output_style)
  if (
    plan.extensions.hooks ||
    plan.extensions.permissions ||
    plan.extensions.statusline ||
    plan.extensions.outputStyle
  ) {
    const extResults = await syncExtensions(
      plan.providers,
      plan.extensions,
      options.cwd,
    );
    for (const r of extResults) {
      warnings.push(...r.warnings);
      for (const drop of r.droppedHooks) {
        warnings.push(
          `[${r.tool}] hook ${drop.id} for ${drop.event} dropped: ${drop.reason}`,
        );
      }
    }
  }

  let mcpServerCount = 0;
  if (Object.keys(plan.mcpServers).length > 0) {
    const mcpResults = await syncMCP(
      plan.providers,
      plan.mcpServers,
      options.cwd,
    );
    mcpServerCount = Object.keys(plan.mcpServers).length;
    for (const r of mcpResults) {
      const entry = perTool.get(r.tool);
      if (entry) entry.mcp = r.servers;
    }
  }

  // Update .gitignore only in copy mode (symlinks don't need ignoring)
  if (syncMode === "copy") {
    const { pathExists } = await import("../utils/fs.js");
    const gitignorePath = path.join(options.cwd, ".gitignore");
    if (await pathExists(gitignorePath)) {
      try {
        const gitignoreContent = await readFile(gitignorePath, "utf-8");
        const { hasAgentSyncSection, updateAgentSyncSection } = await import(
          "../utils/gitignore.js"
        );
        if (hasAgentSyncSection(gitignoreContent)) {
          const updated = updateAgentSyncSection(gitignoreContent, plan.tools);
          if (updated !== gitignoreContent) {
            const { outputFile } = await import("../utils/fs.js");
            await outputFile(gitignorePath, updated);
          }
        }
      } catch {
        // Ignore errors in .gitignore update
      }
    }
  }

  const details: SyncToolDetail[] = plan.tools.map((tool) => {
    const entry = perTool.get(tool);
    return {
      tool,
      skills: entry?.skills ?? [],
      commands: entry?.commands ?? [],
      agents: entry?.agents ?? [],
      mcp: entry?.mcp ?? [],
    };
  });

  // Write sync manifest with content hashes for drift detection
  const writtenFiles = collectWrittenFiles(details, options.cwd);
  await writeManifest(options.cwd, writtenFiles);

  return {
    totalSkills,
    totalCommands,
    totalAgents,
    mcpServerCount,
    details,
    warnings,
  };
}

/**
 * Map item names to absolute file paths within a tool directory.
 * Skills are subdirectories containing SKILL.md; commands/agents are direct file paths.
 */
function mapItemPaths(
  cwd: string,
  dir: string | null,
  names: string[],
  isSkill: boolean,
): string[] {
  if (!dir || names.length === 0) return [];
  return names.map((name) =>
    isSkill ? path.join(cwd, dir, name, "SKILL.md") : path.join(cwd, dir, name),
  );
}

/**
 * Reconstruct absolute file paths for all files written during sync.
 * Uses the tool provider paths to map detail names back to disk locations.
 */
function collectWrittenFiles(details: SyncToolDetail[], cwd: string): string[] {
  const files: string[] = [];

  for (const detail of details) {
    let provider: import("../tools/types.js").ToolProvider;
    try {
      provider = getToolProvider(
        detail.tool as import("../constants.js").ToolName,
      );
    } catch {
      continue;
    }

    const { paths } = provider;
    files.push(...mapItemPaths(cwd, paths.skillsDir, detail.skills, true));
    files.push(...mapItemPaths(cwd, paths.commandsDir, detail.commands, false));
    files.push(...mapItemPaths(cwd, paths.agentsDir, detail.agents, false));

    if (detail.mcp.length > 0 && paths.mcpConfigPath) {
      files.push(path.join(cwd, paths.mcpConfigPath));
    }
  }

  return files;
}
