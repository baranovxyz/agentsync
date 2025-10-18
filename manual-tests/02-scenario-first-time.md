# Scenario 02: First-Time Setup

**Purpose**: Test creating global MCP registry for the first time

**Duration**: ~5 minutes

**Prerequisites**:
- [00-setup.md](00-setup.md) completed
- [01-scenario-no-registry.md](01-scenario-no-registry.md) completed (registry removed)

**Test Focus**:
- Registry creation
- Configuration format validation
- Example MCPs

---

## Test 02.1: Create Global Registry Directory

### Commands

```bash
# Create .agentsync directory
mkdir -p ~/.agentsync

# Verify created
ls -ld ~/.agentsync
```

### Expected Output

```
drwxr-xr-x  ... ~/.agentsync
```

### Pass Criteria

- ✅ Directory created successfully
- ✅ Proper permissions (755)

---

## Test 02.2: Create Minimal Registry

### Commands

```bash
# Create registry with one MCP
cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "{GITHUB_TOKEN}"
    }
  }
}
EOF

# Verify file created
cat ~/.agentsync/mcp.json
```

### Expected Output

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "{GITHUB_TOKEN}"
    }
  }
}
```

### Pass Criteria

- ✅ File created successfully
- ✅ Valid JSON format
- ✅ Contains github MCP

---

## Test 02.3: Validate Registry with List Command

### Commands

```bash
cd /tmp/agentsync-manual-tests
mkdir -p scenario-02-first-time
cd scenario-02-first-time

agentsync mcp list
```

### Expected Output

```
Global MCP Registry (1 server):

Available MCPs:
  • github - @modelcontextprotocol/server-github

No MCPs configured for this project yet.
Run 'agentsync mcp add <server>' to add one.
```

### Pass Criteria

- ✅ Registry loaded successfully
- ✅ GitHub MCP shown
- ✅ Helpful message about adding MCPs
- ✅ No errors

---

## Test 02.4: Add Multiple MCPs to Registry

### Commands

```bash
# Expand registry with more MCPs
cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "{GITHUB_TOKEN}"
    }
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users"],
    "env": {}
  },
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "POSTGRES_URL": "{DATABASE_URL}"
    }
  },
  "brave-search": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-brave-search"],
    "env": {
      "BRAVE_API_KEY": "{BRAVE_API_KEY}"
    }
  }
}
EOF

# List again
agentsync mcp list
```

### Expected Output

```
Global MCP Registry (4 servers):

Available MCPs:
  • github - @modelcontextprotocol/server-github
  • filesystem - @modelcontextprotocol/server-filesystem
  • postgres - @modelcontextprotocol/server-postgres
  • brave-search - @modelcontextprotocol/server-brave-search

No MCPs configured for this project yet.
Run 'agentsync mcp add <server>' to add one.
```

### Pass Criteria

- ✅ All 4 MCPs listed
- ✅ Clear formatting
- ✅ No errors

---

## Test 02.5: Test Invalid JSON Format

### Commands

```bash
# Backup valid registry
cp ~/.agentsync/mcp.json ~/.agentsync/mcp.json.valid

# Create invalid JSON
cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "command": "npx"
    "args": ["-y", "@modelcontextprotocol/server-github"]
  }
}
EOF

# Try to list
agentsync mcp list 2>&1
echo "Exit code: $?"

# Restore valid registry
mv ~/.agentsync/mcp.json.valid ~/.agentsync/mcp.json
```

### Expected Output

```
❌ Error: Failed to parse MCP registry at ~/.agentsync/mcp.json
Invalid JSON syntax

Exit code: 1
```

### Pass Criteria

- ✅ JSON parsing error caught
- ✅ Helpful error message
- ✅ Exit code is 1
- ✅ No stack trace

---

## Test 02.6: Test Missing Required Fields

### Commands

```bash
# Create registry with missing fields
cp ~/.agentsync/mcp.json ~/.agentsync/mcp.json.valid

cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "args": ["-y", "@modelcontextprotocol/server-github"]
  }
}
EOF

# Try to list
agentsync mcp list 2>&1

# Restore
mv ~/.agentsync/mcp.json.valid ~/.agentsync/mcp.json
```

### Expected Output

```
❌ Error: Invalid MCP configuration for 'github'
Missing required field: 'command'
```

### Pass Criteria

- ✅ Validation error caught
- ✅ Specific field mentioned
- ✅ Exit code is non-zero

---

## Scenario 02 Summary

Record your results:

- **Test 02.1 - Create Directory**: ✅ ❌ ⚠️
- **Test 02.2 - Minimal Registry**: ✅ ❌ ⚠️
- **Test 02.3 - Validate Registry**: ✅ ❌ ⚠️
- **Test 02.4 - Multiple MCPs**: ✅ ❌ ⚠️
- **Test 02.5 - Invalid JSON**: ✅ ❌ ⚠️
- **Test 02.6 - Missing Fields**: ✅ ❌ ⚠️

**Overall Scenario Status**: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL

---

## Key Observations

**Registry Format**: [Valid/Issues found]

**Error Handling**: [Assessment]

---

## Cleanup

```bash
cd /tmp/agentsync-manual-tests
rm -rf scenario-02-first-time

# Keep registry for next scenarios
```

---

**Previous**: [01-scenario-no-registry.md](01-scenario-no-registry.md)
**Next**: [03-scenario-basic-workflow.md](03-scenario-basic-workflow.md)
