# Contributing to AgentSync

Thanks for your interest in contributing to AgentSync! We welcome contributions from the community. Please read through the following guidelines to ensure a smooth and effective contribution process.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

1.  **Find an issue:** Look for existing issues or create your own. Good first issues are a great place to start.
2.  **Fork the repo:** Create your own copy of the project to work on.
3.  **Create a branch:** Use a descriptive branch name like `feat/new-command` or `fix/config-bug`.
4.  **Develop:** Make your changes, following the ground rules below.
5.  **Submit a PR:** Open a pull request with a clear title and description.

## Ground Rules

- Create feature branches; do not push to `main` directly.
- Write tests for new features and bug fixes.
- Keep commits small and focused; use Conventional Commits.
  - Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
  - Format: `type(scope): summary` (max 72 chars)
  - Scopes (suggested): core, cli, mcp, targets, parser, registry, security, tests, docs, ci, release, init
  - Use `pnpm cz` for guided messages (Commitizen)

## Development

- Install: `pnpm install`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint (typecheck): `pnpm lint`

## Security

- Do not include secrets in issues, PRs, code, or tests.
- Follow guidance in [SECURITY.md](SECURITY.md).

## PR Checklist

- [ ] Conventional commit title
- [ ] Small, atomic PR (split if >800 LOC changed)
- [ ] Tests added/updated
- [ ] Docs updated (if needed)
- [ ] CI green

## License

By contributing, you agree your contributions are licensed under the project license.
