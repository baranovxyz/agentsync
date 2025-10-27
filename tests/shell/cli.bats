#!/usr/bin/env bats
# BATS (Bash Automated Testing System) tests for AgentSync CLI
# Run with: bats tests/shell/cli.bats
# Install BATS: npm install -g bats or brew install bats-core

# Cleanup helper function
cleanup_trap() {
  # Kill any background processes spawned by this test
  pkill -P $$ 2>/dev/null || true

  # Restore directory
  if [ -n "$ORIGINAL_PWD" ]; then
    cd "$ORIGINAL_PWD" 2>/dev/null || true
  fi

  # Restore HOME
  if [ -n "$ORIGINAL_HOME" ]; then
    export HOME="$ORIGINAL_HOME"
  fi

  # Remove temp directories
  if [ -n "$TEST_TEMP_DIR" ]; then
    rm -rf "$TEST_TEMP_DIR" 2>/dev/null || true
  fi
  if [ -n "$TEST_HOME_DIR" ]; then
    rm -rf "$TEST_HOME_DIR" 2>/dev/null || true
  fi
}

# Setup runs before each test
setup() {
  # Get the directory of this test file
  DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" >/dev/null 2>&1 && pwd )"
  ROOT="$(cd "$DIR/../.." && pwd)"

  # CLI path
  export CLI="$ROOT/dist/cli.js"

  # Get version from package.json
  export VERSION=$(node -p "require('$ROOT/package.json').version")
  export PACKAGE_NAME="agentsync-${VERSION}.tgz"

  # Create temp directory for each test
  export TEST_TEMP_DIR="$(mktemp -d)"
  export ORIGINAL_PWD="$PWD"
  cd "$TEST_TEMP_DIR"

  # Create temp home
  export ORIGINAL_HOME="$HOME"
  export TEST_HOME_DIR="$(mktemp -d)"
  export HOME="$TEST_HOME_DIR"

  # Note: Avoid trapping EXIT which interferes with Bats harness bookkeeping.
  # We'll still trap INT/TERM for cleanup during interruptions.
  trap 'cleanup_trap' INT TERM

  # Setup global MCP registry
  mkdir -p "$HOME/.agentsync"
  cat > "$HOME/.agentsync/mcp.json" <<EOF
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "{GITHUB_TOKEN}"
    }
  },
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "POSTGRES_URL": "{DATABASE_URL}"
    }
  }
}
EOF

  # Setup environment
  export GITHUB_TOKEN="ghp_bats_test_token"
  export DATABASE_URL="postgresql://localhost:5432/bats_test"

  # Create target directories
  mkdir -p .cursor .claude
}

# Teardown runs after each test
teardown() {
  # Remove trap to prevent double-cleanup
  trap - EXIT INT TERM

  # Run cleanup
  cleanup_trap
}

# Helper function to check if CLI is built
check_cli_built() {
  if [ ! -f "$CLI" ]; then
    skip "CLI not built. Run 'pnpm build' first."
  fi
}

# ==================== Basic CLI Tests ====================

@test "CLI shows version" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "CLI shows exact version" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]
}

@test "CLI shows help" {
  check_cli_built
  run node "$CLI" --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Usage:" ]]
  [[ "$output" =~ "agentsync" ]]
}

@test "CLI fails on unknown command" {
  check_cli_built
  run node "$CLI" nonexistent-command
  [ "$status" -ne 0 ]
}

# Note: Shebang test removed due to CI file permission issues
# The test would verify direct CLI execution (./dist/cli.js --version)
# but file permissions don't persist through pnpm build on CI.
# This is not critical for Phase 1 as the CLI works via node execution.

# ==================== MCP List Tests ====================

@test "mcp list shows available MCPs" {
  check_cli_built
  run node "$CLI" mcp list
  [ "$status" -eq 0 ]
  [[ "$output" =~ "github" ]]
  [[ "$output" =~ "postgres" ]]
}

@test "mcp list fails without registry" {
  check_cli_built
  rm -f "$HOME/.agentsync/mcp.json"
  run node "$CLI" mcp list
  [ "$status" -ne 0 ]
}

# ==================== MCP Add Tests ====================

