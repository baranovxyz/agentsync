/**
 * Status Command
 * Display current AgentSync configuration status
 */

import picocolors from "picocolors";
import { loadConfigHierarchy } from "../core/config/hierarchy.js";

const pc = picocolors;

/**
 * Display status of current AgentSync configuration
 */
export async function statusCommand(): Promise<void> {
  const cwd = process.cwd();

  try {
    const merged = await loadConfigHierarchy(cwd);

    // Title
    console.log(pc.bold("\n📊 AgentSync Status\n"));

    // Config Hierarchy
    console.log(pc.bold("Config Hierarchy:"));
    if (merged._sources.global) {
      console.log(pc.gray(`  • Global: ${merged._sources.global}`));
    }
    console.log(pc.gray(`  • Project: ${merged._sources.project}`));
    if (merged._sources.local) {
      console.log(
        pc.cyan(`  • Local: ${merged._sources.local} ${pc.dim("(overrides)")}`),
      );
    }

    // Tools
    if (merged.tools && merged.tools.length > 0) {
      console.log(pc.bold("\nTools:"));
      console.log(pc.gray(`  ${merged.tools.join(", ")}`));
    } else {
      console.log(pc.bold("\nTools:"));
      console.log(pc.yellow("  (none configured)"));
    }

    // Presets
    if (merged.extends && merged.extends.length > 0) {
      console.log(pc.bold("\nPresets:"));
      for (const ext of merged.extends) {
        if (typeof ext === "string") {
          console.log(pc.gray(`  • ${ext}`));
        } else {
          const isFsSource = ext.source.startsWith("fs:");
          console.log(
            pc.gray(`  • ${ext.source} ${pc.dim(`(${ext.namespace})`)}`),
          );
          if (isFsSource) {
            console.log(pc.dim(`    └─ Read-only filesystem source`));
          }
        }
      }
    } else {
      console.log(pc.bold("\nPresets:"));
      console.log(pc.gray("  (none configured)"));
    }

    // MCP Servers
    if (merged.mcpServers) {
      console.log(pc.bold("\nMCP Servers:"));
      const servers = Array.isArray(merged.mcpServers)
        ? merged.mcpServers
        : Object.keys(merged.mcpServers);

      if (servers.length > 0) {
        console.log(pc.gray(`  ${servers.join(", ")}`));
        if (merged._sources.local) {
          console.log(pc.cyan(`  ${pc.dim("(Local overrides active)")}`));
        }
      } else {
        console.log(pc.gray("  (none configured)"));
      }
    }

    // Deduplication log
    if (merged._deduplicationLog && merged._deduplicationLog.length > 0) {
      console.log(pc.bold("\nNotifications:"));
      for (const log of merged._deduplicationLog) {
        console.log(pc.gray(`  ℹ️  ${log.message}`));
      }
    }

    // Next steps
    console.log(pc.bold("\nNext Steps:"));
    console.log(
      pc.gray(`  • Run ${pc.cyan("agentsync sync")} to apply changes`),
    );
    console.log(
      pc.gray(
        `  • Run ${pc.cyan("agentsync preset list -v")} for preset details`,
      ),
    );
    console.log(
      pc.gray(
        `  • Run ${pc.cyan("agentsync import <source>")} to import rules`,
      ),
    );
    console.log();
  } catch (error) {
    // Check if it's a ConfigError (no project config)
    if (
      error instanceof Error &&
      error.message.includes("Project config not found")
    ) {
      console.log(pc.yellow("\n❌ No AgentSync configuration found.\n"));
      console.log(pc.gray("To get started:"));
      console.log(
        pc.gray("  • Run ") +
          pc.cyan("agentsync init") +
          pc.gray(" to initialize"),
      );
      console.log(
        pc.gray("  • Run ") +
          pc.cyan("agentsync discover") +
          pc.gray(" to find existing tool directories"),
      );
      console.log();
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(pc.red(`❌ ${message}`));
      process.exit(1);
    }
  }
}
