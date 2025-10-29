# AGENTS.md

## Project Overview

AgentSync is the infrastructure layer for AI coding agent configuration. It syncs rules, commands, and MCP servers across different AI tools (Claude, Cursor, Cline, RooCode).

**Tech Stack**: TypeScript, Node.js 18+, pnpm, Vitest, Commander.js

## Critical Guardrails

- **NEVER push to `main`** - Always: branch → commit → PR → merge on GitHub
- **Preserve history** - Use `git mv` for renames, never plain `mv`
- **Branch format** - `{type}/{brief-description}` (e.g., `fix/init-local-config`)
- **After PR merge** - Checkout `main`, pull latest, verify clean tree
- **Commit format** - Use conventional commits (feat:, fix:, chore:, docs:, test:)

See: ./CONTRIBUTING.md for full Git workflow

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Development with hot reload
pnpm build                # Build CLI to dist/
pnpm test                 # Run all tests
pnpm test:unit            # Unit tests only
pnpm test:e2e             # E2E tests only
pnpm test:shell           # Shell tests via Vitest
pnpm test:bats            # BATS CLI tests (requires bats-core)
pnpm cli <command>        # Test CLI commands (after build)
```

## Project Structure

- `src/cli.ts` - CLI entry point
- `src/commands/` - Command implementations (init, sync, gitignore, mcp/_, preset/_)
- `src/core/` - Business logic (config, mcp, registry systems)
- `src/security/` - Secret scanning, Unicode detection
- `src/targets/` - Tool-specific converters (rules, commands, tools)
- `src/types/` - TypeScript definitions
- `tests/unit/` - Unit tests (mirror src/ structure)
- `tests/e2e/` - End-to-end tests
- `tests/shell/` - BATS CLI tests
- `templates/` - AGENTS.md templates for projects
- `docs/` - Detailed documentation

## Key Concepts

**Configuration**

- Project config: `.agentsync/config.json` (committed)
- Local overrides: `agentsync.local.json` (gitignored)
- Local `mcpServers` completely replaces project config (no merging)

**Preset System**

- GitHub-based: `github:owner/repo` format
- Cached locally, use `--pull` to refresh
- Selective loading via `include`/`exclude` patterns
- Internal namespacing uses underscore (`preset_name`)

**Tool Output**

- Cursor/Claude/RooCode: Nested directories (`preset/name/`)
- Cline: Flat structure (`preset_name_`)
- Each tool has specific converter in `src/targets/`

**MCP Integration**

- Project MCPs in config, local overrides replace entirely
- Empty array `[]` disables all MCPs
- Generates tool-specific configs (e.g., `claude_desktop_config.json`)

## Implementation Notes

**Error Handling**

- Use typed errors with recovery guidance
- Handle CommanderError: check for `commander.version` and `commander.helpDisplayed`, exit 0
- Provide clear error messages with actionable fixes

**Module Detection**

- Prefer `import.meta.main` for main module detection
- Fallback to `es-main` for older Node versions

**Frontmatter**

- Commands and rules require `description` field
- Missing frontmatter triggers warnings, not errors

**Testing Philosophy**

- Favor natural workflows - don't bypass with manual setup
- Test user journeys in E2E tests
- Unit test business logic in isolation
- Always run tests before committing

**Security**

- Auto-scan for secrets in AGENTS.md files
- Detect malicious Unicode characters
- Checks run during sync operations

## Common Development Tasks

**Adding a New Command**

1. Create command file in `src/commands/`
2. Register in `src/cli.ts`
3. Add unit tests in `tests/unit/commands/`
4. Add E2E test for workflow
5. Update CLI documentation

**Adding Tool Support**

1. Create converter in `src/targets/tools/`
2. Add rule converter in `src/targets/rules/`
3. Add command converter in `src/targets/commands/`
4. Register in tool index
5. Add tests for converters

**Modifying Preset System**

1. Core logic in `src/core/registry/`
2. GitHub resolver handles fetching
3. Merger combines presets
4. Cache manager handles storage
5. Test with fixtures in `tests/fixtures/`

**Updating MCP Logic**

1. Config merging in `src/core/mcp/config.ts`
2. Registry in `src/core/mcp/registry.ts`
3. Token replacement in `src/core/mcp/tokens.ts`
4. Test merging behavior thoroughly

## Testing Requirements

- Run `pnpm test` before any commit
- Add tests for new features
- Update fixtures when changing file formats
- E2E tests for user-facing changes
- Unit tests for logic changes
- Keep tests focused and atomic

## Build & Release

- Build with `pnpm build` before testing CLI
- Use `pnpm dev` for hot reload during development
- Version bumps follow semver
- Release process documented in `docs/releasing.md`

## Code Style

- TypeScript strict mode
- 2 spaces indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters
- Biome for formatting/linting
- Prefer functional patterns
- Avoid `any`, use `unknown` when needed

## Debugging

- Use `DEBUG=agentsync:*` for verbose logging
- Check `docs/debugging.md` for troubleshooting
- VSCode launch configs available
- Source maps enabled in development

## Architecture Decisions

- Modular design with clear separation of concerns
- Tool-agnostic core with tool-specific adapters
- Local config overrides for flexibility
- GitHub as preset source for sharing
- Security scanning built-in

## Documentation

**Core Docs**

- REQUIREMENTS.md - Feature specs and design (source of truth)
- ARCHITECTURE.md - System design
- TESTING.md - Testing strategy
- SECURITY.md - Security considerations
- CONTRIBUTING.md - Contribution guide

**Reference**

- docs/cli.md - CLI command reference
- docs/configuration.md - Config format
- docs/presets.md - Preset system details
- docs/debugging.md - Debug techniques
- docs/tool-capabilities.md - Tool-specific features

---

_For AI agents developing AgentSync. See README.md for user documentation._
