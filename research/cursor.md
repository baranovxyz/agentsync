# Tool: Cursor IDE (October 2025)

## Official Documentation

- https://cursor.com/docs/context/rules
- https://cursor.com/docs/agent/chat/commands
- https://cursor.com/docs/context/mcp
- https://cursor.com/docs/background-agent
- https://agents.md

## Configuration Schema

### Currently Implemented

**.cursor/mcp.json**

- **Top-level field:** `mcpServers` (object)
- **Each server config:**
  - `command`: Executable (e.g., `"node"`, `"python"`, `"npx"`)
  - `args`: Array of arguments
  - `env`: Object with environment variables (supports `${env:VAR}` substitution)
  - `url`: [Optional] URL to connect
  - `headers`: [Optional] Object for HTTP request headers
- **Variable Substitution:**
  - `${env:VAR_NAME}`\n- `${workspaceFolder}`
  - Supported in: `command`, `args`, `env`, `url`, `headers` fields[1][2]
- **Examples (all under `mcpServers`):**
  - GitHub: includes `GITHUB_TOKEN`
  - PostgreSQL: uses `DATABASE_URL`
  - Web/API: uses command for fetch, `ALLOWED_DOMAINS`, headers, etc.

**.cursor/rules/\*.mdc** (YAML frontmatter + Markdown)

- **Frontmatter fields**:
  - `description`: What/when/why of the rule (“ACTION TRIGGER OUTCOME” format)
  - `globs`: Comma-separated glob patterns (no array or quotes)
  - `alwaysApply`: Boolean
  - `tags`: Optional, for categorization
  - `priority`: Optional int, for conflict resolution (1=high)
  - `version`: Optional, semantic
  - `title`, `id`, `author`, `date`, `status`: All optional
- **Types of Rules**:
  - Always: `alwaysApply: true`, others blank, applies everywhere
  - Auto Attached: `alwaysApply: false`, `globs` set, loads by pattern
  - Agent Requested: `alwaysApply: false`, `description` set, “AI decides” when to use it
  - Manual: everything blank, only loaded with explicit reference

**.cursor/commands/\*.md** (Slash Commands)

- Markdown file, slash-accessible in chat
- File becomes `/project:filename`; subdirectories are `/project:dir:name`
- Frontmatter supports:
  - `description`
  - `allowed-tools`
  - Arbitrary metadata
- `$ARGUMENTS` for user parameter injection
- Supports dynamic content: `!` for bash, `@` for files

### Available but Not Implemented

- No documentation for additional fields in `.cursor/mcp.json` outside `mcpServers`.
- No official support for `.cursor/settings.json` (settings stored in SQLite DB; see workspace settings below for pain points).
- No explicit top-level `.cursor/prompt.json` or `.cursor/context.json` formats revealed, but Cursor can ingest context/contextual files using `@` in chat and rule linking.

### Community/Unofficial Options

- Several users create additional organizational folders under `.cursor/rules/` (e.g., `core-rules`, `global-rules`, `tool-rules`, `ts-rules`).
- Projects may link `AGENTS.md` (native support), or symlink to `.cursor/rules/rules.md` for broader compatibility.
- Gists or markdown documents added to Docs index in Cursor via the UI, enabling context retrieval by `@Doc`.

## Frontmatter/Metadata Support

### Rules Files (.mdc)

Supported frontmatter keys:

- `description` (required for agent-requested and explainable auto-rules)
- `globs` (optional; specifies auto-attachment)
- `alwaysApply` (`true` for universal rules)
- `tags` (array for classification, optional)
- `priority`
- `version`
- `title`
- `id`
- `author`
- `date`
- `status`
  See body formatting: primary is markdown (headings, lists, code), but pseudo-XML tags (`<requirement>`, `<examples>`) and mermaid diagrams are supported for structure and clarity.[3][4][5][6]

### Command Files

- YAML frontmatter at top allowed, with any key recognized by Cursor that’s referenced in docs or used internally (e.g., `description`, `allowed-tools`).
- Body is instructions / template, optionally with `$ARGUMENTS` placeholders.

## MCP Configuration

### Schema (as of October 2025)

```json
{
  "mcpServers": {
    "MY_SERVER_ID": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/SERVER.js", "--flagX", "value"],
      "env": {
        "API_KEY": "${env:API_KEY}"
      },
      "url": "http://...",
      "headers": {
        "Authorization": "Bearer ${env:MY_TOKEN}"
      }
    }
  }
}
```

- `mcpServers` required
- Only documented fields: `command`, `args`, `env`, `url`, `headers`
- Variable substitution supported as described above[2][1]

### Tool-Specific Extensions

- No documented support for custom extensions, but individual MCP servers may accept extra values internally.
- Extensions/control such as rate-limiting, permission controls, or custom headers managed via `env` and `headers` keys.[7][8][9]

## Workspace Settings

