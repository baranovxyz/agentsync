import { chmod, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import picocolors from "picocolors";
import {
  parseProjectTomlConfig,
  tomlToInternalConfig,
} from "../config/toml-loader.js";
import type { AgentSyncTomlConfig } from "../config/types.js";
import { DEFAULT_TOOLS, SUPPORTED_TOOLS } from "../constants.js";
import {
  ConfigError,
  FileSystemError,
  getErrorMessage,
} from "../core/errors.js";
import type { InitOptions, ToolName } from "../types/index.js";
import { cliResult, type InitData, jsonStringify } from "../types/output.js";
import { ToolNameSchema } from "../types/schemas.js";
import {
  ensureProjectConfig,
  getProjectConfigPath,
} from "../utils/config-creation.js";
import { ensureDir, outputFile, pathExists } from "../utils/fs.js";
import {
  generateGitignoreContent,
  hasAgentSyncSection,
  updateAgentSyncSection,
} from "../utils/gitignore.js";
import { assertSafeProjectOutputPath } from "../utils/project-output.js";

const pc = picocolors;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findAncestorContaining(
  startDir: string,
  entryName: string,
): Promise<string | null> {
  let current = startDir;
  const root = path.parse(current).root;
  while (current !== root) {
    if (await pathExists(path.join(current, entryName))) return current;
    current = path.dirname(current);
  }
  return null;
}

async function findPackageRoot(startDir: string): Promise<string> {
  const packageRoot = await findAncestorContaining(startDir, "package.json");
  if (packageRoot) return packageRoot;
  throw new FileSystemError(
    "Could not find package.json in any parent directory",
    startDir,
    new Error("Traversed to filesystem root without finding package.json"),
  );
}

function getPackageRootViaRequire(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("agentsync/package.json");
    return path.dirname(packageJsonPath);
  } catch {
    return null;
  }
}

const DEFAULT_TEMPLATE = "default.md";
const AGENTS_SUBDIRECTORIES = ["skills", "commands", "agents", "rules"];
type Log = (message: string) => void;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Command installed by `init` in the repository's post-merge hook. */
export const POST_MERGE_HOOK_COMMAND = "npx agentsync sync 2>/dev/null || true";
export const POST_MERGE_HOOK_MARKER =
  "# AgentSync: auto-sync tool configs after pull";
const POST_MERGE_HOOK_BLOCK = `${POST_MERGE_HOOK_MARKER}\n${POST_MERGE_HOOK_COMMAND}\n`;

type HookUpdateAction = "created" | "appended" | "unchanged";

/** Project the current AgentSync command without rewriting prior hook content. */
export function projectPostMergeHook(existing?: string): {
  action: HookUpdateAction;
  content: string;
} {
  if (existing === undefined) {
    return {
      action: "created",
      content: `#!/bin/sh\n${POST_MERGE_HOOK_BLOCK}`,
    };
  }

  if (existing.includes(POST_MERGE_HOOK_COMMAND)) {
    return { action: "unchanged", content: existing };
  }

  return {
    action: "appended",
    content: `${existing}\n${POST_MERGE_HOOK_BLOCK}`,
  };
}

async function readProjectConfig(
  configPath: string,
): Promise<AgentSyncTomlConfig> {
  return parseProjectTomlConfig(
    await readFile(configPath, "utf-8"),
    configPath,
  );
}

async function showCurrentStatus(
  cwd: string,
  projectConfig: AgentSyncTomlConfig,
): Promise<void> {
  console.log(pc.cyan("✓ AgentSync is already initialized\n"));
  const agentsMdExists = await pathExists(path.join(cwd, "AGENTS.md"));
  const config = tomlToInternalConfig(projectConfig);
  const mcpCount = Object.keys(config.mcp ?? {}).length;
  const tools = config.tools ?? [];

  console.log(pc.bold("Current setup:"));
  console.log(
    pc.gray("  AGENTS.md sync: "),
    agentsMdExists ? pc.green("✓ Configured") : pc.yellow("✗ Not set up"),
  );
  console.log(
    pc.gray("  MCP servers:    "),
    mcpCount > 0
      ? pc.green(`✓ ${mcpCount} server${mcpCount !== 1 ? "s" : ""} configured`)
      : pc.yellow("✗ Not configured"),
  );
  console.log(
    pc.gray("  Tools syncing:  "),
    tools.length > 0 ? pc.green(tools.join(", ")) : pc.gray("None"),
  );

  console.log();
  console.log(pc.bold("What you can do:"));
  if (mcpCount === 0) {
    console.log(
      pc.gray("  • Add an MCP server:  ") +
        pc.cyan(
          'agentsync config add mcp github --mcp-config \'{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}\'',
        ),
    );
  } else {
    console.log(
      pc.gray("  • Apply changes:       ") + pc.cyan("agentsync sync"),
    );
  }
  console.log(
    pc.gray("  • List MCP servers:   ") + pc.cyan("agentsync config ls mcp"),
  );
  console.log();
}

