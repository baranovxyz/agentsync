/**
 * Gitignore Command
 * Updates .gitignore based on current tool configuration
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import picocolors from "picocolors";
import { ConfigError } from "../core/errors.js";
import { validateConfig } from "../types/schemas.js";
import { outputFile, pathExists } from "../utils/fs.js";
import {
  generateGitignoreContent,
  hasAgentSyncSection,
  updateAgentSyncSection,
} from "../utils/gitignore.js";

const pc = picocolors;

export async function updateGitignore(): Promise<void> {
  console.log(pc.blue("🔄 Updating .gitignore...\n"));

  const configPath = path.join(process.cwd(), ".agentsync", "config.json");

  if (!(await pathExists(configPath))) {
    throw new ConfigError(
      "AgentSync configuration not found",
      configPath,
      'Run "agentsync init" to initialize AgentSync',
    );
  }

  const configContent = await readFile(configPath, "utf-8");
  const config = validateConfig(JSON.parse(configContent));
  const tools = config.tools || [];

  const gitignorePath = path.join(process.cwd(), ".gitignore");

  let content = "";
  if (await pathExists(gitignorePath)) {
    content = await readFile(gitignorePath, "utf-8");
  }

  if (hasAgentSyncSection(content)) {
    content = updateAgentSyncSection(content, tools);
    await outputFile(gitignorePath, content);
    console.log(pc.green("✓ Updated .gitignore (AgentSync section)"));
  } else {
    const agentSyncContent = generateGitignoreContent(tools);
    content += `\n${agentSyncContent}`;
    await outputFile(gitignorePath, content);
    console.log(pc.green("✓ Added AgentSync section to .gitignore"));
  }

  console.log(pc.gray(`  Tools: ${tools.join(", ") || "none"}`));
  console.log();
}
