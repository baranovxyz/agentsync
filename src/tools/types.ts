/**
 * Tool Provider Interface
 * Defines where each AI coding tool expects its files and what it supports
 */

import type { z } from "zod";
import type { ToolName } from "../constants.js";
import type { MCP } from "../core/mcp/tokens.js";
import type {
  StructuredConfigDeclaration,
  StructuredStateClaim,
} from "../sync/structured-state.js";
import type { SyncMode } from "../sync/write-file.js";
import type {
  HookSpec,
  OutputStyleConfigSchema,
  PermissionsConfigSchema,
  StatuslineConfigSchema,
} from "../types/schemas.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;
type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;

/** Complete canonical extension state passed to provider reconciliation. */
export interface ToolExtensionsInput {
  hooks?: Record<string, HookSpec[]>;
  permissions?: NonNullable<PermissionsConfig>;
  statusline?: NonNullable<StatuslineConfig>;
  outputStyle?: NonNullable<OutputStyleConfig>;
}

export interface ToolPaths {
  /** Directory for skills (SKILL.md format) relative to project root */
  skillsDir: string | null;
  /**
   * AgentSync-owned destination for preset skills when project/global skills
   * are discovered natively. Presets resolve outside native discovery roots,
   * so this path must be declared independently from `skillsDir`.
   */
  generatedPresetSkillsDir?: string | null;
  /** Directory for commands (*.md) relative to project root */
  commandsDir: string | null;
  /** Directory for agents (*.md) relative to project root */
  agentsDir: string | null;
  /** Path to MCP config file relative to project root */
  mcpConfigPath: string | null;
  /** Path to docs file (AGENTS.md, CLAUDE.md, GEMINI.md) relative to project root */
  docsFile: string;
}

export interface ToolCapabilities {
  skills: boolean;
  commands: boolean;
  agents: boolean;
  mcpStdio: boolean;
  mcpHttp: boolean;
  nativeAgentsMd: boolean;
  nativeSkillsDiscovery: boolean;
  /** Default false. Set true on providers that ship a hooksFormat writer. */
  hooks?: boolean;
  /** Default false. Set true on providers that ship a permissionsFormat writer. */
  permissions?: boolean;
  /** Default false. Set true on providers that ship a statuslineFormat writer. */
  statusline?: boolean;
  /** Default false. Set true on providers that ship an outputStyleFormat writer. */
  outputStyle?: boolean;
  /**
   * Default false. Set true only on providers that can honor a rule's load
   * condition. A tool whose instruction channel is
   * unconditional may still set this (opencode does) as long as its writer
   * withholds path-scoped rules rather than flattening them.
   */
  rules?: boolean;
}

/**
 * A rule as authored in `.agents/rules/**\/*.md`.
 *
 * The canonical format is Claude Code's: plain markdown with optional
 * `description` and `paths` frontmatter. `paths` is the load condition, and
 * it is the property every per-tool translation is judged against.
 */
export interface CanonicalRule {
  /** Path relative to `.agents/rules/`, minus the `.md` extension. */
  name: string;
  /** Path relative to `.agents/rules/`, including the extension. */
  relPath: string;
  /** One-line summary; used by tools that match rules on descriptions. */
  description?: string;
  /**
   * Glob patterns scoping the rule.
   *
   * Present (INCLUDING an empty list) → the rule is CONDITIONAL: it applies
   * only when the agent works with a matching file. Absent → the rule is
   * unconditional and loads at session start. An empty list is deliberately
   * NOT collapsed to `undefined`: doing so would turn a rule that matches
   * nothing into one that always applies — the exact inversion this
   * surface exists to prevent.
   */
  paths?: string[];
  /** Source file content verbatim, frontmatter included. */
  raw: string;
  /** Source file content with the frontmatter block stripped. */
  body: string;
  /** Absolute path of the source file, used for warning context. */
  sourcePath: string;
}