async function resolvePackageRoot(): Promise<string> {
  try {
    return await findPackageRoot(__dirname);
  } catch {
    const packageRoot = getPackageRootViaRequire();
    if (packageRoot) return packageRoot;
    throw new FileSystemError(
      "Could not locate agentsync package root directory",
      __dirname,
      new Error("All package root detection strategies failed"),
    );
  }
}

async function createAgentsMd(cwd: string, log?: Log): Promise<void> {
  log?.(pc.gray("  Creating AGENTS.md from default template..."));
  const packageRoot = await resolvePackageRoot();
  const templatePath = path.join(packageRoot, "templates", DEFAULT_TEMPLATE);
  const targetPath = path.join(cwd, "AGENTS.md");
  await assertSafeProjectOutputPath(cwd, targetPath);

  try {
    await outputFile(targetPath, await readFile(templatePath, "utf-8"));
    log?.(pc.green("  ✓ Created AGENTS.md"));
  } catch (error) {
    const templateError = asError(error);
    const message = [
      "Failed to create AGENTS.md from template",
      `  Template path: ${templatePath}`,
      `  Package root: ${packageRoot}`,
      `  Template exists: ${await pathExists(templatePath)}`,
      `  Error: ${templateError.message}`,
    ].join("\n");
    throw new FileSystemError(message, templatePath, templateError);
  }
}

async function createAgentsDir(
  cwd: string,
  tools: ToolName[],
  log?: Log,
): Promise<void> {
  log?.(pc.gray("  Creating .agents directory..."));
  const agentsDir = path.join(cwd, ".agents");
  await assertSafeProjectOutputPath(cwd, getProjectConfigPath(cwd));

  try {
    const directories = [
      agentsDir,
      ...AGENTS_SUBDIRECTORIES.map((name) => path.join(agentsDir, name)),
    ];
    for (const directory of directories) {
      await ensureDir(directory);
    }
    await ensureProjectConfig(cwd, { tools });
    log?.(pc.green("  ✓ Created .agents directory"));
  } catch (error) {
    throw new FileSystemError(
      "Failed to create .agents directory",
      agentsDir,
      asError(error),
    );
  }
}

async function findGitDir(cwd: string): Promise<string | null> {
  const repositoryRoot = await findAncestorContaining(cwd, ".git");
  return repositoryRoot ? path.join(repositoryRoot, ".git") : null;
}

const HOOK_ACTION_VERB: Record<
  Exclude<HookUpdateAction, "unchanged">,
  string
> = {
  created: "Created",
  appended: "Appended agentsync sync to existing",
};

/** Install or update AgentSync's block in the nearest post-merge hook. */
export async function installGitHook(cwd: string, log?: Log): Promise<void> {
  log?.(pc.gray("  Installing post-merge git hook..."));
  try {
    const gitDir = await findGitDir(cwd);
    if (!gitDir) {
      log?.(pc.yellow("  ⚠ No .git directory found, skipping git hook"));
      return;
    }

    const hooksDir = path.join(gitDir, "hooks");
    const hookPath = path.join(hooksDir, "post-merge");
    await assertSafeProjectOutputPath(gitDir, hooksDir);
    await ensureDir(hooksDir);
    await assertSafeProjectOutputPath(gitDir, hookPath);

    const existing = (await pathExists(hookPath))
      ? await readFile(hookPath, "utf-8")
      : undefined;
    const update = projectPostMergeHook(existing);
    if (update.action === "unchanged") {
      log?.(pc.green("  ✓ post-merge hook already has agentsync sync"));
      return;
    }

    await outputFile(hookPath, update.content);
    await chmod(hookPath, 0o755);
    log?.(
      pc.green(`  ✓ ${HOOK_ACTION_VERB[update.action]} post-merge git hook`),
    );
  } catch (error) {
    log?.(
      pc.yellow(`  ⚠ Could not install git hook: ${getErrorMessage(error)}`),
    );
  }
}

