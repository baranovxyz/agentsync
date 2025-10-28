# RooCode Configuration Research (October 2025)

I've completed comprehensive research on RooCode's configuration system and created a detailed structured document for you. Here are the key findings:

## Critical Clarification

**RooCode is NOT a VSCode fork** - it's a VSCode **extension**. This is important for understanding its architecture and configuration approach.[1][2][3]

## Complete `.roo/` Directory Configuration

RooCode uses a well-structured configuration system:

### Confirmed Configuration Structure

**Project Level:**

- `.roo/rules/*.md` - General workspace rules (all modes)[2]
- `.roo/rules-{modeSlug}/*.md` - Mode-specific rules[4][2]
- `.roo/commands/*.md` - Slash commands with YAML frontmatter[5]
- `.roo/mcp.json` - Project-level MCP server configuration[6]

**Global Level:**

- `~/.roo/rules/` - Global rules across all projects[2]
- `~/.roo/rules-{modeSlug}/` - Global mode-specific rules[2]
- `~/.roo/commands/` - Global slash commands[5]

**Extension Storage:**

- `custom_modes.yaml` (preferred) or `custom_modes.json`[4]
- `mcp_settings.json` for MCP servers[6]

### AGENTS.md Native Support ✅

RooCode has **native support for AGENTS.md** as of July 2025:[7][8]

- Location: Project root (`AGENTS.md` or fallback `AGENT.md`)
- **No symlink needed** - direct file reading
- Auto-loaded by default (disable via `roo-cline.useAgentRules: false`)
- Cross-tool compatible with Aider, Cline, GitHub Copilot, etc.
- Plain Markdown format (no frontmatter)

## Frontmatter/Metadata Support

### Rules Files

**No frontmatter** - Plain markdown/text only[2]

- Loaded alphabetically from directories
- Recursive reading with symlink support (max depth: 5)

### Command Files

**YAML frontmatter supported**:[5]

```yaml
---
description: Brief description for UI
argument-hint: <param1> <param2>
---
```

**Supported fields:**

- `description` (optional) - Shows in command menu
- `argument-hint` (optional) - Shows expected parameters

## MCP Configuration Schema

### Complete `.roo/mcp.json` Schema

**STDIO Transport (Local):**[6]

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "cwd": "/optional/working/directory",
      "env": {
        "API_KEY": "value",
        "VAR": "${env:SYSTEM_VAR}"
      },
      "alwaysAllow": ["tool1", "tool2"],
      "disabled": false
    }
  }
}
```

**Streamable HTTP (Modern Remote):**[6]

```json
{
  "type": "streamable-http",
  "url": "https://server.com/mcp",
  "headers": { "X-API-Key": "token" },
  "alwaysAllow": ["tool1"],
  "disabled": false
}
```

**SSE (Legacy Remote):**[6]

```json
{
  "type": "sse",
  "url": "https://server.com/base",
  "headers": { "Authorization": "Bearer token" }
}
```

### MCP Extensions

- Environment variable interpolation: `${env:VAR_NAME}`[6]
- Runtime version managers (mise, asdf) support[6]
- Platform-specific configurations (Windows uses `cmd /c`)

## Custom Modes Configuration

### Complete Schema

**Locations:**

- Global: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/custom_modes.yaml`
- Project: `.roomodes` (YAML or JSON)

**All Available Fields:**[4]

| Field                | Type   | Required | Description                           |
| -------------------- | ------ | -------- | ------------------------------------- |
| `slug`               | string | Yes      | Unique ID (`/^[a-zA-Z0-9-]+$/`)       |
| `name`               | string | Yes      | Display name (can include emojis)     |
| `description`        | string | Optional | Short UI summary (mode selector)      |
| `roleDefinition`     | string | Yes      | Detailed mode personality             |
| `whenToUse`          | string | Optional | Orchestration/mode selection guidance |
| `customInstructions` | string | Optional | Additional behavioral rules           |
| `groups`             | array  | Yes      | Tool access + file restrictions       |
| `apiConfiguration`   | object | Optional | Model params (temperature, etc.)      |
| `source`             | string | Auto     | Auto-added: `"global"` or `"project"` |

**Available Tool Groups:**

- `"read"` - File reading
- `"edit"` - File editing (all files or restricted)
- `"browser"` - Browser automation
- `"command"` - Terminal execution
- `"mcp"` - MCP server tools

**File Restrictions:**

```yaml
groups:
  - read
  - - edit
    - fileRegex: \.(js|ts)$
      description: JS/TS files only
  - command
```

## Unique RooCode Features

### vs Base VSCode

**RooCode-Specific (Not in VSCode):**

