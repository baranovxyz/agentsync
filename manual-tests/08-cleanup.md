# Scenario 08: Cleanup and Teardown

**Purpose**: Clean up test environment and restore system state

**Duration**: ~2 minutes

**Prerequisites**: All other scenarios completed

---

## Test 08.1: Unlink Global Install

### Commands

```bash
# Unlink agentsync
pnpm unlink --global agentsync

# Verify unlinked
which agentsync 2>&1
echo "Exit code: $?"
```

### Expected Output

```
agentsync not found

Exit code: 1
```

### Pass Criteria

- ✅ agentsync command no longer available
- ✅ which returns non-zero exit code

---

## Test 08.2: Remove Test Projects

### Commands

```bash
# Remove all test directories
rm -rf /tmp/agentsync-manual-tests

# Verify removed
ls /tmp/agentsync-manual-tests 2>&1
```

### Expected Output

```
ls: /tmp/agentsync-manual-tests: No such file or directory
```

### Pass Criteria

- ✅ Test directory removed
- ✅ No leftover test projects

---

## Test 08.3: Restore MCP Registry (Optional)

### Commands

```bash
# If you had a backup
if [ -f ~/.agentsync/mcp.json.scenario01-backup ]; then
  mv ~/.agentsync/mcp.json.scenario01-backup ~/.agentsync/mcp.json
  echo "Registry restored from backup"
else
  echo "No backup to restore"
fi

# Or remove test registry
# rm ~/.agentsync/mcp.json

# List what's there
ls -la ~/.agentsync/
```

### Expected Output

```
Registry restored from backup
```

**OR**

```
No backup to restore
```

### Pass Criteria

- ✅ Original registry restored (if backup existed)
- ✅ OR test registry removed

---

## Test 08.4: Verify Clean State

### Commands

```bash
# Check for leftover files
find /tmp -name "*agentsync*" -type d 2>/dev/null | head -5

# Check global state
ls -la ~/.agentsync/

# Try to run agentsync (should fail)
agentsync --version 2>&1
```

### Expected Output

```
[No or minimal tmp files]

~/.agentsync/:
total 8
drwxr-xr-x  ...
-rw-r--r--  ... mcp.json

agentsync: command not found
```

### Pass Criteria

- ✅ No test directories in /tmp
- ✅ ~/.agentsync clean or restored
- ✅ agentsync not in PATH

---

## Test 08.5: Document Test Session

### Commands

```bash
# Show test summary
echo "=== Manual Test Session Summary ==="
echo "Date: $(date)"
echo "Version tested: 0.2.0-alpha.2"
echo "Platform: $(uname -s)"
echo "Node: $(node --version)"
echo ""
echo "Scenarios completed:"
echo "  [✅/❌] 00 - Setup"
echo "  [✅/❌] 01 - No Registry"
echo "  [✅/❌] 02 - First-Time Setup"
echo "  [✅/❌] 03 - Basic Workflow"
echo "  [✅/❌] 04 - Error Handling"
echo "  [✅/❌] 08 - Cleanup"
echo ""
echo "Overall result: [PASS/FAIL]"
```

### Expected Output

```
=== Manual Test Session Summary ===
Date: [current date]
Version tested: 0.2.0-alpha.2
Platform: Darwin (or Linux)
Node: v20.x.x

Scenarios completed:
  [✅] 00 - Setup
  [✅] 01 - No Registry
  [✅] 02 - First-Time Setup
  [✅] 03 - Basic Workflow
  [✅] 04 - Error Handling
  [✅] 08 - Cleanup

Overall result: PASS
```

### Pass Criteria

- ✅ Summary generated
- ✅ All scenarios marked

---

## Cleanup Checklist

Verify all cleanup steps completed:

- [ ] Global link removed
- [ ] Test directories deleted
- [ ] Registry restored or documented
- [ ] No leftover files in /tmp
- [ ] Test results recorded
- [ ] Issues documented (if any)

---

## Post-Cleanup Actions

### If All Tests Passed

```markdown
✅ **Ready for Release**

- All manual tests passed
- No blocker issues found
- Documentation verified
- Ready to publish to npm
```

### If Tests Failed

```markdown
❌ **Not Ready for Release**

Issues found:

1. [List issues]
2. [List issues]

Recommended actions:

- Fix blocker issues
- Re-run affected scenarios
- Update documentation if needed
```

---

## Final Verification

### Commands

```bash
# Back to project directory
cd <PROJECT_ROOT>

# Verify git status
git status

# Check version
cat package.json | grep version
```

### Next Steps

1. ✅ Review test results
2. ✅ Fix any issues found
3. ✅ Update CHANGELOG.md
4. ✅ Create git tag
5. ✅ Publish to npm (if tests passed)

---

## Scenario 08 Summary

- **Test 08.1 - Unlink Install**: ✅ ❌ ⚠️
- **Test 08.2 - Remove Tests**: ✅ ❌ ⚠️
- **Test 08.3 - Restore Registry**: ✅ ❌ ⚠️
- **Test 08.4 - Verify Clean**: ✅ ❌ ⚠️
- **Test 08.5 - Document Session**: ✅ ❌ ⚠️

**Overall Cleanup Status**: ✅ COMPLETE | ❌ INCOMPLETE

---

## Test Session Complete

**Thank you for running the manual test suite!**

Your testing helps ensure AgentSync quality and user experience.

---

**Previous**: [04-scenario-error-handling.md](04-scenario-error-handling.md)
**Return to**: [README.md](README.md)
