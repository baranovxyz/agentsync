/**
 * Doctor Command — Diagnostic Check Functions
 */

import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import fg from "fast-glob";
import type { ToolName } from "../../constants.js";
import { discoverConfigContext } from "../../core/config/discovery.js";
import { resolveConfig } from "../../core/config/resolve.js";
import { AgentSyncError, getErrorMessage } from "../../core/errors.js";
import { loadEnv } from "../../core/mcp/env.js";
import { TOKEN_PATTERN } from "../../core/mcp/tokens.js";
import { GitHubSourceParser } from "../../core/registry/github-source.js";
import {
  globalSkillsGapFix,
  globalSkillsGapMessage,
  globalSkillsRemedyPath,
  hasGlobalSkillsGap,
} from "../../sync/global-skills-gap.js";
import { hashFile, readManifest } from "../../sync/manifest.js";
import { getToolProvider } from "../../tools/index.js";
import type { McpServerConfig } from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";
import { getGlobalConfigDir } from "../../utils/global-config.js";
import type { ConfigCheckResult, DoctorResult } from "./types.js";

/**
 * Project-relative directory a tool's rules writer actually produces, for
 * tools that have one. Derived from `ToolProvider.rulesFormat.fileOutput.root`
 * — the same field `src/sync/rules.ts` writes to — instead of a
 * hand-maintained duplicate map. A hand-maintained map is exactly what drifted
 * before: RooCode and Copilot were both listed with a "rules" directory
 * (`.roo/rules`, `.github/copilot-instructions.md`) even though neither
 * provider defines `rulesFormat` at all — `syncRules` falls back to a
 * warning for them (see `unsupportedRuleResult` in `src/sync/rules.ts`) and
 * never writes those paths, so the drift check reported them "missing"
 * forever, even right after a clean sync. Any tool without a file-backed
 * `rulesFormat` (including Cline, whose `.clinerules` directory is its
 * *skills* destination, not a rules writer) is correctly excluded here.
 */
function rulesHoldoutPath(tool: ToolName): string | null {
  try {
    return getToolProvider(tool).rulesFormat?.fileOutput?.root ?? null;
  } catch {
    return null;
  }
}

/**
 * Collect {TOKEN_NAME} references from a string or record.
 */
