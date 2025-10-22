# Interactive Selection Documentation

Interactive Selection provides fine-grained control over preset content with file-level selections and a three-level configuration hierarchy. This feature allows you to selectively adopt parts of presets rather than using them entirely.

## Overview

Interactive Selection enables you to:

- Selectively include/exclude files from presets using glob patterns
- Choose specific MCP servers from presets
- Maintain a three-level configuration hierarchy (user → project → local)
- Interactively manage selections through a user-friendly CLI
- Validate and migrate configurations automatically

## Quick Start

```bash
# Interactively select presets and configure file-level selections
agentsync preset interactive-select

# View configured presets with selections
agentsync preset list --verbose

# Sync with selections applied
agentsync sync --selections

# Interactively remove presets and selections
agentsync preset interactive-remove

# Add a preset with selection configuration
agentsync preset add github:company/standards --selection
```

## Three-Level Configuration Hierarchy

Interactive Selection supports a three-level configuration hierarchy that allows for flexible preset management:

### 1. User Level (`~/.agentsync/interactive-selection.json`)

**Purpose:** Personal default selections for all projects
**Created by:** `agentsync preset interactive-select` (when saving to user level)
**Location:** Home directory
**Git:** NOT committed (personal configuration)

```json
{
  "version": "2.0",
  "user": {
    "presets": ["github:company/standards", "github:personal/tools"],
    "defaultSelections": {
      "github:company/standards": {
        "rules": {
          "include": ["typescript.md", "testing.md"],
          "exclude": ["deprecated/*"]
        },
        "commands": {
          "include": ["commit.md", "deploy.md"]
        },
        "mcps": ["github", "postgres"]
      }
    }
  }
}
```

### 2. Project Level (`.agentsync/config.json`)

**Purpose:** Team-shared selections and project-specific overrides
**Created by:** `agentsync preset interactive-select` (when saving to project level)
**Modified by:** `agentsync preset interactive-select/remove` commands
**Git:** Committed to repository

```json
{
  "version": "1.0",
  "extends": ["github:company/standards"],
  "tools": ["cursor", "claude"],
  "interactiveSelection": {
    "version": "2.0",
    "project": {
      "selections": {
        "github:company/standards": {
          "rules": {
            "include": ["typescript.md", "testing.md"],
            "exclude": ["deprecated/*"]
          },
          "commands": {
            "include": ["commit.md", "deploy.md"]
          },
          "mcps": ["github", "postgres"]
        }
      },
      "overrides": {
        "tools": ["cursor", "claude", "windsurf"]
      }
    }
  }
}
```

### 3. Local Level (`agentsync.local.json`)

**Purpose:** Personal overrides for this project
**Created by:** User manually or `agentsync preset interactive-select` (when saving to local level)
**Git:** NOT committed (in `.gitignore`)

```json
{
  "interactiveSelection": {
    "version": "2.0",
    "local": {
      "selections": {
        "github:company/standards": {
          "rules": {
            "include": ["typescript.md", "testing.md", "debugging.md"]
          }
        }
      },
      "overrides": {
        "tools": ["cursor", "claude", "windsurf", "cline"]
      }
    }
  }
}
```

## Configuration Priority

The three levels merge with the following priority order (later levels override earlier ones):

1. **User Level** - Base configuration
2. **Project Level** - Overrides user level
3. **Local Level** - Overrides both user and project levels

For selections, the merge is field-level:

- If user level selects `rules: ["typescript.md"]`
- And project level selects `rules: ["testing.md"]`
- The result is `rules: ["typescript.md", "testing.md"]`

For overrides, the merge is complete replacement:

- If project level overrides `tools: ["cursor", "claude"]`
- And local level overrides `tools: ["cursor", "claude", "windsurf"]`
- The result is `tools: ["cursor", "claude", "windsurf"]`

## File-Level Selections

### Selection Schema

Each preset selection can include three types of content:

```json
{
  "presetSource": {
    "rules": {
      "include": ["glob-pattern-1", "glob-pattern-2"],
      "exclude": ["exclude-pattern-1", "exclude-pattern-2"]
    },
    "commands": {
      "include": ["glob-pattern-1", "glob-pattern-2"],
      "exclude": ["exclude-pattern-1", "exclude-pattern-2"]
    },
    "mcps": ["mcp-server-1", "mcp-server-2"]
  }
}
```

### Glob Pattern Support

File patterns support standard glob syntax:

- `*` - Match any characters except `/`
- `**` - Match any characters including `/`
- `?` - Match any single character
- `[]` - Match any character in the set
- `{}` - Match any of the comma-separated alternatives

**Examples:**

