# Scenario 04: Error Handling and Edge Cases

**Purpose**: Test error cases and edge conditions

**Duration**: ~8 minutes

**Prerequisites**: [00-setup.md](00-setup.md) completed

**Test Focus**: Error messages, validation, edge cases

---

## Setup

```bash
cd /tmp/agentsync-manual-tests
mkdir -p scenario-04-errors
cd scenario-04-errors
mkdir -p .cursor .claude
```

---

## Test 04.1: Add Non-Existent MCP

```bash
agentsync mcp add nonexistent-mcp 2>&1
echo "Exit code: $?"
```

**Expected Error**:
```
❌ Error: MCP server 'nonexistent-mcp' not found in global registry.

Available servers: github, filesystem, postgres, brave-search
```

**Pass Criteria**:
- ✅ Clear error message
- ✅ Lists available servers
- ✅ Exit code is 1

---

## Test 04.2: Add Duplicate MCP

```bash
agentsync mcp add github
agentsync mcp add github 2>&1
cat .agentsync.json
```

**Expected**: Second add should be idempotent, no duplicate

**Pass Criteria**:
- ✅ No error thrown
- ✅ Only one "github" in config
- ✅ Helpful message about already added

---

## Test 04.3: Remove Non-Existent MCP

```bash
agentsync mcp remove nonexistent 2>&1
echo "Exit code: $?"
```

**Expected Error**: MCP not in project config

**Pass Criteria**:
- ✅ Clear error message
- ✅ Exit code is 1

---

## Test 04.4: Remove All MCPs (Empty Config)

```bash
# Ensure only one MCP
echo '{"mcpServers": ["github"]}' > .agentsync.json

# Remove last MCP (should succeed, leaving empty array)
agentsync mcp remove github
echo "Exit code: $?"

# Verify config is now empty
cat .agentsync.json
```

**Expected Output**:
```
✅ Removed MCP server 'github'
Exit code: 0
{"mcpServers": []}
```

**Pass Criteria**:
- ✅ Allows removing last MCP
- ✅ Config becomes {"mcpServers": []}
- ✅ Exit code is 0
- ✅ Empty config is valid (can sync, add new MCPs later)

---

## Test 04.5: Sync Without Environment Variables

```bash
# Remove .env
rm -f .env

# Add MCP requiring env var
agentsync mcp add github

# Try to sync
agentsync mcp sync 2>&1
echo "Exit code: $?"
```

**Expected Error**: Missing GITHUB_TOKEN

**Pass Criteria**:
- ✅ Error mentions GITHUB_TOKEN
- ✅ Suggests adding to .env
- ✅ Exit code is 1

---

## Test 04.6: Invalid JSON in Project Config

```bash
echo '{invalid json}' > .agentsync.json
agentsync mcp list 2>&1
```

**Expected Error**: JSON parse error

**Pass Criteria**:
- ✅ Clear parse error
- ✅ No stack trace
- ✅ Exit code is 1

---

## Test 04.7: No Target Directories

```bash
cd /tmp/agentsync-manual-tests
mkdir -p scenario-04-no-targets
cd scenario-04-no-targets

# Don't create .cursor or .claude
agentsync mcp add github
echo "GITHUB_TOKEN=test" > .env
agentsync mcp sync 2>&1
```

**Expected Error**: No targets detected

**Pass Criteria**:
- ✅ Error message about missing targets
- ✅ Suggests creating .cursor or .claude
- ✅ Exit code is 1

---

## Test 04.8: Permission Denied (Unix only)

```bash
cd /tmp/agentsync-manual-tests/scenario-04-errors
mkdir -p .cursor
chmod 444 .cursor  # Read-only

agentsync mcp add github
echo "GITHUB_TOKEN=test" > .env
agentsync mcp sync 2>&1

# Restore permissions
chmod 755 .cursor
```

**Expected Error**: Permission denied writing to .cursor/mcp.json

**Pass Criteria**:
- ✅ Error mentions permission issue
- ✅ Shows problematic path
- ✅ Exit code is 1

---

## Test 04.9: Spaces in Paths

```bash
cd /tmp/agentsync-manual-tests
mkdir -p "scenario 04 with spaces"
cd "scenario 04 with spaces"
mkdir -p .cursor

agentsync mcp add filesystem
agentsync mcp sync
ls -la .cursor/
```

**Expected**: Works correctly with spaces in path

**Pass Criteria**:
- ✅ No errors
- ✅ .cursor/mcp.json created successfully

---

## Test 04.10: Empty Registry

```bash
echo '{}' > ~/.agentsync/mcp.json
agentsync mcp list 2>&1
```

**Expected**: Shows "No MCPs in global registry"

**Pass Criteria**:
- ✅ Handles empty registry gracefully
- ✅ Helpful message

---

## Scenario 04 Summary

- **Test 04.1 - Non-Existent MCP**: ✅ ❌ ⚠️
- **Test 04.2 - Duplicate MCP**: ✅ ❌ ⚠️
- **Test 04.3 - Remove Non-Existent**: ✅ ❌ ⚠️
- **Test 04.4 - Remove Last MCP**: ✅ ❌ ⚠️
- **Test 04.5 - Missing Env Vars**: ✅ ❌ ⚠️
- **Test 04.6 - Invalid JSON**: ✅ ❌ ⚠️
- **Test 04.7 - No Targets**: ✅ ❌ ⚠️
- **Test 04.8 - Permissions**: ✅ ❌ ⚠️ ⏭️
- **Test 04.9 - Spaces in Paths**: ✅ ❌ ⚠️
- **Test 04.10 - Empty Registry**: ✅ ❌ ⚠️

**Overall**: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL

---

## Cleanup

```bash
# Restore valid registry
cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {"GITHUB_TOKEN": "{GITHUB_TOKEN}"}
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users"],
    "env": {}
  }
}
EOF

cd /tmp/agentsync-manual-tests
rm -rf scenario-04-*
```

---

**Previous**: [03-scenario-basic-workflow.md](03-scenario-basic-workflow.md)
**Next**: [08-cleanup.md](08-cleanup.md)