async function updateGitignore(
  cwd: string,
  tools: ToolName[],
  log?: Log,
): Promise<void> {
  log?.(pc.gray("  Updating .gitignore..."));
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    await assertSafeProjectOutputPath(cwd, gitignorePath);
    const existing = (await pathExists(gitignorePath))
      ? await readFile(gitignorePath, "utf-8")
      : "";
    const hasSection = hasAgentSyncSection(existing);
    const content = hasSection
      ? updateAgentSyncSection(existing, tools)
      : `${existing}\n${generateGitignoreContent(tools)}`;
    await outputFile(gitignorePath, content);
    const suffix = hasSection ? " (AgentSync section)" : "";
    log?.(pc.green(`  ✓ Updated .gitignore${suffix}`));
  } catch (error) {
    log?.(
      pc.yellow(`  ⚠ Could not update .gitignore: ${getErrorMessage(error)}`),
    );
  }
}

async function performInit(
  cwd: string,
  tools: ToolName[],
  log?: Log,
): Promise<InitData> {
  const configPath = getProjectConfigPath(cwd);
  const agentsPath = path.join(cwd, "AGENTS.md");
  await assertSafeProjectOutputPath(cwd, configPath);

  if (await pathExists(agentsPath)) {
    log?.(pc.green("  ✓ Using existing AGENTS.md"));
  } else {
    await createAgentsMd(cwd, log);
  }
  await createAgentsDir(cwd, tools, log);
  await updateGitignore(cwd, tools, log);
  await installGitHook(cwd, log);
  return { action: "created", configPath, tools };
}

function selectedTools(options: InitOptions): ToolName[] {
  const result = ToolNameSchema.array().safeParse(
    options.tools ?? [...DEFAULT_TOOLS],
  );
  if (result.success) return result.data;
  throw new ConfigError(
    `Invalid init tool selection: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
    undefined,
    `Valid tools: ${SUPPORTED_TOOLS.join(", ")}`,
  );
}

async function executeJson(options: InitOptions, cwd: string): Promise<void> {
  const configPath = getProjectConfigPath(cwd);
  let data: InitData;
  if (await pathExists(configPath)) {
    const config = tomlToInternalConfig(await readProjectConfig(configPath));
    data = {
      action: "already_initialized",
      configPath,
      tools: config.tools ?? [],
    };
  } else {
    data = await performInit(cwd, selectedTools(options));
  }
  console.log(jsonStringify(cliResult("init", data), options.pretty));
}

async function executeHuman(options: InitOptions, cwd: string): Promise<void> {
  console.log(pc.blue("🚀 Initializing AgentSync...\n"));
  const configPath = getProjectConfigPath(cwd);
  if (await pathExists(configPath)) {
    await showCurrentStatus(cwd, await readProjectConfig(configPath));
    return;
  }

  await performInit(cwd, selectedTools(options), console.log);
  console.log(pc.green("\n✅ AgentSync initialized successfully!\n"));
  console.log(pc.gray("Next steps:"));
  console.log(pc.gray("  1. Edit AGENTS.md to match your project"));
  console.log(
    pc.gray("  2. Run ") +
      pc.cyan("agentsync sync") +
      pc.gray(" to generate tool configs"),
  );
  console.log(pc.gray("  3. (Optional) Set up MCP servers:"));
  console.log(
    pc.gray("     - Run ") +
      pc.cyan("agentsync config add mcp <name> --mcp-config '{...}'") +
      pc.gray(" to add MCPs"),
  );
}

async function executeInit(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  return options.json ? executeJson(options, cwd) : executeHuman(options, cwd);
}

export async function init(options: InitOptions): Promise<void> {
  return executeInit(options);
}
