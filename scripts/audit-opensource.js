#!/usr/bin/env node
/**
 * Pre-Open Source Audit Script
 * Checks for common issues before making the repository public
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const issues = {
  critical: [],
  warning: [],
  info: [],
};

function log(type, category, message) {
  const color =
    type === "critical"
      ? colors.red
      : type === "warning"
        ? colors.yellow
        : colors.cyan;
  issues[type].push({ category, message });
  console.log(
    `${color}[${type.toUpperCase()}]${colors.reset} ${colors.magenta}[${category}]${colors.reset} ${message}`,
  );
}

function scanFileForSecrets(filePath) {
  const secretPatterns = [
    { name: "AWS Key", pattern: /AKIA[0-9A-Z]{16}/gi },
    { name: "GitHub Token (classic)", pattern: /ghp_[A-Za-z0-9]{36}/gi },
    {
      name: "GitHub Token (fine-grained)",
      pattern: /github_pat_[A-Za-z0-9_]{82}/gi,
    },
    {
      name: "Generic API Key",
      pattern: /api[_-]?key[_-]?[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
    },
    {
      name: "Generic Secret",
      pattern: /secret[_-]?[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
    },
    {
      name: "Private Key",
      pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/gi,
    },
    {
      name: "Password in Code",
      pattern: /password[_-]?[:=]\s*['"][^'"]{8,}['"]/gi,
    },
  ];

  try {
    const content = readFileSync(filePath, "utf-8");
    const relativePath = relative(ROOT, filePath);

    // Skip security scanner files - they contain pattern definitions, not actual secrets
    if (
      relativePath.includes("src/security/scanner") ||
      relativePath.includes("src/security/checks")
    ) {
      return;
    }

    // Skip test fixtures - but still report them for review
    const isTestFixture = relativePath.includes("tests/fixtures");

    for (const { name, pattern } of secretPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        const level = isTestFixture ? "warning" : "critical";
        log(
          level,
          "Secrets",
          `Found ${name} in ${relativePath}${isTestFixture ? " (test fixture - verify it's a mock)" : ""}`,
        );
      }
    }
  } catch (_err) {
    // Ignore binary files or read errors
  }
}

function walkDirectory(dir, callback, exclude = []) {
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = join(dir, file);
    const relativePath = relative(ROOT, fullPath);

    // Check if path should be excluded
    if (exclude.some((ex) => relativePath.startsWith(ex))) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDirectory(fullPath, callback, exclude);
    } else {
      callback(fullPath);
    }
  }
}

function checkDocumentation() {
  console.log(`\n${colors.cyan}=== Checking Documentation ===${colors.reset}`);

  const requiredDocs = [
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
  ];

  for (const doc of requiredDocs) {
    const path = join(ROOT, doc);
    if (!existsSync(path)) {
      log("critical", "Documentation", `Missing required file: ${doc}`);
    } else {
      const content = readFileSync(path, "utf-8");
      if (content.length < 100) {
        log(
          "warning",
          "Documentation",
          `${doc} seems too short (${content.length} chars)`,
        );
      }

      // Check for placeholder text
      if (
        content.includes("[TODO]") ||
        content.includes("TODO:") ||
        content.includes("FIXME")
      ) {
        log("warning", "Documentation", `${doc} contains TODO/FIXME markers`);
      }
    }
  }
}

function checkPackageJson() {
  console.log(`\n${colors.cyan}=== Checking package.json ===${colors.reset}`);

  const pkgPath = join(ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  // Check version
  if (pkg.version.includes("alpha") || pkg.version.includes("beta")) {
    log("warning", "Package", `Version is pre-release: ${pkg.version}`);
  }

  // Check required fields
  const requiredFields = [
    "name",
    "version",
    "description",
    "license",
    "repository",
    "author",
  ];
  for (const field of requiredFields) {
    if (!pkg[field]) {
      log(
        "critical",
        "Package",
        `Missing required field in package.json: ${field}`,
      );
    }
  }

  // Check files field
  if (!pkg.files || pkg.files.length === 0) {
    log(
      "warning",
      "Package",
      "No files field in package.json - entire directory will be published",
    );
  }

  // Check for private field
  if (pkg.private === true) {
    log(
      "critical",
      "Package",
      "Package is marked as private - won't be publishable to npm",
    );
  }
}

function checkGitignore() {
  console.log(`\n${colors.cyan}=== Checking .gitignore ===${colors.reset}`);

  const gitignorePath = join(ROOT, ".gitignore");
  if (!existsSync(gitignorePath)) {
    log("critical", "Git", "Missing .gitignore file");
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const requiredPatterns = ["node_modules", ".env", "dist", "*.log"];

  for (const pattern of requiredPatterns) {
    if (!content.includes(pattern)) {
      log("warning", "Git", `.gitignore missing pattern: ${pattern}`);
    }
  }
}

function checkHiddenDirectories() {
  console.log(
    `\n${colors.cyan}=== Checking Hidden/Sensitive Directories ===${colors.reset}`,
  );

  const sensitivePatterns = [
    "bugs",
    "research",
    "private",
    "internal",
    "draft",
  ];

  for (const pattern of sensitivePatterns) {
    const path = join(ROOT, pattern);
    if (existsSync(path)) {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        log(
          "warning",
          "Cleanup",
          `Directory "${pattern}" exists - review contents before open sourcing`,
        );
      }
    }
  }
}

function checkGitHubActions() {
  console.log(`\n${colors.cyan}=== Checking GitHub Actions ===${colors.reset}`);

  const workflowsDir = join(ROOT, ".github", "workflows");
  if (!existsSync(workflowsDir)) {
    log("info", "CI/CD", "No GitHub Actions workflows found");
    return;
  }

  const workflows = readdirSync(workflowsDir).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  );

  if (workflows.length === 0) {
    log("info", "CI/CD", "No workflow files found");
  } else {
    log(
      "info",
      "CI/CD",
      `Found ${workflows.length} workflow(s): ${workflows.join(", ")}`,
    );
  }

  // Check for secrets in workflows
  for (const workflow of workflows) {
    const content = readFileSync(join(workflowsDir, workflow), "utf-8");
    if (
      content.includes("secrets.") &&
      !content.includes("secrets.GITHUB_TOKEN")
    ) {
      log(
        "info",
        "CI/CD",
        `${workflow} uses custom secrets - ensure they're documented`,
      );
    }
  }
}

function checkTestFixtures() {
  console.log(`\n${colors.cyan}=== Checking Test Fixtures ===${colors.reset}`);

  const fixturesDir = join(ROOT, "tests", "fixtures");
  if (!existsSync(fixturesDir)) {
    return;
  }

  // Check for files with potential secrets
  walkDirectory(
    fixturesDir,
    (filePath) => {
      if (
        filePath.endsWith(".json") ||
        filePath.endsWith(".env") ||
        filePath.endsWith(".test")
      ) {
        scanFileForSecrets(filePath);
      }
    },
    ["node_modules", "dist"],
  );
}

function scanForSecrets() {
  console.log(`\n${colors.cyan}=== Scanning for Secrets ===${colors.reset}`);

  const excludeDirs = [
    "node_modules",
    ".git",
    "dist",
    "coverage",
    "tests/fixtures",
  ];

  walkDirectory(ROOT, scanFileForSecrets, excludeDirs);
}

function checkCodeQuality() {
  console.log(`\n${colors.cyan}=== Code Quality Checks ===${colors.reset}`);

  // Check for console.log in source (not tests)
  const srcDir = join(ROOT, "src");
  if (existsSync(srcDir)) {
    walkDirectory(
      srcDir,
      (filePath) => {
        if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
          const content = readFileSync(filePath, "utf-8");
          const lines = content.split("\n");

          lines.forEach((line, index) => {
            if (line.includes("console.log") && !line.trim().startsWith("//")) {
              log(
                "info",
                "Code Quality",
                `console.log found in ${relative(ROOT, filePath)}:${index + 1}`,
              );
            }

            if (line.includes("debugger") && !line.trim().startsWith("//")) {
              log(
                "warning",
                "Code Quality",
                `debugger statement in ${relative(ROOT, filePath)}:${index + 1}`,
              );
            }
          });
        }
      },
      ["node_modules"],
    );
  }
}

function printSummary() {
  console.log(`\n${colors.blue}${"=".repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}=== Audit Summary ===${colors.reset}`);
  console.log(`${colors.blue}${"=".repeat(60)}${colors.reset}\n`);

  console.log(
    `${colors.red}Critical Issues: ${issues.critical.length}${colors.reset}`,
  );
  console.log(
    `${colors.yellow}Warnings: ${issues.warning.length}${colors.reset}`,
  );
  console.log(`${colors.cyan}Info: ${issues.info.length}${colors.reset}\n`);

  if (issues.critical.length === 0 && issues.warning.length === 0) {
    console.log(
      `${colors.green}✓ No critical issues or warnings found!${colors.reset}`,
    );
    console.log(
      `${colors.green}✓ Project appears ready for open source release${colors.reset}\n`,
    );
  } else {
    console.log(
      `${colors.yellow}⚠ Please address the issues above before open sourcing${colors.reset}\n`,
    );
  }

  // Group by category
  const categories = {};
  for (const type of ["critical", "warning", "info"]) {
    for (const issue of issues[type]) {
      if (!categories[issue.category]) {
        categories[issue.category] = { critical: 0, warning: 0, info: 0 };
      }
      categories[issue.category][type]++;
    }
  }

  console.log(`${colors.blue}=== Issues by Category ===${colors.reset}`);
  for (const [category, counts] of Object.entries(categories)) {
    console.log(
      `  ${category}: ${colors.red}${counts.critical}${colors.reset} critical, ${colors.yellow}${counts.warning}${colors.reset} warnings, ${colors.cyan}${counts.info}${colors.reset} info`,
    );
  }

  return issues.critical.length === 0 ? 0 : 1;
}

// Run all checks
async function runAudit() {
  console.log(`${colors.blue}${"=".repeat(60)}${colors.reset}`);
  console.log(
    `${colors.blue}=== AgentSync Open Source Audit ===${colors.reset}`,
  );
  console.log(`${colors.blue}${"=".repeat(60)}${colors.reset}`);

  checkDocumentation();
  checkPackageJson();
  checkGitignore();
  checkHiddenDirectories();
  checkGitHubActions();
  checkTestFixtures();
  scanForSecrets();
  checkCodeQuality();

  const exitCode = printSummary();
  process.exit(exitCode);
}

runAudit();
