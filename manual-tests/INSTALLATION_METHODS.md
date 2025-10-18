# Local Installation Methods for Testing

This guide shows different ways to install and test AgentSync locally before publishing to npm.

## Quick Reference

| Method               | Use Case               | Setup Time | Reflects Production |
| -------------------- | ---------------------- | ---------- | ------------------- |
| **pnpm link**        | Development & testing  | 30s        | ⚠️ Medium           |
| **Direct execution** | Quick testing          | 10s        | ❌ Low              |
| **pnpm pack**        | Pre-publish validation | 1min       | ✅ High             |
| **Isolated env**     | Full production test   | 2min       | ✅ Highest          |

## Method 1: pnpm link (Recommended for Testing)

**Best for**: Running manual test suite, daily development

### Setup

```bash
cd <PROJECT_ROOT>
pnpm build
pnpm link --global
```

### Verify

```bash
which agentsync
# <PATH_TO_PNPM_BIN>/agentsync  # e.g., ~/Library/pnpm/agentsync

agentsync --version
# 0.2.0-alpha.2
```

### Usage

```bash
# Use anywhere
cd /tmp/test-project
agentsync mcp list
agentsync mcp add github
```

### Cleanup

```bash
pnpm unlink --global agentsync
```

### Pros/Cons

✅ **Pros**:

- Fast setup
- Changes reflected on rebuild (symlink-based)
- Global availability
- Easy to test in multiple projects

❌ **Cons**:

- Not exactly like production install
- pnpm-specific

---

## Method 2: Direct Execution

**Best for**: Quick one-off tests without installing

### Usage

```bash
cd <PROJECT_ROOT>
pnpm build

# Execute directly
node dist/cli.js --version
node dist/cli.js mcp list

# Or via shebang (Unix)
./dist/cli.js --version
```

### In Test Projects

```bash
cd /tmp/test-project
node <PROJECT_ROOT>/dist/cli.js mcp add github
```

### Pros/Cons

✅ **Pros**:

- No installation needed
- Instant
- No cleanup required

❌ **Cons**:

- Long command paths
- Not testing real installation
- No `agentsync` command in PATH

---

## Method 3: pnpm pack (Production-Like)

**Best for**: Pre-publish validation, final testing before release

### Setup

```bash
cd <PROJECT_ROOT>
pnpm build
pnpm pack
```

**Creates**: `agentsync-0.2.0-alpha.2.tgz`

### Install Globally

```bash
# Install from tarball
npm install -g agentsync-0.2.0-alpha.2.tgz

# Or with pnpm
pnpm add -g agentsync-0.2.0-alpha.2.tgz
```

### Verify

```bash
which agentsync
# /usr/local/bin/agentsync (or npm/pnpm global bin)

agentsync --version
# 0.2.0-alpha.2
```

### Usage

```bash
# Use exactly like production
cd /tmp/test-project
agentsync mcp list
```

### Cleanup

```bash
npm uninstall -g agentsync
# or
pnpm remove -g agentsync

# Remove tarball
rm agentsync-0.2.0-alpha.2.tgz
```

### Pros/Cons

✅ **Pros**:

- **Closest to production npm install**
- Tests actual package contents
- Tests bin linking
- Tests package.json files field
- Catches packaging issues

❌ **Cons**:

- Slower (need to pack/install for each change)
- Requires cleanup

**⭐ RECOMMENDED before publishing to npm**

---

## Method 4: Isolated Environment (Full Production Test)

**Best for**: Final validation, testing on clean system

### Setup

```bash
# Create isolated directory
mkdir -p /tmp/agentsync-isolated-test
cd /tmp/agentsync-isolated-test

# Backup existing registry
mv ~/.agentsync ~/.agentsync.backup 2>/dev/null || true

# Install from tarball
pnpm add -g <PROJECT_ROOT>/agentsync-0.2.0-alpha.2.tgz
```

### Test Complete Workflow

```bash
# Start fresh - no registry
agentsync mcp list 2>&1
# Expected: Error about missing registry

# Create registry
mkdir -p ~/.agentsync
cat > ~/.agentsync/mcp.json <<'EOF'
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {"GITHUB_TOKEN": "{GITHUB_TOKEN}"}
  }
}
EOF

# Test workflow
mkdir test-project && cd test-project
mkdir -p .cursor .claude
agentsync mcp list
agentsync mcp add github
echo "GITHUB_TOKEN=test123" > .env
agentsync mcp sync
cat .cursor/mcp.json
```

### Cleanup