- `.roo/` directory structure
- Custom modes system (YAML/JSON)
- MCP server integration
- AGENTS.md support
- Slash commands with frontmatter
- Task orchestration (Orchestrator mode)
- Checkpoint/rollback system
- Mode-specific rules directories

### Workspace Settings Relationship

**Separation:**

- `.vscode/settings.json` → Editor preferences, extension toggles
- `.roo/` configs → AI behavior, rules, modes, commands

**No conflicts** - They operate independently and can both be version-controlled.

## Context Management

**Advanced Features:**[2]

- `@file`, `@folder`, `@/folder/` context mentions
- Smart tools (list_files, read_file, execute_command, use_mcp_tool)
- Checkpoint system for state rollbacks
- Message-level task management

## Security & Permissions

**File Restrictions:**[4]

- Regex-based file access control per mode
- `FileRestrictionError` when violations occur

**Auto-Approval:**[6]

- MCP tools: Per-tool via `alwaysAllow` array
- Requires global "Use MCP servers" approval enabled

**API Key Storage:**[9]

- Stored in extension global storage
- ⚠️ **Export includes plaintext keys** - handle securely

## Key Insights for AgentSync

Based on this research, RooCode demonstrates:

1. **Mature directory-based configuration** - `.roo/` with clear scope separation
2. **Multiple format support** - YAML (preferred), JSON, Markdown
3. **Cross-tool standards** - AGENTS.md for interoperability
4. **Metadata flexibility** - YAML frontmatter for commands only
5. **Clear precedence rules** - Project > Global, Directory > File
6. **MCP as extensibility layer** - Standard protocol for tool integration

The document has been saved and is available for download.