/** Per-tool rules writer. */
export interface RulesFormat {
  /**
   * Exact file layout written by this provider, when rules are materialized as
   * files. Structured writers (for example OpenCode `instructions`) omit it.
   */
  fileOutput?: {
    /** Project-relative directory containing generated rule files. */
    root: string;
    /** Provider-facing file extension, including the leading dot. */
    extension: string;
  };
  /** Read-only validation for shared destinations before any sync writes. */
  preflightRules?(rules: CanonicalRule[], cwd: string): Promise<void>;
  /** Pure projection used by dry-run; must match `writeRules` inclusion/loss. */
  previewRules(rules: CanonicalRule[]): {
    written: string[];
    warnings: string[];
  };
  /**
   * @param rules  every canonical rule, conditional and unconditional alike.
   *               A writer that cannot honor a rule's load condition MUST
   *               skip it and warn — never widen its scope.
   * @param mode   "copy" or "link". A writer whose output is byte-identical
   *               to the canonical source (e.g. Claude Code) should honor
   *               `writeFileByMode`; a writer that transforms content (e.g.
   *               Cursor's `.mdc`) always materializes real bytes and may
   *               ignore this parameter.
   * @returns the rule names actually written, plus lossy-translation warnings
   */
  writeRules(
    rules: CanonicalRule[],
    cwd: string,
    mode: SyncMode,
  ): Promise<{ written: string[]; warnings: string[] }>;
}

/**
 * How much of `paths.mcpConfigPath` an `MCPFormat` writer owns.
 *
 * This is what tells `agentsync clean` whether the file may be deleted. It
 * lives next to the project writer on purpose: it is a fact ABOUT the writer, and the
 * one time `clean` re-derived such a fact for itself it drifted and started
 * deleting the user's content.
 *
 * - `whole-file` — the writer serializes the entire file from AgentSync state,
 *   discarding anything else that was there. Sync would clobber a user's edits
 *   anyway, so `clean` deleting the file loses nothing extra.
 * - `owned-keys` — the writer reads the existing file and replaces only the
 *   named top-level keys, deliberately preserving everything else (models,
 *   providers, themes, permissions…). `clean` must strip just those keys and
 *   leave the file, deleting it only if nothing else remains.
 *
 * Accepted limitation: `clean` strips an owned key whether or not THIS project
 * ever populated it, because nothing on disk records which keys a given sync
 * wrote. A hand-authored value under an owned key is therefore removed — but
 * sync would have overwritten that same value anyway, and the alternative this
 * replaced was deleting the entire file.
 */
export type McpConfigOwnership =
  | { kind: "whole-file" }
  | {
      kind: "owned-keys";
      /**
       * Top-level keys THIS writer assigns wholesale.
       *
       * Two kinds of key are deliberately excluded, because removing either
       * would destroy user config — the exact failure this field exists to
       * prevent. Keys the writer only writes INTO (Codex's `tui.status_line`
       * preserves its sibling `tui` keys), and keys owned by a DIFFERENT
       * AgentSync writer that runs only when its feature is configured
       * (OpenCode's `permission`, Codex's `default_permissions`) — a project
       * syncing only MCP would otherwise have a hand-written block stripped.
       * The cost is that those contributions survive `clean`.
       */
      keys: string[];
      format: "json" | "jsonc" | "toml" | "yaml";
    };

export interface ExternalMcpReconciliationResult {
  warnings: string[];
  removedFiles: string[];
  modifiedFiles: string[];
}

/** One exact project config selected before managed MCP mutation begins. */
export type McpOwnedValueExpectation =
  | { present: false }
  | { present: true; value: unknown };

export interface McpProjectTarget {
  readonly relativePath: string;
  readonly absolutePath: string;
  /** Managed-key state captured by the read-only outer preflight. */
  readonly expectedOwnedValues?: Readonly<
    Record<string, McpOwnedValueExpectation>
  >;
}

/** Exact semantic values a shared-config writer intended to own. */
export interface McpProjectWriteEvidence {
  ownedValues: Readonly<Record<string, unknown>>;
}

interface MCPFormatBase {
  /** Which parts of the target file this writer owns. Drives `agentsync clean`. */
  ownership: McpConfigOwnership;
  /** Read-only validation for explicitly enabled external MCP projections. */
  preflightExternalMCP?(mcps: Record<string, MCP>, cwd: string): Promise<void>;
  /**
   * Reconcile provider-specific MCP state outside the project boundary.
   * The implementation must be a no-op unless its separate opt-in is active.
   */
  reconcileExternalMCP?(
    mcps: Record<string, MCP>,
    cwd: string,
    dryRun: boolean,
  ): Promise<ExternalMcpReconciliationResult>;
}

