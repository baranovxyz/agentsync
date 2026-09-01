import { rm, rmdir } from "node:fs/promises";
import * as path from "node:path";
import { stringify } from "smol-toml";
import { z } from "zod";
import { ConfigError } from "../../core/errors.js";
import { splitFrontmatter } from "../../utils/frontmatter.js";
import { toPosixPath } from "../../utils/path-normalization.js";
import { assertSafeProjectOutputPath } from "../../utils/project-output.js";
import type { ProjectedAgentFile } from "../types.js";
import {
  type CodexOwnership,
  type CodexRoleOwnership,
  codexConfigPath,
  fileHashState,
  hashValue,
  isRecord,
  optionalConfigTable,
  readCodexOwnership,
  readProjectTomlOrEmpty,
  resolveRoleArtifact,
  validateCodexSharedState,
  withoutProperty,
  writeCodexOwnership,
  writeProjectText,
  writeProjectToml,
} from "./shared.js";

interface CodexAgentProjection {
  roleConfig: Record<string, unknown>;
  nicknameCandidates?: string[];
  description?: string;
  warnings: string[];
  skip: boolean;
}

const CODEX_ROLE_METADATA_FIELDS = new Set([
  "description",
  "nickname_candidates",
  "max_depth",
]);
const INVALID_NICKNAME_CHARACTER = /[^A-Za-z0-9 _-]/u;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const NonBlankStringSchema = z.string().trim().min(1);
const CodexNicknameCandidatesSchema = z
  .array(z.string(), {
    error: "expected an array of nickname strings",
  })
  .min(1, "must contain at least one name")
  .transform((names) => names.map((name) => name.trim()))
  .superRefine((names, context) => {
    const seen = new Set<string>();
    for (const [index, name] of names.entries()) {
      if (!name) {
        context.addIssue({
          code: "custom",
          message: "cannot contain blank names",
          path: [index],
        });
      } else if (seen.has(name)) {
        context.addIssue({
          code: "custom",
          message: "cannot contain duplicates after trimming",
          path: [index],
        });
      } else {
        seen.add(name);
      }
      if (INVALID_NICKNAME_CHARACTER.test(name)) {
        context.addIssue({
          code: "custom",
          message:
            "may only contain ASCII letters, digits, spaces, hyphens, and underscores",
          path: [index],
        });
      }
    }
  });

const CODEX_ROLE_CONFIG_FIELDS: Readonly<Record<string, z.ZodType>> = {
  model: NonBlankStringSchema,
  model_provider: NonBlankStringSchema,
  // Codex accepts documented levels such as `max`/`ultra` and preserves
  // non-empty custom levels for provider-specific models.
  model_reasoning_effort: NonBlankStringSchema,
  model_reasoning_summary: z.enum(["auto", "concise", "detailed", "none"]),
  model_verbosity: z.enum(["low", "medium", "high"]),
  approval_policy: z.union([
    z.enum(["untrusted", "on-failure", "on-request", "never"]),
    z
      .object({
        granular: z
          .object({
            sandbox_approval: z.boolean(),
            rules: z.boolean(),
            mcp_elicitations: z.boolean(),
            skill_approval: z.boolean().optional(),
            request_permissions: z.boolean().optional(),
          })
          .strict(),
      })
      .strict(),
  ]),
  sandbox_mode: z.enum(["read-only", "workspace-write", "danger-full-access"]),
  web_search: z.enum(["disabled", "cached", "indexed", "live"]),
  personality: z.enum(["none", "friendly", "pragmatic"]),
  model_context_window: z.number().int().positive(),
  model_auto_compact_token_limit: z.number().int().positive(),
};

function projectRoleConfig(
  frontmatter: Record<string, unknown>,
  name: string,
  warnings: string[],
): Record<string, unknown> {
  const roleConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (CODEX_ROLE_METADATA_FIELDS.has(key)) continue;
    const schema = CODEX_ROLE_CONFIG_FIELDS[key];
    if (!schema) {
      warnings.push(
        `codex agent ${name}: codex.${key} dropped — it is not an allowed role-config field.`,
      );
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      roleConfig[key] = parsed.data;
    } else {
      warnings.push(
        `codex agent ${name}: codex.${key} dropped — the value does not match the current Codex schema.`,
      );
    }
  }
  return roleConfig;
}

