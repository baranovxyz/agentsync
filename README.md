<p align="center">
  <h1 align="center">AgentSync</h1>
  <p align="center">
    Sync AI coding agent configuration across tools from a single source of truth.
    <br />
    Define once. Sync to maintainer-validated CLIs, with optional adapters for more tools.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentsync"><img src="https://img.shields.io/npm/v/agentsync.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/baranovxyz/agentsync/actions"><img src="https://img.shields.io/github/actions/workflow/status/baranovxyz/agentsync/ci.yml?branch=main&style=flat-square&label=tests" alt="CI" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/agentsync"><img src="https://img.shields.io/node/v/agentsync?style=flat-square" alt="Node version" /></a>
</p>

> Beta release: `1.0.0-beta.0` is a prerelease for validating the v1 CLI,
> `.agents/` config format, and maintainer-validated adapters before the stable
> 1.0 release. Optional adapters remain available when explicitly configured.
> Install with `npm install -g agentsync@beta`.

---

## The Problem

AI coding CLIs each store configuration differently. Claude Code uses `.claude/commands/` and `.mcp.json`. OpenCode reads `.agents/` directly and uses `opencode.json`. Codex reads `.agents/` directly and writes MCP servers to `.codex/config.toml`. Optional adapters such as Cursor, Copilot, RooCode, and Cline have their own file formats too.

When you use multiple tools — or your team does — you end up maintaining the same rules, commands, and MCP server configs in 3-5 different places. Add a new MCP server? Edit 4 config files. Update a coding standard? Copy-paste across directories. Onboard a new tool? Manually recreate everything.

In monorepos it's worse. Each service needs its own tool configs, but shares org-wide standards. Without a sync layer, config drift is inevitable — your frontend team's Cursor rules diverge from the backend's Claude rules within weeks.

## The Solution

AgentSync is a CLI that reads one config (`.agents/agentsync.toml`) and writes to every tool's native format. Skills, commands, and MCP servers defined once, synced everywhere. Non-interactive, deterministic, CI/CD friendly.

```
┌─────────────────────┐
│  .agents/           │
│  ├── agentsync.toml │──── agentsync sync ────┬──► .claude/skills/*.md
│  ├── skills/*.md    │                        ├──► .claude/commands/*.md
│  ├── commands/*.md  │                        ├──► .mcp.json (Claude)
│  └── agents/*.md    │                        ├──► opencode.json
│                     │                        ├──► .codex/config.toml
│  Presets:           │                        └──► more CLI adapters
│  github:company/std │
└─────────────────────┘
```

Tools that read `.agents/` natively (OpenCode, Codex, Gemini, Amp, Goose, and others) need zero file copies -- AgentSync just ensures the source directory is correct. Tools that need native files get generated outputs in their tool directories.

## Install

```bash
npm install -g agentsync@beta
```

## Quick Start

```bash
# Initialize in your project (non-interactive by default)
agentsync init

# Sync to all enabled tools
agentsync sync

# Preview changes without writing
agentsync sync --dry-run

# Diagnostics
agentsync doctor

# Remove all synced files
agentsync clean
```

This creates `.agents/agentsync.toml`:

```toml
tools = ["claude", "opencode", "codex"]

extends = ["github:company/standards"]

[mcp.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
```

<details>
<summary>MCP server management</summary>

```bash
# Add an MCP server to config
agentsync config add mcp github --mcp-config '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'

# Remove an MCP server
agentsync config rm mcp github

# List configured MCPs
agentsync config ls mcp

# Dump resolved config
agentsync config show
```

MCP servers defined in `[mcp.*]` are enabled by default -- defining a server is enabling it. No separate `mcp_enabled` list needed.

</details>

<details>
<summary>Preset system (shared configs)</summary>

Pull skills, commands, and MCP configs from GitHub repos or local directories:

```toml
extends = [
  "github:company/standards",
  "fs:./local-presets",
]
```

Presets are namespaced to prevent conflicts (`company--typescript.md` in tool outputs). GitHub presets are fetched fresh during sync; there is no persistent preset cache or `--pull` flag in the v1 beta CLI.

</details>

<details>
<summary>Monorepo support</summary>

AgentSync walks from CWD to git root, merging every `.agents/agentsync.toml` it finds:

```
my-monorepo/
├── .agents/agentsync.toml          # Org-wide: tools, shared MCPs
├── frontend/.agents/agentsync.toml # Frontend overrides
└── backend/.agents/agentsync.toml  # Backend overrides
```

Running from `frontend/` merges both configs. Tools lists replace (deepest wins), MCP servers merge per-key (deepest wins).

</details>

<details>
<summary>Role-based profiles</summary>

Define multiple configurations in one file, selected at sync time:

```toml
[profiles.frontend]
tools = ["claude", "opencode"]
mcp = ["storybook", "figma"]

[profiles.backend]
tools = ["claude", "codex"]
mcp = ["postgres"]

[profiles.ci]
tools = ["codex", "claude"]
env = "CI"
```

Profile fields like `mcp`, `skills`, and `extends` use filter semantics -- they restrict the base config to the listed items, rather than accumulating.

```bash
agentsync sync --profile frontend
# or
AGENTSYNC_PROFILE=ci agentsync sync
```

</details>

## Tool Tiers

Validated beta support means the adapter is part of the maintainer release-validation set.

| Validated CLI | Skills | Commands | MCP | Method |
|---------------|--------|----------|-----|--------|
| Claude Code | yes | yes | yes | File copies (`.claude/`) |
| OpenCode | yes | yes | yes | Reads `.agents/` directly |
| Codex | yes | no | yes | Reads `.agents/` directly |
| Gemini | yes | no | yes | Reads `.agents/` directly |
| Amp | yes | yes | yes | Reads `.agents/` directly |
| Goose | yes | no | yes | Reads `.agents/` directly |
| Aider | yes | no | no | AGENTS.md only |
| Amazon Q | yes | no | yes | Reads `.agents/` directly |
| Augment | yes | yes | yes | Reads `.agents/` directly |
| Kiro | yes | no | yes | Reads `.agents/` directly |
| OpenHands | yes | no | yes | Reads `.agents/` directly |
| Junie | yes | no | yes | Reads `.agents/` directly |
| Crush | no | no | yes | MCP only |
| Kilocode | yes | no | yes | Reads `.agents/` directly |
| Qwen | yes | no | yes | Reads `.agents/` directly |

Optional adapters are still supported by the config schema and sync engine, but they are not part of the default validated beta target set.

| Optional Adapter | Skills | Commands | MCP | Method |
|------------------|--------|----------|-----|--------|
| Cursor | yes | yes | yes | File copies (`.cursor/`) |
| Copilot | yes | no | yes | File copies (`.github/`) |
| RooCode | yes | yes | yes | File copies (`.roo/`) |
| Cline | yes | no | no | File copies (`.clinerules/`) |

<details>
<summary>Development</summary>

```bash
git clone https://github.com/baranovxyz/agentsync.git
cd agentsync
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](https://github.com/baranovxyz/agentsync/blob/main/docs/contributing.md) for contribution guidelines.

</details>

## Links

- [npm package](https://www.npmjs.com/package/agentsync)
- [GitHub repository](https://github.com/baranovxyz/agentsync)
- [Configuration guide](https://github.com/baranovxyz/agentsync/blob/main/docs/configuration.md)
- [CLI reference](https://github.com/baranovxyz/agentsync/blob/main/docs/cli.md)
- [Architecture](https://github.com/baranovxyz/agentsync/blob/main/docs/architecture.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