export interface StaticMCPFormat extends MCPFormatBase {
  projectPath: "static";
  projectConfigPaths?: never;
  resolveProjectConfigPath?: never;
  /** Write only the project config declared by `paths.mcpConfigPath`. */
  writeProjectMCP(mcps: Record<string, MCP>, cwd: string): Promise<void>;
  writeProjectMCPAtPath?: never;
}

export interface DynamicMCPFormat extends MCPFormatBase {
  projectPath: "dynamic";
  /** Every project-relative filename this provider may select for MCP state. */
  projectConfigPaths: readonly string[];
  /** Resolve the one native project filename active for this project. */
  resolveProjectConfigPath(cwd: string): Promise<string>;
  writeProjectMCP?: never;
  /**
   * Dynamic-path project writer. The managed lifecycle resolves `target`
   * exactly once, and the writer returns the precise values it projected so
   * the post-write snapshot cannot claim a concurrent user edit.
   */
  writeProjectMCPAtPath(
    mcps: Record<string, MCP>,
    cwd: string,
    target: McpProjectTarget,
  ): Promise<McpProjectWriteEvidence>;
}

/** One current project-MCP contract: fixed-path or explicitly path-bound. */
export type MCPFormat = StaticMCPFormat | DynamicMCPFormat;

export interface DocsFormat {
  /** Write docs directive file for this tool */
  writeDocs(agentsMdPath: string, cwd: string): Promise<void>;
}

export interface HooksFormat {
  /** Structured dependency whose artifacts must be preserved as one group. */
  artifactDependency?: string;
  /** Pure/read-only loss projection used by dry-run. */
  previewHooks(
    hooks: Record<string, HookSpec[]>,
    cwd: string,
  ): Promise<{
    dropped: Array<{ event: string; id: string; reason: string }>;
    warnings?: string[];
    /** Absolute generated script paths planned by this projection. */
    generatedFiles?: string[];
  }>;
  /** Write canonical hooks into the tool's settings file. Returns dropped hooks (unsupported events). */
  writeHooks(
    hooks: Record<string, HookSpec[]>,
    cwd: string,
  ): Promise<{
    dropped: Array<{ event: string; id: string; reason: string }>;
    warnings?: string[];
    /** Absolute generated script paths actually written. */
    generatedFiles?: string[];
  }>;
}