export function projectCodexAgent(
  content: string,
  name: string,
): CodexAgentProjection {
  const { fm } = splitFrontmatter(content);
  const codexFrontmatter = isRecord(fm?.codex) ? fm.codex : {};
  const codexDescription = nonEmptyString(codexFrontmatter.description);
  const description = codexDescription ?? nonEmptyString(fm?.description);
  const warnings: string[] = [];
  const nicknameResult = CodexNicknameCandidatesSchema.safeParse(
    codexFrontmatter.nickname_candidates,
  );

  if ("max_depth" in codexFrontmatter) {
    warnings.push(
      `codex agent ${name}: codex.max_depth dropped — Codex supports agents.max_depth globally, not per role.`,
    );
  }
  if ("nickname_candidates" in codexFrontmatter && !nicknameResult.success) {
    const reason = nicknameResult.error.issues[0]?.message;
    warnings.push(
      `codex agent ${name}: codex.nickname_candidates dropped — ${reason ?? "the value is invalid"}.`,
    );
  }
  if ("description" in codexFrontmatter && !codexDescription) {
    warnings.push(
      `codex agent ${name}: codex.description ignored — expected a nonblank string.`,
    );
  }
  if (!description) {
    warnings.push(
      `codex agent ${name} skipped — description is required for [agents.${name}].`,
    );
  }

  return {
    roleConfig: projectRoleConfig(codexFrontmatter, name, warnings),
    nicknameCandidates: nicknameResult.success
      ? nicknameResult.data
      : undefined,
    description,
    warnings,
    skip: !description,
  };
}

interface CodexRoleProjection {
  roleName: string;
  markdownPath: string;
  tomlPath: string;
  roleConfig: Record<string, unknown>;
  entry: Record<string, unknown>;
}

function codexRolePaths(
  relativePath: string,
): Pick<CodexRoleProjection, "roleName" | "markdownPath" | "tomlPath"> {
  const projectedPath = toPosixPath(relativePath);
  const extension = path.posix.extname(projectedPath);
  const stem = extension
    ? projectedPath.slice(0, -extension.length)
    : projectedPath;
  return {
    roleName: stem.split("/").join("--"),
    markdownPath: path.posix.join("agents", projectedPath),
    tomlPath: path.posix.join("agents", `${stem}.toml`),
  };
}

function projectCodexRoles(
  agentFiles: ProjectedAgentFile[],
): CodexRoleProjection[] {
  const roles = new Map<string, CodexRoleProjection>();
  for (const agentFile of agentFiles) {
    const paths = codexRolePaths(agentFile.relativePath);
    const projection = projectCodexAgent(agentFile.content, paths.roleName);
    if (!projection.description) continue;
    const entry: Record<string, unknown> = {
      config_file: paths.tomlPath,
      description: projection.description,
    };
    if (projection.nicknameCandidates) {
      entry.nickname_candidates = projection.nicknameCandidates;
    }
    roles.set(paths.roleName, {
      ...paths,
      roleConfig: projection.roleConfig,
      entry,
    });
  }
  return [...roles.values()];
}

export function validateCodexRolePaths(agentFiles: ProjectedAgentFile[]): void {
  const rolePaths = new Map<string, string>();
  for (const agentFile of agentFiles) {
    const { roleName } = codexRolePaths(agentFile.relativePath);
    const markdownPath = toPosixPath(agentFile.relativePath);
    const existing = rolePaths.get(roleName);
    if (existing && existing !== markdownPath) {
      throw new ConfigError(
        `Codex agent paths "${existing}" and "${markdownPath}" both project ` +
          `to role "${roleName}".`,
        undefined,
        "Rename one agent or preset namespace so its flattened Codex role name is unique.",
      );
    }
    rolePaths.set(roleName, markdownPath);
  }
}

