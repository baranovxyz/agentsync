/**
 * Sync Module Index
 * Re-exports all sync functions
 */

export { type AgentSyncResult, previewAgents, syncAgents } from "./agents.js";
export {
  type CommandSyncResult,
  previewCommands,
  syncCommands,
} from "./commands.js";
export {
  type DocsSyncResult,
  previewDocs,
  syncDocs,
} from "./docs.js";
export {
  executeSyncPlan,
  previewSharedOutputLifecycle,
  type SyncResult,
} from "./execute.js";
export {
  assertExtensionArtifactParity,
  type ExtensionsInput,
  type ExtensionsSyncResult,
  extensionWarnings,
  previewExtensions,
  syncExtensions,
} from "./extensions.js";
export {
  getManifestPath,
  hashFile,
  readManifest,
  type SyncManifest,
  writeOwnedManifest,
} from "./manifest.js";
export {
  type ManagedMcpResult,
  type MCPSyncResult,
  previewManagedMCP,
  syncManagedMCP,
} from "./mcp.js";
export { buildSyncPlan, type SyncPlan, type SyncPlanOptions } from "./plan.js";
export {
  loadCanonicalRules,
  previewRules,
  type RuleSyncResult,
  syncRules,
} from "./rules.js";
export {
  previewSkills,
  type SkillSyncResult,
  type SyncOptions,
  syncSkills,
} from "./skills.js";
