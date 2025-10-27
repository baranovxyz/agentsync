# AGENTS.md: Parser and Translators

Status: v0.3.0-beta in progress. `init` command implemented; translators and full sync pending.

## Parser (`src/core/parser.ts`)

- Class: `AgentsMdParser`
- Dependencies: unified, remark-parse, gray-matter
- Key methods:
  - `parse(content, filePath)` — parse AGENTS.md to AST
  - `extractSections(ast)` — extract hierarchical sections
  - `sectionsToAgentsMd(sections)` — convert to typed structure
  - `validate(agentsMd)` — validate against Zod schema
- Section recognition: overview, build/test commands, code style, structure, git workflow, permissions, MCP servers

## Translators (planned)

Create `src/translators/[tool].ts` implementing the `Translator` interface.

```ts
export class CursorTranslator implements Translator {
  async translate(agentsMd: AgentsMd): Promise<FileOperation[]> {
    /* ... */
  }
  async validate(operations: FileOperation[]): Promise<void> {
    /* ... */
  }
}
```

- Handle tool-specific formats (e.g., Cursor wrapper vs Claude direct object)
- Validate operations before sync

## Templates

`templates/` contains AGENTS.md templates:

- `default.md`
- `typescript-react.md`
- `python-fastapi.md`