export interface PermissionsFormat {
  previewPermissions(
    permissions: NonNullable<PermissionsConfig>,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
  writePermissions(
    permissions: NonNullable<PermissionsConfig>,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

export interface StatuslineFormat {
  /** Structured dependency whose artifacts must be preserved as one group. */
  artifactDependency?: string;
  previewStatusline(
    statusline: NonNullable<StatuslineConfig>,
    cwd: string,
  ): Promise<{ warnings: string[]; generatedFiles?: string[] }>;
  writeStatusline(
    statusline: NonNullable<StatuslineConfig>,
    cwd: string,
  ): Promise<{ warnings: string[]; generatedFiles?: string[] }>;
}

export interface OutputStyleFormat {
  /** Structured dependency whose artifacts must be preserved as one group. */
  artifactDependency?: string;
  previewOutputStyle(
    outputStyle: NonNullable<OutputStyleConfig>,
    cwd: string,
  ): Promise<{ warnings: string[]; generatedFiles?: string[] }>;
  writeOutputStyle(
    outputStyle: NonNullable<OutputStyleConfig>,
    cwd: string,
  ): Promise<{ warnings: string[]; generatedFiles?: string[] }>;
}

/** Shape constraint for provider-generated extension artifacts. */
export type ExtensionFileOutput =
  | { kind: "exact"; path: string; dependency?: string }
  | {
      kind: "tree";
      root: string;
      extension?: string;
      dependency?: string;
    };

export interface StructuredConfigProjectionInput {
  extensions: ToolExtensionsInput;
  rules: readonly CanonicalRule[];
}

/** Provider codec for exact semantic ownership of shared config fields. */
export interface StructuredConfigCodec {
  /** Static authority; claims outside these exact paths/keys are rejected. */
  declarations: readonly StructuredConfigDeclaration[];
  /** Complete artifact groups referenced by declaration dependencies. */
  artifactDependencies: readonly string[];
  /** Resolve a dynamic provider config path before projecting any claims. */
  resolveProjectConfigPath?(cwd: string): Promise<string>;
  /** Project exact desired claims without writing provider config. */
  project(
    input: StructuredConfigProjectionInput,
    cwd: string,
    projectConfigPath?: string,
  ): Promise<{ claims: readonly StructuredStateClaim[] }>;
}

/** Withdraws previously owned provider keys that are absent from current input. */
export interface ExtensionsReconciler {
  /** Read-only validation used by dry-run. */
  preflight(input: ToolExtensionsInput, cwd: string): Promise<void>;
  reconcile(
    input: ToolExtensionsInput,
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

/** One agent file successfully projected for a provider destination. */
export interface ProjectedAgentFile {
  /** Absolute path of the provider-facing file. */
  outputPath: string;
  /** Path relative to `provider.paths.agentsDir`, including its extension. */
  relativePath: string;
  /** Exact provider-facing content, available before any destination write. */
  content: string;
}

/** Optional per-tool post-processing for agent files (runs after generic copy) */
export interface AgentsPostHook {
  /** Read-only shared-state and destination validation before any writes. */
  preflight(agentFiles: ProjectedAgentFile[], cwd: string): Promise<void>;
  /** Validate destination identities during both preview and real sync. */
  validate(agentFiles: ProjectedAgentFile[]): void;
  /**
   * Called after agent .md files have been copied into provider.paths.agentsDir.
   * Receives the exact successfully projected destinations so tool-specific
   * artifacts preserve namespaces and never have to re-derive output names
   * from source basenames.
   */
  postSync(
    agentFiles: ProjectedAgentFile[],
    cwd: string,
  ): Promise<{ warnings: string[] }>;
}

/** Provider-specific cleanup for exact shared state outside manifest files. */
export interface ProviderCleanResult {
  removedFiles: string[];
  removedDirs: string[];
  modifiedFiles: string[];
  warnings: string[];
  /** Manifest paths fully handled by this hook during this clean. */
  handledManifestPaths: string[];
  /** Existing handled paths whose ownership must be relinquished. */
  relinquishedManifestPaths: string[];
}

/** Result shared by provider-specific Markdown content transforms. */
export type ContentTransformResult =
  | { content: string; warnings: string[]; skip?: false }
  | { skip: true; warnings: string[] };

/**
 * Optional per-tool transform of an agent .md's content at copy time.
 *
 * Unlike `agentsPostHook` (which writes sibling artifacts and leaves the .md
 * untouched), this rewrites the file the tool actually reads — for tools that
 * parse the agent's own frontmatter and reject foreign keys (e.g. OpenCode
 * fatal-boots on agentsync's `tools` allowlist). Its presence forces a real
 * copy (symlink mode is skipped, since the dest content diverges from source).
 */
export interface AgentContentTransform {
  /**
   * @param content  canonical agent .md (frontmatter + body)
   * @param name     final provider-facing destination identity, flattened with
   *                 `--` across namespaces and nested directories
   * @returns translated content, or `skip: true` when the provider would not
   *          load the declaration; warnings explain every lossy decision
   */
  transform(content: string, name: string): ContentTransformResult;
}

/**
 * Optional per-tool transform of a command Markdown file before publication.
 *
 * Its presence forces a real copy because the provider-facing bytes may
 * diverge from the canonical source. Preview and execution both call the same
 * pure transform, so skips and warnings remain identical.
 */
export interface CommandContentTransform {
  /**
   * @param content canonical command Markdown (frontmatter + body)
   * @param name final provider-facing command identity, without `.md`
   */
  transform(content: string, name: string): ContentTransformResult;
}

export interface ToolProvider {
  /** Tool identifier */
  name: ToolName;
  /** Human-readable display name */
  displayName: string;
  /** Get paths for this tool */
  paths: ToolPaths;
  /** Feature capability matrix */
  capabilities: ToolCapabilities;
  /**
   * Generated file surfaces governed by exact manifest path + hash receipts.
   * Every provider declares this explicitly, including `[]` when it writes no
   * non-canonical files through the generic sync pipeline.
   */
  manifestCleanSurfaces: readonly (
    | "skills"
    | "commands"
    | "agents"
    | "docs"
    | "rules"
    | "extension-files"
  )[];
  /** Exact/bounded file shapes emitted by extension writers. */
  extensionFileOutputs?: readonly ExtensionFileOutput[];
  /** Return a reason when a generated preset skill name is invalid for this tool. */
  validateGeneratedPresetSkillName?(name: string): string | undefined;
  /**
   * Whether this tool's native reader for `.agents/` also covers the
   * GLOBAL `~/.agents/` directory, as distinct from the PROJECT `.agents/`
   * (repo root and below) that `capabilities.nativeSkillsDiscovery` covers.
   *
   * - `true`: vendor source or documentation verifies both scopes.
   * - `false`: the tool reads the project `.agents/` but is verified NOT
   *   to read `~/.agents/`. `syncSkills` (src/sync/skills.ts) then emits a
   *   per-tool warning naming the undelivered global skills and the
   *   symlink remedy, instead of silently reporting `skillCount: 0` —
   *   which is otherwise indistinguishable from "native tool, nothing
   *   needed". `doctor` (src/commands/doctor/checks.ts) reports the same
   *   gap as a standing finding. The value is also explicit on providers
   *   without native project discovery, where the distinction is inert.
   * - `"unverified"`: no user-scope support claim is made. Nonempty global
   *   skills produce a warning, and AgentSync does not include that directory
   *   in the provider's native inventory.
   */
  readsGlobalAgentsDir: boolean | "unverified";
  /**
   * The tool's own OS-level GLOBAL skills directory,
   * expressed with a leading `~`. Used ONLY to compose the remedy command
   * shown when `readsGlobalAgentsDir` is `false` and global skills exist —
   * see `src/sync/global-skills-gap.ts`. AgentSync never writes here
   * itself: `~/.agents/` is a sync SOURCE, not an output target (see
   * docs/architecture.md); the remedy is a command the user/operator runs
   * by hand.
   */
  globalSkillsHome?: string;
  /** File extension for agent files */
  agentFileExtension: string;
  /** MCP format handler (null if tool doesn't support MCP) */
  mcpFormat: MCPFormat | null;
  /** Docs format handler (null if tool reads AGENTS.md natively) */
  docsFormat: DocsFormat | null;
  /** Optional per-tool post-processing after agent copy (e.g., Codex role TOML wrappers) */
  agentsPostHook?: AgentsPostHook;
  /** Optional per-tool agent .md content transform applied at copy time (e.g., OpenCode frontmatter translation) */
  agentContentTransform?: AgentContentTransform;
  /** Optional per-tool command Markdown transform applied in preview and execution. */
  commandContentTransform?: CommandContentTransform;
  /** Optional exact-ownership reconciliation for shared extension config. */
  extensionsReconciler?: ExtensionsReconciler;
  /** Shared structured-config declaration and desired-state codec. */
  structuredConfig?: StructuredConfigCodec;
  /** Optional exact cleanup for provider-private shared-state receipts. */
  cleanGeneratedState?(
    cwd: string,
    dryRun: boolean,
  ): Promise<ProviderCleanResult>;
  /** Read-only discovery for provider-private state governed outside the manifest. */
  hasGeneratedState?(cwd: string): Promise<boolean>;
  /** Hooks writer (null if tool does not support hooks via agentsync) */
  hooksFormat?: HooksFormat | null;
  /** Permissions writer (null if tool does not support permissions sync) */
  permissionsFormat?: PermissionsFormat | null;
  /** Statusline writer (null if not supported) */
  statuslineFormat?: StatuslineFormat | null;
  /** Output style writer (null if not supported) */
  outputStyleFormat?: OutputStyleFormat | null;
  /** Rules writer (null if the tool has no surface that can carry rules) */
  rulesFormat?: RulesFormat | null;
}
