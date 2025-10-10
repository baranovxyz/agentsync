# Multi-Agent Code Tool Requirements

## Problem Statement

Teams use multiple AI coding agents (Cursor, Claude Code, Windsurf, etc.) but lack a unified way to share:
- Rules/configurations
- Slash commands
- Prompts
- Memory banks
- Documentation

**Goal**: Create a tool that provides a single source of truth for AI coding agent configurations across different tools and team levels.

---

## Core Requirements

### 1. Multi-Layer Configuration System

**Four layers of configuration (priority: most specific → most general):**

1. **User-local settings** - Personal preferences, overrides
2. **Project-level settings** - Team-agreed rules, commands
3. **Organization-level settings** - Company-wide standards, shared prompts
4. **Global settings** - Universal defaults (optional)

### 2. Agent Compatibility

**Must support:**
- Cursor (`.cursorrules`, `.cursor/rules/*.mdc`)
- Claude Code (`.claude/CLAUDE.md`, `.claude/commands/*.md`)
- Windsurf (and other emerging tools)

**Strategy**: Translate from single source format to each tool's native format

### 3. Scope-Based Content Organization

**Different audiences need different content:**
- **Frontend developers**: React patterns, component rules, TypeScript configs
- **Backend developers**: API patterns, database rules, security checks
- **QA engineers**: Testing patterns, validation rules
- **Universal**: Commit helpers, documentation standards, git workflows

### 4. Monorepo Constraints

**Technical limitation**: Cannot use symlinks (not supported in our monorepo)

**Required approach**:
- Centralized source directory in monorepo root
- Copy-on-the-fly mechanism to sync to tool-specific locations
- Watch for changes and auto-propagate

---

## Use Cases

### Use Case 1: Shared Slash Command
**Example**: `/smart-commit` command useful for entire organization
- Should be available in all projects
- Works regardless of Cursor/Claude Code/Windsurf
- Single definition, multiple tool formats

### Use Case 2: Team-Specific Rules
**Example**: Frontend team React patterns
- Only relevant to frontend projects
- Should not clutter backend developer configs
- Project-level or org-level scoping

### Use Case 3: Personal Preferences
**Example**: Individual developer's preferred commit style
- User-local override
- Doesn't affect team
- Portable across projects

---

## Technical Design Requirements

### 1. Source of Truth Structure

```
<monorepo-root>/
├── .ai-agents/                          # Central config directory
│   ├── organization/                    # Layer 4: Org-wide
│   │   ├── rules/
│   │   │   ├── security.md
│   │   │   └── git-workflow.md
│   │   ├── commands/
│   │   │   ├── smart-commit.md
│   │   │   └── generate-docs.md
│   │   └── prompts/
│   │       └── code-review.md
│   ├── scopes/                          # Scope-based organization
│   │   ├── frontend/
│   │   │   ├── rules/
│   │   │   └── commands/
│   │   ├── backend/
│   │   └── qa/
│   └── config.yaml                      # Tool configuration
│
├── packages/frontend-app/               # Project example
│   ├── .ai-agents/                      # Layer 3: Project-level
│   │   ├── rules/
│   │   └── commands/
│   ├── .cursor/                         # Generated for Cursor
│   │   └── rules/
│   └── .claude/                         # Generated for Claude Code
│       └── commands/
│
└── ~/.ai-agents/                        # Layer 1-2: User-local
    └── overrides/
```

### 2. File Sync Mechanism

**Requirements**:
- Watch `.ai-agents/` directories for changes
- Generate tool-specific formats on-the-fly
- Copy to appropriate tool directories
- Handle file format translation (MD → MDC, etc.)

**Proposed implementation**:
- CLI tool: `ai-agent-sync`
- Commands: `sync`, `watch`, `init`
- Configuration-driven translation rules

### 3. Priority/Merge Strategy

**When multiple layers define the same rule/command:**
1. User-local overrides all
2. Project-level overrides organization
3. Organization overrides global defaults
4. Explicit merge strategies for arrays/lists

---

## Open Questions

1. **File format**: Should source files be in universal markdown, YAML, or tool-agnostic DSL?
2. **Auto-sync timing**: On file save, on git commit, manual trigger, or daemon watch?
3. **Conflict resolution**: How to handle incompatible features across tools?
4. **Discovery**: How do developers learn what commands/rules are available?
5. **Validation**: How to ensure generated configs are valid for each tool?
6. **Migration**: How to import existing `.cursorrules` or `CLAUDE.md` files?

---

## Success Criteria

1. ✅ Single command to sync all AI agent configs across monorepo
2. ✅ Team can add shared slash command once, works in all tools
3. ✅ Frontend devs don't see backend rules and vice versa
4. ✅ Personal preferences don't leak into team configs
5. ✅ No symlinks required (copy-based approach)
6. ✅ Works with Cursor, Claude Code, Windsurf out of the box
7. ✅ Easy onboarding: `npx ai-agent-sync init`

---

## Next Steps

1. **Design config format** - Define universal schema for rules/commands
2. **Build file translator** - Convert universal format → tool-specific formats
3. **Implement sync CLI** - Create `ai-agent-sync` tool with watch mode
4. **Define scoping system** - How to tag content for frontend/backend/qa/universal
5. **Create migration tools** - Import existing configs into centralized structure
6. **Write documentation** - Team onboarding guide and best practices