function buildAgentToml(role: CodexRoleProjection): string {
  const instructionsPath = path.posix.relative(
    path.posix.dirname(role.tomlPath),
    role.markdownPath,
  );
  return stringify({
    model_instructions_file: instructionsPath,
    ...role.roleConfig,
  });
}

function fileStillOwned(
  state: Awaited<ReturnType<typeof fileHashState>>,
  expectedHash: string,
): boolean {
  return (
    state.kind === "missing" ||
    (state.kind === "readable" && state.hash === expectedHash)
  );
}

async function roleStillOwned(
  cwd: string,
  entry: unknown,
  ownership: CodexRoleOwnership,
): Promise<boolean> {
  const markdownPath = resolveRoleArtifact(cwd, ownership.markdown_path);
  const tomlPath = resolveRoleArtifact(cwd, ownership.toml_path);
  await Promise.all([
    assertSafeProjectOutputPath(cwd, markdownPath),
    assertSafeProjectOutputPath(cwd, tomlPath),
  ]);
  const [markdown, toml] = await Promise.all([
    fileHashState(markdownPath),
    fileHashState(tomlPath),
  ]);
  return (
    (entry === undefined || hashValue(entry) === ownership.entry_hash) &&
    fileStillOwned(markdown, ownership.markdown_hash) &&
    fileStillOwned(toml, ownership.toml_hash)
  );
}

async function pruneEmptyRoleParents(
  artifactPath: string,
  agentsRoot: string,
): Promise<string[]> {
  const removed: string[] = [];
  let current = path.dirname(artifactPath);
  while (
    current !== agentsRoot &&
    current.startsWith(`${agentsRoot}${path.sep}`)
  ) {
    try {
      await rmdir(current);
      removed.push(current);
    } catch {
      return removed;
    }
    current = path.dirname(current);
  }
  return removed;
}

async function removeOwnedRoleArtifacts(
  cwd: string,
  ownership: CodexRoleOwnership,
  dryRun = false,
): Promise<{ files: string[]; dirs: string[] }> {
  const agentsRoot = path.join(cwd, ".codex", "agents");
  const files: string[] = [];
  const dirs: string[] = [];
  for (const relativePath of [ownership.markdown_path, ownership.toml_path]) {
    const artifactPath = resolveRoleArtifact(cwd, relativePath);
    await assertSafeProjectOutputPath(cwd, artifactPath);
    if ((await fileHashState(artifactPath)).kind === "missing") continue;
    files.push(artifactPath);
    if (dryRun) continue;
    await rm(artifactPath, { force: true });
    dirs.push(...(await pruneEmptyRoleParents(artifactPath, agentsRoot)));
  }
  return { files, dirs };
}

function modifiedRoleWarning(name: string): string {
  return (
    `codex agent ${name} preserved after withdrawal because a prior ` +
    "AgentSync-owned role artifact or config entry was modified; " +
    "ownership was relinquished. Remove or rename the preserved role manually after review."
  );
}

function rolePathsMatch(
  role: CodexRoleProjection | undefined,
  ownership: CodexRoleOwnership,
): boolean {
  return (
    role !== undefined &&
    ownership.markdown_path === role.markdownPath &&
    ownership.toml_path === role.tomlPath
  );
}

function withoutAgentEntries(
  config: Record<string, unknown>,
  agents: Record<string, unknown>,
  removedNames: ReadonlySet<string>,
): Record<string, unknown> {
  if (removedNames.size === 0) return config;
  const retained = Object.fromEntries(
    Object.entries(agents).filter(([name]) => !removedNames.has(name)),
  );
  return Object.keys(retained).length > 0
    ? { ...config, agents: retained }
    : withoutProperty(config, "agents");
}

