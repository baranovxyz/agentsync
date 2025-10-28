# Testing

Minimal guide for running tests. See docs/testing.md for full strategy and details.

## Test pyramid

```
       ┌─────────────────────┐
       │  E2E Smoke (CI)     │ packaging-only
       ├─────────────────────┤
       │  Workflows          │ in-process CLI flows
       ├─────────────────────┤
       │  Unit               │ pure logic, fast
       └─────────────────────┘
```

- E2E smoke: packaging/shebang checks; minimal, CI-only
- Workflows: realistic CLI flows; fast and deterministic
- Unit: pure logic; no I/O or filesystem

## Run tests

```bash
pnpm test
```

## Useful commands

```bash
# Run specific file
pnpm test -- tests/workflows/mcp-basic.test.ts

# Run tests matching pattern
pnpm test -- --grep "MCP"

# Coverage
pnpm test -- --coverage

# Unit vs workflow
pnpm test -- tests/unit/
pnpm test -- tests/workflows/
```

## Example: workflow harness

```ts
import { runCli, assertSuccess } from "../utils/workflow-harness.js";

it("adds MCP server", async () => {
  const result = await runCli(["mcp", "add", "github"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  assertSuccess(result);
});
```

## Links

- Testing documentation: docs/testing.md
- CLI reference: docs/cli.md