- `*.md` - All markdown files
- `rules/*.md` - All markdown files in rules directory
- `rules/**/*.md` - All markdown files in rules directory and subdirectories
- `typescript.{md,txt}` - Either `typescript.md` or `typescript.txt`
- `test?.md` - `test1.md`, `test2.md`, etc.

### Selection Examples

**1. Select only TypeScript-related rules:**

```json
{
  "rules": {
    "include": ["typescript.md", "ts-*.md", "types/**/*.md"]
  }
}
```

**2. Select all rules except deprecated ones:**

```json
{
  "rules": {
    "include": ["**/*.md"],
    "exclude": ["deprecated/*", "old/*"]
  }
}
```

**3. Select specific commands and MCPs:**

```json
{
  "commands": {
    "include": ["commit.md", "deploy.md", "test.md"]
  },
  "mcps": ["github", "postgres", "redis"]
}
```

## Commands

### `agentsync preset interactive-select`

Interactively select presets and configure file-level selections.

```bash
agentsync preset interactive-select [--yes]
```

**Options:**

- `--yes` - Skip confirmation prompts

**Process:**

1. Load current configuration
2. Show available preset sources (GitHub + user registry)
3. Let user select a preset source
4. Load preset content from GitHub
5. Let user select content types (rules, commands, MCPs)
6. Configure file patterns for each selected type
7. Validate selection against preset content
8. Show preview of selected content
9. Confirm and save to configuration

**Example Output:**

```
🎯 Interactive Preset Selection

? Select a preset source: 📦 github:company/standards - Company coding standards
📁 Available rules files:
  typescript.md
  testing.md
  security.md
  deprecated/old-rules.md

? Include patterns for rules (comma-separated): typescript.md, testing.md
? Exclude patterns for rules (comma-separated, optional): deprecated/*

📋 Preview of Selection:

📋 Rules (2 files):
  ✓ typescript.md
  ✓ testing.md

⚡ Commands (1 files):
  ✓ commit.md

🔌 MCPs (2 servers):
  ✓ github
  ✓ postgres

? Save this selection to configuration? (Y/n)
✅ Selection saved successfully!
Run 'agentsync sync' to apply the selection.
```

### `agentsync preset interactive-remove`

Interactively remove presets and their selections from configuration.

```bash
agentsync preset interactive-remove [--yes]
```

**Options:**

- `--yes` - Skip confirmation prompts

**Process:**

1. Load current configuration
2. Show configured preset sources with selections
3. Let user select a preset to remove
4. Show available configuration levels for this preset
5. Let user select configuration level
6. Let user choose removal type (entire preset or specific selections)
7. If specific removal, let user select content types
8. Show preview of what will be removed
9. Confirm and apply removal
10. If user preset, offer to remove from registry

### `agentsync preset list --verbose`

List configured presets with detailed selection information.

```bash
agentsync preset list [--verbose]
```

**Options:**

- `--verbose` - Show detailed information including selections

**Example Output:**

```
📚 Extended Presets

github:company/standards
  Namespace: company
  Selections:
    Rules: typescript.md, testing.md (exclude: deprecated/*)
    Commands: commit.md, deploy.md
    MCPs: github, postgres
  ✓ Cached (2.3MB, last updated: 10/20/2024)

github:personal/tools
  Namespace: personal
  Selections:
    Commands: debug.md, lint.md
  ✓ Cached (1.1MB, last updated: 10/18/2024)

📋 2 presets with interactive selections
Use 'agentsync preset interactive-select' to manage selections
Use 'agentsync sync --selections' to sync with selections
```

### `agentsync preset add <source> --selection`

Add a preset to project configuration with optional selection configuration.

```bash
agentsync preset add <source> [--selection] [--yes]
```

**Arguments:**

- `<source>` - Preset source (e.g., `github:org/repo`)

**Options:**

- `--selection` - Configure selection for the preset
- `--yes` - Skip confirmation prompts

### `agentsync sync --selections`

Sync libraries, rules, commands, and MCPs to AI tools with selections applied.

```bash
agentsync sync [--selections] [--update] [--dry-run] [--tool <name>]
```

**Options:**

- `--selections` - Use interactive selections for selective loading
- `--update` - Update GitHub library caches (re-clone)
- `--dry-run` - Preview changes without applying them
- `--tool <name>` - Sync only to specific tool (cursor, claude)

## Use Cases

### 1. Selective Rule Adoption

**Scenario:** Your company has a comprehensive preset with 50+ rules, but your project only needs TypeScript and testing rules.

**Solution:** Use interactive selection to include only relevant rules:

```json
{
  "github:company/standards": {
    "rules": {
      "include": ["typescript.md", "testing.md", "ts-*.md"],
      "exclude": ["deprecated/*"]
    }
  }
}
```

**Benefits:**

- Reduced AI context bloat
- Faster AI responses
- Focus on relevant rules only
- Gradual migration to new standards

### 2. Team Customization

**Scenario:** Different teams in your company need different subsets of the company standards.

**Solution:** Each team creates project-level selections:

**Frontend Team:**

```json
{
  "github:company/standards": {
    "rules": {
      "include": ["react.md", "css.md", "typescript.md", "frontend-testing.md"]
    },
    "mcps": ["github", "figma", "vercel"]
  }
}
```

**Backend Team:**

```json
{
  "github:company/standards": {
    "rules": {
      "include": ["api.md", "database.md", "security.md", "backend-testing.md"]
    },
    "mcps": ["github", "postgres", "redis"]
  }
}
```

**Benefits:**

- Teams get relevant content only
- Maintains consistency with company standards
- Allows team-specific customizations
- Reduces cognitive load

### 3. Personal Preferences

**Scenario:** A developer wants to add personal tools without affecting the team configuration.

**Solution:** Create local-level overrides:

```json
{
  "interactiveSelection": {
    "local": {
      "selections": {
        "github:company/standards": {
          "rules": {
            "include": ["typescript.md", "testing.md", "debugging.md"]
          }
        }
      },
      "overrides": {
        "tools": ["cursor", "claude", "windsurf", "cline"]
      }
    }
  }
}
```

**Benefits:**

- Personal customization without team impact
- Temporary selections for specific tasks
- Experimentation without commitment
- Personal tool preferences

### 4. Gradual Migration

**Scenario:** Migrating from old standards to new ones gradually.

**Solution:** Start with a subset and expand over time:

**Phase 1:**

```json
{
  "github:company/new-standards": {
    "rules": {
      "include": ["typescript.md"]
    }
  }
}
```

**Phase 2:**

```json
{
  "github:company/new-standards": {
    "rules": {
      "include": ["typescript.md", "testing.md"]
    }
  }
}
```

**Phase 3:**

```json
{
  "github:company/new-standards": {
    "rules": {
      "include": ["**/*.md"],
      "exclude": ["deprecated/*"]
    }
  }
}
```

**Benefits:**

- Controlled migration process
- Reduced risk
- Team can adapt gradually
- Easy rollback if needed

## Configuration Schema

### InteractiveSelectionConfig

```typescript
interface InteractiveSelectionConfig {
  version: string; // "2.0"
  user?: UserRegistryConfig;
  project?: ProjectConfig;
  local?: LocalConfig;
}
```

### UserRegistryConfig

```typescript
interface UserRegistryConfig {
  presets: string[]; // List of preset sources
  defaultSelections?: Record<string, PresetSelection>; // Default selections for presets
}
```

### ProjectConfig

```typescript
interface ProjectConfig {
  selections?: Record<string, PresetSelection>; // Project-level selections
  overrides?: Record<string, any>; // Project-level overrides
  tools?: ToolName[]; // Target tools for this project
}
```

### LocalConfig

```typescript
interface LocalConfig {
  selections?: Record<string, PresetSelection>; // Local-level selections
  overrides?: Record<string, any>; // Local-level overrides
}
```

### PresetSelection

```typescript
interface PresetSelection {
  rules?: FileSelection; // File patterns for rules
  commands?: FileSelection; // File patterns for commands
  mcps?: string[]; // List of MCP server names
}
```

### FileSelection

```typescript
interface FileSelection {
  include: string[]; // Glob patterns to include
  exclude?: string[]; // Glob patterns to exclude
}
```

## Validation and Error Handling

### Selection Validation

Interactive Selection validates selections against preset content:

1. **Pattern Validation** - Ensures glob patterns are valid
2. **File Existence** - Checks if selected files exist in preset
3. **MCP Validation** - Verifies selected MCPs exist in preset
4. **Schema Validation** - Validates configuration structure

### Common Validation Errors

**Invalid Glob Pattern:**

```
❌ Selection validation failed
Pattern "[invalid" is not a valid glob pattern
```

**File Not Found:**

```
❌ Selection validation failed
File "nonexistent.md" not found in preset "github:company/standards"
```

**MCP Not Found:**

```
❌ Selection validation failed
MCP server "nonexistent" not found in preset "github:company/standards"
```

### Error Recovery

1. **Interactive Prompts** - Clear error messages with actionable steps
2. **Validation Before Save** - Prevents invalid configurations
3. **Rollback Support** - Automatic rollback on save failures
4. **Helpful Suggestions** - Provides guidance for fixing issues

