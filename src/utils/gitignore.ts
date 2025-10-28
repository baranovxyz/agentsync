import type { ToolName } from "../types/index.js";

/**
 * .gitignore patterns per tool (outputs only)
 */
export const TOOL_GITIGNORE_PATTERNS: Record<ToolName, string[]> = {
  cursor: [".cursor/rules/", ".cursor/commands/", ".cursor/mcp.json"],
  claude: [
    ".claude/rules/",
    ".claude/commands/",
    ".claude/mcp.json",
    "CLAUDE.md",
  ],
  cline: [
    ".clinerules/*.md",
    ".clinerules/AGENTS.md",
    "cline_mcp_settings.json",
  ],
  roocode: [".roo/mcp.json"],
};

/**
 * Base patterns (always included)
 */
export const BASE_GITIGNORE_PATTERNS = [
  "",
  "# AgentSync",
  ".agentsync/logs/",
  ".agentsync/cache/",
  ".agentsync/backups/",
  "*.backup",
  "agentsync.local.json",
];

/**
 * Patterns to preserve
 */
export const PRESERVE_PATTERNS = [
  "",
  "# Keep project custom rules",
  "!.agentsync/rules/",
  "!.agentsync/commands/",
];

/**
 * Generate .gitignore content for selected tools
 */
export function generateGitignoreContent(tools: ToolName[]): string {
  const lines: string[] = [...BASE_GITIGNORE_PATTERNS];

  if (tools.length > 0) {
    lines.push("");
    lines.push("# Tool outputs (regenerated on sync)");

    for (const tool of tools) {
      const patterns = TOOL_GITIGNORE_PATTERNS[tool];
      if (patterns) {
        lines.push(...patterns);
      }
    }
  }

  lines.push(...PRESERVE_PATTERNS);

  return `${lines.join("\n")}\n`;
}

/**
 * Check if .gitignore has AgentSync section
 */
export function hasAgentSyncSection(content: string): boolean {
  return content.includes("# AgentSync");
}

/**
 * Find the end of AgentSync section in gitignore
 */
function findAgentSyncSectionEnd(
  lines: string[],
  startLineIdx: number,
): number {
  let endLineIdx = lines.length;
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Empty lines between sections are OK
    if (!line) {
      continue;
    }

    // Another comment section starts (new section)
    if (line.startsWith("# ") && !line.startsWith("# AgentSync")) {
      endLineIdx = i;
      break;
    }

    // Non-pattern content (assume end of gitignore patterns)
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

  const agentSyncStart = existingContent.indexOf("# AgentSync");

  if (agentSyncStart === -1) {
    return `${existingContent}\n${agentSyncContent}`;
  }

  // Find which line the "# AgentSync" comment is on
  const lines = existingContent.split("\n");
  let startLineIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("# AgentSync")) {
      startLineIdx = i;
      break;
    }
  }

  // Find end of AgentSync section
  const endLineIdx = findAgentSyncSectionEnd(lines, startLineIdx);

  // Reconstruct: before AgentSync + new content + after AgentSync
  const beforeLines = lines.slice(0, startLineIdx);
  const afterLines = lines.slice(endLineIdx);

  // Join, ensuring proper newlines
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
