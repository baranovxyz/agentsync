Now I have comprehensive information to answer the user's research questions. Let me compile a detailed report covering all aspects of Claude Code configuration as of October 2025.

## Claude Code Configuration Research (October 2025)

### Official Configuration Structure

Claude Code uses a hierarchical configuration system with these core directories and files:[1][2][3]

**Configuration Files:**

- `.claude/settings.json` - Project settings (checked into git)
- `.claude/settings.local.json` - Local overrides (gitignored)
- `~/.claude/settings.json` - User-level global settings
- `CLAUDE.md` - Memory/instruction files (loaded at startup)
- `.claude/commands/*.md` - Custom slash commands
- `.claude/agents/*.md` - Custom subagent definitions

**Directory Structure:**

```
.claude/
├── settings.json          # Project settings
├── settings.local.json    # Local overrides
├── commands/              # Custom slash commands
│   ├── command1.md
│   └── subdirectory/
│       └── namespaced.md
├── agents/                # Subagent definitions
│   └── agent1.md
└── hooks/                 # Custom hook scripts
```

**Settings Precedence** (highest to lowest):[2][1]

1. Enterprise managed policies (`managed-settings.json`)
2. Command line arguments
3. Local project settings (`.claude/settings.local.json`)
4. Shared project settings (`.claude/settings.json`)
5. User settings (`~/.claude/settings.json`)

### 1. MCP Configuration Format

**Claude Desktop MCP Configuration**[4][5][6][7]

Claude Desktop uses `claude_desktop_config.json` with the `mcpServers` format:

**Location:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

**Format:**

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

**Cursor vs Claude Desktop Differences**[8][9]

- **Claude Desktop**: Uses `mcpServers` in `claude_desktop_config.json`, supports only stdio transport locally[5][4]
- **Cursor**: Uses `mcpServers` in `~/.cursor/mcp.json`, supports SSE transport for remote servers[9][8]
- **VS Code**: Uses nested format `{"mcp": {"servers": {...}}}` in `.vscode/mcp.json`[8]

**Key Limitation**: Claude Desktop does **not** support remote HTTP/SSE servers directly; you must use stdio bridges like `npx mcp-remote` or `nd-mcp`[10][4]

**MCP Specification Version**[11][12]

The current official MCP protocol version is **2025-06-18**. Major changes include:[11]

- Structured tool output support
- OAuth 2.1 authorization for resource servers
- Elicitation (server-requested user input)
- Resource links in tool results
- Removed JSON-RPC batching

Next version scheduled for **November 25, 2025** (RC on November 11)[13][14]

### 2. Additional Claude-Specific Configuration Files

**Beyond documented files, there is NO `.claude/rules/` directory**. The confusion may arise from community experiments, but officially Claude Code supports:[15][1]

- **Memory files**: `CLAUDE.md` (any directory level)
- **Settings files**: `settings.json` variants
- **Commands**: `.claude/commands/*.md`
- **Agents**: `.claude/agents/*.md`
- **Hooks**: Custom scripts referenced in settings

**Enterprise Managed Configurations**:[1][2]

- `managed-settings.json` - Enforced policies (cannot be overridden)
- `managed-mcp.json` - Enforced MCP server configurations

Locations vary by OS (see Settings Precedence above).

### 3. Workspace-Specific Settings Support

**Yes, Claude Code fully supports workspace-specific settings**:[3][2][1]

**Project-Level Settings** (`.claude/settings.json`):

- Shared with team via git
- Configures permissions, environment variables, MCP servers
- Can reference project-specific MCP servers via `.mcp.json`[1]

**Local Project Overrides** (`.claude/settings.local.json`):

- Gitignored by default
- Personal preferences and API keys
- Overrides project settings

**Additional Directories**:[16][17]

```bash
claude --add-dir ../backend-api
# or during session:
/add-dir ../shared-libraries
```

**CLAUDE.md Hierarchical Loading**:[18][19]

- Root directory: `CLAUDE.md` (shared)
- Any parent directory (for monorepos)
- Child directories (loaded on-demand)
- Home folder: `~/.claude/CLAUDE.md` (applies to all sessions)