async function reconcileOwnedRoles(
  cwd: string,
  configFile: string,
  config: Record<string, unknown>,
  receipt: CodexOwnership,
  desiredRoles: ReadonlyMap<string, CodexRoleProjection>,
): Promise<{ config: Record<string, unknown>; warnings: string[] }> {
  if (Object.keys(receipt.roles).length === 0) {
    return { config, warnings: [] };
  }
  const agents = optionalConfigTable(config, "agents", configFile);
  const removedNames = new Set<string>();
  const warnings: string[] = [];

  for (const [name, ownership] of Object.entries(receipt.roles)) {
    if (rolePathsMatch(desiredRoles.get(name), ownership)) continue;
    if (!(await roleStillOwned(cwd, agents[name], ownership))) {
      warnings.push(modifiedRoleWarning(name));
      continue;
    }
    removedNames.add(name);
    await removeOwnedRoleArtifacts(cwd, ownership);
  }

  return {
    config: withoutAgentEntries(config, agents, removedNames),
    warnings,
  };
}

async function requiredFileHash(filePath: string): Promise<string> {
  const state = await fileHashState(filePath);
  if (state.kind === "readable") return state.hash;
  throw new ConfigError(
    `Expected generated Codex role file "${filePath}" is not readable.`,
    filePath,
    "Restore path permissions and rerun agentsync sync.",
  );
}

async function snapshotRoleOwnership(
  cwd: string,
  role: CodexRoleProjection,
): Promise<CodexRoleOwnership> {
  return {
    entry_hash: hashValue(role.entry),
    markdown_path: role.markdownPath,
    markdown_hash: await requiredFileHash(
      resolveRoleArtifact(cwd, role.markdownPath),
    ),
    toml_path: role.tomlPath,
    toml_hash: await requiredFileHash(resolveRoleArtifact(cwd, role.tomlPath)),
  };
}

async function assertRoleArtifactWritable(
  cwd: string,
  relativePath: string,
  expectedHash: string | undefined,
): Promise<void> {
  const artifactPath = resolveRoleArtifact(cwd, relativePath);
  await assertSafeProjectOutputPath(cwd, artifactPath);
  const state = await fileHashState(artifactPath);
  if (
    state.kind === "missing" ||
    (state.kind === "readable" && state.hash === expectedHash)
  ) {
    return;
  }
  throw new ConfigError(
    `Cannot overwrite Codex role artifact "${artifactPath}": it is not an unchanged AgentSync-owned output.`,
    artifactPath,
    "Move or rename the hand-authored file, or restore the exact previously generated file and ownership receipt, then rerun agentsync sync.",
  );
}

async function assertDesiredRoleWritable(
  cwd: string,
  configFile: string,
  agents: Record<string, unknown>,
  receipt: CodexOwnership,
  role: CodexRoleProjection,
): Promise<void> {
  const ownership = receipt.roles[role.roleName];
  const artifacts: Array<[string, string | undefined, string | undefined]> = [
    [role.markdownPath, ownership?.markdown_path, ownership?.markdown_hash],
    [role.tomlPath, ownership?.toml_path, ownership?.toml_hash],
  ];
  await Promise.all(
    artifacts.map(([desiredPath, ownedPath, ownedHash]) =>
      assertRoleArtifactWritable(
        cwd,
        desiredPath,
        ownedPath === desiredPath ? ownedHash : undefined,
      ),
    ),
  );

  const currentEntry = agents[role.roleName];
  if (
    currentEntry === undefined ||
    (ownership && hashValue(currentEntry) === ownership.entry_hash)
  ) {
    return;
  }
  throw new ConfigError(
    `Cannot overwrite [agents.${role.roleName}] in "${configFile}": it is not an unchanged AgentSync-owned entry.`,
    configFile,
    `Move or rename the hand-authored role, or restore [agents.${role.roleName}] and the ownership receipt, then rerun agentsync sync.`,
  );
}

async function writeProjectedRoles(
  cwd: string,
  roles: readonly CodexRoleProjection[],
): Promise<Record<string, Record<string, unknown>>> {
  const entries: Record<string, Record<string, unknown>> = {};
  for (const role of roles) {
    await writeProjectText(
      cwd,
      path.join(cwd, ".codex", role.tomlPath),
      buildAgentToml(role),
    );
    entries[role.roleName] = role.entry;
  }
  return entries;
}