function collectTokenRefs(value: unknown): string[] {
  if (typeof value === "string") {
    return [...value.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(collectTokenRefs);
}

/**
 * Extract env var references from an MCP server config.
 * Looks for {TOKEN_NAME} patterns in env values and headers.
 */
function extractEnvVarRefs(server: McpServerConfig): string[] {
  const refs =
    "url" in server
      ? [...collectTokenRefs(server.url), ...collectTokenRefs(server.headers)]
      : collectTokenRefs(server.env);
  return [...new Set(refs)];
}

/**
 * List skill names (the `<name>` in `<name>/SKILL.md`) the sync engine will
 * actually consume from a directory.
 *
 * Must match the glob in `src/sync/skills.ts` (`syncSkillsToTool`):
 * skills are `<name>/SKILL.md` directories, not flat `<name>.md`
 * files. Doctor previously counted top-level `.md` files which led
 * to a misleading "skills.count: N, synced: false" when the user
 * had laid skills out flat — doctor saw them but sync silently
 * dropped them.
 */
async function listSkillDirNames(dir: string): Promise<string[]> {
  try {
    const matches = await fg("*/SKILL.md", {
      cwd: dir,
      absolute: false,
      onlyFiles: true,
    });
    return matches.map((f) => path.dirname(f));
  } catch {
    return [];
  }
}

/** Count skills the sync engine will actually consume. See `listSkillDirNames`. */
async function countSkillDirs(dir: string): Promise<number> {
  return (await listSkillDirNames(dir)).length;
}

/**
 * Check config file existence and validity, extracting tools, MCP servers, and extends.
 */
async function checkConfig(cwd: string): Promise<ConfigCheckResult> {
  const { chain } = await discoverConfigContext(cwd);
  const configPath = chain[0];

  try {
    const config = await resolveConfig({ cwd });
    return {
      config: { found: true, valid: true },
      configPath,
      tools: config.tools ?? [],
      mcpServers: config.mcp ?? {},
      extendsSources: config.extends ?? [],
    };
  } catch (error) {
    const projectMissing =
      !configPath &&
      error instanceof AgentSyncError &&
      error.message === "Project config not found";
    const message = getErrorMessage(error);
    return {
      config: {
        found: Boolean(configPath),
        valid: false,
        error: projectMissing
          ? "No configuration file found (.agents/agentsync.toml). Run: agentsync init"
          : error instanceof AgentSyncError && error.suggestion
            ? `${message}\nRecovery: ${error.suggestion}`
            : message,
      },
      configPath,
      tools: [],
      mcpServers: {},
      extendsSources: [],
    };
  }
}

/**
 * List configured tools.
 */
function checkTools(tools: ToolName[]): DoctorResult["tools"] {
  return tools.map((tool) => ({ name: tool }));
}

/**
 * Check skills count and whether any configured tool has synced output.
 *
 * The probe path is each tool's real skills destination —
 * `ToolProvider.paths.skillsDir`, the same field `src/sync/skills.ts`
 * (`syncSkillsToTool`) writes copies to — not a hand-maintained duplicate
 * map. (The old map here was actually `HOLDOUT_PATHS`, a *rules* holdout
 * map borrowed for this unrelated purpose, so it reported `synced: false`
 * whenever no tool had rules output, even with skills freshly copied.)
 *
 * A tool with `capabilities.nativeSkillsDiscovery` reads `.agents/skills`
 * directly and never receives a copy — for those, "synced" means canonical
 * skills exist for it to read (`count > 0`), not that a copy landed
 * somewhere. If every configured tool is native-only, `synced` therefore
 * tracks `count > 0` exactly.
 */
async function checkSkills(
  cwd: string,
  tools: ToolName[],
): Promise<DoctorResult["skills"]> {
  const skillsDir = path.join(cwd, ".agents", "skills");
  const count = await countSkillDirs(skillsDir);

  let synced = false;
  for (const tool of tools) {
    let provider: ReturnType<typeof getToolProvider>;
    try {
      provider = getToolProvider(tool);
    } catch {
      continue;
    }

    if (provider.capabilities.nativeSkillsDiscovery) {
      if (count > 0) {
        synced = true;
        break;
      }
      continue;
    }

    const skillsOutputDir = provider.paths.skillsDir;
    if (
      skillsOutputDir &&
      (await pathExists(path.join(cwd, skillsOutputDir)))
    ) {
      synced = true;
      break;
    }
  }

  return { count, synced };
}

/**
 * Check MCP server env var resolution status.
 */
function checkMcpEnvVars(
  mcpServers: Record<string, McpServerConfig>,
  env: Readonly<Record<string, string>>,
): DoctorResult["mcp"] {
  const results: DoctorResult["mcp"] = [];
  for (const [name, server] of Object.entries(mcpServers)) {
    const envVarRefs = extractEnvVarRefs(server);
    const missingEnvVars = envVarRefs.filter(
      (varName) => !Object.hasOwn(env, varName),
    );
    // Severity: unresolved env tokens are critical (server will fail at runtime
    // with plaintext "{TOKEN}" strings sent to the MCP server).
    const severity: "ok" | "warning" | "critical" =
      missingEnvVars.length > 0 ? "critical" : "ok";
    results.push({
      name,
      configured: true,
      envResolved: missingEnvVars.length === 0,
      missingEnvVars,
      hasEnvRefs: envVarRefs.length > 0,
      severity,
    });
  }
  return results;
}

/**
 * Validate a GitHub preset source format.
 * Checks that the source matches the expected github:org/repo[@ref] pattern.
 */
function checkGithubPreset(source: string): { source: string; valid: boolean } {
  try {
    new GitHubSourceParser().parse(source);
    return { source, valid: true };
  } catch {
    return { source, valid: false };
  }
}

/**
 * Check a filesystem preset path for existence.
 */
async function checkFsPreset(
  source: string,
  cwd: string,
): Promise<{ source: string; valid: boolean }> {
  const fsPath = source.startsWith("fs:") ? source.slice(3) : source;
  const resolvedPath = path.isAbsolute(fsPath)
    ? fsPath
    : path.resolve(cwd, fsPath);
  return { source, valid: await pathExists(resolvedPath) };
}

/**
 * Detect drift between config and synced rules output.
 * Compares config file mtime against each tool's rules holdout directory
 * (see `rulesHoldoutPath`). If the config is newer, the sync is stale and
 * should be re-run.
 */
async function checkDrift(
  cwd: string,
  tools: ToolName[],
  configPath: string,
): Promise<DoctorResult["drift"]> {
  let configMtime: Date;
  try {
    configMtime = (await stat(configPath)).mtime;
  } catch {
    return [];
  }

  const results: DoctorResult["drift"] = [];
  for (const tool of tools) {
    const toolDir = rulesHoldoutPath(tool);
    if (!toolDir) continue; // No rules writer for this tool — nothing to check.

    const toolPath = path.join(cwd, toolDir);
    if (!(await pathExists(toolPath))) {
      results.push({ tool, status: "missing" });
      continue;
    }

    try {
      const toolMtime = (await stat(toolPath)).mtime;
      results.push({
        tool,
        status: configMtime > toolMtime ? "stale" : "ok",
      });
    } catch {
      results.push({ tool, status: "missing" });
    }
  }

  return results;
}

/**
 * Check content drift by comparing current file hashes against the sync manifest.
 * Detects files that were modified directly (bypassing `.agents/` source of truth).
 * Returns an empty array if no manifest exists (first sync hasn't run yet).
 */
async function checkContentDrift(
  cwd: string,
): Promise<DoctorResult["contentDrift"]> {
  const manifest = await readManifest(cwd);
  if (!manifest) return [];

  const results: DoctorResult["contentDrift"] = [];

  for (const [relPath, expectedHash] of Object.entries(manifest.files)) {
    const absPath = path.join(cwd, relPath);

    if (!(await pathExists(absPath))) {
      results.push({ file: relPath, status: "missing" });
      continue;
    }

    const currentHash = await hashFile(absPath);
    results.push({
      file: relPath,
      status: currentHash === expectedHash ? "ok" : "modified",
    });
  }

  return results;
}

/**
 * Check preset validity for all configured presets.
 * GitHub presets are validated by format; filesystem presets are checked for existence.
 */
async function checkPresets(
  cwd: string,
  extendsSources: string[],
): Promise<DoctorResult["presets"]> {
  const results: DoctorResult["presets"] = [];

  for (const source of extendsSources) {
    if (source.startsWith("github:")) {
      results.push(checkGithubPreset(source));
    } else {
      results.push(await checkFsPreset(source, cwd));
    }
  }

  return results;
}

/**
 * Check whether any configured tool that is verified to read the project
 * `.agents/` but NOT the global `~/.agents/` (`ToolProvider.readsGlobalAgentsDir
 * === false` — see `src/sync/global-skills-gap.ts`) is missing the documented
 * symlink remedy while global skills exist for it to lose. Read-only: never
 * creates the remedy itself, only reports on it.
 *
 * "ok" covers both "nothing to deliver" (no global skills) and "remedy
 * symlink/directory already present". "gap" is the actionable failure.
 */
async function checkGlobalSkillsGap(
  tools: ToolName[],
): Promise<DoctorResult["globalSkillsGap"]> {
  const results: DoctorResult["globalSkillsGap"] = [];
  const globalSkills = await listSkillDirNames(
    path.join(getGlobalConfigDir(), "skills"),
  );

  for (const tool of tools) {
    let provider: ReturnType<typeof getToolProvider>;
    try {
      provider = getToolProvider(tool);
    } catch {
      continue;
    }
    if (!hasGlobalSkillsGap(provider)) continue;

    if (globalSkills.length === 0) {
      results.push({ tool, status: "ok", skillCount: 0, skills: [] });
      continue;
    }

    const remedyPath = globalSkillsRemedyPath(provider, homedir());
    const remedyPresent = remedyPath ? await pathExists(remedyPath) : false;

    results.push(
      remedyPresent
        ? {
            tool,
            status: "ok",
            skillCount: globalSkills.length,
            skills: globalSkills,
          }
        : {
            tool,
            status: "gap",
            skillCount: globalSkills.length,
            skills: globalSkills,
            message: globalSkillsGapMessage(provider, globalSkills),
            fix: globalSkillsGapFix(provider),
          },
    );
  }

  return results;
}

/**
 * Run all diagnostic checks and return a structured result.
 * Separated from display logic for testability.
 */
export async function runDiagnostics(cwd: string): Promise<DoctorResult> {
  const { config, configPath, tools, mcpServers, extendsSources } =
    await checkConfig(cwd);

  if (!(config.found && config.valid)) {
    return {
      config,
      tools: [],
      skills: { count: 0, synced: false },
      mcp: [],
      presets: [],
      drift: [],
      contentDrift: [],
      globalSkillsGap: [],
    };
  }

  const [skills, presets, drift, contentDrift, globalSkillsGap, env] =
    await Promise.all([
      checkSkills(cwd, tools),
      checkPresets(cwd, extendsSources),
      configPath ? checkDrift(cwd, tools, configPath) : Promise.resolve([]),
      checkContentDrift(cwd),
      checkGlobalSkillsGap(tools),
      loadEnv(path.join(cwd, ".env")),
    ]);
  return {
    config,
    tools: checkTools(tools),
    skills,
    mcp: checkMcpEnvVars(mcpServers, env),
    presets,
    drift,
    contentDrift,
    globalSkillsGap,
  };
}

/**
 * Determine if diagnostics found problems that should cause non-zero exit.
 * Returns true if config is missing/invalid, MCP has critical issues, or
 * drift is detected — enables CI pipelines to branch on $?.
 */
export function hasFailures(result: DoctorResult): boolean {
  if (!(result.config.found && result.config.valid)) return true;
  if (result.mcp.some((m) => m.severity === "critical")) return true;
  if (result.drift.some((d) => d.status === "stale")) return true;
  return false;
}
