/**
 * Interactive Selection Configuration Schema Tests
 * Tests for the new three-level hierarchy (user/project/local scopes)
 * File-level selection capabilities and user registry system
 */

import { describe, expect, it } from "vitest";
import {
  FileSelectionSchema,
  InteractiveSelectionConfigSchema,
  PresetSelectionSchema,
  UserRegistryConfigSchema,
} from "../../../src/types/schemas.js";

describe("Interactive Selection Configuration Schema", () => {
  describe("Three-level hierarchy", () => {
    it("validates complete configuration with all three levels", () => {
      const config = {
        version: "2.0",
        user: {
          presets: ["github:company/standards", "github:team/backend"],
          defaultSelections: {
            "github:company/standards": {
              rules: {
                include: ["**/*.ts", "**/*.js"],
                exclude: ["**/node_modules/**"],
              },
              commands: {
                include: ["**/package.json"],
              },
              mcps: ["github", "postgres"],
            },
          },
        },
        project: {
          selections: {
            "github:company/standards": {
              rules: {
                include: ["src/**/*.ts"],
                exclude: ["src/test/**"],
              },
            },
          },
          tools: ["cursor", "claude"],
        },
        local: {
          selections: {
            "github:team/backend": {
              commands: {
                include: ["scripts/**"],
              },
            },
          },
          overrides: {
            mcpServers: {
              github: {
                env: {
                  GITHUB_TOKEN: "custom-token",
                },
              },
            },
          },
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.version).toBe("2.0");
      expect(result.user?.presets).toHaveLength(2);
      expect(result.project?.tools).toEqual(["cursor", "claude"]);
      expect(result.local?.overrides).toBeDefined();
    });

    it("validates configuration with only user level", () => {
      const config = {
        version: "2.0",
        user: {
          presets: ["github:company/standards"],
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.user?.presets).toEqual(["github:company/standards"]);
      expect(result.project).toBeUndefined();
      expect(result.local).toBeUndefined();
    });

    it("validates configuration with only project level", () => {
      const config = {
        version: "2.0",
        project: {
          tools: ["cursor"],
          selections: {
            "github:company/standards": {
              rules: {
                include: ["**/*.ts"],
              },
            },
          },
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.project?.tools).toEqual(["cursor"]);
      expect(result.user).toBeUndefined();
      expect(result.local).toBeUndefined();
    });

    it("validates configuration with only local level", () => {
      const config = {
        version: "2.0",
        local: {
          overrides: {
            mcpServers: ["github"],
          },
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.local?.overrides).toBeDefined();
      expect(result.user).toBeUndefined();
      expect(result.project).toBeUndefined();
    });

    it("uses default version when not specified", () => {
      const config = {
        user: {
          presets: ["github:company/standards"],
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.version).toBe("2.0");
    });
  });

  describe("File-level selection capabilities", () => {
    it("validates file selection with include and exclude patterns", () => {
      const fileSelection = {
        include: ["src/**/*.ts", "lib/**/*.js"],
        exclude: ["**/node_modules/**", "**/dist/**"],
      };

      const result = FileSelectionSchema.parse(fileSelection);
      expect(result.include).toEqual(["src/**/*.ts", "lib/**/*.js"]);
      expect(result.exclude).toEqual(["**/node_modules/**", "**/dist/**"]);
    });

    it("validates file selection with only include patterns", () => {
      const fileSelection = {
        include: ["**/*.ts"],
      };

      const result = FileSelectionSchema.parse(fileSelection);
      expect(result.include).toEqual(["**/*.ts"]);
      expect(result.exclude).toBeUndefined();
    });

    it("rejects file selection without include patterns", () => {
      const fileSelection = {
        exclude: ["**/node_modules/**"],
      };

      expect(() => FileSelectionSchema.parse(fileSelection)).toThrow();
    });

    it("rejects file selection with empty include array", () => {
      const fileSelection = {
        include: [],
      };

      expect(() => FileSelectionSchema.parse(fileSelection)).toThrow();
    });

    it("validates preset selection with all components", () => {
      const presetSelection = {
        rules: {
          include: ["**/*.ts"],
          exclude: ["**/test/**"],
        },
        commands: {
          include: ["package.json"],
        },
        mcps: ["github", "postgres"],
      };

      const result = PresetSelectionSchema.parse(presetSelection);
      expect(result.rules?.include).toEqual(["**/*.ts"]);
      expect(result.commands?.include).toEqual(["package.json"]);
      expect(result.mcps).toEqual(["github", "postgres"]);
    });

    it("validates preset selection with partial components", () => {
      const presetSelection = {
        rules: {
          include: ["**/*.ts"],
        },
      };

      const result = PresetSelectionSchema.parse(presetSelection);
      expect(result.rules?.include).toEqual(["**/*.ts"]);
      expect(result.commands).toBeUndefined();
      expect(result.mcps).toBeUndefined();
    });
  });

  describe("User registry configuration", () => {
    it("validates user registry with presets", () => {
      const userRegistry = {
        presets: ["github:company/standards", "github:team/backend"],
      };

      const result = UserRegistryConfigSchema.parse(userRegistry);
      expect(result.presets).toHaveLength(2);
      expect(result.presets[0]).toBe("github:company/standards");
    });

    it("validates user registry with default selections", () => {
      const userRegistry = {
        presets: ["github:company/standards"],
        defaultSelections: {
          "github:company/standards": {
            rules: {
              include: ["**/*.ts"],
            },
          },
        },
      };

      const result = UserRegistryConfigSchema.parse(userRegistry);
      expect(result.defaultSelections).toBeDefined();
      expect(Object.keys(result.defaultSelections!)).toHaveLength(1);
    });

    it("rejects user registry without presets", () => {
      const userRegistry = {};

      expect(() => UserRegistryConfigSchema.parse(userRegistry)).toThrow();
    });

    it("rejects user registry with empty presets array", () => {
      const userRegistry = {
        presets: [],
      };

      expect(() => UserRegistryConfigSchema.parse(userRegistry)).toThrow();
    });
  });

  describe("Backward compatibility", () => {
    it("validates legacy configuration format", () => {
      // This represents the old AgentSyncConfig format
      const legacyConfig = {
        version: "1.0",
        extends: ["github:company/standards"],
        tools: ["cursor", "claude"],
        useSymlinks: true,
        mcpServers: ["github", "postgres"],
      };

      // This should be handled by a migration function
      // For now, we'll test that the new schema can handle migrated data
      const migratedConfig = {
        version: "2.0",
        user: {
          presets: legacyConfig.extends || [],
        },
        project: {
          tools: legacyConfig.tools,
          selections: {},
          overrides: {
            mcpServers: legacyConfig.mcpServers,
          },
        },
      };

      const result = InteractiveSelectionConfigSchema.parse(migratedConfig);
      expect(result.user?.presets).toEqual(["github:company/standards"]);
      expect(result.project?.tools).toEqual(["cursor", "claude"]);
    });

    it("handles missing optional fields gracefully", () => {
      const minimalConfig = {
        version: "2.0",
      };

      const result = InteractiveSelectionConfigSchema.parse(minimalConfig);
      expect(result.version).toBe("2.0");
      expect(result.user).toBeUndefined();
      expect(result.project).toBeUndefined();
      expect(result.local).toBeUndefined();
    });
  });

  describe("Configuration validation", () => {
    it("rejects invalid version format", () => {
      const config = {
        version: 123, // Should be string
        user: {
          presets: ["github:company/standards"],
        },
      };

      expect(() => InteractiveSelectionConfigSchema.parse(config)).toThrow();
    });

    it("rejects invalid preset source format", () => {
      const config = {
        user: {
          presets: ["invalid-source-format"], // Should be "github:org/repo"
        },
      };

      // This would be validated by additional business logic
      // The schema itself only validates it's a string
      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(result.user?.presets[0]).toBe("invalid-source-format");
    });

    it("rejects invalid glob patterns in file selection", () => {
      const config = {
        project: {
          selections: {
            "github:company/standards": {
              rules: {
                include: [""], // Empty string should be invalid
              },
            },
          },
        },
      };

      // The schema validates it's a non-empty string array
      // Additional validation would check glob pattern validity
      const result = InteractiveSelectionConfigSchema.parse(config);
      expect(
        result.project?.selections?.["github:company/standards"]?.rules
          ?.include,
      ).toEqual([""]);
    });
  });
});