**MCP Server Project Configurations**:[1]

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["memory", "github"],
  "disabledMcpjsonServers": ["filesystem"]
}
```

### 4. Command File Metadata/Frontmatter

Custom slash commands support **YAML frontmatter** with these fields:[20][21][22][15]

```markdown
---
description: Brief description of the command
argument-hint: [pr-number] [priority] [assignee]
model: claude-3-5-haiku-20241022
allowed-tools: Bash(git add:*), Bash(git status:*)
disable-model-invocation: false
---

Command content with $ARGUMENTS or $1, $2 positional args
```

**Frontmatter Fields**:[22][15]

| Field                      | Purpose                                     | Default                    |
| -------------------------- | ------------------------------------------- | -------------------------- |
| `description`              | Brief command description shown in `/help`  | First line of prompt       |
| `argument-hint`            | Expected arguments format for autocomplete  | None                       |
| `model`                    | Override model for this command             | Inherits from session      |
| `allowed-tools`            | Specific tools this command can use         | Inherits from conversation |
| `disable-model-invocation` | Prevent SlashCommand tool from auto-calling | false                      |

**Special Features**:[15][22]

- **Arguments**: `$ARGUMENTS` (all), `$1`, `$2`... (positional)
- **Bash execution**: `!`git status`` (output included in context)
- **File references**: `@src/file.js`
- **Namespacing**: `.claude/commands/frontend/component.md` → `/component` with "(project:frontend)" label

### 5. Prompt Templates and Context Management

**CLAUDE.md as Prompt Template**[19][23][18]

CLAUDE.md files function as **persistent system-level instructions** with highest adherence:[23][19]

**Instruction Hierarchy**:[19]

1. **CLAUDE.md** - Treated as immutable system rules
2. **User prompts** - Flexible requests within established rules
3. **Process execution** - CLAUDE.md steps followed sequentially

**Best Practices**:[18][23]

- Keep concise (100-200 lines recommended)
- Use hierarchical structure (global → project → subdir)
- Put **nouns** (facts, architecture) in CLAUDE.md
- Put **verbs** (procedures) in slash commands
- Include: build commands, test commands, coding standards, file boundaries

**Dynamic Context Management**:[23]

- `/clear` - Wipe conversation, keep CLAUDE.md
- `/compact [instructions]` - Compress history with summary
- `/context` - Monitor token usage
- Subagents (`.claude/agents/`) - Isolated context windows

**Environment Variables**:[1]

```json
{
  "env": {
    "API_KEY": "value",
    "CUSTOM_VAR": "data"
  }
}
```

Applied to every session automatically.

### 6. Tool/Function Calling Configurations

**Claude API Tool Use Format**[24][25][26]

When using the Claude API (not Claude Code CLI), tools are defined via the `tools` parameter:

```json
{
  "model": "claude-3-5-sonnet-20240620",
  "messages": [...],
  "tools": [
    {
      "name": "tool_name",
      "description": "What the tool does",
      "input_schema": {
        "type": "object",
        "properties": {
          "param": {
            "type": "string",
            "description": "Parameter description"
          }
        },
        "required": ["param"]
      }
    }
  ]
}
```

**Tool Choice Configuration**:[25]

- `auto` - Claude decides whether to use tools
- `any` - Claude must use one of the provided tools
- `tool: {name: "specific_tool"}` - Force specific tool

**Claude Code Tool Permissions**[27][1]

Claude Code has built-in tools requiring permission configuration:

```json
{
  "permissions": {
    "allow": ["Bash(npm run lint)", "Edit", "mcp__github__get_issue"],
    "ask": ["Bash(git push:*)"],
    "deny": ["Read(./.env)", "WebFetch"]
  }
}
```

**MCP Tool Permissions**:[15]

- ✅ `mcp__github` - Approves ALL tools from github server
- ✅ `mcp__github__get_issue` - Specific tool only
- ❌ `mcp__github__*` - Wildcards NOT supported

**Hooks for Tool Execution**:[28][1]

```json
{
  "hooks": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "prettier --write \"$CLAUDE_FILE_PATHS\""
        }
      ]
    }
  ]
}
```

### 7. CLAUDE.md vs AGENTS.md Support

**Current Status (October 2025)**[29][30][31][32][33]

- **CLAUDE.md**: Native format for Claude Code, **officially supported**[18][19][1]
- **AGENTS.md**: Open standard, **NOT natively supported** by Claude Code[34][29]

**AGENTS.md Background**:[33][35][36][37]

- Created July 2025 by Sourcegraph, OpenAI, Google collaboration
- Used by 20,000+ open-source projects
- Supported by: Cursor, Zed, Aider, Gemini CLI, Codex, Jules, Factory
- Simple Markdown format, same concept as CLAUDE.md

**Claude Code AGENTS.md Workarounds**:[30][32][38][29]

**Option 1: Symlink** (Recommended)

```bash
ln -s AGENTS.md CLAUDE.md
```

Single source of truth, both files point to same content[32]

**Option 2: Reference in CLAUDE.md**

```markdown
# CLAUDE.md

