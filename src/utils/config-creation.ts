import * as path from "node:path";
import { DEFAULT_TOOLS } from "../constants.js";
import type { ToolName } from "../types/index.js";
import type { AgentSyncConfig } from "../types/schemas.js";
import { outputFile } from "./fs.js";
import { assertSafeProjectOutputPath } from "./project-output.js";

export function generateTomlConfig(tools: ToolName[]): string {
  const toolsList = tools.map((t) => `"${t}"`).join(", ");
  return `tools = [${toolsList}]\n`;
}

export function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, ".agents", "agentsync.toml");
}

export async function ensureProjectConfig(
  cwd?: string,
  options?: { tools?: ToolName[] },
): Promise<AgentSyncConfig> {
  const workDir = cwd || process.cwd();
  const configPath = getProjectConfigPath(workDir);
  const tools = options?.tools || [...DEFAULT_TOOLS];
  await assertSafeProjectOutputPath(workDir, configPath);
  await outputFile(configPath, generateTomlConfig(tools), {
    encoding: "utf-8",
  });

  return { tools };
}
