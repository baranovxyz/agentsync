# AGENTS.md

## Project Overview

AgentSync syncs AI coding agent configuration (commands, skills, MCP servers) across 19 tools (Cursor, Claude, Cline, RooCode, OpenCode, Codex, Gemini, Copilot, Amp, Goose, Aider, Amazon Q, Augment, Kiro, OpenHands, Junie, Crush, Kilocode, Qwen). TypeScript, Node.js 18+, pnpm, Vitest, Commander.js.

**Stable (v1.0)**: Semver commitment. Config schema is frozen. Global content (`~/.agents/`) accumulates with project content.

**Agent-first**: The primary users of AgentSync are AI coding agents (Claude Code, Cursor, Copilot, etc.), not humans at a terminal. Agents create configs, manage presets, run sync, and interpret `--json` output. Human CLI usage is the secondary path. Design decisions should optimize for agent workflows: structured output, actionable errors, no interactive prompts, deterministic behavior.

## Docs

Read these before making changes in the relevant area:

- @docs/architecture.md — system diagrams, data flow, key entry points
- @docs/configuration.md — config format (TOML), MCP setup, preset sources, frontmatter format
- @docs/cli.md — CLI command reference
- @docs/tool-capabilities.md — tool-specific features and format differences
- @docs/contributing.md — contribution guidelines, CI/CD workflows, PR checklist
- @docs/security.md — security considerations, threat model

## Project Structure

```
src/
├── cli.ts                  # CLI entry point (Commander.js)
├── commands/               # Command implementations — ALL new commands register here
│   └── config/             # Config subcommands (add, rm, ls, show)
├── config/                 # Config file loaders (TOML/JSON)
├── core/                   # Business logic — no CLI concerns here
│   ├── config/             # Config hierarchy and interactive selection
│   │   ├── discovery.ts    # N-layer monorepo config discovery (loadConfigHierarchy)
│   │   ├── merge.ts        # Config merge logic across hierarchy levels
│   │   └── profiles.ts     # Role-based profiles ([profiles.*], --profile flag)
│   ├── mcp/                # MCP config merging, registry, tokens, transport
│   ├── monorepo.ts         # Monorepo subtree discovery (findAgentsSubtrees, filterChangedSubtrees)
│   └── registry/           # Preset loading, GitHub source, merger
├── sync/                   # Sync engine — ALL sync modules here (agents, commands, docs, mcp, skills)
├── tools/                  # Tool definitions and detection (19 tools including cline)
├── types/                  # TypeScript definitions, Zod schemas
└── utils/                  # Shared utilities (frontmatter, fs, gitignore, paths)
tests/
├── unit/                   # Unit tests (mirror src/ structure)
├── integration/            # Integration tests per tool
├── workflows/              # Realistic CLI workflow tests
├── scenarios/              # Scenario-based tests
├── e2e/                    # E2E packaging validation
└── shell/                  # BATS CLI tests
```

## Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build CLI to dist/
pnpm test                 # Run all tests
pnpm test:e2e             # E2E tests only
pnpm test:bats            # BATS CLI tests (requires bats-core)
pnpm lint                 # TypeScript type-check + Biome lint
pnpm lint:fix             # Auto-fix lint issues
pnpm cli <command>        # Test CLI commands (requires pnpm build first)
pnpm cli sync --profile <name>  # Sync using a named role-based profile
pnpm cli doctor           # Run diagnostics (config, tools, MCP, presets)
pnpm cli doctor --json    # Structured JSON diagnostics
pnpm cli clean            # Remove all synced files
pnpm cli config ls        # List tools, MCP servers, presets
pnpm cli config show      # Dump resolved config as JSON
pnpm cli config add mcp github --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'
pnpm cli config rm mcp github
```

### Verification (run before any commit)

```bash
pnpm lint && pnpm test
```

## Conventions

- **CLI-first**: Non-interactive by default (scriptable, CI/CD friendly). Use `--tools` flag for init.
- **Config format**: TOML (`.agents/agentsync.toml`). No JSON fallback.
- **Always use `readJsonValidated()` with Zod schemas** — never plain `readJson()` or type assertions (`as`).
- **Conventional commits**: `type(scope): summary` — types: feat|fix|docs|chore|test|refactor. Use `pnpm cz` for guided messages.
- **Branch format**: `{type}/{brief-description}` (e.g., `fix/init-local-config`)
- **Handle CommanderError**: Check for `commander.version` and `commander.helpDisplayed`, exit 0.
- **Frontmatter**: Commands and skills require `description` field. Missing frontmatter triggers warnings, not errors.
- **Config hierarchy**: N-layer monorepo discovery (org > team > service), walking up from CWD to git root. Profiles (`[profiles.*]`, `--profile` flag, `AGENTSYNC_PROFILE` env var) overlay role-specific overrides with filter semantics. Per-key merge for `[mcp.*]` servers. Defined MCP servers are enabled (no separate `mcp_enabled`).
- **TOML keys**: Use snake_case (`tools`, `mcp`) per TOML convention.
- **Config format (v1)**: `tools = [...]` flat list, `[mcp.*]` defined=enabled, `extends = [...]` flat strings. No `version` or `source_dir` fields.
- **Namespace separator**: Use `--` (flat) not `/` (nested) in tool outputs.
- **`@AGENTS.md` directive**: Used by CLAUDE.md, GEMINI.md instead of symlinks.

## Rules

- **Data validation**: Always use `readJsonValidated()` with a Zod schema — never plain `readJson()`, `JSON.parse()` with type assertions, or `as` casts. Surface Zod error messages to the user. Use `unknown` instead of `any`.
- **Testing**: Favor natural workflows over manual setup. Test user journeys in E2E tests, business logic in unit tests. One behavior per test, clear arrange/act/assert. Use `readJsonValidated()` with Zod in tests too.

## Boundaries

- ✅ **Always:** Run `pnpm lint && pnpm test` before committing
- ✅ **Always:** Add tests for new features and bug fixes
- ✅ **Always:** Update AGENTS.md and relevant docs when changing project structure or commands
- ✅ **Always:** Use typed errors with recovery guidance (see `src/core/errors.ts`)
- ✅ **Always:** Document architectural decisions in the agentsync-docs repo
- ⚠️ **Ask first:** Before changing config schema or merge strategy
- ⚠️ **Ask first:** Before adding new tool support (requires codec + converters + tests)
- 🚫 **Never:** Push directly to `main` — always branch > commit > PR > merge
- 🚫 **Never:** Use plain `readJson()` or `as` type assertions for JSON — use `readJsonValidated()` with Zod
- 🚫 **Never:** Include secrets in code, tests, or documentation
