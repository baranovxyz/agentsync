/**
 * Skills Sync Module
 * Source: .agents/skills/ — copies to tool-specific dirs for holdout tools
 * Tools with nativeSkillsDiscovery=true already read .agents/ directly.
 */

import { readdir, readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import yaml from "js-yaml";
import type { ToolProvider } from "../tools/types.js";
import { splitFrontmatter } from "../utils/frontmatter.js";
import { ensureDir, outputFile, pathExists } from "../utils/fs.js";
import { validateSyncNamespace } from "../utils/path-normalization.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";
import { sanitizeContent } from "../utils/sanitize.js";
import {
  globalSkillsGapFix,
  globalSkillsGapMessage,
  hasGlobalSkillsGap,
} from "./global-skills-gap.js";
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

export function projectPresetSkillNames(
  provider: ToolProvider,
  names: string[],
): { names: string[]; warnings: string[] } {
  const accepted: string[] = [];
  const warnings: string[] = [];
  for (const name of names) {
    const reason = provider.validateGeneratedPresetSkillName?.(name);
    if (reason) {
      warnings.push(
        `[${provider.name}] skipped preset skill ${name} — ${reason}`,
      );
    } else {
      accepted.push(name);
    }
  }
  return { names: accepted, warnings };
}

// writeFileByMode imported from ./write-file.js

/** Builds the warning for a skill excluded by name collision, or `null` to skip it silently. */
type ExcludedNameReason = (destName: string) => string | null;

function defaultExcludedNameReason(destName: string): string {
  return `skipped preset skill ${destName} — a native skill with the same name already exists; rename one definition to remove the ambiguity`;
}

/**
 * A skill's `description` is required by `docs/configuration.md`'s Validation
 * section and AGENTS.md's frontmatter convention. Presets already synthesize
 * a default (see `projectPresetSkillContent`) so they're excluded here —
 * this covers plain project/global skills, which are copied byte-for-byte
 * with no synthesis step of their own.
 */
function hasNonEmptyDescription(content: string): boolean {
  const { fm } = splitFrontmatter(content);
  const description = fm?.description;
  return typeof description === "string" && description.trim().length > 0;
}

function missingDescriptionWarning(
  tool: string,
  cwd: string,
  sourcePath: string,
): string {
  return (
    `[${tool}] ${path.relative(cwd, sourcePath)} — missing frontmatter ` +
    "'description'; syncing with default values"
  );
}

function projectPresetSkillContent(
  content: string,
  namespacedName: string,
): string | null {
  const parsed = splitFrontmatter(content);
  const hasFrontmatterEnvelope =
    content.startsWith("---\n") ||
    content.startsWith("---\r\n") ||
    /^---[ \t]+\r?\n/.test(content);
  if (hasFrontmatterEnvelope && !parsed.fm) return null;

  const metadata = {
    ...(parsed.fm ?? {}),
    name: namespacedName,
    description:
      typeof parsed.fm?.description === "string" &&
      parsed.fm.description.trim().length > 0
        ? parsed.fm.description
        : `Imported preset skill ${namespacedName}`,
  };
  const serialized = yaml
    .dump(metadata, { lineWidth: -1, noRefs: true })
    .replaceAll("\n", parsed.eol);
  return `---${parsed.eol}${serialized}---${parsed.eol}${parsed.body}`;
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
  write: boolean,
  tool: string,
): Promise<string | null> {
  const skillName = path.dirname(relPath);
  const sourcePath = path.join(skillDir, relPath);

  // Flat namespace: company--tdd (not company/tdd)
  const destName = namespace ? `${namespace}--${skillName}` : skillName;
  const destDir = path.join(targetDir, destName);

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
    const rewritten = projectPresetSkillContent(content, destName);
    if (rewritten === null) {
      warnings.push(
        `[${tool}] skipped preset skill ${destName} — malformed YAML frontmatter in ${namespace}/${relPath}`,
      );
      return null;
    }
    if (write) {
      const destination = path.join(destDir, "SKILL.md");
      await assertSafeProjectOutputPath(cwd, destination);
      await ensureDir(destDir);
      await rm(destination, { force: true });
      await outputFile(destination, rewritten, {
        encoding: "utf-8",
      });
    }
  } else {
    const content = await readFile(sourcePath, "utf-8");
    if (!hasNonEmptyDescription(content)) {
      warnings.push(missingDescriptionWarning(tool, cwd, sourcePath));
    }
    if (write) {
      await writeFileByMode(
        sourcePath,
        path.join(destDir, "SKILL.md"),
        mode,
        cwd,
      );
    }
  }

  // Copy any additional files in the skill directory (including subdirectories)
  if (write) {
    const extraFiles = await fg("**/*", {
      cwd: path.join(skillDir, skillName),
      absolute: false,
      onlyFiles: true,
      ignore: ["SKILL.md"],
    });

    for (const extra of extraFiles) {
      const extraSource = path.join(skillDir, skillName, extra);
      await writeFileByMode(extraSource, path.join(destDir, extra), mode, cwd);
    }
  }

  return destName;
}

