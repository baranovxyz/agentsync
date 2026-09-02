/**
 * Sync Plan Executor
 * Executes a SyncPlan by calling the sync modules and publishing ownership.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { SyncToolDetail } from "../types/output.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import { syncAgents } from "./agents.js";
import { syncCommands } from "./commands.js";
import { previewDocs, syncDocs } from "./docs.js";
import {
  assertExtensionArtifactParity,
  type ExtensionsSyncResult,
  extensionWarnings,
  previewExtensions,
  syncExtensions,
} from "./extensions.js";
import { readManifest, type SyncManifest } from "./manifest.js";
import { previewManagedMCP, syncManagedMCP } from "./mcp.js";
import type { SyncPlan } from "./plan.js";
import { loadCanonicalRules, previewRules, syncRules } from "./rules.js";
import {
  previewSharedOutputLifecycle,
  publishSyncOwnership,
} from "./shared-output-lifecycle.js";
import { syncSkills } from "./skills.js";
import {
  applyStructuredLifecyclePlan,
  type StructuredLifecyclePlan,
} from "./structured-lifecycle.js";
import {
  planToolStructuredLifecycle,
  refreshToolStructuredLifecycle,
  type ToolStructuredLifecycleRequest,
} from "./structured-providers.js";

interface PerToolResults {
  skills: string[];
  commands: string[];
  agents: string[];
  rules: string[];
  mcp: string[];
}

interface ExecuteOptions {
  link?: boolean;
  cwd: string;
  filtered?: boolean;
}

export interface SyncResult {
  totalSkills: number;
  totalCommands: number;
  totalAgents: number;
  totalRules: number;
  mcpServerCount: number;
  details: SyncToolDetail[];
  warnings: string[];
}

function emptyPerToolResults(): PerToolResults {
  return { skills: [], commands: [], agents: [], rules: [], mcp: [] };
}

function initializePerTool(plan: SyncPlan): Map<string, PerToolResults> {
  return new Map(
    plan.providers.map((provider) => [provider.name, emptyPerToolResults()]),
  );
}

function collectPerTool<T extends { tool: string; warnings: string[] }>(
  results: readonly T[],
  perTool: Map<string, PerToolResults>,
  field: keyof Omit<PerToolResults, "mcp">,
  getItems: (result: T) => string[],
  warnings: string[],
): number {
  let total = 0;
  for (const result of results) {
    const items = getItems(result);
    total += items.length;
    const entry = perTool.get(result.tool);
    if (entry) entry[field] = items;
    warnings.push(...result.warnings);
  }
  return total;
}

async function preflightSharedDestinations(
  plan: SyncPlan,
  cwd: string,
  filtered: boolean,
  manifest: SyncManifest | undefined,
  structuredLifecycle: StructuredLifecyclePlan,
): Promise<ExtensionsSyncResult[]> {
  const managedMcpOptions = {
    previousOwners: manifest?.mcp_owners,
    filtered,
  };
  const [, , , extensions] = await Promise.all([
    previewSharedOutputLifecycle(
      plan,
      cwd,
      manifest,
      filtered,
      structuredLifecycle.protectedDependencies,
    ),
    previewDocs(plan.providers, cwd),
    previewRules(plan.providers, cwd),
    previewExtensions(plan.providers, plan.extensions, cwd, {
      protectedDependencies: structuredLifecycle.protectedDependencies,
    }),
    previewManagedMCP(plan.providers, plan.mcpServers, cwd, managedMcpOptions),
  ]);
  return extensions;
}

async function syncPrimarySurfaces(
  plan: SyncPlan,
  cwd: string,
  mode: "copy" | "link",
) {
  return Promise.all([
    syncSkills(plan.providers, cwd, plan.presetSkills, {
      mode,
      globalDirs: plan.hierarchySkillDirs,
    }),
    syncCommands(plan.providers, cwd, plan.presetCommands, {
      mode,
      globalDirs: plan.hierarchyCommandDirs,
    }),
    syncAgents(plan.providers, cwd, plan.presetAgents, {
      mode,
      globalDirs: plan.hierarchyAgentDirs,
    }),
    syncRules(plan.providers, cwd, { mode }),
  ]);
}

async function updateManagedGitignore(
  plan: SyncPlan,
  cwd: string,
): Promise<void> {
  const gitignorePath = path.join(cwd, ".gitignore");
  await assertSafeProjectOutputPath(cwd, gitignorePath);
  const { pathExists } = await import("../utils/fs.js");
  if (!(await pathExists(gitignorePath))) return;
  try {
    const content = await readFile(gitignorePath, "utf-8");
    const { hasAgentSyncSection, updateAgentSyncSection } = await import(
      "../utils/gitignore.js"
    );
    if (!hasAgentSyncSection(content)) return;
    const updated = updateAgentSyncSection(content, plan.tools);
    if (updated === content) return;
    const { outputFile } = await import("../utils/fs.js");
    await outputFile(gitignorePath, updated);
  } catch {
    // A best-effort managed section update must not fail the sync.
  }
}

function buildDetails(
  plan: SyncPlan,
  perTool: ReadonlyMap<string, PerToolResults>,
): SyncToolDetail[] {
  return plan.tools.map((tool) => {
    const result = perTool.get(tool) ?? emptyPerToolResults();
    return { tool, ...result };
  });
}

export async function executeSyncPlan(
  plan: SyncPlan,
  options: ExecuteOptions,
): Promise<SyncResult> {
  const { cwd } = options;
  const filtered = options.filtered ?? false;
  const syncMode = options.link ? "link" : "copy";
  const warnings: string[] = [];
  const perTool = initializePerTool(plan);
  const previousManifest = await readManifest(cwd);
  const managedMcpOptions = {
    previousOwners: previousManifest?.mcp_owners,
    filtered,
  };
  const { rules: canonicalRules } = await loadCanonicalRules(cwd);
  const structuredRequest: ToolStructuredLifecycleRequest = {
    cwd,
    providers: plan.providers,
    previousReceipts: previousManifest?.structured_owners,
    desired: { extensions: plan.extensions, rules: canonicalRules },
    preserveUnselected: filtered,
  };
  const structuredLifecycle =
    await planToolStructuredLifecycle(structuredRequest);

  // Validate every shared destination before the first projection write.
  const extensionPreview = await preflightSharedDestinations(
    plan,
    cwd,
    filtered,
    previousManifest,
    structuredLifecycle,
  );

  const [skillResults, commandResults, agentResults, ruleResults] =
    await syncPrimarySurfaces(plan, cwd, syncMode);
  const totalSkills = collectPerTool(
    skillResults,
    perTool,
    "skills",
    (result) => result.skills,
    warnings,
  );
  const totalCommands = collectPerTool(
    commandResults,
    perTool,
    "commands",
    (result) => result.commands,
    warnings,
  );
  const totalAgents = collectPerTool(
    agentResults,
    perTool,
    "agents",
    (result) => result.agents,
    warnings,
  );
  const totalRules = collectPerTool(
    ruleResults,
    perTool,
    "rules",
    (result) => result.rules,
    warnings,
  );

  const docsResults = await syncDocs(plan.providers, cwd);

  // Empty input still reconciles prior provider-owned extension keys.
  const extensionResults = await syncExtensions(
    plan.providers,
    plan.extensions,
    cwd,
    { protectedDependencies: structuredLifecycle.protectedDependencies },
  );
  assertExtensionArtifactParity(extensionPreview, extensionResults);
  warnings.push(...extensionWarnings(extensionResults));

  const managedMcp = await syncManagedMCP(
    plan.providers,
    plan.mcpServers,
    cwd,
    managedMcpOptions,
  );
  warnings.push(...managedMcp.warnings);
  for (const result of managedMcp.results) {
    const entry = perTool.get(result.tool);
    if (entry) entry.mcp = result.servers;
  }

  if (syncMode === "copy") await updateManagedGitignore(plan, cwd);

  // Reprojection detects canonical source drift between preflight and write;
  // apply rereads configs before publishing refreshed receipts.
  const refreshedStructured = await refreshToolStructuredLifecycle(
    structuredRequest,
    structuredLifecycle,
  );
  const appliedStructured =
    await applyStructuredLifecyclePlan(refreshedStructured);
  warnings.push(...appliedStructured.plan.warnings);

  const details = buildDetails(plan, perTool);
  warnings.push(
    ...(await publishSyncOwnership({
      plan,
      details,
      docsResults,
      extensionResults,
      cwd,
      manifest: previousManifest,
      filtered,
      protectedDependencies: appliedStructured.plan.protectedDependencies,
      mcpOwners: managedMcp.owners,
      structuredOwners: appliedStructured.plan.nextReceipts,
    })),
  );

  return {
    totalSkills,
    totalCommands,
    totalAgents,
    totalRules,
    mcpServerCount: plan.providers.some((provider) => provider.mcpFormat)
      ? Object.keys(plan.mcpServers).length
      : 0,
    details,
    warnings,
  };
}

export { previewSharedOutputLifecycle } from "./shared-output-lifecycle.js";