- **VSCode compatibility**: `.vscode/settings.json` file, mostly supported for editor settings, themes, behaviors[10][11][12][13]
- **Cursor-specific settings**: No confirmed `settings.json` in `.cursor/` for global IDE settings; main settings live in an internal SQLite database (user feedback: this is pain for backup/VC)[14]
- **Model Selection**: Cursor → Settings → Models (GUI)
- **Environment Variables**: Read from `.env`, supports `${env:VAR}` substitution, but parsing bugs with comments exist[15]
- **Background Agent environments**: `.cursor/environment.json` for reproducible cloud boxes[16][17]

## Security/Permissions

- **MCP Security Model**: Most security handled externally (API keys, OAuth) or by running trusted servers only[18][8][9]
- **Cursorignore**: Excludes files (like `.env`) from being indexed by AI, reducing accidental exposure
- **YOLO/Auto-run Mode**: Can enable AI agents to execute shell/terminal commands automatically (risky; best limited to test/dev)
- **Rate Limits**: Cursor Pro is unlimited “with rate limits” (burst, local limits per provider)[19]
- **Agent permissions**: Max file changes, allowed/blocked commands (in agent config or rules file)[20]

## Agent Support

- **AGENTS.md**: Open, universal project context file for coding agents. Native support in Cursor IDE (October 2025)—no symlink or extra config needed.[21][22][23]
- **Purpose**: Single source of context, high-level rules, project organization, onboarding for agents and new devs.
- **Structure**: Freeform markdown, typically includes: project structure, team/agent responsibilities, coding/commit guidelines, escalation protocols/FAQs.

---

This document captures the major Cursor configuration types and capabilities as of October 2025. For live changes, breaking schema updates, and evolving practices, refer to the official documentation and active community channels for up-to-date details.

