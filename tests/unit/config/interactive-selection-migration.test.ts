/**
 * Interactive Selection Configuration Migration Tests
 * Tests for migrating from legacy configuration format to new interactive selection format
 */

import { beforeEach, describe, expect, it } from "vitest";

// Legacy configuration types (current format)
interface LegacyAgentSyncConfig {
  version?: string;
  extends?: string[];
  tools?: string[];
  useSymlinks?: boolean;
  mcpServers?: string[] | Record<string, unknown>;
  security?: unknown;
}

// New configuration types
interface FileSelection {
  include: string[];
  exclude?: string[];
}

interface PresetSelection {
  rules?: FileSelection;
  commands?: FileSelection;
  mcps?: string[];
}

interface UserRegistryConfig {
  presets: string[];
  defaultSelections?: Record<string, PresetSelection>;
}

interface ProjectConfig {
  selections?: Record<string, PresetSelection>;
  overrides?: Record<string, unknown>;
  tools?: string[];
}

interface LocalConfig {
  selections?: Record<string, PresetSelection>;
  overrides?: Record<string, unknown>;
}

interface InteractiveSelectionConfig {
  version: string;
  user?: UserRegistryConfig;
  project?: ProjectConfig;
  local?: LocalConfig;
}

// Mock migration implementation
class ConfigMigrator {
  /**
   * Migrate legacy configuration to new interactive selection format
   */
  migrateFromLegacy(
    legacyConfig: LegacyAgentSyncConfig,
  ): InteractiveSelectionConfig {
    const newConfig: InteractiveSelectionConfig = {
      version: "2.0",
    };

    // Migrate extends to user.presets
    if (legacyConfig.extends && legacyConfig.extends.length > 0) {
      newConfig.user = {
        presets: legacyConfig.extends,
      };
    }

    // Migrate tools to project.tools
    if (legacyConfig.tools && legacyConfig.tools.length > 0) {
      newConfig.project = {
        ...newConfig.project,
        tools: legacyConfig.tools,
      };
    }

    // Migrate mcpServers to project.overrides
    if (legacyConfig.mcpServers) {
      newConfig.project = {
        ...newConfig.project,
        overrides: {
          ...newConfig.project?.overrides,
          mcpServers: legacyConfig.mcpServers,
        },
      };
    }

    // Migrate other settings to project.overrides
    const otherSettings: Record<string, unknown> = {};
    if (legacyConfig.useSymlinks !== undefined) {
      otherSettings.useSymlinks = legacyConfig.useSymlinks;
    }
    if (legacyConfig.security) {
      otherSettings.security = legacyConfig.security;
    }

    if (Object.keys(otherSettings).length > 0) {
      newConfig.project = {
        ...newConfig.project,
        overrides: {
          ...newConfig.project?.overrides,
          ...otherSettings,
        },
      };
    }

    return newConfig;
  }

  /**
   * Check if configuration is in legacy format
   */
  isLegacyConfig(config: unknown): config is LegacyAgentSyncConfig {
    if (typeof config !== "object" || config === null) {
      return false;
    }
    const c = config as Record<string, unknown>;
    // Legacy configs have extends, tools, mcpServers at top level
    // New configs have user/project/local structure
    return (
      (c.extends !== undefined ||
        c.tools !== undefined ||
        c.mcpServers !== undefined) &&
      c.user === undefined &&
      c.project === undefined &&
      c.local === undefined
    );
  }

  /**
   * Validate migrated configuration
   */
  validateMigratedConfig(config: InteractiveSelectionConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.version) {
      errors.push("Version is required");
    }

