```markdown
# Tool: Cline (VSCode Extension)

## Official Documentation

- [GitHub Repository](https://github.com/cline/cline)
- [Cline Rules Chapter](https://cline.ghost.io/cline-rules/)
- [System Prompt Fundamentals](https://cline.ghost.io/system-prompt/)
- [Prompt Fundamentals](https://cline.ghost.io/prompt-fundamentals/)

---

## Configuration Schema

### Currently Implemented

#### .clinerules Directory & Files

- Modular Markdown files inside `.clinerules/` directory—core files include `rules`, `memory`, and `directory-structure`
- Rules are explicit, codified team standards and preferences
- Multi-file format supports organized, atomic rules; single `.clinerules` file still supported for simple projects
- `AGENTS.md` can be symlinked to this folder if needed

#### MCP Settings: `cline_mcp_settings.json`

- Located typically in VSCode’s user/global storage, may be workspace-local in the future
- Sample schema:
```

{
"mcpServers": {
"MockLoopLocal": {
"autoApprove": [],
"disabled": false,
"timeout": 60,
"command": "/path/to/mockloop-mcp/.venv/bin/python",
"args": ["/path/to/mockloop-mcp/src/mockloop_mcp/main.py"],
"transportType": "stdio"
}
}
}

```

**Fields:**
- `autoApprove`: Array of tool names for auto-approval without confirmation
- `disabled`: Boolean, disable this MCP server
- `timeout`: Connection timeout (seconds)
- `command`: Path to the executable for the MCP server
- `args`: Arguments passed to the MCP server executable
- `transportType`: Communication protocol (e.g., `"stdio"`)[2][5][11][14]

### Available but Not Implemented

- Planned: Move `mcpServers` into VSCode workspace `.vscode/settings.json` for workspace-specific settings
- Suggested: Declarative per-workspace config via standard `.vscode/settings.json` or environment variables for most options (API models, Plan/Act instructions, etc.)

### Community/Unofficial Options

- Some advanced setups document possible overrides via environment variables or config files named `config.json` (see XDG or project root), partly for headless/CI workflows
- Beta features discussed: Headless setup, disabling onboarding wizard via CLI/ENV, advanced agent-like "memory" layering, and richer context strategies

---

## Frontmatter/Metadata Support

### Rules Files

- Typical `.clinerules/*.md` includes:
- Explicit organizational categories (rules, memory, directory-structure)
- YAML-frontmatter or Markdown metadata (inspired by Cursor, but Cline mostly parses only known fields or just markdown content)
- Recommended to organize by language, purpose, and precedence (naming conventions, file inclusion/exclusion, security standards, code patterns)
- No confirmed arbitrary frontmatter parsing; custom/unrecognized fields may be ignored but retained if markdown

**Example:**
```

---

description: "Use SOLID principles for class design"
tags: [design, patterns, OOP]
priority: 1
languages: [TypeScript, Python]

---

All class implementations must follow SOLID principles...

```

#### File Structure (suggested)
```

.clinerules/
├── rules
├── memory
└── directory-structure

```
- `rules`: Coding standards and practices
- `memory`: Project knowledge/context
- `directory-structure`: File/folder conventions[26]

### Command Files

- **Cline does not currently support custom command files** in practice. All command “support” is no-op, as Cline’s implementation is agentic/action-based, not command-driven.

---

## MCP Configuration

### Schema

- MCP servers defined within `cline_mcp_settings.json` as shown above.
- Each server block may customize environment (`env`) and process controls.
- Follows the JSON-RPC 2.0 protocol for tool invocation and context exchange.[8][5]

### Tool-Specific Extensions

- Support for tool auto-approval (granting Cline autonomous access to listed tools)
- Ability to use custom MCP servers, including local or cloud toolchains
- Advanced: Cline can guide in stepwise construction of new MCP servers with plan/act flows; `.clinerules` may be used in the MCP working directory for specialized modes[8]

---

## Workspace Settings

- Global settings are stored in VSCode’s global state and secret storage.
- Workspace migration (in active development): Some settings and task history may be workspace-local in future releases—critical for multi-project work environments[3][45].
- Declarative project/workspace support (planned/partial):
  - `cline.planApiProvider`, `cline.planModel`, `cline.planCustomInstructions`
  - `cline.actApiProvider`, `cline.actModel`, `cline.actCustomInstructions`
  - Can set in `.vscode/settings.json` or via `devcontainer.json` for containerized workspaces

**Example**:
```

{
"cline.planApiProvider": "OpenRouter",
"cline.planModel": "claude-4-opus",
"cline.planCustomInstructions": "...",
"cline.actApiProvider": "OpenRouter",
"cline.actModel": "claude-4-sonnet",
"cline.actCustomInstructions": "..."
}

```
(API keys should be set via environment variables, not `settings.json`)[45][3][42][47]

---

## Security/Permissions

- Human-in-the-loop: Most destructive or external actions require approval (e.g., writing, running, HTTP)
- Auto-approve can be configured by tool for trusted development cycles
- Plan vs Act modes keep modeling and execution stages distinct for risk mitigation
- Session-level budgets and runtime caps available in rules/config
- Workspace-specific API keys and approvals planned (currently global)[10]

---

## Agent Support

- Cline supports agentic workflows but not explicit “commands”—it treats actions as plans and acts, rather than inflexible, static command templates.
- Agent-specific configuration is accomplished by symlinking or placing `AGENTS.md` in `.clinerules/` (content is agent/operator metadata and role documentation)
- Multi-agent (rotating context, memory layering) is under discussion, not yet natively released

---

# Direct Answers to Research Questions

1. **No Command Files:**
   Cline does not implement a true “commands” system; this is both a design choice and a current limitation. Its philosophy is agentic via plan/act flows, preferring autonomous AI action with human approvals over static commands.

2. **`cline_mcp_settings.json` Schema:**
   See above—schema contains `mcpServers` (mapping to server configs), with subfields for command, args, env, approval, transport, and timeouts. Follows JSON structure for each tool/MCP server.

3. **VSCode Workspace Settings:**
   Under active development for full workspace isolation. Planned: Workspace-level plans, API provider/model preferences, custom instructions, task history, and approvals all stored in `.vscode/settings.json` (or via the VSCode settings GUI), with partial support in current releases.

4. **Additional Custom Config:**
   Advanced setups may use environment variables or `config.json` per XDG spec, and CI/headless setup flags allow automation and non-interactive workflows[22]. No evidence of hidden, “extra” settings beyond those covered above.

5. **Frontmatter:**
   Best practice is standard YAML in each `.clinerules/*.md`. Only recognized fields are enforced; arbitrary keys may be safely ignored or passed to the model as part of the rule content.

6. **Context Management/Prompt Templates:**
   Extremely robust native context management: Focus Chain, Auto Compact, Plan/Act reset, and intelligent truncation are core features. No user-defined prompt templates as in some competitors—context is handled programmatically and via rules, not by copying prompt templates into every message. MCP servers can technically provide prompt templates, but Cline itself does not expose user-facing prompt template APIs[40][43][51][52][55].

7. **VSCode Extension Settings:**
   All extension state/settings currently reside in global VSCode state and secret storage by default; workspace/project-level overrides are partial and improving. Settings are (or will be) manageable via `.vscode/settings.json` and via environment variables in CI/devcontainer workflows. No hidden config files within the project root aside from `.clinerules/`, MCP config, and (optionally) AGENTS.md symlinks[45][42][50].

```

[1](https://github.com/cline/cline/issues/533)
[2](https://docs.mockloop.com/getting-started/configuration/)
[3](https://github.com/cline/cline/discussions/2550)
[4](https://apidog.com/blog/how-to-use-cline/)
[5](https://dev.to/webdeveloperhyper/how-to-use-mcp-in-cline-and-cursor-54hg)
[6](https://www.youtube.com/watch?v=lxRAj1Gijic)
[7](https://www.linkedin.com/pulse/how-use-google-gemini-25-pro-vscode-cline-guide-tim-markus-9kyie)
[8](https://fp8.co/articles/Analysis-of-Cline's-Interaction-and-Adherence-to-MCP-Specification)
[9](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
[10](https://cline.bot/blog/cursor-alternatives-2025-cline-guide)
[11](https://github.com/cline/linear-mcp)
[12](https://javascript.plainenglish.io/top-vs-code-extensions-for-developers-in-2025-7ee8c00d8cb7)
[13](https://www.reddit.com/r/vscode/comments/1nednwu/visual_studio_code_august_2025_version_1104/)
[14](https://github.com/cline/cline/issues/2459)
[15](https://github.com/cline/cline/issues/374)
[16](https://github.com/cline/cline/discussions/2096)
[17](https://repomix.com/guide/mcp-server)
[18](https://stackoverflow.com/questions/71567229/how-to-re-add-an-extension-to-the-vscode-sidebar-activity-bar)
[19](https://cline.bot/blog/best-ai-coding-assistant-2025-complete-guide-to-cline-and-cursor)
[20](https://logfire.pydantic.dev/docs/how-to-guides/mcp-server/)
[21](https://forum.cursor.com/t/allow-custom-frontmatter-for-cursor-rules/94611)
[22](https://github.com/cline/cline/discussions/3559)
[23](https://www.datacamp.com/tutorial/cline-ai)
[24](https://www.reddit.com/r/cursor/comments/1jgfic0/the_ultimate_rules_template_for/)
[25](https://www.youtube.com/watch?v=l6RmThjDUS8)
[26](https://publish.obsidian.md/aixplore/AI+Development+&+Agents/mastering-clinerules-configuration)
[27](https://www.everydev.ai/p/blog-ai-coding-agent-rules-files-fragmentation-formats-and-the-push-to-standardize)
[28](https://github.com/cline/cline/discussions/361)
[29](https://www.reddit.com/r/ClaudeAI/comments/1glwtk0/cline_custom_instructions_guide/)
[30](https://github.com/RooCodeInc/Roo-Code/discussions/2083)
[31](https://opendatasky.com/document/en/cline.html)
[32](https://github.com/cline/cline)
[33](https://www.youtube.com/watch?v=ZHH9NP2mogg)
[34](https://www.linkedin.com/pulse/cline-prompt-engineering-crash-course-custom-evan-musick-k2dcc)
[35](https://cline.ghost.io/cline-rules/)
[36](https://github.com/microsoft/vscode/issues/249387)
[37](https://www.youtube.com/watch?v=MpbCUPSR7-8)
[38](https://github.com/Bhartendu-Kumar/rules_template)
[39](https://cline-project-guide.vercel.app)
[40](https://www.linkedin.com/posts/clinebot_context-engineering-in-cline-how-do-i-activity-7363632944709554176-AtUu)
[41](https://docsbot.ai/prompts/productivity/cline-template-guide)
[42](https://github.com/cline/cline/discussions/2355)
[43](https://addyo.substack.com/p/why-i-use-cline-for-ai-engineering)
[44](https://www.reddit.com/r/ChatGPTPromptGenius/comments/1jzk769/v20_of_prompt_template_for_cursorroo_code_cline/)
[45](https://github.com/cline/cline/discussions/3796)
[46](https://docsbot.ai/prompts/education/cline-instruction-templates)
[47](https://code.visualstudio.com/docs/configure/settings)
[48](https://www.reddit.com/r/CLine/comments/1i6oevd/context_management/)
[49](https://cline.ghost.io/system-prompt/)
[50](https://www.reddit.com/r/CLine/comments/1jaxn56/where_is_vscode_settings_for_cline_saved/)
[51](https://github.com/cline/cline/issues/4389)
[52](https://github.com/cline/cline/discussions/382)
[53](https://whoa.fyi/how-to-use-cline-extension-with-vscode/)
[54](https://www.linkedin.com/pulse/ai-dev-clinecursor-efficient-context-management-key-hassan-syed-4ufte)
[55](https://github.com/cline/cline/discussions/3415)
[56](https://stackoverflow.com/questions/71633612/where-to-find-documentation-on-all-available-vs-code-editor-settings-json-settin)
[57](https://cline.bot)
[58](https://cline.ghost.io/prompt-fundamentals/)
