# AgentSync tests

AgentSync tests use Vitest. Run these commands from the repository root.

## Run tests

```bash
# All test files under tests/
pnpm test

# One file or a name pattern
pnpm exec vitest run tests/unit/commands/doctor.test.ts
pnpm exec vitest run -t "GitHub preset"

# Watch or collect coverage
pnpm exec vitest --watch
pnpm test:coverage

# Built-package smoke tests only
pnpm test:e2e
```

`pnpm test` includes unit, integration, workflow, e2e, and probing suites. The
`test:e2e` script is a focused e2e run; e2e tests are not CI-only.

## Test layout

- `tests/unit/` — isolated functions, schemas, commands, and tool behavior.
- `tests/integration/` — sync behavior across presets and tool adapters.
- `tests/workflows/` — in-process CLI journeys; use
  `tests/utils/workflow-harness.ts` and its `runCli`/`withTempProject` helpers.
- `tests/e2e/` — built CLI and filesystem smoke tests.
- `tests/probing/` — contract probes for supported tool behavior.
- `tests/scenarios/` — declarative fixtures used as workflow references.

Choose a unit test for pure logic, an integration or workflow test for a
multi-step sync journey, and an e2e test for built-artifact or platform
behavior. Keep tests isolated with temporary directories and restore modified
environment variables.

Example in-process CLI test:

```typescript
import {
  assertSuccess,
  runCli,
  withTempProject,
} from "./utils/workflow-harness.js";

await withTempProject(async ({ projectDir, homeDir }) => {
  const result = await runCli(["config", "ls", "tools"], {
    cwd: projectDir,
    env: { HOME: homeDir },
  });
  assertSuccess(result);
});
```

Use the current eight leaf commands in CLI tests:

```text
init
sync
doctor
clean
config add
config rm
config ls
config show
```

Tests should assert both the exit code and relevant output. Avoid external
services, timing sleeps, hard-coded absolute paths, and commands outside the current CLI.