[1](https://docs.roocode.com/getting-started/installing)
[2](https://docs.roocode.com/features/custom-instructions)
[3](https://github.com/RooCodeInc/Roo-Code)
[4](https://docs.roocode.com/features/custom-modes)
[5](https://docs.roocode.com/features/slash-commands)
[6](https://docs.roocode.com/features/mcp/using-mcp-in-roo)
[7](https://github.com/RooCodeInc/Roo-Code/issues/5966)
[8](https://agents.md)
[9](https://docs.roocode.com/features/settings-management)
[10](https://git.pratiknarola.com/nikhilmundra/RooPrompts/src/commit/eb26f4c714063a546294eaa322071741500cdc95/roo.md)
[11](https://relax.ai/docs/integrations/developer-productivity-tools/roocode)
[12](https://brightdata.com/blog/ai/roo-code-with-web-mcp)
[13](https://www.reddit.com/r/RooCode/comments/1kcp8pj/where_is_the_roo_code_configuration_file_located/)
[14](https://docs.z.ai/devpack/tool/roo)
[15](https://docs.roocode.com/providers/vscode-lm)
[16](https://github.com/RooCodeInc/Roo-Code/discussions/2083)
[17](https://docs.aimlapi.com/integrations/roo-code)
[18](https://www.linkedin.com/pulse/my-settings-agentic-coding-roo-code-reuven-cohen-0l44c)
[19](https://voice-mode.readthedocs.io/en/latest/integrations/roo-code/)
[20](https://www.datacamp.com/tutorial/roo-code)
[21](https://www.reddit.com/r/RooCode/comments/1o1t7n0/which_is_better_in_october_2025_for_serious_ai/)
[22](https://docs.cognee.ai/cognee-mcp/integrations/roo-code)
[23](https://github.com/RooCodeInc/Roo-Code-Docs)
[24](https://github.com/alarno/Roo-Code)
[25](https://www.youtube.com/watch?v=hRxjMTyB-GA)
[26](https://www.reddit.com/r/RooCode/comments/1judq3s/is_there_any_way_to_get_rooclaude_to_be_more/)
[27](https://gofastmcp.com/integrations/mcp-json-configuration)
[28](https://skywork.ai/skypage/en/master-ai-agents-custom-modes/1981536096260120576)
[29](https://www.reddit.com/r/RooCode/comments/1jbshmh/roo_code_doesnt_know_what_terminal_folder_its_in/)
[30](https://apidog.com/blog/mcp-server-roo-code/)
[31](https://www.reddit.com/r/RooCode/comments/1mc49ds/agentsmd_please_critique/)
[32](https://www.linkedin.com/pulse/integrating-terminal-commands-roo-code-workflows-james-barnes-ok4kf)
[33](https://github.com/ccc0168/modes-mcp-server)
[34](https://blog.stackademic.com/meet-roo-code-your-new-ai-coding-partner-1127c7551cef)
[35](https://docs.roocode.com/tips-and-tricks)
[36](https://docs.roocode.com/advanced-usage/available-tools/use-mcp-tool)
[37](https://www.linkedin.com/pulse/from-solo-ai-super-team-building-software-agent-swarm-zohar-babin-xtfqf)
[38](https://github.com/RooCodeInc/Roo-Code/issues/4183)
[39](https://github.com/RooCodeInc/Roo-Code/issues/7621)
[40](https://www.youtube.com/watch?v=PE-0P6SAZYc)
[41](https://code.visualstudio.com/docs/configure/settings)
[42](https://github.com/RooCodeInc/Roo-Code/issues/4792)
[43](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
[44](https://www.youtube.com/watch?v=eEJErgZBqLE)
[45](https://docs.roocode.com/advanced-usage/available-tools/list-files)
[46](https://github.com/RooCodeInc/Roo-Code/discussions/6147)
[47](https://github.com/RooCodeInc/Roo-Code/issues/5512)
[48](https://github.com/RooCodeInc/Roo-Code/issues/4029)
[49](https://www.reddit.com/r/RooCode/comments/1l7v23t/managing_roo_modes_rules_between_projects/)
[50](https://www.reddit.com/r/RooCode/comments/1idwwlk/where_are_roocode_settings_stored/)
[51](https://docs.roocode.com/features/marketplace)
[52](https://github.com/RooCodeInc/Roo-Code/issues/2216)
[53](https://www.linkedin.com/pulse/boomerang-tasks-automating-code-development-roo-sparc-reuven-cohen-nr3zc)
[54](https://github.com/RooCodeInc/Roo-Code/issues/5938)
[55](https://github.com/RooCodeInc/Roo-Code/discussions/7111)
[56](https://gist.github.com/iamhenry/7e9375756dcf4609ec91d8f57b9169dc)
[57](https://docs.roocode.com/advanced-usage/available-tools/switch-mode)
[58](https://www.reddit.com/r/RooCode/comments/1ioyp4j/proposal_roocode_community_github_repository_for/)
[59](https://www.youtube.com/watch?v=qgqceCuhlRA)
[60](https://github.com/RooCodeInc/Roo-Code/issues/4732)
[61](https://www.thisdot.co/blog/roo-custom-modes)
[62](https://www.reddit.com/r/RooCode/comments/1jm48o1/simplified_roo_flow_with_orchestrator_mode/)
[63](https://gitlab.codeconductor.ai/jeremy/Roo-Code/-/blob/v3.15.3/CHANGELOG.md)
[64](https://playbooks.com/mcp/roovet-custom-behavioral-modes)
[65](https://www.reddit.com/r/RooCode/)
[66](https://github.com/jtgsystems/Custom-Modes-Roo-Code)
[67](https://qiita.com/straygizmo/items/706778f8ddd3d59f0f87)
[68](https://www.reddit.com/r/RooCode/comments/1lagw86/my_custom_modes/)
[69](https://github.com/RooCodeInc/Roo-Code/issues/2208)
[70](https://www.tanyongsheng.com/blog/automating-a-data-science-project-with-roocode-and-github-copilot-step-by-step-guide/)
[71](https://github.com/enescingoz/roocode-workspace)
[72](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)
[73](https://nebul.com/building-a-secure-ai-coding-assistant-with-roo-code-kilo-code-on-vscode/)
[74](https://www.reddit.com/r/RooCode/comments/1nkitci/what_is_the_best_way_to_use_vs_code_roocode_in/)
[75](https://github.com/RooVetGit/Roo-Code/discussions/459)
[76](https://github.com/RooCodeInc/Roo-Code/issues/3811)
[77](https://github.com/jezweb/roo-commander/wiki/06_Advanced_Usage_Customization-01_Custom_Modes)
[78](https://github.com/RooCodeInc/Roo-Code/discussions/2993)
[79](https://github.com/jezweb/roo-commander/wiki/02_Custom_Instructions_Rules)
[80](https://github.com/RooCodeInc/Roo-Code/issues/7285)
[81](https://www.youtube.com/watch?v=cfzXNT4ohpA)
[82](https://www.reddit.com/r/cursor/comments/1jgfic0/the_ultimate_rules_template_for/)
[83](https://docs.roocode.com/faq)
[84](https://dev.to/lord_magus/the-ai-journaling-revolution-free-local-and-powerful-with-rovo-dev-frontmatter-mcp-59pa)
[85](https://docs.roocode.com/features/api-configuration-profiles)
[86](https://www.reddit.com/r/RooCode/comments/1l7ja05/where_are_the_source_files_that_define_the/)
[87](https://bestaiagents.ai/agent/roo-code)
