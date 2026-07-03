/**
 * Agents Sync Module
 * Copies agent definitions from .agents/agents/ to each tool's agents directory
 * Uses provider.agentFileExtension for tool-specific file naming
 */

import { readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { ToolProvider } from "../tools/types.js";
import { outputFile, pathExists } from "../utils/fs.js";
import { validateSyncNamespace } from "../utils/path-normalization.js";
import { sanitizeContent } from "../utils/sanitize.js";
import type { SyncOptions } from "./skills.js";
import { writeFileByMode } from "./write-file.js";

/** Result of syncing agents to a single tool */
export interface AgentSyncResult {
  tool: string;
  agentCount: number;
  agents: string[];
  warnings: string[];
}

// writeFileByMode imported from ./write-file.js

/**
 * Sync agents to a single tool
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential sync with mode/namespace branching
async function syncAgentsToTool(
  agentDirs: string[],
  provider: ToolProvider,
  cwd: string,
  namespace?: string,
  options?: SyncOptions,
): Promise<AgentSyncResult> {
  if (!provider.paths.agentsDir) {
    return { tool: provider.name, agentCount: 0, agents: [], warnings: [] };
  }

  const targetDir = path.join(cwd, provider.paths.agentsDir);
  const agents: string[] = [];
  const warnings: string[] = [];

  for (const agentDir of agentDirs) {
    if (!(await pathExists(agentDir))) continue;

    const files = await fg("**/*.md", { cwd: agentDir, absolute: false });

    const mode = options?.mode || "copy";

    for (const relPath of files) {
      const sourcePath = path.join(agentDir, relPath);

      // Rename extension for tools that need it (e.g., Copilot: .agent.md)
      // (must compute destPath before the same-file check)
      let destName = namespace ? path.join(namespace, relPath) : relPath;
      if (provider.agentFileExtension !== ".md") {
        const parsed = path.parse(destName);
        destName = path.join(
          parsed.dir,
          `${parsed.name}${provider.agentFileExtension}`,
        );
      }

      const destPath = path.join(targetDir, destName);

      // Skip if source and dest are the same file (tool reads .agents/ directly)
      if (path.resolve(sourcePath) === path.resolve(destPath)) {
        agents.push(destName);
        continue;
      }

      // A content transform (e.g. OpenCode frontmatter translation) rewrites
      // the file the tool reads, so the dest diverges from source — that forces
      // a real copy too (a symlink would point back at the untranslated source).
      const transform = provider.agentContentTransform;

      // Namespaced (preset) content needs sanitization — always copy.
      // Extension rename also requires copy (can't symlink with different name).
      // A content transform likewise requires a real copy.
      if (namespace || provider.agentFileExtension !== ".md" || transform) {
        let content = await readFile(sourcePath, "utf-8");
        if (namespace) {
          const sanitized = sanitizeContent(content, {
            source: `${namespace}/${relPath}`,
          });
          content = sanitized.content;
          warnings.push(...sanitized.warnings);
        }
        if (transform) {
          const result = transform.transform(
            content,
            path.basename(relPath, path.extname(relPath)),
          );
          content = result.content;
          warnings.push(...result.warnings);
        }
        // Drop any stale entry first: outputFile uses writeFile, which would
        // follow a symlink left by a prior `--link` sync and clobber the
        // canonical source. rm removes the link itself; force ignores a
        // missing dest.
        await rm(destPath, { force: true });
        await outputFile(destPath, content, { encoding: "utf-8" });
      } else {
        const sourceLabel = path.relative(cwd, sourcePath);
        await writeFileByMode(sourcePath, destPath, mode, sourceLabel);
      }
      agents.push(destName);
    }
  }

  return {
    tool: provider.name,
    agentCount: agents.length,
    agents,
    warnings,
  };
}

/**
 * Sync agents to all configured tools
 * Source: .agents/agents/
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential global+preset+project+postHook orchestration
export async function syncAgents(
  providers: ToolProvider[],
  cwd: string,
  presetAgents?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<AgentSyncResult[]> {
  const projectAgentsDir = path.join(cwd, ".agents", "agents");
  const results: AgentSyncResult[] = [];

  for (const provider of providers) {
    if (!provider.capabilities.agents) {
      results.push({
        tool: provider.name,
        agentCount: 0,
        agents: [],
        warnings: [],
      });
      continue;
    }

    let totalAgents = 0;
    const allAgents: string[] = [];
    const allWarnings: string[] = [];

    // Global user agents first (lowest priority — can be overwritten by presets and project)
    if (options?.globalDirs && options.globalDirs.length > 0) {
      const globalResult = await syncAgentsToTool(
        options.globalDirs,
        provider,
        cwd,
        undefined,
        options,
      );
      totalAgents += globalResult.agentCount;
      allAgents.push(...globalResult.agents);
      allWarnings.push(...globalResult.warnings);
    }

    // Preset agents next (middle priority — can be overwritten by project)
    if (presetAgents) {
      for (const [namespace, dirs] of presetAgents) {
        validateSyncNamespace(namespace);
        const presetResult = await syncAgentsToTool(
          dirs,
          provider,
          cwd,
          namespace,
          options,
        );
        totalAgents += presetResult.agentCount;
        allAgents.push(...presetResult.agents);
        allWarnings.push(...presetResult.warnings);
      }
    }

    // Project custom agents last (highest priority — wins on collision)
    const projectResult = await syncAgentsToTool(
      [projectAgentsDir],
      provider,
      cwd,
      undefined,
      options,
    );

    totalAgents += projectResult.agentCount;
    allAgents.push(...projectResult.agents);
    allWarnings.push(...projectResult.warnings);

    // Tool-specific post-processing (e.g., Codex writes .toml role wrappers
    // and merges [agents.<n>] into .codex/config.toml). Runs against the
    // canonical source dirs — postSync owns its destination layout.
    if (provider.agentsPostHook && totalAgents > 0) {
      const sources: string[] = [];
      if (options?.globalDirs) sources.push(...options.globalDirs);
      if (presetAgents) {
        for (const [, dirs] of presetAgents) sources.push(...dirs);
      }
      sources.push(projectAgentsDir);
      await provider.agentsPostHook.postSync(sources, cwd);
    }

    results.push({
      tool: provider.name,
      agentCount: totalAgents,
      agents: allAgents,
      warnings: allWarnings,
    });
  }

  return results;
}