/**
 * List skill names (the `<name>` in `<name>/SKILL.md`) present across a set
 * of source directories, deduplicated. Read-only — used to name what a
 * gap-prone provider (see `hasGlobalSkillsGap`) would fail to receive,
 * without performing any copy.
 */
async function listSkillNames(dirs: string[]): Promise<string[]> {
  return [...(await listSkillOccurrences(dirs)).keys()];
}

async function listSkillOccurrences(
  dirs: string[],
): Promise<Map<string, string[]>> {
  const occurrences = new Map<string, string[]>();
  const uniqueDirs = [...new Set(dirs.map((dir) => path.resolve(dir)))];
  for (const dir of uniqueDirs) {
    if (!(await pathExists(dir))) continue;
    const skillFiles = await fg("*/SKILL.md", { cwd: dir, absolute: false });
    for (const relPath of skillFiles) {
      const name = path.dirname(relPath);
      occurrences.set(name, [...(occurrences.get(name) ?? []), dir]);
    }
  }
  return occurrences;
}

async function flatSkillWarnings(
  skillDir: string,
  cwd: string,
): Promise<string[]> {
  const entries = await readdir(skillDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"),
    )
    .map((entry) => {
      const source = path.relative(cwd, path.join(skillDir, entry.name));
      const suggested = entry.name.replace(/\.md$/i, "");
      return (
        `Skipped flat file ${source} — skills use the <name>/SKILL.md directory layout. ` +
        `Move to ${path.dirname(source)}/${suggested}/SKILL.md to have it synced.`
      );
    });
}

/**
 * Flat-file warnings describe the source directory, not any one tool — the
 * same directory is re-scanned once per provider (and once per preset
 * namespace), so warn only the first time this run sees it (see also
 * rules.ts's attachLoadWarnings, which hoists a similarly source-level
 * warning out of the per-tool loop). The directory is claimed synchronously
 * (no `await` between the check and the add) so concurrent providers racing
 * on the same directory can't both observe "not seen yet" before either has
 * recorded its claim.
 */
function flatWarningsOnce(
  skillDir: string,
  cwd: string,
  seenFlatWarningDirs: Set<string>,
): Promise<string[]> {
  const resolvedSkillDir = path.resolve(skillDir);
  const alreadyWarned = seenFlatWarningDirs.has(resolvedSkillDir);
  seenFlatWarningDirs.add(resolvedSkillDir);
  return alreadyWarned ? Promise.resolve([]) : flatSkillWarnings(skillDir, cwd);
}

async function projectSkillFile(
  skillDir: string,
  relPath: string,
  provider: ToolProvider,
  targetDir: string,
  namespace: string | undefined,
  options: SyncOptions | undefined,
  excludedNames: ReadonlySet<string> | undefined,
  excludedNameReason: ExcludedNameReason,
  warnings: string[],
  cwd: string,
  write: boolean,
): Promise<string | null> {
  const sourceName = path.dirname(relPath);
  const destName = namespace ? `${namespace}--${sourceName}` : sourceName;
  const invalidReason = namespace
    ? provider.validateGeneratedPresetSkillName?.(destName)
    : undefined;
  if (invalidReason) {
    warnings.push(
      `[${provider.name}] skipped preset skill ${destName} — ${invalidReason}`,
    );
    return null;
  }
  if (excludedNames?.has(destName)) {
    const reason = excludedNameReason(destName);
    if (reason) warnings.push(`[${provider.name}] ${reason}`);
    return null;
  }
  return syncSingleSkill(
    skillDir,
    relPath,
    targetDir,
    namespace,
    options?.mode ?? "copy",
    warnings,
    cwd,
    write,
    provider.name,
  );
}

