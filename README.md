# AgentSync

> The missing infrastructure layer for AI coding agent configuration management.

**Sync your AGENTS.md to all your AI coding tools** - Cursor, Claude Code, Cline, Windsurf, GitHub Copilot - from a single source of truth.

## 🚧 Development Status

This project is currently under active development. Phase 1 (Foundation + Security) is complete.

### ✅ Completed Components

#### Security Layer (Phase 1)
- **Secret Scanner** - Detects API keys, tokens, and credentials
- **Unicode Attack Detector** - Prevents hidden instruction attacks (CVE-2021-42574)
- **Audit Logger** - Immutable JSONL logs for compliance
- **Error Handler** - Centralized error handling with actionable messages

#### Infrastructure
- **TypeScript Configuration** - Strict mode enabled
- **Vite Build Setup** - Fast CLI builds
- **Vitest Testing** - Unit and integration tests
- **Zod Schemas** - AGENTS.md validation schemas
- **CLI Framework** - Commander.js with all commands scaffolded

### 🔨 In Progress

- [ ] AGENTS.md Parser (using remark/unified)
- [ ] Translator implementations (Cursor, Claude, Cline, Windsurf, Copilot)
- [ ] Atomic Sync Engine with rollback
- [ ] File watcher with debouncing
- [ ] Template library
- [ ] Migration tools

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/agentsync
cd agentsync

# Install dependencies
pnpm install

# Run in development
pnpm dev
```

## Architecture

```
agentsync/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── commands/                 # Command implementations
│   ├── core/                     # Core functionality
│   │   ├── error-handler.ts      ✅ Complete
│   │   ├── parser.ts             🔨 TODO
│   │   └── atomic-sync.ts        🔨 TODO
│   ├── security/                 # Security layer
│   │   ├── secret-scanner.ts     ✅ Complete
│   │   ├── unicode-detector.ts   ✅ Complete
│   │   └── audit-logger.ts       ✅ Complete
│   ├── translators/              # Tool-specific translators
│   ├── templates/                # AGENTS.md templates
│   ├── utils/                    # Utilities
│   └── types/                    # TypeScript types
│       ├── index.ts              ✅ Complete
│       └── schemas.ts            ✅ Complete
└── tests/
    ├── fixtures/
    └── unit/
```

## Security Features

### Secret Detection
Detects and blocks high-severity secrets:
- OpenAI, Anthropic API keys
- GitHub tokens
- AWS credentials
- Database connection strings
- SSH private keys
- And more...

### Unicode Attack Protection
Prevents malicious hidden instructions using:
- Zero-width character detection
- Trojan Source prevention (CVE-2021-42574)
- Homoglyph attack detection
- Suspicious sequence analysis

### Audit Logging
- JSONL format for easy parsing
- Automatic log rotation at 10MB
- 90-day retention with compression
- Tracks all file operations

## Development

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Type checking
pnpm lint

# Run CLI in development
pnpm cli --help
```

## Configuration

AgentSync uses `.agentsync/config.json` for configuration:

```json
{
  "version": "1.0",
  "tools": ["cursor", "claude", "cline"],
  "useSymlinks": true,
  "security": {
    "secretScanning": {
      "enabled": true,
      "blockOnHighSeverity": true
    },
    "unicodeDetection": {
      "enabled": true,
      "blockOnHighRisk": true
    },
    "auditLogging": {
      "enabled": true,
      "retentionDays": 90
    }
  }
}
```

## Contributing

This project follows Apple engineering standards:
- "It Just Works" - zero data loss
- "Sweat the Details" - quality over speed
- Test coverage >80%
- Clear error messages with actionable steps

## License

MIT

## Acknowledgments

Built on the AGENTS.md standard by OpenAI, Sourcegraph, and Google.

Inspired by the need for better AI coding agent infrastructure.