function mergeAgentEntries(
  config: Record<string, unknown>,
  configFile: string,
  desiredEntries: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const agents = {
    ...optionalConfigTable(config, "agents", configFile),
    ...desiredEntries,
  };
  return Object.keys(agents).length > 0
    ? { ...config, agents }
    : withoutProperty(config, "agents");
}

async function snapshotRoleOwnerships(
  cwd: string,
  roles: readonly CodexRoleProjection[],
): Promise<Record<string, CodexRoleOwnership>> {
  const ownerships: Record<string, CodexRoleOwnership> = {};
  for (const role of roles) {
    ownerships[role.roleName] = await snapshotRoleOwnership(cwd, role);
  }
  return ownerships;
}

export async function preflightCodexAgents(
  agentFiles: ProjectedAgentFile[],
  cwd: string,
): Promise<void> {
  const roles = projectCodexRoles(agentFiles);
  const configFile = codexConfigPath(cwd);
  const { config, receipt } = await validateCodexSharedState(cwd);
  const agents = optionalConfigTable(config, "agents", configFile);
  await Promise.all(
    roles.map((role) =>
      assertDesiredRoleWritable(cwd, configFile, agents, receipt, role),
    ),
  );
}

export async function codexAgentsPostSync(
  agentFiles: ProjectedAgentFile[],
  cwd: string,
): Promise<{ warnings: string[] }> {
  validateCodexRolePaths(agentFiles);
  const roles = projectCodexRoles(agentFiles);
  const desiredRoles = new Map(roles.map((role) => [role.roleName, role]));
  const configFile = codexConfigPath(cwd);
  const [receipt, existing] = await Promise.all([
    readCodexOwnership(cwd),
    readProjectTomlOrEmpty(cwd, configFile),
  ]);
  const reconciliation = await reconcileOwnedRoles(
    cwd,
    configFile,
    existing,
    receipt,
    desiredRoles,
  );
  const agentsTable = await writeProjectedRoles(cwd, roles);
  const next = mergeAgentEntries(
    reconciliation.config,
    configFile,
    agentsTable,
  );
  if (hashValue(next) !== hashValue(existing)) {
    await writeProjectToml(cwd, configFile, next);
  }

  const currentRoles = await snapshotRoleOwnerships(cwd, roles);
  await writeCodexOwnership(cwd, { ...receipt, roles: currentRoles });
  return { warnings: reconciliation.warnings };
}

export interface CodexRoleCleanup {
  config: Record<string, unknown>;
  removedFiles: string[];
  removedDirs: string[];
  warnings: string[];
  handledManifestPaths: string[];
  relinquishedManifestPaths: string[];
}

export async function cleanCodexRoles(
  cwd: string,
  configFile: string,
  config: Record<string, unknown>,
  receipt: CodexOwnership,
  dryRun: boolean,
): Promise<CodexRoleCleanup> {
  const agents = optionalConfigTable(config, "agents", configFile);
  const removedNames = new Set<string>();
  const cleanup: CodexRoleCleanup = {
    config,
    removedFiles: [],
    removedDirs: [],
    warnings: [],
    handledManifestPaths: [],
    relinquishedManifestPaths: [],
  };

  for (const [name, ownership] of Object.entries(receipt.roles)) {
    const manifestPath = path.posix.join(".codex", ownership.markdown_path);
    cleanup.handledManifestPaths.push(manifestPath);
    if (!(await roleStillOwned(cwd, agents[name], ownership))) {
      cleanup.relinquishedManifestPaths.push(manifestPath);
      cleanup.warnings.push(modifiedRoleWarning(name));
      continue;
    }
    removedNames.add(name);
    const removed = await removeOwnedRoleArtifacts(cwd, ownership, dryRun);
    cleanup.removedFiles.push(...removed.files);
    cleanup.removedDirs.push(...removed.dirs);
  }

  cleanup.config = withoutAgentEntries(config, agents, removedNames);
  return cleanup;
}