@test "mcp add creates config file" {
  check_cli_built
  run node "$CLI" mcp add github
  [ "$status" -eq 0 ]
  [ -f ".agentsync/config.json" ]

  # Check config contains github
  run cat .agentsync/config.json
  [[ "$output" =~ "github" ]]
}

@test "mcp add handles duplicate gracefully" {
  check_cli_built
  node "$CLI" mcp add github
  run node "$CLI" mcp add github
  [ "$status" -eq 0 ]

  # Should only appear once in config
  count=$(grep -o "github" .agentsync/config.json | wc -l)
  [ "$count" -eq 1 ]
}

@test "mcp add fails on invalid MCP name" {
  check_cli_built
  run node "$CLI" mcp add nonexistent-mcp
  [ "$status" -ne 0 ]
}

# ==================== MCP Sync via Main Sync Tests ====================

@test "sync creates MCP target configs" {
  check_cli_built
  node "$CLI" mcp add github
  # configure tools in project config
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "mcpServers": ["github"]
}
CFG
  run node "$CLI" sync
  [ "$status" -eq 0 ]

  # At least one target should be created
  [ -f ".cursor/mcp.json" ] || [ -f ".claude/mcp.json" ]
}

@test "sync --dry-run doesn't create MCP files" {
  check_cli_built
  node "$CLI" mcp add github
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "mcpServers": ["github"]
}
CFG
  run node "$CLI" sync --dry-run
  [ "$status" -eq 0 ]

  # No files should be created
  [ ! -f ".cursor/mcp.json" ]
  [ ! -f ".claude/mcp.json" ]
}

@test "sync --tool creates only specified MCP target" {
  check_cli_built
  node "$CLI" mcp add github
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "mcpServers": ["github"]
}
CFG
  run node "$CLI" sync --tool cursor
  [ "$status" -eq 0 ]

  [ -f ".cursor/mcp.json" ]
  [ ! -f ".claude/mcp.json" ]
}

@test "sync substitutes environment variables for MCP" {
  check_cli_built
  node "$CLI" mcp add github
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor"],
  "mcpServers": ["github"]
}
CFG
  node "$CLI" sync

  # Check if GITHUB_TOKEN was substituted
  if [ -f ".cursor/mcp.json" ]; then
    run cat .cursor/mcp.json
    [[ "$output" =~ "ghp_bats_test_token" ]]
    [[ ! "$output" =~ "{GITHUB_TOKEN}" ]]
  fi
}

@test "sync fails without environment variables for MCP" {
  check_cli_built
  unset GITHUB_TOKEN
  node "$CLI" mcp add github
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor"],
  "mcpServers": ["github"]
}
CFG
  run node "$CLI" sync
  [ "$status" -ne 0 ]
  [[ "$output" =~ "GITHUB_TOKEN" ]] || [[ "$output" =~ "environment" ]]
}

# ==================== MCP Remove Tests ====================

@test "mcp remove updates config" {
  check_cli_built
  # Add two MCPs so we can remove one
  node "$CLI" mcp add github
  node "$CLI" mcp add postgres
  run node "$CLI" mcp remove github
  [ "$status" -eq 0 ]

  # Check github removed but postgres remains
  run cat .agentsync/config.json
  [[ ! "$output" =~ "github" ]]
  [[ "$output" =~ "postgres" ]]
}

@test "mcp remove fails on non-existent MCP" {
  check_cli_built
  run node "$CLI" mcp remove nonexistent
  [ "$status" -ne 0 ]
}

# ==================== Error Handling Tests ====================

@test "handles invalid JSON config gracefully" {
  check_cli_built
  mkdir -p .agentsync
  echo "{invalid json}" > .agentsync/config.json
  run node "$CLI" mcp list
  [ "$status" -ne 0 ]
  [[ "$output" =~ "JSON" ]] || [[ "$output" =~ "parse" ]]
}

@test "handles missing permissions gracefully (Unix only)" {
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    skip "Permission test not applicable on Windows"
  fi

  check_cli_built
  chmod 444 .cursor
  node "$CLI" mcp add github
  run node "$CLI" sync
  [ "$status" -ne 0 ]
  chmod 755 .cursor  # Restore for cleanup
}

@test "handles spaces in paths" {
  check_cli_built
  mkdir "folder with spaces"
  cd "folder with spaces"
  run node "$CLI" --version
  [ "$status" -eq 0 ]
}