async function projectSkillDirectory(
  skillDir: string,
  provider: ToolProvider,
  cwd: string,
  targetDir: string,
  namespace: string | undefined,
  options: SyncOptions | undefined,
  excludedNames: ReadonlySet<string> | undefined,
  write: boolean,
  seenFlatWarningDirs: Set<string>,
  excludedNameReason: ExcludedNameReason = defaultExcludedNameReason,
): Promise<SkillSyncResult> {
  if (!(await pathExists(skillDir))) {
    return { tool: provider.name, skillCount: 0, skills: [], warnings: [] };
  }

  const skillFiles = await fg("*/SKILL.md", { cwd: skillDir, absolute: false });
  const warnings = await flatWarningsOnce(skillDir, cwd, seenFlatWarningDirs);
  const skills: string[] = [];
  for (const relPath of skillFiles) {
    const synced = await projectSkillFile(
      skillDir,
      relPath,
      provider,
      targetDir,
      namespace,
      options,
      excludedNames,
      excludedNameReason,
      warnings,
      cwd,
      write,
    );
    if (synced) skills.push(synced);
  }
  return {
    tool: provider.name,
    skillCount: skills.length,
    skills,
    warnings,
  };
}

/**
 * Sync skills from source directories to a single tool
 */
async function syncSkillsToTool(
  skillDirs: string[],
  provider: ToolProvider,
  cwd: string,
  namespace: string | undefined,
  options: SyncOptions | undefined,
  targetSkillsDir: string | null = provider.paths.skillsDir,
  write = true,
  excludedNames: ReadonlySet<string> | undefined,
  seenFlatWarningDirs: Set<string>,
  excludedNameReason: ExcludedNameReason = defaultExcludedNameReason,
): Promise<SkillSyncResult> {
  if (!targetSkillsDir) {
    return { tool: provider.name, skillCount: 0, skills: [], warnings: [] };
  }

  const targetDir = path.join(cwd, targetSkillsDir);
  const results: SkillSyncResult[] = [];
  for (const skillDir of skillDirs) {
    results.push(
      await projectSkillDirectory(
        skillDir,
        provider,
        cwd,
        targetDir,
        namespace,
        options,
        excludedNames,
        write,
        seenFlatWarningDirs,
        excludedNameReason,
      ),
    );
  }
  return mergeSkillResults(provider.name, results);
}

async function listPresetSkillNames(
  presetSkills: Map<string, string[]>,
): Promise<string[]> {
  const names = new Set<string>();
  for (const [namespace, dirs] of presetSkills) {
    validateSyncNamespace(namespace);
    for (const name of await listSkillNames(dirs)) {
      names.add(`${namespace}--${name}`);
    }
  }
  return [...names];
}

export function skippedNativePresetSkillsWarning(
  tool: string,
  names: string[],
): string {
  return (
    `[${tool}] skipped ${names.length} preset skill${names.length === 1 ? "" : "s"} ` +
    `(${names.join(", ")}) — native discovery cannot read AgentSync's preset cache and ` +
    "this provider has no compatible generated preset destination. Copy and, if required, " +
    "rename the skills into .agents/skills explicitly."
  );
}

async function syncPresetSkills(
  presetSkills: Map<string, string[]>,
  provider: ToolProvider,
  cwd: string,
  options: SyncOptions | undefined,
  targetSkillsDir: string | null,
  write: boolean,
  excludedNames: ReadonlySet<string> | undefined,
  seenFlatWarningDirs: Set<string>,
): Promise<SkillSyncResult> {
  const aggregate: SkillSyncResult = {
    tool: provider.name,
    skillCount: 0,
    skills: [],
    warnings: [],
  };
  for (const [namespace, dirs] of presetSkills) {
    validateSyncNamespace(namespace);
    const result = await syncSkillsToTool(
      dirs,
      provider,
      cwd,
      namespace,
      options,
      targetSkillsDir,
      write,
      excludedNames,
      seenFlatWarningDirs,
    );
    aggregate.skillCount += result.skillCount;
    aggregate.skills.push(...result.skills);
    aggregate.warnings.push(...result.warnings);
  }
  return aggregate;
}

function mergeSkillResults(
  tool: string,
  results: SkillSyncResult[],
): SkillSyncResult {
  return results.reduce<SkillSyncResult>(
    (aggregate, result) => ({
      tool,
      skillCount: aggregate.skillCount + result.skillCount,
      skills: [...aggregate.skills, ...result.skills],
      warnings: [...aggregate.warnings, ...result.warnings],
    }),
    { tool, skillCount: 0, skills: [], warnings: [] },
  );
}

