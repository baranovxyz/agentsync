/**
 * Skills Sync Module
 * Source: .agents/skills/ — copies to tool-specific dirs for holdout tools
 * Tools with readsAgentsDir=true already read .agents/ directly (no copy needed)
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import type { ToolProvider } from "../tools/types.js";
import { ensureDir, outputFile, pathExists } from "../utils/fs.js";
import { validateSyncNamespace } from "../utils/path-normalization.js";
import { sanitizeContent } from "../utils/sanitize.js";
import { prependHeader } from "./header.js";
import { writeFileByMode } from "./write-file.js";

/** Result of syncing skills to a single tool */
export interface SkillSyncResult {
  tool: string;
  skillCount: number;
  skills: string[];
  warnings: string[];
}

/** Options for skill sync behavior */
export interface SyncOptions {
  mode?: "copy" | "link";
}

// writeFileByMode imported from ./write-file.js

/**
 * Rewrite the name field in SKILL.md frontmatter to include namespace prefix.
 * If no name: field exists, injects one after the opening ---.
 */
function rewriteSkillName(content: string, namespacedName: string): string {
  // Match name field anywhere in frontmatter (including as first field after ---)
  const nameFieldPattern = /^(---\n)([\s\S]*?)(name:\s*).+(\n[\s\S]*?---)/m;
  if (nameFieldPattern.test(content)) {
    return content.replace(nameFieldPattern, `$1$2name: ${namespacedName}$4`);
  }
  // No name: field — inject one after the opening ---
  return content.replace(/^---\n/m, `---\nname: ${namespacedName}\n`);
}

/**
 * Sync a single skill (SKILL.md + extras) from source to target directory
 */
async function syncSingleSkill(
  skillDir: string,
  relPath: string,
  targetDir: string,
  namespace: string | undefined,
  mode: "copy" | "link",
  warnings: string[],
  cwd: string,
): Promise<string> {
  const skillName = path.dirname(relPath);
  const sourcePath = path.join(skillDir, relPath);

  // Flat namespace: company--tdd (not company/tdd)
  const destName = namespace ? `${namespace}--${skillName}` : skillName;
  const destDir = path.join(targetDir, destName);

  await ensureDir(destDir);

  // Skip if source and dest are the same directory (tool reads .agents/ directly)
  const destSkillMd = path.join(destDir, "SKILL.md");
  if (path.resolve(sourcePath) === path.resolve(destSkillMd)) {
    return destName;
  }

  // For namespaced skills, rewrite the name field in frontmatter
  if (namespace) {
    let content = await readFile(sourcePath, "utf-8");
    // Sanitize preset content (namespace indicates external source)
    const sanitized = sanitizeContent(content, {
      source: `${namespace}/${relPath}`,
    });
    content = sanitized.content;
    warnings.push(...sanitized.warnings);
    const rewritten = rewriteSkillName(content, destName);
    const presetLabel = `preset:${namespace}/${relPath}`;
    await outputFile(
      path.join(destDir, "SKILL.md"),
      prependHeader(rewritten, presetLabel),
      { encoding: "utf-8" },
    );
  } else {
    const sourceLabel = path.relative(cwd, sourcePath);
    await writeFileByMode(
      sourcePath,
      path.join(destDir, "SKILL.md"),
      mode,
      sourceLabel,
    );
  }

  // Copy any additional files in the skill directory (including subdirectories)
  const extraFiles = await fg("**/*", {
    cwd: path.join(skillDir, skillName),
    absolute: false,
    onlyFiles: true,
    ignore: ["SKILL.md"],
  });

  for (const extra of extraFiles) {
    const extraSource = path.join(skillDir, skillName, extra);
    const extraSourceLabel = namespace
      ? `preset:${namespace}/${skillName}/${extra}`
      : path.relative(cwd, extraSource);
    await writeFileByMode(
      extraSource,
      path.join(destDir, extra),
      mode,
      extraSourceLabel,
    );
  }

  return destName;
}

/**
 * Sync skills from source directories to a single tool
 */
async function syncSkillsToTool(
  skillDirs: string[],
  provider: ToolProvider,
  cwd: string,
  namespace?: string,
  options?: SyncOptions,
): Promise<SkillSyncResult> {
  if (!provider.paths.skillsDir) {
    return { tool: provider.name, skillCount: 0, skills: [], warnings: [] };
  }

  const targetDir = path.join(cwd, provider.paths.skillsDir);
  const skills: string[] = [];
  const warnings: string[] = [];
  const mode = options?.mode || "copy";

  for (const skillDir of skillDirs) {
    if (!(await pathExists(skillDir))) continue;

    const skillFiles = await fg("*/SKILL.md", {
      cwd: skillDir,
      absolute: false,
    });

    for (const relPath of skillFiles) {
      const destName = await syncSingleSkill(
        skillDir,
        relPath,
        targetDir,
        namespace,
        mode,
        warnings,
        cwd,
      );
      skills.push(destName);
    }
  }

  return { tool: provider.name, skillCount: skills.length, skills, warnings };
}

/**
 * Sync skills to all configured tools
 * Source: .agents/skills/
 * Holdout tools (readsAgentsDir=false) get copies in their tool-specific dirs
 * Native tools (readsAgentsDir=true) skip — they read .agents/ directly
 */
export async function syncSkills(
  providers: ToolProvider[],
  cwd: string,
  presetSkills?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<SkillSyncResult[]> {
  const projectSkillsDir = path.join(cwd, ".agents", "skills");
  const results: SkillSyncResult[] = [];

  for (const provider of providers) {
    // Tools that read .agents/ directly don't need copies
    if (provider.readsAgentsDir) {
      results.push({
        tool: provider.name,
        skillCount: 0,
        skills: [],
        warnings: [],
      });
      continue;
    }

    let totalSkills = 0;
    const allSkills: string[] = [];
    const allWarnings: string[] = [];

    // Global user skills first (lowest priority — can be overwritten by presets and project)
    if (options?.globalDirs && options.globalDirs.length > 0) {
      const globalResult = await syncSkillsToTool(
        options.globalDirs,
        provider,
        cwd,
        undefined,
        options,
      );
      totalSkills += globalResult.skillCount;
      allSkills.push(...globalResult.skills);
      allWarnings.push(...globalResult.warnings);
    }

    // Preset skills next (middle priority — can be overwritten by project)
    if (presetSkills) {
      for (const [namespace, dirs] of presetSkills) {
        validateSyncNamespace(namespace);
        const presetResult = await syncSkillsToTool(
          dirs,
          provider,
          cwd,
          namespace,
          options,
        );
        totalSkills += presetResult.skillCount;
        allSkills.push(...presetResult.skills);
        allWarnings.push(...presetResult.warnings);
      }
    }

    // Project custom skills last (highest priority — wins on collision)
    const projectResult = await syncSkillsToTool(
      [projectSkillsDir],
      provider,
      cwd,
      undefined,
      options,
    );

    totalSkills += projectResult.skillCount;
    allSkills.push(...projectResult.skills);

    results.push({
      tool: provider.name,
      skillCount: totalSkills,
      skills: allSkills,
      warnings: allWarnings,
    });
  }

  return results;
}