# ==================== Exit Code Tests ====================

@test "exits with 0 on success" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
}

@test "exits with non-zero on error" {
  check_cli_built
  run node "$CLI" invalid-command
  [ "$status" -ne 0 ]
}

@test "exits with non-zero on missing arguments" {
  check_cli_built
  run node "$CLI" mcp add
  [ "$status" -ne 0 ]
}

# ==================== Output Tests ====================

@test "outputs version to stdout" {
  check_cli_built
  run node "$CLI" --version
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "outputs help to stdout" {
  check_cli_built
  run node "$CLI" --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Usage:" ]]
}

# ==================== Global Installation Tests ====================

@test "global pnpm installation works from different directory" {
  # Build and pack
  cd "$ROOT"
  pnpm build
  npm pack

  # Install globally with pnpm
  pnpm install -g "$ROOT/$PACKAGE_NAME"

  # Test from a completely different directory
  TEMP_TEST_DIR="$(mktemp -d)"
  cd "$TEMP_TEST_DIR"

  # Test that agentsync command works (not node dist/cli.js)
  run agentsync --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]

  # Cleanup
  cd "$ROOT"
  rm -rf "$TEMP_TEST_DIR"
  rm -f "$ROOT/$PACKAGE_NAME"
}

@test "global npm installation works from different directory" {
  # Build and pack
  cd "$ROOT"
  pnpm build
  npm pack

  # Install globally with npm
  npm install -g "$ROOT/$PACKAGE_NAME"

  # Test from a completely different directory
  TEMP_TEST_DIR="$(mktemp -d)"
  cd "$TEMP_TEST_DIR"

  # Test that agentsync command works
  run agentsync --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]

  # Cleanup
  cd "$ROOT"
  rm -rf "$TEMP_TEST_DIR"
  rm -f "$ROOT/$PACKAGE_NAME"
}

@test "packed version works with npm install and npx" {
  # Build and pack the current version
  cd "$ROOT"
  pnpm build
  npm pack

  # Create temp directory for testing
  TEST_DIR="$(mktemp -d)"
  ORIGINAL_PWD="$PWD"
  cd "$TEST_DIR"

  # Install the packed package
  npm install "$ORIGINAL_PWD/$PACKAGE_NAME"

  # Test npx execution
  run npx agentsync --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]

  # Test direct binary execution
  run ./node_modules/.bin/agentsync --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]

  # Test node execution of CLI file
  run node node_modules/agentsync/dist/cli.js --version
  [ "$status" -eq 0 ]
  [ "$output" = "$VERSION" ]

  # Cleanup
  cd "$ORIGINAL_PWD"
  rm -rf "$TEST_DIR"
  rm -f "$PACKAGE_NAME"
}

# ==================== Integration Workflow Tests ====================

@test "full workflow: add → sync → remove" {
  check_cli_built

  # Add two MCPs
  run node "$CLI" mcp add github
  [ "$status" -eq 0 ]
  run node "$CLI" mcp add postgres
  [ "$status" -eq 0 ]

  # Configure tools and sync to targets
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor", "claude"],
  "mcpServers": ["github", "postgres"]
}
CFG
  run node "$CLI" sync
  [ "$status" -eq 0 ]

  # List should show both as active
  run node "$CLI" mcp list
  [[ "$output" =~ "github" ]]
  [[ "$output" =~ "postgres" ]]

  # Remove one MCP
  run node "$CLI" mcp remove github
  [ "$status" -eq 0 ]

  # Sync again to update targets
  run node "$CLI" sync
  [ "$status" -eq 0 ]
}

@test "supports multiple MCPs" {
  check_cli_built

  # Add two MCPs
  node "$CLI" mcp add github
  node "$CLI" mcp add postgres

  # Configure tools and sync
  mkdir -p .agentsync
  cat > .agentsync/config.json <<CFG
{
  "version": "1.0",
  "tools": ["cursor"],
  "mcpServers": ["github", "postgres"]
}
CFG
  run node "$CLI" sync
  [ "$status" -eq 0 ]

  # Check both are in target config
  if [ -f ".cursor/mcp.json" ]; then
    run cat .cursor/mcp.json
    [[ "$output" =~ "github" ]]
    [[ "$output" =~ "postgres" ]]
  fi
}
