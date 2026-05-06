---
name: smart-commit
description: Analyze project changes and create atomic conventional commits grouped by type
model: gemini-2.5-pro
---

# Smart Commit - Intelligent Change Analysis and Conventional Commits

## Overview

This command analyzes all uncommitted changes in your project, intelligently groups them by conventional commit types, and creates atomic commits with well-structured messages.

## Process

### 1. Change Analysis

First, I'll analyze your changes by:

- Running `git status` to see all modified and untracked files
- Running `git diff` to understand the nature of staged and unstaged changes
- Running `git log --oneline -5` to understand recent commit patterns and style

### 2. Intelligent Grouping

I'll thoughtfully group changes by:

- **Conventional commit types**: feat, fix, docs, style, refactor, test, chore, build, ci, perf
- **Logical relationships**: Changes that belong together functionally
- **Dependencies**: Files that must be committed together to maintain consistency
- **Scope**: Related components or modules

### 3. Commit Strategy

For each group of changes, I'll:

- Determine the appropriate conventional commit type
- Identify the scope (if applicable)
- Write a clear, concise commit message focusing on the "why"
- Consider whether changes need to be split into multiple commits for clarity

### 4. Execution

I'll then:

- Stage the appropriate files for each commit group
- Create commits with properly formatted messages
- Verify each commit was successful

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Conventional Commit Types

- **feat**: New feature or functionality
- **fix**: Bug fixes
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code changes that neither fix bugs nor add features
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **build**: Build system or external dependency changes
- **ci**: CI/CD configuration changes
- **perf**: Performance improvements

## Best Practices I Follow

1. **Atomic commits**: Each commit represents one logical change
2. **Clear messages**: Focus on why the change was made, not just what
3. **Proper grouping**: Related changes are committed together
4. **No mixing**: Don't mix features with refactoring or fixes
5. **Staging verification**: Always verify what's being staged before committing
6. **Test consideration**: Ensure tests are included with their related code changes
7. **No AI attribution**: Never mention Claude, Anthropic, or AI generation in commit messages per project rules

## Example Usage

```
/smart-commit
```

The command will:

1. Analyze all your current changes
2. Show you a proposed commit plan with grouped changes
3. Execute the commits after your approval

## Important Notes

- I'll always show you the commit plan before executing
- Complex changes may require multiple commits for clarity
- I'll respect your project's existing commit style patterns
- Configuration files and their related code changes will be grouped together
- I'll ensure no breaking changes are split across commits
- TypeScript files and their tests should be committed together when related
- Security changes (scanner, unicode detector) are high-priority and often isolated

## AgentSync Commit Style Examples

Recent commit patterns from this repository:

**Feature commits:**

- `feat: implement MCP context optimizer`
- `feat(commands): implement init command with interactive setup`
- `feat(templates): add AGENTS.md templates for common project types`
- `feat: implement atomic sync engine with rollback`
- `feat: implement base translator abstract class`

**Fix commits:**

- `fix: resolve init command issues for non-interactive environments`
- `fix: update references from Claude Desktop to Claude Code`
- `fix: resolve TypeScript compilation errors`
- `fix: correct __dirname path in init command`

**Documentation commits:**

- `docs: update development guide with current status`
- `docs: restructure README for better clarity`
- `docs: add comprehensive changelog for v0.2.0-alpha releases`

**Refactor commits:**

- `refactor: update deprecated references from Claude Desktop to Claude Code`
- `refactor: update repository URL and improve code formatting`

**Chore commits:**

- `chore: bump version to 0.2.0-alpha.2 and update package metadata`
- `chore: clean up .gitignore`
- `chore: update .gitignore`

**Build commits:**

- `build: add npm configuration files for publishing`

## AgentSync-Specific Grouping Patterns

When grouping changes for AgentSync, consider these module boundaries:

1. **Commands System**
   - CLI entry point (`src/cli.ts`)
   - Init command (`src/commands/init.ts`)
   - Sync command (`src/commands/sync.ts`)
   - Gitignore command (`src/commands/gitignore.ts`)
   - MCP commands (`src/commands/mcp/*.ts`)
   - Preset commands (`src/commands/preset/*.ts`)

2. **Core Business Logic**
   - Config management (`src/core/config/*.ts`)
   - MCP system (`src/core/mcp/*.ts`)
   - Registry system (`src/core/registry/*.ts`)
   - Error handling (`src/core/errors.ts`)

3. **Tool Codecs**
   - Tool codecs (`src/targets/tools/*.ts`)

4. **Testing**
   - Unit tests (`tests/unit/**/*.test.ts`)
   - E2E tests (`tests/e2e/*.test.ts`)
   - Shell tests (`tests/shell/*.bats`)
   - Test utilities (`tests/utils/*.ts`)
   - Test workflows (`tests/workflows/*.test.ts`)

6. **Documentation**
   - Development guide (`AGENTS.md`)
   - User documentation (`README.md`)
   - Architecture (`docs/architecture.md`)
   - Testing guide (`TESTING.md`)
   - Security guide (`SECURITY.md`)
   - Contributing guide (`CONTRIBUTING.md`)
   - CLI reference (`docs/cli.md`)
   - Configuration docs (`docs/configuration.md`)
   - Tool capabilities (`docs/tool-capabilities.md`)

7. **Templates & Build**
   - AGENTS.md templates (`templates/*.md`)
   - Package metadata (`package.json`)
   - TypeScript config (`tsconfig.json`)
   - Build config (`vite.config.ts`, `vitest.config.ts`)
   - Scripts (`scripts/*.js`)
   - Git configuration (`.gitignore`, `.gitmessage.txt`)