[1](https://cursor.com/docs/context/mcp)
[2](https://aifreeapi.com/en/posts/cursor-mcp-integration-guide-2025)
[3](https://forum.cursor.com/t/optimal-structure-for-mdc-rules-files/52260/8)
[4](https://gist.github.com/Stormix/4be0a136761478a0afb1117233cd05d4)
[5](https://www.everydev.ai/p/blog-ai-coding-agent-rules-files-fragmentation-formats-and-the-push-to-standardize)
[6](https://forum.cursor.com/t/how-to-force-your-cursor-ai-agent-to-always-follow-your-rules-using-auto-rule-generation-techniques/80199)
[7](https://mcpmarket.com/server/envmcp)
[8](https://prefactor.tech/blog/mcp-authorization-implementation-guide)
[9](https://stytch.com/blog/mcp-security/)
[10](https://code.visualstudio.com/docs/configure/settings)
[11](https://forum.cursor.com/t/workspace-settings-that-conflict-with-vscode-settings/28499)
[12](https://forum.cursor.com/t/project-based-json-settings-for-cursor/46179)
[13](https://gist.github.com/tomoima525/034c7f4360f238bbbdfe5b037937dcd6)
[14](https://jackyoustra.com/blog/cursor-settings-location)
[15](https://forum.cursor.com/t/environment-variable-parsing-bug-in-cursor-ide/48870)
[16](https://stevekinney.com/courses/ai-development/cursor-environment-configuration)
[17](https://cursor.com/docs/background-agent)
[18](https://www.reddit.com/r/mcp/comments/1jdcz2p/mcp_security_and_access_control_how_do_you_stop/)
[19](https://apidog.com/blog/cursor-rate-limit/)
[20](https://collabnix.com/cursor-ai-deep-dive-technical-architecture-advanced-features-best-practices-2025/)
[21](https://forum.cursor.com/t/show-me-your-agents-md-rules-system/132323)
[22](https://www.devshorts.in/p/agentsmd-one-file-for-all-agents)
[23](https://agents.md)
[24](https://www.hackthebox.com/blog/CVE-2025-54136-cursor-code-editor)
[25](https://forum.cursor.com/t/my-best-practices-for-mdc-rules-and-troubleshooting/50526)
[26](https://docs.nvidia.com/nemo/agent-toolkit/1.2/extend/cursor-rules-developer-guide.html)
[27](https://mcpcursor.com/server/json-schema-manager-mcp)
[28](https://forum.cursor.com/t/what-is-a-mdc-file/50417)
[29](https://dev.to/stamigos/setting-up-cursor-rules-the-complete-guide-to-ai-enhanced-development-24cg)
[30](https://skywork.ai/skypage/en/awesome-cursor-mcp-server-guide-ai-engineers/1978656748915511296)
[31](https://github.com/DVC2/cursor_prompts)
[32](https://notes.switchdimension.com/Cursor-AI-Rules-The-Missing-Manual-191b5b07a9438056bf22cf23a8f8e600)
[33](https://lobehub.com/mcp/griffinwork40-cursor-agent-mcp)
[34](https://www.reddit.com/r/cursor/comments/1idg434/anyone_else_finding_the_the_new_mdc_cursorrules/)
[35](https://cursor.com/docs/context/rules)
[36](https://forum.cursor.com/t/problem-with-cursor-mcp-schema-validation-numeric-vs-integer/134988)
[37](https://forum.cursor.com/t/metadata-frontmatter-of-cmd-file-visible-by-some-model/86565)
[38](https://cursor.com/docs/agent/chat/commands)
[39](https://forum.cursor.com/t/mcp-json-config-interpolation/135729)
[40](https://forum.cursor.com/t/optimal-structure-for-mdc-rules-files/52260)
[41](https://cursor.com/docs)
[42](https://forum.cursor.com/t/submitting-generated-messy-json-format-when-calling-mcp/134785)
[43](https://playbooks.com/rules/create-rules)
[44](https://github.com/fisapool/cursor-workspace-configurator)
[45](https://github.com/getcursor/cursor/issues/2508)
[46](https://cursorideguide.com/guides/cursor-model-comparison)
[47](https://www.reddit.com/r/cursor/comments/1kmq032/workaround_for_cursor_agent_to_use_environment/)
[48](https://www.youtube.com/watch?v=BjwPHdBiYbE)
[49](https://www.emgoto.com/cursor/)
[50](https://forum.cursor.com/t/workspace-specific-settings/3422)
[51](https://frontendmasters.com/blog/choosing-the-right-model-in-cursor/)
[52](https://cursor.com/learn/how-ai-models-work)
[53](https://www.hubermann.com/en/blog/mastering-cursor-configuration-a-comprehensive-guide-to-project-rules-and-settings)
[54](https://cursor.com/docs/models)
[55](https://forum.cursor.com/t/cursor-doesnt-seem-to-respect-the-settings-in-vscode-folder/50733)
[56](https://stevekinney.com/courses/ai-development/claude-code-commands)
[57](https://github.com/gleanwork/mcp-config-schema)
[58](https://cloudartisan.com/posts/2025-04-14-claude-code-tips-slash-commands/)
[59](https://modelcontextprotocol.io/specification/2025-06-18/schema)
[60](https://forum.cursor.com/t/define-default-model-per-command/137727)
[61](https://github.com/digitalchild/cursor-best-practices)
[62](https://www.reactsquad.io/blog/this-new-cursor-feature-changes-everything-slash-commands)
[63](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
[64](https://docs.roocode.com/features/slash-commands)
[65](https://mcpcat.io/guides/understanding-json-rpc-protocol-mcp/)
[66](https://forum.cursor.com/t/can-anyone-help-me-use-this-new-cursor-rules-functionality/45692)
[67](https://forgecode.dev/blog/mcp-spec-updates/)
[68](https://www.siddharthbharath.com/coding-with-cursor-beginners-guide/)
[69](https://github.com/PatrickJS/awesome-cursorrules)
[70](https://stevekinney.com/courses/ai-development/cursor-context)
[71](https://stack.convex.dev/6-tips-for-improving-your-cursor-composer-and-convex-workflow)
[72](https://www.reddit.com/r/cursor/comments/1ik06ol/a_guide_to_understand_new_cursorrules_in_045/)
[73](https://cursor.com/learn/context)
[74](https://www.reddit.com/r/cursor/comments/1jtc9ej/cursors_internal_prompt_and_context_management_is/)
[75](https://cursor.com/docs/cli/reference/configuration)
[76](https://cursor.directory)
[77](https://www.builder.io/blog/cursor-tips)
[78](https://cursor.com/changelog)
[79](https://cursor.com/docs/context/symbols)
[80](https://www.danielcorin.com/til/cursor/intro/)
[81](https://playbooks.com/mcp/cursor-background-composer)
[82](https://israataha.com/blog/creating-frontmatter-snippet-for-markdown-files/)
[83](https://www.npmjs.com/package/cursor-background-agent-mcp-server?activeTab=readme)
[84](https://github.com/facebook/docusaurus/discussions/8759)
[85](https://forum.cursor.com/t/background-agents-environment-json-docs-are-broken/109191)
[86](https://www.infracloud.io/blogs/securing-mcp-servers/)
[87](https://forum.cursor.com/t/mdc-files-can-we-just-edit-yaml-front-matter-directly/75561)
[88](https://marketplace.dify.ai/plugins/lysonober/cursor-background-agents)
[89](https://docs.cursor.com/en/guides/tutorials/building-mcp-server)
[90](https://skywork.ai/blog/how-to-cursor-1-7-hooks-guide/)
[91](https://github.com/anthropics/claude-code/issues/6235)
[92](https://dotcursorrules.com)
[93](https://dev.to/heymarkkop/cursor-tips-10f8)
[94](https://forum.cursor.com/t/tutorial-adding-full-repo-context-pdfs-and-other-docs/33925)
[95](https://developertoolkit.ai/en/cursor-ide/advanced-techniques/agent-modes-deep-dive/)
[96](https://codeaholicguy.com/2025/04/12/what-i-learned-using-cursorai-every-day-as-an-engineer/)
[97](https://cursor.directory/rules)
[98](https://cursordocs.com/en)