```bash
# Remove global install
pnpm remove -g agentsync

# Restore registry
mv ~/.agentsync.backup ~/.agentsync 2>/dev/null || true

# Remove test directory
rm -rf /tmp/agentsync-isolated-test
```

### Pros/Cons

✅ **Pros**:

- **Most realistic test**
- Tests complete new user experience
- Catches environment-specific issues
- Validates all documentation steps

❌ **Cons**:

- Most time-consuming
- Requires careful cleanup
- Modifies global state

---

## Method Comparison

### For Manual Test Suite

**Use**: Method 1 (pnpm link)

```bash
pnpm build && pnpm link --global
cd manual-tests
# Run scenarios...
```

**Why**: Fast, repeatable, easy cleanup

### Before Publishing to npm

**Use**: Method 3 (pnpm pack) + Method 4 (isolated)

```bash
# 1. Pack
pnpm pack

# 2. Test in isolated environment
[Follow Method 4 steps]

# 3. If successful → publish
npm publish
```

**Why**: Catches packaging issues, validates production experience

### Quick Development Iteration

**Use**: Method 2 (direct execution)

```bash
pnpm build
node dist/cli.js --version
```

**Why**: No installation overhead

---

## Testing Checklist by Method

### Method 1: pnpm link

- [ ] Build succeeds
- [ ] Link creates symlink
- [ ] `which agentsync` finds command
- [ ] Version is correct
- [ ] Commands work in test projects
- [ ] Unlink removes command

### Method 3: pnpm pack

- [ ] Pack creates tarball
- [ ] Tarball size is reasonable (<1MB)
- [ ] Install from tarball succeeds
- [ ] Bin is executable
- [ ] Commands work globally
- [ ] Uninstall removes cleanly

### Method 4: Isolated

- [ ] Fresh environment works
- [ ] Error messages helpful (no registry)
- [ ] Registry creation works
- [ ] Full workflow completes
- [ ] Cleanup restores original state

---

## Common Issues

### Issue: "agentsync: command not found" (Method 1)

```bash
# Check if linked
pnpm list -g | grep agentsync

# Re-link
cd <PROJECT_ROOT>
pnpm unlink --global agentsync
pnpm link --global

# Check PATH
echo $PATH | grep pnpm
```

### Issue: Old version showing

```bash
# Rebuild and re-link
cd <PROJECT_ROOT>
pnpm build
# No need to re-link (symlink updates automatically)

agentsync --version
```

### Issue: Permission denied

```bash
# Fix permissions
chmod +x dist/cli.js

# Check shebang
head -1 dist/cli.js
# Should show: #!/usr/bin/env node
```

### Issue: Tarball install fails

```bash
# Check tarball contents
tar -tzf agentsync-0.2.0-alpha.2.tgz | head -20

# Should include:
# - package/dist/
# - package/templates/
# - package/package.json

# Rebuild and repack
pnpm build
pnpm pack
```

---

## Pre-Publish Workflow

Recommended workflow before publishing:

```bash
# 1. All tests pass
pnpm test
pnpm test:bats

# 2. Clean build
rm -rf dist
pnpm build

# 3. Link for manual testing
pnpm link --global

# 4. Run manual test suite
cd manual-tests
# Execute all scenarios

# 5. Unlink
pnpm unlink --global agentsync

# 6. Pack and test
pnpm pack
npm install -g agentsync-0.2.0-alpha.2.tgz

# 7. Quick smoke test
agentsync --version
agentsync --help
agentsync mcp --help

# 8. Full isolated test
[Follow Method 4]

# 9. If all pass → publish
npm publish

# 10. Cleanup
npm uninstall -g agentsync
rm agentsync-0.2.0-alpha.2.tgz
```

---

## Integration with Manual Test Suite

The manual test suite ([README.md](README.md)) uses **Method 1 (pnpm link)**:

```bash
# In 00-setup.md
cd <PROJECT_ROOT>
pnpm build
pnpm link --global

# Run all scenarios...

# In 08-cleanup.md
pnpm unlink --global agentsync
```

For pre-publish validation, add **Method 3 & 4** to your checklist.

---

## Quick Reference Commands

```bash
# Method 1: Link
pnpm build && pnpm link --global
pnpm unlink --global agentsync

# Method 2: Direct
node dist/cli.js --version

# Method 3: Pack
pnpm pack
npm install -g agentsync-*.tgz
npm uninstall -g agentsync

# Method 4: Isolated
mkdir /tmp/test && cd /tmp/test
pnpm add -g /path/to/agentsync-*.tgz
# ... test ...
pnpm remove -g agentsync
```

---

**See also**: [manual-tests/README.md](README.md) for the complete manual testing suite
