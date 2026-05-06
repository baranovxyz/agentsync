/**
 * Doctor Command — Render Functions
 */

import picocolors from "picocolors";
import type { DoctorResult } from "./types.js";

// Short alias used throughout this file
const pc = picocolors;

/**
 * Render the config section of the doctor report.
 * Returns false if display should stop (config missing or invalid).
 */
function renderConfigSection(
  config: DoctorResult["config"],
  toolCount: number,
): boolean {
  console.log(pc.bold("\nConfig"));

  if (!config.found) {
    console.log(pc.red("  ✗ No config file found"));
    if (config.error) {
      console.log(pc.gray(`    ${config.error}`));
    }
    console.log(pc.gray(`    Run ${pc.cyan("agentsync init")} to initialize`));
    return false;
  }

  console.log(pc.green("  ✓ .agents/agentsync.toml found"));

  if (!config.valid) {
    console.log(pc.red(`  ✗ Invalid config: ${config.error}`));
    return false;
  }

  console.log(
    pc.green(
      `  ✓ Valid config, ${toolCount} tool${toolCount !== 1 ? "s" : ""} configured`,
    ),
  );
  return true;
}

/**
 * Render the tools section of the doctor report.
 */
function renderToolsSection(tools: DoctorResult["tools"]): void {
  if (tools.length === 0) return;
  console.log(pc.bold("\nTools"));
  for (const tool of tools) {
    console.log(pc.green(`  ✓ ${tool.name}: configured`));
  }
}

/**
 * Render the skills section of the doctor report.
 */
function renderSkillsSection(skills: DoctorResult["skills"]): void {
  console.log(pc.bold("\nSkills"));
  if (skills.count > 0) {
    console.log(
      pc.green(
        `  ✓ ${skills.count} skill${skills.count !== 1 ? "s" : ""} in .agents/skills/`,
      ),
    );
  } else {
    console.log(pc.gray("  - No skills in .agents/skills/"));
  }
}

/**
 * Render the MCP servers section of the doctor report.
 */
function renderMcpSection(mcp: DoctorResult["mcp"]): void {
  if (mcp.length === 0) return;
  console.log(pc.bold("\nMCP Servers"));
  for (const server of mcp) {
    if (server.envResolved) {
      const envNote = server.hasEnvRefs
        ? "env vars resolved"
        : "no env vars needed";
      console.log(pc.green(`  ✓ ${server.name}: configured, ${envNote}`));
    } else {
      const missing = server.missingEnvVars.join(", ");
      console.log(
        pc.red(
          `  ✗ ${server.name}: CRITICAL — ${missing} not set in environment`,
        ),
      );
      console.log(
        pc.gray(
          `    Unresolved tokens will be sent as literal "{TOKEN}" strings to the MCP server.`,
        ),
      );
    }
  }
}

/**
 * Render the presets section of the doctor report.
 */
function renderPresetsSection(presets: DoctorResult["presets"]): void {
  if (presets.length === 0) return;
  console.log(pc.bold("\nPresets"));
  for (const preset of presets) {
    if (preset.valid) {
      console.log(pc.green(`  ✓ ${preset.source} (valid)`));
    } else {
      const label = preset.source.startsWith("github:")
        ? "invalid format"
        : "not found";
      console.log(pc.red(`  ✗ ${preset.source} (${label})`));
    }
  }
}

/**
 * Render the drift section of the doctor report.
 */
function renderDriftSection(drift: DoctorResult["drift"]): void {
  if (drift.length === 0) return;
  const hasIssues = drift.some((d) => d.status !== "ok");
  if (!hasIssues) return;

  console.log(pc.bold("\nSync Status"));
  for (const entry of drift) {
    if (entry.status === "stale") {
      console.log(
        pc.yellow(
          `  ⚠ ${entry.tool}: config changed since last sync — run agentsync sync`,
        ),
      );
    } else if (entry.status === "missing") {
      console.log(
        pc.yellow(
          `  ⚠ ${entry.tool}: output directory missing — run agentsync sync`,
        ),
      );
    }
  }
}

/**
 * Render the content drift section of the doctor report.
 * Warns when synced files were modified directly, bypassing .agents/ sources.
 */
function renderContentDriftSection(
  contentDrift: DoctorResult["contentDrift"],
): void {
  if (contentDrift.length === 0) return;
  const issues = contentDrift.filter((d) => d.status !== "ok");
  if (issues.length === 0) return;

  console.log(pc.bold("\nContent Drift"));
  for (const entry of issues) {
    if (entry.status === "modified") {
      console.log(
        pc.yellow(
          `  ⚠ ${entry.file}: modified directly — changes will be lost on next sync`,
        ),
      );
    } else if (entry.status === "missing") {
      console.log(
        pc.yellow(
          `  ⚠ ${entry.file}: deleted since last sync — run agentsync sync to restore`,
        ),
      );
    }
  }
}

/**
 * Display the doctor report to the console with formatted output.
 */
export function displayDoctorReport(result: DoctorResult): void {
  const shouldContinue = renderConfigSection(
    result.config,
    result.tools.length,
  );
  if (!shouldContinue) return;

  renderToolsSection(result.tools);
  renderSkillsSection(result.skills);
  renderMcpSection(result.mcp);
  renderPresetsSection(result.presets);
  renderDriftSection(result.drift);
  renderContentDriftSection(result.contentDrift);

  console.log();
}
