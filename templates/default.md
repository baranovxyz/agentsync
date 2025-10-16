# AGENTS.md

## Project Overview

Describe your project here. What does it do? What problem does it solve?

## Build Commands

- Install dependencies: `npm install` or `pnpm install`
- Build project: `npm run build`
- Development mode: `npm run dev`
- Clean build: `npm run clean`

## Test Commands

- Run all tests: `npm test`
- Run tests with coverage: `npm run test:coverage`
- Run specific test: `npm test -- path/to/test`
- Watch mode: `npm run test:watch`

## Code Style

- Use TypeScript for all new code
- Prefer functional programming patterns
- Use ESLint and Prettier for formatting
- Follow conventional commits for git messages
- Maximum line length: 100 characters
- Use 2 spaces for indentation
- Always use semicolons
- Use single quotes for strings

## Project Structure

- `src/` - Source code
- `tests/` - Test files
- `docs/` - Documentation
- `dist/` - Build output
- `node_modules/` - Dependencies (do not modify)
- `.github/` - GitHub Actions workflows
- `scripts/` - Build and utility scripts

## Git Workflow

- Create feature branches from `main`
- Use conventional commit messages (feat:, fix:, chore:, docs:)
- Squash commits before merging
- Require PR reviews before merging to main
- Run tests before committing
- Keep commits atomic and focused

## Permissions

### Allowed Without Prompt

- Read all project files
- Run build commands
- Run test commands
- Install dependencies from package.json
- Format code with prettier/eslint

### Require Approval

- Modify package.json dependencies
- Create or delete files
- Modify configuration files
- Execute shell commands
- Access environment variables

### Blocked

- Access files outside project directory
- Modify .git directory
- Access system files
- Execute privileged commands
- Access private keys or secrets

## MCP Servers

_Optional: List any MCP (Model Context Protocol) servers if using Claude Code or similar_

<!--
Example:
- filesystem: Access to project files
- git: Git operations
- npm: Package management
-->

---

_Generated with [AgentSync](https://github.com/baranovxyz/agentsync)_
