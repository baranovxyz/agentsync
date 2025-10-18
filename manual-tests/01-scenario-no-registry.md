# Scenario 01: No Global Registry

**Purpose**: Test new user experience without MCP registry

**Duration**: ~3 minutes

**Prerequisites**: [00-setup.md](00-setup.md) completed

**Test Focus**:
- Error messages for missing registry
- Help text quality
- User guidance

---

## Test 01.1: Remove Registry (Clean State)

### Commands

```bash
# Backup registry if exists
if [ -f ~/.agentsync/mcp.json ]; then
  mv ~/.agentsync/mcp.json ~/.agentsync/mcp.json.scenario01-backup
  echo "Registry backed up"
fi

# Verify registry doesn't exist
ls ~/.agentsync/mcp.json 2>&1
```

### Expected Output

```
ls: ~/.agentsync/mcp.json: No such file or directory
```

### Pass Criteria

- ✅ Registry file doesn't exist
- ✅ Backup created if it existed

---

## Test 01.2: Create Fresh Test Project

### Commands

```bash
# Create project
mkdir -p /tmp/agentsync-manual-tests/scenario-01-no-registry
cd /tmp/agentsync-manual-tests/scenario-01-no-registry

# Create target directories
mkdir -p .cursor .claude

# Verify location
pwd
ls -la
```

### Expected Output

```
/tmp/agentsync-manual-tests/scenario-01-no-registry

total 0
drwxr-xr-x  .
drwxr-xr-x  ..
drwxr-xr-x  .cursor
drwxr-xr-x  .claude
```

### Pass Criteria

- ✅ Project directory created
- ✅ Target directories exist

---

## Test 01.3: List MCPs Without Registry

### Commands

```bash
agentsync mcp list 2>&1
echo "Exit code: $?"
```

### Expected Output

```
❌ Error: Global MCP registry not found at: ~/.agentsync/mcp.json

Please create it with your MCP server configurations.
Example:
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
  }
}

Exit code: 1
```

### Pass Criteria

- ✅ Error message is clear and helpful
- ✅ Shows correct registry path
- ✅ Provides example JSON
- ✅ Exit code is non-zero (1)
- ✅ No stack traces or technical errors

---

## Test 01.4: Add MCP Without Registry

### Commands

```bash
agentsync mcp add github 2>&1
echo "Exit code: $?"
```

### Expected Output

```
❌ Error: Global MCP registry not found at: ~/.agentsync/mcp.json

Please create it with your MCP server configurations.
Example:
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
  }
}

Exit code: 1
```

### Pass Criteria

- ✅ Same helpful error as list command
- ✅ Consistent error messaging
- ✅ Exit code is 1

---

## Test 01.5: Sync Without Registry

### Commands

```bash
agentsync mcp sync 2>&1
echo "Exit code: $?"
```

### Expected Output

```
❌ Error: Global MCP registry not found at: ~/.agentsync/mcp.json

Please create it with your MCP server configurations.
Example:
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
  }
}

Exit code: 1
```

### Pass Criteria

- ✅ Same error message
- ✅ Consistent behavior across commands
- ✅ Exit code is 1

---

## Test 01.6: Remove MCP Without Registry

### Commands

```bash
agentsync mcp remove github 2>&1
echo "Exit code: $?"
```

### Expected Output

```
❌ Error: Global MCP registry not found at: ~/.agentsync/mcp.json

Please create it with your MCP server configurations.
Example:
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "{GITHUB_TOKEN}" }
  }
}

Exit code: 1
```

### Pass Criteria

- ✅ Same error message
- ✅ Exit code is 1

---

## Test 01.7: Help Commands Still Work

### Commands

```bash
# Main help
agentsync --help | head -20

# MCP help
agentsync mcp --help

# Version
agentsync --version
```

### Expected Output

```
Usage: agentsync [options] [command]
...

Usage: agentsync mcp [options] [command]
...

0.2.0-alpha.2
```

### Pass Criteria

- ✅ Help commands work without registry
- ✅ Version command works
- ✅ No errors

---

## Test 01.8: Check Error Message Quality

### Quality Checklist

Review the error message for:

- [ ] Clear problem statement ("not found")
- [ ] Exact file path shown
- [ ] Solution provided (create file)
- [ ] Example configuration shown
- [ ] Example is valid JSON
- [ ] Example is relevant (github MCP)
- [ ] No technical jargon or stack traces
- [ ] Proper formatting and readability
- [ ] Emoji/symbol for visual clarity (❌)

### Pass Criteria

- ✅ All quality criteria met
- ✅ Error message is user-friendly
- ✅ Actionable guidance provided

---

## Test 01.9: Verify No Side Effects

### Commands

```bash
# Check no files created
ls -la /tmp/agentsync-manual-tests/scenario-01-no-registry/

# Check no global registry created
ls ~/.agentsync/mcp.json 2>&1
```

### Expected Output

```
total 0
drwxr-xr-x  .
drwxr-xr-x  ..
drwxr-xr-x  .cursor
drwxr-xr-x  .claude

ls: ~/.agentsync/mcp.json: No such file or directory
```

### Pass Criteria

- ✅ No .agentsync.json created in project
- ✅ No global registry created
- ✅ Only .cursor and .claude directories exist

---

## Scenario 01 Summary

Record your results:

- **Test 01.1 - Remove Registry**: ✅ ❌ ⚠️
- **Test 01.2 - Create Test Project**: ✅ ❌ ⚠️
- **Test 01.3 - List Without Registry**: ✅ ❌ ⚠️
- **Test 01.4 - Add Without Registry**: ✅ ❌ ⚠️
- **Test 01.5 - Sync Without Registry**: ✅ ❌ ⚠️
- **Test 01.6 - Remove Without Registry**: ✅ ❌ ⚠️
- **Test 01.7 - Help Commands**: ✅ ❌ ⚠️
- **Test 01.8 - Error Quality**: ✅ ❌ ⚠️
- **Test 01.9 - No Side Effects**: ✅ ❌ ⚠️

**Overall Scenario Status**: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL

---

## Key Observations

**Error Message Quality**: [Your assessment]

**User Experience**: [Your assessment]

**Improvements Needed**: [List any issues]

---

## Cleanup

```bash
# Remove test project
cd /tmp/agentsync-manual-tests
rm -rf scenario-01-no-registry

# Keep registry removed for next scenario
# (Scenario 02 will create it)
```

---

**Previous**: [00-setup.md](00-setup.md)
**Next**: [02-scenario-first-time.md](02-scenario-first-time.md)
