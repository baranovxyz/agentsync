/**
 * Discover Command
 * Scan for tool directories in project and global scope
 */

import picocolors from "picocolors";
import { getCodecRegistry } from "../targets/codec-registry.js";

const pc = picocolors;

/**
 * Discover tool directories
 */
export async function discoverCommand(): Promise<void> {
  console.log(pc.bold("\n🔍 AgentSync Discovery\n"));

  const cwd = process.cwd();
  const registry = getCodecRegistry();

  // Detect project tool directories
  const projectTools = await registry.detectProject(cwd);

  // Detect global tool directories
  const globalTools = await registry.detectGlobal();

  // Show detected project tools
  if (projectTools.length > 0) {
    console.log(pc.bold("Detected Project Tool Directories:"));
    for (const { toolName, info } of projectTools) {
      console.log(pc.cyan(`\n  ${toolName} (${info.path})`));
      console.log(pc.gray(`    • Rules: ${info.ruleCount || 0}`));
      console.log(pc.gray(`    • Commands: ${info.commandCount || 0}`));
      console.log(pc.gray(`    • MCP: ${info.hasMCP ? "Yes" : "No"}`));
    }
    console.log();
  }

  // Show detected global tools
  if (globalTools.length > 0) {
    console.log(pc.bold("Detected Global Tool Directories:"));
    for (const { toolName, info } of globalTools) {
      console.log(pc.cyan(`\n  ${toolName} (${info.path})`));
      console.log(pc.gray(`    • Rules: ${info.ruleCount || 0}`));
      console.log(pc.gray(`    • Commands: ${info.commandCount || 0}`));
      console.log(pc.gray(`    • MCP: ${info.hasMCP ? "Yes" : "No"}`));
    }
    console.log();
  }

  if (projectTools.length === 0 && globalTools.length === 0) {
    console.log(
      pc.gray("No tool directories detected in project or global scope.\n"),
    );
  }

  // Next steps
  console.log(pc.bold("Next Steps:"));
  console.log(
    pc.gray("  1. Run ") +
      pc.cyan("agentsync init") +
      pc.gray(" to initialize AgentSync"),
  );

  if (projectTools.length > 0) {
    if (projectTools.length === 1) {
      const tool = projectTools[0];
      console.log(
        pc.gray("  2. Run ") +
          pc.cyan(`agentsync import ${tool.info.path}`) +
          pc.gray(` to import from ${tool.toolName}`),
      );
    } else {
      console.log(
        pc.gray("  2. Run ") +
          pc.cyan("agentsync import <tool-dir>") +
          pc.gray(" to import from a detected tool"),
      );
      for (const { info } of projectTools) {
        console.log(
          pc.gray("     • ") + pc.cyan(`agentsync import ${info.path}`),
        );
      }
    }
  } else if (globalTools.length > 0) {
    if (globalTools.length === 1) {
      const tool = globalTools[0];
      console.log(
        pc.gray("  2. Run ") +
          pc.cyan(`agentsync import ${tool.info.path}`) +
          pc.gray(` to import from ${tool.toolName}`),
      );
    } else {
      console.log(
        pc.gray("  2. Run ") +
          pc.cyan("agentsync import <tool-dir>") +
          pc.gray(" to import from a detected tool"),
      );
      for (const { info, toolName } of globalTools) {
        console.log(
          pc.gray(`     • ${toolName}: `) +
            pc.cyan(`agentsync import ${info.path}`),
        );
      }
    }
  } else {
    console.log(
      pc.gray("  2. Create rules in ") +
        pc.cyan(".agentsync/rules/") +
        pc.gray(" directory"),
    );
  }

  console.log(
    pc.gray("  3. Run ") +
      pc.cyan("agentsync sync") +
      pc.gray(" to sync to your tools"),
  );
  console.log();
}
