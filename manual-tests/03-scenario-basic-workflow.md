# Scenario 03: Basic MCP Workflow

**Purpose**: Test standard user workflow from add to sync to remove

**Duration**: ~10 minutes

**Prerequisites**: [00-setup.md](00-setup.md), [02-scenario-first-time.md](02-scenario-first-time.md)

**Test Focus**: Complete happy path workflow

---

## Setup

```bash
cd /tmp/agentsync-manual-tests
mkdir -p scenario-03-basic-workflow
cd scenario-03-basic-workflow
mkdir -p .cursor .claude
```

---

## Test 03.1: Add First MCP

```bash
agentsync mcp add github
cat .agentsync.json
```

**Expected**: Config created with `["github"]`

**Pass Criteria**: ✅ Config file created, GitHub added

---

## Test 03.2: Add Second MCP

```bash
agentsync mcp add filesystem
cat .agentsync.json
```

**Expected**: Config shows `["github", "filesystem"]`

**Pass Criteria**: ✅ Both MCPs in config

---

## Test 03.3: List Active MCPs

```bash
agentsync mcp list
```

**Expected**: Shows 2 active, 2 inactive MCPs

**Pass Criteria**: ✅ Correct active/inactive split

---

## Test 03.4: Create .env File

```bash
echo "GITHUB_TOKEN=ghp_test_token_12345" > .env
echo "DATABASE_URL=postgresql://localhost:5432/testdb" >> .env
cat .env
```

**Pass Criteria**: ✅ .env file created

---

## Test 03.5: Dry-Run Sync

```bash
agentsync mcp sync --dry-run
```

**Expected**: Shows what would be synced, no files created

**Pass Criteria**:
- ✅ Preview shown
- ✅ No .cursor/mcp.json created
- ✅ No .claude/mcp.json created

---

## Test 03.6: Actual Sync

```bash
agentsync mcp sync
ls -la .cursor/ .claude/
```

**Expected**: Both target files created

**Pass Criteria**:
- ✅ .cursor/mcp.json exists
- ✅ .claude/mcp.json exists

---

## Test 03.7: Verify Token Substitution

```bash
cat .cursor/mcp.json | grep GITHUB_TOKEN
```

**Expected**: Shows `"GITHUB_TOKEN": "ghp_test_token_12345"` (not `{GITHUB_TOKEN}`)

**Pass Criteria**: ✅ Tokens substituted correctly

---

## Test 03.8: Tool-Specific Sync

```bash
# Remove synced files
rm .cursor/mcp.json .claude/mcp.json

# Sync only to Cursor
agentsync mcp sync --tool cursor
ls -la .cursor/ .claude/
```

**Expected**: Only .cursor/mcp.json created

**Pass Criteria**:
- ✅ .cursor/mcp.json exists
- ✅ .claude/mcp.json does NOT exist

---

## Test 03.9: Remove MCP

```bash
agentsync mcp remove github
cat .agentsync.json
```

**Expected**: Config shows only `["filesystem"]`

**Pass Criteria**: ✅ GitHub removed, filesystem remains

---

## Test 03.10: Sync After Removal

```bash
agentsync mcp sync
cat .cursor/mcp.json | jq keys
```

**Expected**: Only filesystem MCP in synced config

**Pass Criteria**: ✅ GitHub removed from targets

---

## Scenario 03 Summary

- **Test 03.1-10**: ✅ ❌ ⚠️

**Overall**: ✅ PASS | ❌ FAIL

---

**Previous**: [02-scenario-first-time.md](02-scenario-first-time.md)
**Next**: [04-scenario-error-handling.md](04-scenario-error-handling.md)