## Migration from v1.0 to v2.0

Interactive Selection v2.0 introduced the three-level hierarchy. Migration is automatic:

### v1.0 Configuration

```json
{
  "version": "1.0",
  "selections": {
    "github:company/standards": {
      "rules": {
        "include": ["typescript.md"]
      }
    }
  }
}
```

### v2.0 Configuration (after migration)

```json
{
  "version": "2.0",
  "project": {
    "selections": {
      "github:company/standards": {
        "rules": {
          "include": ["typescript.md"]
        }
      }
    }
  }
}
```

### Migration Process

1. **Automatic Detection** - Detects v1.0 configuration
2. **Backup Creation** - Creates backup of original configuration
3. **Schema Migration** - Converts to v2.0 format
4. **Validation** - Validates migrated configuration
5. **Success Confirmation** - Reports migration status

## Troubleshooting

### Common Issues

#### 1. Selection Not Applied

**Problem:** Selections configured but not applied during sync.

**Solution:**

- Ensure you're using `agentsync sync --selections`
- Check that selections are properly configured
- Verify preset source matches exactly

```bash
# Check selections
agentsync preset list --verbose

# Sync with selections
agentsync sync --selections
```

#### 2. Invalid Glob Patterns

**Problem:** Glob patterns not matching expected files.

**Solution:**

- Use proper glob syntax
- Test patterns with `agentsync preset interactive-select`
- Check file paths in preset repository

**Common mistakes:**

- Using backslashes instead of forward slashes
- Missing `**/` for recursive patterns
- Incorrect special character escaping

#### 3. Configuration Conflicts

**Problem:** Conflicts between configuration levels.

**Solution:**

- Understand priority order (user → project → local)
- Use `agentsync preset list --verbose` to see effective selections
- Check for duplicate preset sources

#### 4. MCP Server Not Found

**Problem:** Selected MCP server not available in preset.

**Solution:**

- Verify MCP name matches preset exactly
- Check preset repository for available MCPs
- Use interactive selection to see available options

#### 5. Permission Issues

**Problem:** Cannot save configuration files.

**Solution:**

- Check file permissions for `.agentsync/` directory
- Ensure write access to configuration files
- Run with appropriate user permissions

### Debug Commands

```bash
# Check configuration syntax
cat .agentsync/config.json | jq .

# Validate selections
agentsync preset interactive-select --yes

# Preview sync with selections
agentsync sync --selections --dry-run

# Check cache status
agentsync preset list --verbose
```

### Getting Help

1. **Use verbose mode** - `--verbose` flag provides detailed information
2. **Check logs** - `.agentsync/logs/` directory contains detailed logs
3. **Validate configuration** - Use interactive commands to validate
4. **Start fresh** - Delete `.agentsync/` and run `agentsync init` if needed

## Best Practices

### 1. Organization

- Use descriptive glob patterns
- Group related files together
- Document selection rationale
- Keep selections minimal

### 2. Team Collaboration

- Commit project-level selections
- Use local overrides for personal preferences
- Document team standards
- Review selections regularly

### 3. Performance

- Minimize selected files
- Use specific patterns instead of broad ones
- Exclude unnecessary files
- Monitor AI context size

### 4. Maintenance

- Review selections periodically
- Update when presets change
- Remove unused selections
- Backup configurations

## Examples Repository

See [github:agentsync/interactive-selection-examples](https://github.com/agentsync/interactive-selection-examples) for:

- Complete configuration examples
- Common selection patterns
- Team setup templates
- Migration examples
- Troubleshooting scenarios

## API Reference

### ConfigMerger Class

```typescript
class ConfigMerger {
  mergeConfig(config: InteractiveSelectionConfig): MergedConfig;
  applySelections(preset: Preset, selection: PresetSelection): AppliedSelection;
  validateMCPSelection(
    preset: Preset,
    selection: PresetSelection
  ): ValidationResult;
  getEffectiveSelection(
    presetSource: string,
    mergedConfig: MergedConfig
  ): PresetSelection;
}
```

### Utility Functions

```typescript
// Load selections for project
loadSelectionsForProject(cwd: string): Promise<Record<string, PresetSelection>>

// Save selections for project
saveSelectionsForProject(cwd: string, selections: Record<string, PresetSelection>): Promise<void>

// Validate configuration
validateInteractiveSelectionConfig(data: unknown): InteractiveSelectionConfig
```

## Contributing

To contribute to Interactive Selection:

1. **Fork the repository**
2. **Create a feature branch**
3. **Add tests for new features**
4. **Update documentation**
5. **Submit a pull request**

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.
