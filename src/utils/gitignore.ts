import type { ToolName } from "../types/index.js";

/**
 * .gitignore patterns per tool (MCP configs only — tool output dirs are committed)
 */
export const TOOL_GITIGNORE_PATTERNS: Record<ToolName, string[]> = {
  claude: [".mcp.json", "CLAUDE.md"],
  opencode: ["opencode.json"],
  cursor: [".cursor/mcp.json"],
  roocode: [".roo/mcp.json"],
  codex: [".codex/config.toml"],
  copilot: [".vscode/mcp.json"],
  cline: [], // MCP is global-only (VS Code storage), no project files to ignore
  gemini: [".gemini/settings.json", "GEMINI.md"],
  amp: [".amp/settings.json"],
  goose: [".goose/config.yaml"],
  aider: [],
  amazonq: [".amazonq/mcp.json"],
  augment: [".augment/settings.json"],
  kiro: [".kiro/settings/mcp.json"],
  openhands: [".openhands/mcp.json"],
  junie: [".junie/mcp/mcp.json"],
  crush: ["crush.json"],
  kilocode: [".kilocode/mcp.json"],
  qwen: [".qwen/.mcp.json"],
};

/**
 * Base patterns (always included)
 */
export const BASE_GITIGNORE_PATTERNS = [
  "",
  "# AgentSync",
  ".agents/backups/",
  "agentsync.local.toml",
];

/**
 * Generate .gitignore content for selected tools
 */
export function generateGitignoreContent(tools: ToolName[]): string {
  const lines: string[] = [...BASE_GITIGNORE_PATTERNS];

  if (tools.length > 0) {
    lines.push("");
    lines.push("# Tool MCP configs (regenerated on sync)");

    for (const tool of tools) {
      const patterns = TOOL_GITIGNORE_PATTERNS[tool];
      if (patterns) {
        lines.push(...patterns);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Check if .gitignore has AgentSync section
 */
export function hasAgentSyncSection(content: string): boolean {
  return content.includes("# AgentSync");
}

/**
 * Find the end of AgentSync section in gitignore.
 * Section ends at next comment line or EOF — fragile but sufficient for our controlled output.
 */
function findAgentSyncSectionEnd(
  lines: string[],
  startLineIdx: number,
): number {
  let endLineIdx = lines.length;
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("# ") && !line.startsWith("# AgentSync")) {
      endLineIdx = i;
      break;
    }

    if (
      !(
        line.startsWith("#") ||
        line.startsWith("!") ||
        line.startsWith(".") ||
        line.startsWith("*")
      )
    ) {
      endLineIdx = i;
      break;
    }
  }

  return endLineIdx;
}

/**
 * Update AgentSync section in existing .gitignore
 */
export function updateAgentSyncSection(
  existingContent: string,
  tools: ToolName[],
): string {
  const agentSyncContent = generateGitignoreContent(tools);

  const lines = existingContent.split("\n");
  let startLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("# AgentSync")) {
      startLineIdx = i;
      break;
    }
  }

  if (startLineIdx === -1) {
    return `${existingContent}\n${agentSyncContent}`;
  }

  const endLineIdx = findAgentSyncSectionEnd(lines, startLineIdx);

  const beforeLines = lines.slice(0, startLineIdx);
  const afterLines = lines.slice(endLineIdx);

  let result = beforeLines.join("\n");
  if (beforeLines.length > 0) {
    result += "\n";
  }
  result += agentSyncContent;
  if (afterLines.length > 0 && afterLines[0].trim()) {
    result += afterLines.join("\n");
  } else if (afterLines.length > 1) {
    result += afterLines.slice(1).join("\n");
  }

  return result;
}