@AGENTS.md
```

Loads AGENTS.md inline, allows Claude-specific additions[38][29]

**Option 3: Copy directive**

```markdown
# CLAUDE.md

Follow these rules at all times @AGENTS.md
```

**Feature Request Status**:[29]

- GitHub issue #6235 requesting native AGENTS.md support
- Proposed fallback: Check CLAUDE.md first, then AGENTS.md if not found
- Not yet implemented as of October 2025

**Key Differences**:

| Aspect     | CLAUDE.md                            | AGENTS.md                  |
| ---------- | ------------------------------------ | -------------------------- |
| Support    | Native in Claude Code                | Requires workaround        |
| Ecosystem  | Claude-specific                      | Multi-tool standard        |
| Features   | Can reference subagents, MCP configs | Generic agent instructions |
| Precedence | Higher in instruction hierarchy      | N/A (not natively read)    |

### Documentation Sources Referenced

**Official Anthropic Documentation:**

- Claude Code Settings: https://docs.claude.com/en/docs/claude-code/settings[1]
- Slash Commands: https://docs.claude.com/en/docs/claude-code/slash-commands[15]
- Claude Code Best Practices: https://www.anthropic.com/engineering/claude-code-best-practices[18]

**MCP Specification:**

- Official Site: https://modelcontextprotocol.io[39]
- Current Version: https://modelcontextprotocol.io/specification/2025-06-18[40][11]
- Changelog: https://modelcontextprotocol.io/specification/2025-06-18/changelog[11]
- Connect Local Servers: https://modelcontextprotocol.io/docs/develop/connect-local-servers[5]

**MCPB (MCP Bundles):**

- GitHub Repository: https://github.com/anthropics/mcpb[41]
- Desktop Extensions Announcement: https://www.anthropic.com/engineering/desktop-extensions[42]

**AGENTS.md Standard:**

- Official Site: https://agents.md[37]
- GitHub Repository: https://github.com/openai/agents.md[43]

### Summary

Claude Code as of October 2025 uses a well-structured configuration system centered around `.claude/` directory with `settings.json` files and `CLAUDE.md` memory files. MCP configuration follows the `mcpServers` format in `claude_desktop_config.json` (stdio transport only for Claude Desktop). Command files support rich YAML frontmatter for metadata. While AGENTS.md is gaining industry adoption, Claude Code does not natively support it—users must use symlinks or references. The MCP protocol itself is at version 2025-06-18 with the next major update scheduled for November 2025.

[1](https://docs.claude.com/en/docs/claude-code/settings)
[2](https://www.petefreitag.com/blog/claude-code-permissions/)
[3](https://www.eesel.ai/blog/settings-json-claude-code)
[4](https://learn.netdata.cloud/docs/netdata-ai/mcp/mcp-clients/claude-desktop)
[5](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
[6](https://claudedesktopconfiggenerator.com)
[7](https://help.yourgpt.ai/article/mcp-setup-guide-for-claude-desktop-cursor-and-windsurf-1789)
[8](https://dev.to/darkmavis1980/understanding-mcp-servers-across-different-platforms-claude-desktop-vs-vs-code-vs-cursor-4opk)
[9](https://gofastmcp.com/integrations/mcp-json-configuration)
[10](https://generect.com/blog/claude-mcp/)
[11](https://modelcontextprotocol.io/specification/versioning)
[12](https://www.reddit.com/r/hypeurls/comments/1lez5db/mcp_specification_version_20250618_changes/)
[13](https://modelcontextprotocol.info/blog/mcp-next-version-update/)
[14](http://blog.modelcontextprotocol.io)
[15](https://docs.claude.com/en/docs/claude-code/slash-commands)
[16](https://www.claudelog.com/configuration/)
[17](https://github.com/anthropics/claude-code/issues/3146)
[18](https://www.anthropic.com/engineering/claude-code-best-practices)
[19](https://www.claudelog.com/faqs/what-is-claude-md/)
[20](https://www.eesel.ai/blog/slash-commands-claude-code)
[21](https://github.com/davila7/claude-code-templates/issues/65)
[22](https://stevekinney.com/courses/ai-development/claude-code-commands)
[23](https://www.cometapi.com/managing-claude-codes-context/)
[24](https://composio.dev/blog/claude-function-calling-tools)
[25](https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
[26](https://blog.mlq.ai/claude-function-calling-tools/)
[27](https://docs.claude.com/en/docs/claude-code/iam)
[28](https://www.builder.io/blog/claude-code)
[29](https://github.com/anthropics/claude-code/issues/6235)
[30](https://www.reddit.com/r/GithubCopilot/comments/1nee01w/agentsmd_vs_claudemd/)
[31](https://pnote.eu/notes/agents-md/)
[32](https://www.linkedin.com/pulse/stop-wasting-time-how-one-symlink-command-saved-me-vs-lozovsky-mba-ffsjc)
[33](https://ai.plainenglish.io/agents-md-a-comprehensive-guide-to-agentic-ai-collaboration-571df0e78ccc)
[34](https://www.builder.io/blog/codex-vs-claude-code)
[35](https://www.infoq.com/news/2025/08/agents-md/)
[36](https://research.aimultiple.com/agents-md/)
[37](https://agents.md)
[38](https://news.ycombinator.com/item?id=44830894)
[39](https://modelcontextprotocol.io)
[40](https://modelcontextprotocol.io/specification/2025-06-18)
[41](https://github.com/anthropics/mcpb)
[42](https://www.anthropic.com/engineering/desktop-extensions)
[43](https://github.com/openai/agents.md)
[44](https://github.com/zebbern/claude-code-guide)
[45](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
[46](https://modelcontextprotocol.io/specification/draft/basic/authorization)
[47](https://skywork.ai/blog/ai-agent/claude-desktop-2025-ultimate-guide/)
[48](https://www.stainless.com/mcp/mcp-specification)
[49](https://modelcontextprotocol.io/sdk/java/mcp-server)
[50](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
[51](https://www.siddharthbharath.com/claude-code-the-complete-guide/)
[52](https://kahunam.com/articles/blog/how-to-make-claude-desktop-auto-approve-mcp-tools-a-power-users-guide/)
[53](https://www.reddit.com/r/ClaudeAI/comments/1lf559g/claude_code_directories_and_version_control/)
[54](https://github.com/modelcontextprotocol/modelcontextprotocol)
[55](https://skywork.ai/blog/ai-agent/claude-desktop-plugins-mcp-servers-3-steps-integration-2025/)
[56](https://gist.github.com/markomitranic/26dfcf38c5602410ef4c5c81ba27cce1)
[57](https://blog.langchain.com/how-to-turn-claude-code-into-a-domain-specific-coding-agent/)
[58](https://www.youtube.com/watch?v=oYEqwsqy2UQ)
[59](https://www.reddit.com/r/ClaudeAI/comments/1lr6occ/tip_managing_large_claudemd_files_with_document/)
[60](https://www.youtube.com/watch?v=APIc0erbumc)
[61](https://docs.augmentcode.com/cli/custom-commands)
[62](https://www.claude.com/solutions/agents)
[63](https://en.bioerrorlog.work/entry/claude-code-custom-slash-command)
[64](https://stevekinney.com/courses/ai-development/referencing-files-in-claude-code)
[65](https://aws.plainenglish.io/configuring-claude-code-extension-with-aws-bedrock-and-how-you-can-avoid-my-mistakes-090dbed5215b)
[66](https://skywork.ai/blog/ai-agent/claude-desktop-developer-best-practices-automation-plugins-2025/)
[67](https://www.dailydoseofds.com/p/build-a-shared-memory-for-claude-desktop-and-cursor/)
[68](https://www.reddit.com/r/ClaudeAI/comments/1ivuhs4/how_does_cursor_compare_to_using_claude_desktop/)
[69](https://www.arsturn.com/blog/mcp-clients-explained-a-deep-dive-into-vs-code-claude-and-cursor)
[70](https://www.reddit.com/r/ClaudeAI/comments/1l896ek/claude_code_v1018_we_can_now_specify_additional/)
[71](https://www.reddit.com/r/ClaudeAI/comments/1ji8ruv/my_claude_workflow_guide_advanced_setup_with_mcp/)
[72](https://spknowledge.com/2025/06/06/configure-mcp-servers-on-vscode-cursor-claude-desktop/)
[73](https://github.com/anthropics/claude-code/issues/7671)
[74](https://www.youtube.com/watch?v=bhc9aXYhgzQ)
[75](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables)
[76](https://www.twilio.com/en-us/blog/developers/community/understanding-function-calling-claude-twilio)
[77](https://www.anthropic.com/news/model-context-protocol)
[78](https://www.reddit.com/r/ClaudeAI/comments/1mezb57/claude_code_tips_on_managing_context/)
[79](https://www.youtube.com/watch?v=2HsmNeT8TCg)
[80](https://modelcontextprotocol.io/development/roadmap)
[81](https://gelembjuk.com/blog/post/mcp-server-replace-ai-instructions/)
[82](https://aitmpl.com)
[83](https://claude.ai/public/artifacts/f498a4cc-4c45-481c-a6dd-8e1d196dadb0)
[84](https://www.reddit.com/r/ClaudeAI/comments/182cf79/how_to_use_function_calling_tools_with_claude_21/)
[85](https://www.jetbrains.com/help/junie/model-context-protocol-mcp.html)
[86](https://dev.to/ujjavala/a-week-with-claude-code-lessons-surprises-and-smarter-workflows-23ip)
[87](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-claude-3-tool-use)
[88](https://devcenter.upsun.com/posts/why-your-readme-matters-more-than-ai-configuration-files/)
[89](https://www.elastic.co/search-labs/blog/mcp-current-state)
[90](https://datatracker.ietf.org/doc/draft-jennings-mcp-over-moqt/)
[91](https://skywork.ai/blog/ai-agent/claude-desktop-local-file-access-security-5-controls-2025/)
[92](https://www.reddit.com/r/ClaudeAI/comments/1km9hhp/latest_rules_for_claude_code/)
[93](https://en.bioerrorlog.work/entry/connect-claude-desktop-to-mcp-server)
[94](https://apidog.com/blog/claude-code-multi-directory-support/)
[95](http://89.216.2.122/ietf/)
[96](https://x.com/hackernewstop5/status/1935517626685604290)
[97](https://x.com/betterhn20/status/1935525190248841219)
[98](https://docs.mcp.run/mcp-clients/claude-desktop/)
[99](https://www.claudelog.com/faqs/--add-dir/)
[100](https://packages.altlinux.org/en/sisyphus/packages/Development/?qt=all)
[101](https://github.com/Matt-Dionis/claude-code-configs)
[102](https://www.linkedin.com/posts/jimliddle_claude-desktop-extensions-one-click-mcp-activity-7372355347866472448-_8f-)
[103](https://skywork.ai/blog/ai-agent/extending-claude-desktop-ultimate-guide/)
[104](https://github.com/openai/agents.md/issues/71)
[105](https://htdocs.dev/posts/introducing-claude-your-ultimate-directory-for-claude-code-excellence/)
[106](https://forum.cursor.com/t/add-mcpb-support-for-easy-mcp-server-installation/136168)
[107](https://github.com/hesreallyhim/awesome-claude-code)
[108](https://docs.claude.com/en/docs/claude-code/overview)
[109](https://www.reddit.com/r/ClaudeAI/comments/1nqbhgi/frustrated_with_claude_and_not_sure_what_im_doing/)
