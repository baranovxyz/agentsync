# AGENTS.md: Parser

Status: v0.3.0-beta in progress. `init` implemented; full sync pending. Current approach is symlink-only for AGENTS.md per tool.

## Parser (`src/core/parser.ts`)

- Class: `AgentsMdParser`
- Dependencies: unified, remark-parse, gray-matter
- Key methods:
  - `parse(content, filePath)` — parse AGENTS.md to AST
  - `extractSections(ast)` — extract hierarchical sections
  - `sectionsToAgentsMd(sections)` — convert to typed structure
  - `validate(agentsMd)` — validate against Zod schema
- Section recognition: overview, build/test commands, code style, structure, git workflow, permissions, MCP servers

<!-- Translators section removed: translators are no longer referenced -->

## Templates

`templates/` contains AGENTS.md templates:

- `default.md`
- `typescript-react.md`
- `python-fastapi.md`