/**
 * Build the (no-op) result for a provider that reads `.agents/` directly.
 * The project scope is covered by native skill discovery itself — nothing is
 * written. A provider verified NOT to also read `~/.agents/`
 * (`readsGlobalAgentsDir === false`) would otherwise leave global skills
 * undelivered, so this surfaces that as a warning instead of a bare `skillCount: 0`, which
 * otherwise looks identical to "native tool, nothing to do". `skillCount` /
 * `skills` stay empty either way: nothing was written for this provider.
 */
interface NativeSkillInventory {
  names: ReadonlySet<string>;
  result: SkillSyncResult;
}

function duplicateNativeSkillWarnings(
  provider: ToolProvider,
  occurrences: Map<string, string[]>,
  cwd: string,
): string[] {
  return [...occurrences]
    .filter(([, roots]) => roots.length > 1)
    .map(([name, roots]) => {
      const labels = roots.map((root) => path.relative(cwd, root) || ".");
      return (
        `[${provider.name}] native skill ${name} exists in multiple discovery roots ` +
        `(${labels.join(", ")}); resolution is tool-dependent. Keep one definition or rename it.`
      );
    });
}

async function buildNativeReaderResult(
  provider: ToolProvider,
  cwd: string,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<NativeSkillInventory> {
  const warnings: string[] = [];
  const globalDirs = options?.globalDirs ?? [];
  if (hasGlobalSkillsGap(provider) && options?.globalDirs?.length) {
    const undelivered = await listSkillNames(options.globalDirs);
    if (undelivered.length > 0) {
      warnings.push(
        `[${provider.name}] ${globalSkillsGapMessage(provider, undelivered)} ` +
          `Fix: ${globalSkillsGapFix(provider)}`,
      );
    }
  }
  if (provider.readsGlobalAgentsDir === "unverified" && globalDirs.length > 0) {
    const names = await listSkillNames(globalDirs);
    if (names.length > 0) {
      warnings.push(
        `[${provider.name}] native discovery of global ~/.agents/skills is unverified; ` +
          `cannot confirm delivery of ${names.length} global skill${names.length === 1 ? "" : "s"} ` +
          `(${names.join(", ")})`,
      );
    }
  }
  const nativeRoots = [
    path.join(cwd, ".agents", "skills"),
    ...(provider.readsGlobalAgentsDir === true ? globalDirs : []),
  ];
  const occurrences = await listSkillOccurrences(nativeRoots);
  warnings.push(...duplicateNativeSkillWarnings(provider, occurrences, cwd));
  return {
    names: new Set(occurrences.keys()),
    result: { tool: provider.name, skillCount: 0, skills: [], warnings },
  };
}

async function syncNativeProviderSkills(
  provider: ToolProvider,
  cwd: string,
  presetSkills: Map<string, string[]> | undefined,
  presetNames: string[],
  options: SyncOptions & { globalDirs?: string[] },
  write: boolean,
  seenFlatWarningDirs: Set<string>,
): Promise<SkillSyncResult> {
  const native = await buildNativeReaderResult(provider, cwd, options);
  const nativeResult = native.result;
  if (!presetSkills || presetNames.length === 0) return nativeResult;

  const target = provider.paths.generatedPresetSkillsDir;
  if (!target) {
    return mergeSkillResults(provider.name, [
      nativeResult,
      {
        tool: provider.name,
        skillCount: 0,
        skills: [],
        warnings: [
          skippedNativePresetSkillsWarning(provider.name, presetNames),
        ],
      },
    ]);
  }

  const presetResult = await syncPresetSkills(
    presetSkills,
    provider,
    cwd,
    options,
    target,
    write,
    native.names,
    seenFlatWarningDirs,
  );
  return mergeSkillResults(provider.name, [nativeResult, presetResult]);
}

/**
 * Names present in both a global skills directory and the project skills
 * directory. Both map to the same per-tool destination, so only the project
 * copy (synced last, see `syncGeneratedProviderSkills`) should actually
 * reach disk or be counted — this is computed up front so the global pass
 * can skip writing (and reporting) them, deduplicated by final destination
 * with project content taking precedence.
 */
async function shadowedGlobalSkillNames(
  globalDirs: string[],
  projectSkillsDir: string,
): Promise<Map<string, string[]>> {
  const [globalOccurrences, projectNames] = await Promise.all([
    listSkillOccurrences(globalDirs),
    listSkillNames([projectSkillsDir]),
  ]);
  const projectNameSet = new Set(projectNames);
  const shadowed = new Map<string, string[]>();
  for (const [name, dirs] of globalOccurrences) {
    if (projectNameSet.has(name)) shadowed.set(name, dirs);
  }
  return shadowed;
}

function shadowedGlobalSkillWarning(
  provider: ToolProvider,
  name: string,
  dirs: string[],
  cwd: string,
): string {
  const sources = dirs.map(
    (dir) => path.relative(cwd, path.join(dir, name, "SKILL.md")) || ".",
  );
  return (
    `[${provider.name}] skill ${name} is defined in both the project and global skills; the ` +
    `project copy wins and the global source (${sources.join(", ")}) is not synced for this ` +
    "destination"
  );
}

async function syncGlobalSkills(
  provider: ToolProvider,
  cwd: string,
  globalDirs: string[],
  projectSkillsDir: string,
  options: SyncOptions | undefined,
  write: boolean,
  seenFlatWarningDirs: Set<string>,
): Promise<SkillSyncResult> {
  const shadowed = await shadowedGlobalSkillNames(globalDirs, projectSkillsDir);
  const shadowWarnings = [...shadowed].map(([name, dirs]) =>
    shadowedGlobalSkillWarning(provider, name, dirs, cwd),
  );
  const result = await syncSkillsToTool(
    globalDirs,
    provider,
    cwd,
    undefined,
    options,
    provider.paths.skillsDir,
    write,
    new Set(shadowed.keys()),
    seenFlatWarningDirs,
    () => null, // shadowed collision already gets its own warning above
  );
  return { ...result, warnings: [...shadowWarnings, ...result.warnings] };
}

async function syncGeneratedProviderSkills(
  provider: ToolProvider,
  cwd: string,
  projectSkillsDir: string,
  presetSkills: Map<string, string[]> | undefined,
  options: SyncOptions & { globalDirs?: string[] },
  write: boolean,
  seenFlatWarningDirs: Set<string>,
): Promise<SkillSyncResult> {
  const results: SkillSyncResult[] = [];

  // Global user skills first (lowest priority — presets/project may overwrite).
  if (options.globalDirs?.length) {
    results.push(
      await syncGlobalSkills(
        provider,
        cwd,
        options.globalDirs,
        projectSkillsDir,
        options,
        write,
        seenFlatWarningDirs,
      ),
    );
  }
  if (presetSkills) {
    results.push(
      await syncPresetSkills(
        presetSkills,
        provider,
        cwd,
        options,
        provider.paths.skillsDir,
        write,
        undefined,
        seenFlatWarningDirs,
      ),
    );
  }
  // Project skills are last and therefore win on collision.
  results.push(
    await syncSkillsToTool(
      [projectSkillsDir],
      provider,
      cwd,
      undefined,
      options,
      provider.paths.skillsDir,
      write,
      undefined,
      seenFlatWarningDirs,
    ),
  );
  return mergeSkillResults(provider.name, results);
}

/**
 * Sync skills to all configured tools
 * Source: .agents/skills/
 * Holdout tools get copies in their tool-specific dirs.
 * Native skill readers skip copies and read `.agents/skills` directly.
 */
async function projectSkills(
  providers: ToolProvider[],
  cwd: string,
  presetSkills?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
  write = true,
): Promise<SkillSyncResult[]> {
  const projectSkillsDir = path.join(cwd, ".agents", "skills");
  const resolvedOptions = options ?? {};
  const presetNames = presetSkills?.size
    ? await listPresetSkillNames(presetSkills)
    : [];
  // Shared across every provider in this run so a directory scanned by
  // multiple tools (or multiple passes of the same tool) only reports its
  // flat-file warning once — see projectSkillDirectory.
  const seenFlatWarningDirs = new Set<string>();

  return Promise.all(
    providers.map((provider) =>
      provider.capabilities.nativeSkillsDiscovery
        ? syncNativeProviderSkills(
            provider,
            cwd,
            presetSkills,
            presetNames,
            resolvedOptions,
            write,
            seenFlatWarningDirs,
          )
        : syncGeneratedProviderSkills(
            provider,
            cwd,
            projectSkillsDir,
            presetSkills,
            resolvedOptions,
            write,
            seenFlatWarningDirs,
          ),
    ),
  );
}

export async function syncSkills(
  providers: ToolProvider[],
  cwd: string,
  presetSkills?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<SkillSyncResult[]> {
  return projectSkills(providers, cwd, presetSkills, options, true);
}

/** Read-only skill projection used by dry-run. */
export async function previewSkills(
  providers: ToolProvider[],
  cwd: string,
  presetSkills?: Map<string, string[]>,
  options?: SyncOptions & { globalDirs?: string[] },
): Promise<SkillSyncResult[]> {
  return projectSkills(providers, cwd, presetSkills, options, false);
}
