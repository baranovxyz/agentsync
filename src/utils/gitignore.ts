import type { ToolName } from "../types/index.js";

/**
 * .gitignore patterns per tool (MCP configs only — tool output dirs are committed)
 */
export const TOOL_GITIGNORE_PATTERNS: Record<ToolName, string[]> = {
  claude: [".mcp.json", "CLAUDE.md"],
  opencode: ["opencode.json"],
  cursor: [".cursor/mcp.json"],
  roocode: [".roo/mcp.json"],
  codex: [".codex/config.toml", ".codex/.agentsync-ownership.json"],
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
  droid: [".factory/mcp.json"],
  pi: [], // Pi ships no MCP client — nothing generated to ignore
  vibe: [".vibe/config.toml"],
};

/**
 * Base patterns (always included)
 */
export const BASE_GITIGNORE_PATTERNS = [
  "",
  "# AgentSync",
  "agentsync.local.toml",
];

/**
 * Comment line AgentSync writes right before the per-tool entries. Part of
 * the managed block, not a foreign section — `findAgentSyncSectionEnd`'s
 * legacy fallback must recognize it as ours (see `OWN_COMMENT_LINES`).
 */
const TOOL_PATTERNS_HEADER = "# Tool MCP configs (regenerated on sync)";

/**
 * Literal line every block written by this version ends with. Its presence
 * makes the section boundary an exact string match, independent of what any
 * entry inside the block looks like — see `findAgentSyncSectionEnd`.
 */
const SECTION_END_MARKER = "# End AgentSync managed block";

/**
 * Comment lines AgentSync itself writes inside the managed block. Used only
 * by the legacy (no end-marker) fallback to tell "our" sub-headers apart
 * from a genuinely foreign section — never to infer anything about an
 * entry's syntax.
 */
const OWN_COMMENT_LINES = new Set<string>([
  "# AgentSync",
  TOOL_PATTERNS_HEADER,
]);

/**
 * Generate .gitignore content for selected tools
 */
export function generateGitignoreContent(tools: ToolName[]): string {
  const lines: string[] = [...BASE_GITIGNORE_PATTERNS];

  if (tools.length > 0) {
    lines.push("");
    lines.push(TOOL_PATTERNS_HEADER);

    for (const tool of tools) {
      const patterns = TOOL_GITIGNORE_PATTERNS[tool];
      if (patterns) {
        lines.push(...patterns);
      }
    }
  }

  lines.push(SECTION_END_MARKER);

  return `${lines.join("\n")}\n`;
}

/**
 * Check if .gitignore has AgentSync section
 */
export function hasAgentSyncSection(content: string): boolean {
  return content.includes("# AgentSync");
}

/**
 * Find the end of the AgentSync-managed section in an existing .gitignore.
 *
 * The block's own entries are arbitrary tool-owned filenames, several of
 * them bare (`CLAUDE.md`, `agentsync.local.toml`, `opencode.json`, ...), and
 * the block's own sub-header (`TOOL_PATTERNS_HEADER`) is itself a `# `
 * comment line. A boundary rule that infers anything from an entry's syntax
 * — a leading `.`, `!`, `*`, or `#` — is therefore wrong by construction:
 * it stops on the first bare filename, or on the block's own sub-header,
 * long before the block actually ends. That was the bug (no
 * fragile guards over a shape we don't need to guess at).
 *
 * Two-tier rule instead:
 *
 * 1. Primary — every block this version writes ends with the literal
 *    `SECTION_END_MARKER` line. When present, that line alone defines the
 *    boundary exactly, regardless of what the entries above it look like.
 * 2. Fallback (migration only) — a block written before the marker existed
 *    has none. We bound it structurally, using only the comment literals
 *    AgentSync itself writes (`OWN_COMMENT_LINES`: the section header and
 *    the tool-patterns sub-header) plus blank-line structure: the boundary
 *    is the next `# ` comment line that is not one of ours, or a blank line
 *    whose following non-blank content is not one of ours either. This
 *    mirrors ordinary .gitignore hygiene (sections separated by a blank
 *    line and/or a comment) and never inspects an entry's own syntax. Once
 *    a repo goes through one `init`/`sync` under this version, its block
 *    carries the marker and this fallback never runs for it again.
 */
function findAgentSyncSectionEnd(
  lines: string[],
  startLineIdx: number,
): number {
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === SECTION_END_MARKER) {
      return i + 1;
    }
  }

  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      const next = lines.slice(i + 1).find((l) => l.trim().length > 0);
      if (next === undefined || !OWN_COMMENT_LINES.has(next.trim())) {
        return i;
      }
      continue;
    }

    if (line.startsWith("# ") && !OWN_COMMENT_LINES.has(line)) {
      return i;
    }
  }

  return lines.length;
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
    return joinAroundBlock(lines, agentSyncContent, []);
  }

  const endLineIdx = findAgentSyncSectionEnd(lines, startLineIdx);

  return joinAroundBlock(
    lines.slice(0, startLineIdx),
    agentSyncContent,
    lines.slice(endLineIdx),
  );
}

/**
 * Assemble `before` + managed block + `after` so that repeated applications
 * are byte-identical. The block owns its leading blank line (the first entry
 * of `BASE_GITIGNORE_PATTERNS`), so any blank lines the previous write left
 * directly above it are the same separator and are folded into it — that is
 * the only edit ever made to user content. Everything after the block is
 * kept verbatim; the block already ends with a newline.
 */
function joinAroundBlock(
  before: string[],
  agentSyncContent: string,
  after: string[],
): string {
  let end = before.length;
  while (end > 0 && before[end - 1].trim() === "") {
    end--;
  }
  const userBefore = before.slice(0, end);

  const block =
    userBefore.length > 0
      ? agentSyncContent
      : agentSyncContent.replace(/^\n/, "");

  let result = userBefore.join("\n");
  if (userBefore.length > 0) {
    result += "\n";
  }
  result += block;
  result += after.join("\n");

  return result;
}
