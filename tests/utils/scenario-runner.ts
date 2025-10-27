/**
 * Scenario-Based Test Runner
 * Parses YAML scenario files and executes them as integrated tests
 * Supports declarative test setup, execution, and assertions
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "js-yaml";
import * as fsUtils from "../../src/utils/fs.js";
import { type RunCliResult, runCli } from "./workflow-harness.js";

export interface ScenarioSetup {
  project?: { files?: Record<string, string> };
  home?: { files?: Record<string, string> };
  env?: Record<string, string>;
  cwdSubdir?: string;
}

export interface ScenarioStep {
  run: string[];
  expect?: { exitCode?: number };
}

export interface ScenarioAssert {
  files?: Record<string, string | "json" | "exists">;
  json?: Record<string, unknown>;
}

export interface Scenario {
  name: string;
  setup?: ScenarioSetup;
  steps: ScenarioStep[];
  assert?: ScenarioAssert;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  steps: Array<{ command: string; result: RunCliResult }>;
  error?: string;
}

/**
 * Parse YAML scenario file
 * @param filePath - Path to scenario YAML file
 * @returns Parsed scenario
 */
export async function loadScenario(filePath: string): Promise<Scenario> {
  const content = await fs.readFile(filePath, "utf-8");
  return YAML.load(content) as Scenario;
}

/**
 * Run a scenario
 * @param scenario - Scenario to run
 * @returns Scenario result
 */
export async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const projectDir = await fsUtils.mkdtemp(
    path.join(require("node:os").tmpdir(), "scenario-project-"),
  );
  const homeDir = await fsUtils.mkdtemp(
    path.join(require("node:os").tmpdir(), "scenario-home-"),
  );

  try {
    // Setup project files
    if (scenario.setup?.project?.files) {
      for (const [filePath, content] of Object.entries(
        scenario.setup.project.files,
      )) {
        const fullPath = path.join(projectDir, filePath);
        await fsUtils.ensureDir(path.dirname(fullPath));
        await fsUtils.writeFile(fullPath, content);
      }
    }

    // Setup home files
    if (scenario.setup?.home?.files) {
      for (const [filePath, content] of Object.entries(
        scenario.setup.home.files,
      )) {
        const fullPath = path.join(homeDir, filePath);
        await fsUtils.ensureDir(path.dirname(fullPath));
        await fsUtils.writeFile(fullPath, content);
      }
    }

    // Determine working directory
    let cwd = projectDir;
    if (scenario.setup?.cwdSubdir) {
      cwd = path.join(projectDir, scenario.setup.cwdSubdir);
      await fsUtils.ensureDir(cwd);
    }

    // Prepare environment
    const env = { HOME: homeDir, ...scenario.setup?.env };

    // Execute steps
    const results: ScenarioResult["steps"] = [];
    for (const step of scenario.steps) {
      const result = await runCli(step.run, { cwd, env });

      // Check exit code expectation
      if (step.expect?.exitCode !== undefined) {
        if (result.exitCode !== step.expect.exitCode) {
          throw new Error(
            `Step failed: ${step.run.join(" ")}\n` +
              `Expected exit code ${step.expect.exitCode}, got ${result.exitCode}\n` +
              `Stderr: ${result.stderr}`,
          );
        }
      }

      results.push({ command: step.run.join(" "), result });
    }

    // Verify assertions
    if (scenario.assert) {
      await verifyAssertions(scenario.assert, projectDir, homeDir);
    }

    return {
      name: scenario.name,
      passed: true,
      steps: results,
    };
  } catch (error) {
    return {
      name: scenario.name,
      passed: false,
      steps: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fsUtils.remove(projectDir);
    await fsUtils.remove(homeDir);
  }
}

/**
 * Verify scenario assertions
 * @param assertions - Assertions to verify
 * @param projectDir - Project directory
 * @param homeDir - Home directory
 */
async function verifyAssertions(
  assertions: ScenarioAssert,
  projectDir: string,
  _homeDir: string,
): Promise<void> {
  // Verify file assertions
  if (assertions.files) {
    for (const [filePath, expectedType] of Object.entries(assertions.files)) {
      const fullPath = path.join(projectDir, filePath);

      if (expectedType === "exists") {
        const exists = await fsUtils.pathExists(fullPath);
        if (!exists) {
          throw new Error(`File not found: ${filePath}`);
        }
      } else if (expectedType === "json") {
        const exists = await fsUtils.pathExists(fullPath);
        if (!exists) {
          throw new Error(`JSON file not found: ${filePath}`);
        }
      } else if (typeof expectedType === "string") {
        const content = await fsUtils.readFile(fullPath, "utf-8");
        if (content !== expectedType) {
          throw new Error(
            `File content mismatch: ${filePath}\n` +
              `Expected:\n${expectedType}\n` +
              `Got:\n${content}`,
          );
        }
      }
    }
  }

  // Verify JSON assertions
  if (assertions.json) {
    for (const [filePath, expectedValue] of Object.entries(assertions.json)) {
      const fullPath = path.join(projectDir, filePath);
      const content = await fsUtils.readFile(fullPath, "utf-8");
      const data = JSON.parse(content);

      // Deep equality check
      if (JSON.stringify(data) !== JSON.stringify(expectedValue)) {
        throw new Error(
          `JSON content mismatch: ${filePath}\n` +
            `Expected:\n${JSON.stringify(expectedValue, null, 2)}\n` +
            `Got:\n${JSON.stringify(data, null, 2)}`,
        );
      }
    }
  }
}