    if (
      config.user &&
      (!config.user.presets || config.user.presets.length === 0)
    ) {
      errors.push("User presets cannot be empty when user config is present");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

describe("Interactive Selection Configuration Migration", () => {
  let migrator: ConfigMigrator;

  beforeEach(() => {
    migrator = new ConfigMigrator();
  });

  describe("Legacy configuration detection", () => {
    it("identifies legacy configuration with extends", () => {
      const legacyConfig = {
        extends: ["github:company/standards"],
        tools: ["cursor"],
      };

      expect(migrator.isLegacyConfig(legacyConfig)).toBe(true);
    });

    it("identifies legacy configuration with tools", () => {
      const legacyConfig = {
        tools: ["cursor", "claude"],
        mcpServers: ["github"],
      };

      expect(migrator.isLegacyConfig(legacyConfig)).toBe(true);
    });

    it("identifies legacy configuration with mcpServers", () => {
      const legacyConfig = {
        mcpServers: ["github", "postgres"],
      };

      expect(migrator.isLegacyConfig(legacyConfig)).toBe(true);
    });

    it("identifies new configuration format", () => {
      const newConfig = {
        version: "2.0",
        user: {
          presets: ["github:company/standards"],
        },
        project: {
          tools: ["cursor"],
        },
      };

      expect(migrator.isLegacyConfig(newConfig)).toBe(false);
    });

    it("handles empty configuration", () => {
      const emptyConfig = {};

      expect(migrator.isLegacyConfig(emptyConfig)).toBe(false);
    });
  });

  describe("Configuration migration", () => {
    it("migrates complete legacy configuration", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        version: "1.0",
        extends: ["github:company/standards", "github:team/backend"],
        tools: ["cursor", "claude"],
        useSymlinks: true,
        mcpServers: ["github", "postgres"],
        security: {
          secretScanning: { enabled: true },
        },
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.version).toBe("2.0");
      expect(result.user?.presets).toEqual([
        "github:company/standards",
        "github:team/backend",
      ]);
      expect(result.project?.tools).toEqual(["cursor", "claude"]);
      expect(result.project?.overrides).toEqual({
        useSymlinks: true,
        mcpServers: ["github", "postgres"],
        security: {
          secretScanning: { enabled: true },
        },
      });
    });

    it("migrates minimal legacy configuration", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        extends: ["github:company/standards"],
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.version).toBe("2.0");
      expect(result.user?.presets).toEqual(["github:company/standards"]);
      expect(result.project).toBeUndefined();
      expect(result.local).toBeUndefined();
    });

    it("migrates configuration with only tools", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        tools: ["cursor"],
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.version).toBe("2.0");
      expect(result.user).toBeUndefined();
      expect(result.project?.tools).toEqual(["cursor"]);
    });

    it("migrates configuration with only mcpServers", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        mcpServers: {
          github: true,
          postgres: {
            env: { POSTGRES_URL: "custom" },
          },
        },
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.version).toBe("2.0");
      expect(result.project?.overrides?.mcpServers).toEqual({
        github: true,
        postgres: {
          env: { POSTGRES_URL: "custom" },
        },
      });
    });

    it("handles empty legacy configuration", () => {
      const legacyConfig: LegacyAgentSyncConfig = {};

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.version).toBe("2.0");
      expect(result.user).toBeUndefined();
      expect(result.project).toBeUndefined();
      expect(result.local).toBeUndefined();
    });

    it("preserves complex mcpServers structure", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        mcpServers: {
          github: {
            command: "custom-github",
            args: ["--custom"],
            env: { GITHUB_TOKEN: "token" },
          },
          postgres: true,
        },
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      expect(result.project?.overrides?.mcpServers).toEqual({
        github: {
          command: "custom-github",
          args: ["--custom"],
          env: { GITHUB_TOKEN: "token" },
        },
        postgres: true,
      });
    });
  });

  describe("Migrated configuration validation", () => {
    it("validates correct migrated configuration", () => {
      const validConfig: InteractiveSelectionConfig = {
        version: "2.0",
        user: {
          presets: ["github:company/standards"],
        },
        project: {
          tools: ["cursor"],
        },
      };

      const result = migrator.validateMigratedConfig(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects missing version", () => {
      const invalidConfig = {
        user: {
          presets: ["github:company/standards"],
        },
      } as unknown;

      const result = migrator.validateMigratedConfig(
        invalidConfig as InteractiveSelectionConfig,
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Version is required");
    });

    it("detects empty user presets", () => {
      const invalidConfig = {
        version: "2.0",
        user: {
          presets: [],
        },
      } as InteractiveSelectionConfig;

      const result = migrator.validateMigratedConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "User presets cannot be empty when user config is present",
      );
    });

    it("allows configuration without user level", () => {
      const validConfig: InteractiveSelectionConfig = {
        version: "2.0",
        project: {
          tools: ["cursor"],
        },
      };

      const result = migrator.validateMigratedConfig(validConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Backward compatibility scenarios", () => {
    it("handles migration of real-world configuration", () => {
      // Simulate a real-world configuration from existing projects
      const realWorldConfig: LegacyAgentSyncConfig = {
        version: "1.0",
        extends: [
          "github:company/frontend-standards",
          "github:company/security-policies",
        ],
        tools: ["cursor", "claude"],
        useSymlinks: true,
        mcpServers: ["github", "postgres", "linear"],
        security: {
          secretScanning: {
            enabled: true,
            blockOnHighSeverity: true,
          },
          unicodeDetection: {
            enabled: true,
            blockOnHighRisk: true,
          },
        },
      };

      const result = migrator.migrateFromLegacy(realWorldConfig);
      const validation = migrator.validateMigratedConfig(result);

      expect(validation.valid).toBe(true);
      expect(result.user?.presets).toHaveLength(2);
      expect(result.project?.tools).toHaveLength(2);
      expect(result.project?.overrides?.mcpServers).toEqual([
        "github",
        "postgres",
        "linear",
      ]);
      expect(result.project?.overrides?.security).toBeDefined();
    });

    it("preserves configuration semantics during migration", () => {
      const legacyConfig: LegacyAgentSyncConfig = {
        extends: ["github:company/standards"],
        tools: ["cursor"],
        mcpServers: {
          github: true,
          postgres: {
            env: { POSTGRES_URL: "custom" },
          },
        },
      };

      const result = migrator.migrateFromLegacy(legacyConfig);

      // The semantic meaning should be preserved:
      // - extends becomes user.presets
      // - tools becomes project.tools
      // - mcpServers becomes project.overrides.mcpServers
      expect(result.user?.presets).toEqual(["github:company/standards"]);
      expect(result.project?.tools).toEqual(["cursor"]);
      expect(result.project?.overrides?.mcpServers).toEqual({
        github: true,
        postgres: {
          env: { POSTGRES_URL: "custom" },
        },
      });
    });
  });
});
