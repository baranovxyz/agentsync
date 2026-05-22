/**
 * Doctor Command — Diagnostic Check Functions
 */

import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import {
  parseTomlConfig,
  tomlToInternalConfig,
} from "../../config/toml-loader.js";
import type { ToolName } from "../../constants.js";
import { getErrorMessage } from "../../core/errors.js";
import { TOKEN_PATTERN } from "../../core/mcp/tokens.js";
import { hashFile, readManifest } from "../../sync/manifest.js";
import { pathExists } from "../../utils/fs.js";
import type { ConfigCheckResult, DoctorResult } from "./types.js";

const HOLDOUT_PATHS: Record<string, string> = {
  cursor: ".cursor/rules",
  claude: ".claude/rules",
  roocode: ".roo/rules",
  cline: ".clinerules",
  copilot: ".github/copilot-instructions.md",
};

/**
 * Collect {TOKEN_NAME} references from all string values in a record.
 */
function collectTokenRefs(record: unknown, refs: string[]): void {
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  for (const value of Object.values(record)) {
    if (typeof value === "string") {
      for (const match of value.matchAll(TOKEN_PATTERN)) {
        refs.push(match[1]);
      }
    }
  }
}

/**
 * Extract env var references from an MCP server config.
 * Looks for {TOKEN_NAME} patterns in env values and headers.
 */
function extractEnvVarRefs(server: Record<string, unknown>): string[] {
  const refs: string[] = [];
  collectTokenRefs(server.env, refs);
  collectTokenRefs(server.headers, refs);
  return [...new Set(refs)];
}

/**
 * Count markdown files in a directory (non-recursive).
 */
async function countMdFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

/**
 * Check config file existence and validity, extracting tools, MCP servers, and extends.
 */
async function checkConfig(cwd: string): Promise<ConfigCheckResult> {
  const configPath = path.join(cwd, ".agents", "agentsync.toml");

  if (!(await pathExists(configPath))) {
    return {
      config: {
        found: false,
        valid: false,
        error:
          "No configuration file found (.agents/agentsync.toml). Run: agentsync init",
      },
      tools: [],
      mcpServers: {},
      extendsSources: [],
    };
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const toml = parseTomlConfig(content, configPath);
    const internal = tomlToInternalConfig(toml);
    const mcpServers: Record<string, Record<string, unknown>> = {};
    if (internal.mcp) {
      for (const [k, v] of Object.entries(internal.mcp)) {
        mcpServers[k] = v as Record<string, unknown>;
      }
    }
    return {
      config: { found: true, valid: true },
      configPath,
      tools: internal.tools || [],
      mcpServers,
      extendsSources: internal.extends || [],
    };
  } catch (error) {
    return {
      config: {
        found: true,
        valid: false,
        error: getErrorMessage(error),
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
 * Check skills count and whether holdout tools have synced output.
 */
async function checkSkills(
  cwd: string,
  tools: ToolName[],
): Promise<DoctorResult["skills"]> {
  const skillsDir = path.join(cwd, ".agents", "skills");
  const count = await countMdFiles(skillsDir);

  let synced = false;
  for (const tool of tools) {
    const holdoutDir = HOLDOUT_PATHS[tool];
    if (holdoutDir && (await pathExists(path.join(cwd, holdoutDir)))) {
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
  mcpServers: Record<string, Record<string, unknown>>,
): DoctorResult["mcp"] {
  const results: DoctorResult["mcp"] = [];
  for (const [name, server] of Object.entries(mcpServers)) {
    const envVarRefs = extractEnvVarRefs(server);
    const missingEnvVars = envVarRefs.filter(
      (varName) => !process.env[varName],
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
  const withoutPrefix = source.slice(7);
  const [repoPath] = withoutPrefix.split("@");
  const parts = repoPath.split("/");
  // Valid if it has exactly org/repo
  return { source, valid: parts.length === 2 && !!parts[0] && !!parts[1] };
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
 * Detect drift between config and synced tool outputs.
 * Compares config file mtime against holdout tool output directories.
 * If the config is newer, the sync is stale and should be re-run.
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
    const toolDir = HOLDOUT_PATHS[tool];
    if (!toolDir) continue; // Native tools don't have holdout dirs

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
 * Detect worker-mode misconfigurations that don't fail sync but will make
 * harness-driven sessions silently no-op.
 *
 * Today this only fires for opencode: the TUI worker requires top-level
 * `permission: "allow"` in opencode.json, and unlike claude-code/codex
 * there is no equivalent CLI flag (see opencode issue #16367 — agent
 * hangs indefinitely when `permission` is "ask" under headless serve).
 * The fix is operator-side, so this is informational, not a failure.
 *
 * Gated on at least one AGENTSYNC_HARNESS_* env var being set, so the
 * hint only surfaces for users who actually run the harness — normal
 * opencode users on a laptop don't get nagged.
 */
async function checkWorkerHints(
  cwd: string,
  tools: ToolName[],
): Promise<DoctorResult["workerHints"]> {
  const hints: DoctorResult["workerHints"] = [];
  const harnessConfigured = Object.keys(process.env).some((k) =>
    k.startsWith("AGENTSYNC_HARNESS_"),
  );
  if (!harnessConfigured) return hints;

  if (tools.includes("opencode" as ToolName)) {
    const opencodeJsonPath = path.join(cwd, "opencode.json");
    if (await pathExists(opencodeJsonPath)) {
      try {
        const parsed = JSON.parse(await readFile(opencodeJsonPath, "utf-8"));
        if (parsed?.permission !== "allow") {
          hints.push({
            tool: "opencode",
            severity: "warning",
            message:
              'opencode.json lacks top-level `permission: "allow"` — tmux-driven workers will silently no-op on writes',
            fix: `jq '. + {permission: "allow"}' ${opencodeJsonPath} > ${opencodeJsonPath}.tmp && mv ${opencodeJsonPath}.tmp ${opencodeJsonPath}`,
          });
        }
      } catch {
        // Malformed JSON — opencode itself will surface that. Skip the hint.
      }
    }
  }

  return hints;
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
      workerHints: [],
    };
  }

  const [skills, presets, drift, contentDrift, workerHints] = await Promise.all(
    [
      checkSkills(cwd, tools),
      checkPresets(cwd, extendsSources),
      configPath ? checkDrift(cwd, tools, configPath) : Promise.resolve([]),
      checkContentDrift(cwd),
      checkWorkerHints(cwd, tools),
    ],
  );
  return {
    config,
    tools: checkTools(tools),
    skills,
    mcp: checkMcpEnvVars(mcpServers),
    presets,
    drift,
    contentDrift,
    workerHints,
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
