/**
 * Interactive Selection Configuration Migration
 * Handles migration from legacy configuration format to new interactive selection format
 */

import type { AgentSyncConfig } from "../../types/schemas.js";

/**
 * Legacy configuration format (v1.x)
 */
interface LegacyAgentSyncConfig {
  version?: string;
  extends?: string[];
  tools?: string[];
  useSymlinks?: boolean;
  mcpServers?: string[] | Record<string, any>;
  security?: any;
  watch?: any;
}

/**
 * Migration result
 */
export interface MigrationResult {
  config: AgentSyncConfig;
  warnings: string[];
}

/**
 * Configuration migrator for interactive selection system
 */
export class ConfigMigrator {
  /**
   * Migrate legacy configuration to new interactive selection format
   */
  migrateFromLegacy(legacyConfig: LegacyAgentSyncConfig): MigrationResult {
    const warnings: string[] = [];
    const newConfig: AgentSyncConfig = {
      version: "2.0",
      extends: [],
      tools: [],
      useSymlinks: true,
    };

    if (legacyConfig.extends) {
      newConfig.extends = legacyConfig.extends;
    }

    if (legacyConfig.tools) {
      newConfig.tools = legacyConfig.tools.filter((tool) =>
        ["cursor", "claude", "cline", "roocode"].includes(tool),
      ) as any;
    }

    return {
      config: newConfig,
      warnings,
    };
  }

  /**
   * Check if configuration is in legacy format
   */
  isLegacyConfig(config: any): config is LegacyAgentSyncConfig {
    // Legacy configs have extends, tools, mcpServers at top level
    // New configs have user/project/local structure
    return (
      (config.extends !== undefined ||
        config.tools !== undefined ||
        config.mcpServers !== undefined) &&
      config.user === undefined &&
      config.project === undefined &&
      config.local === undefined
    );
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(
    legacyConfig: LegacyAgentSyncConfig,
    migrationResult: MigrationResult,
  ): string {
    const lines: string[] = [];

    lines.push("# Configuration Migration Report");
    lines.push("");
    lines.push("## Summary");
    lines.push(`- Legacy version: ${legacyConfig.version || "1.x"}`);
    lines.push(`- New version: ${migrationResult.config.version}`);
    lines.push(`- Warnings: ${migrationResult.warnings.length}`);
    lines.push("");

    if (migrationResult.warnings.length > 0) {
      lines.push("## Warnings");
      migrationResult.warnings.forEach((warning) => {
        lines.push(`- ${warning}`);
      });
      lines.push("");
    }

    lines.push("## Migration Details");

    if (legacyConfig.extends) {
      lines.push(
        `- \`extends\` → \`user.presets\`: ${legacyConfig.extends.join(", ")}`,
      );
    }

    if (legacyConfig.tools) {
      lines.push(
        `- \`tools\` → \`project.tools\`: ${legacyConfig.tools.join(", ")}`,
      );
    }

    if (legacyConfig.mcpServers) {
      lines.push(`- \`mcpServers\` → \`project.overrides.mcpServers\``);
    }

    const otherFields = [];
    if (legacyConfig.useSymlinks !== undefined) otherFields.push("useSymlinks");
    if (legacyConfig.security) otherFields.push("security");
    if (legacyConfig.watch) otherFields.push("watch");

    if (otherFields.length > 0) {
      lines.push(
        `- Other fields → \`project.overrides\`: ${otherFields.join(", ")}`,
      );
    }

    lines.push("");
    lines.push("## Next Steps");
    lines.push("1. Review the migrated configuration");
    lines.push(
      "2. Consider adding file-level selections in 'user.defaultSelections'",
    );
    lines.push("3. Test the new configuration with your project");
    lines.push("4. Remove the old configuration file once verified");

    return lines.join("\n");
  }

  /**
   * Auto-migrate configuration file
   */
  async migrateConfigFile(
    _legacyConfigPath: string,
    _newConfigPath: string,
  ): Promise<MigrationResult> {
    // This would be implemented with actual file I/O
    // For now, it's a placeholder for the interface
    throw new Error(
      "File migration not implemented yet - use migrateFromLegacy() directly",
    );
  }
}

/**
 * Default migrator instance
 */
export const configMigrator = new ConfigMigrator();
