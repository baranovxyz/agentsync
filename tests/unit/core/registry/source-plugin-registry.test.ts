import { describe, expect, it } from "vitest";
import type {
  SourcePlugin,
  SourceType,
} from "../../../../src/core/registry/source-plugin.js";
import { SourcePluginRegistry } from "../../../../src/core/registry/source-plugin-registry.js";

// Mock plugin implementation for testing
class MockPlugin implements SourcePlugin {
  constructor(
    private type: SourceType,
    private prefix: string,
  ) {}

  getType(): SourceType {
    return this.type;
  }

  canHandle(source: string): boolean {
    return source.startsWith(this.prefix);
  }

  validate(source: string): void {
    if (!source.startsWith(this.prefix)) {
      throw new Error(`Invalid source for ${this.type}`);
    }
  }

  async resolve(source: string): Promise<string> {
    return `/resolved/${source}`;
  }
}

describe("SourcePluginRegistry", () => {
  describe("register", () => {
    it("registers a plugin successfully", () => {
      const registry = new SourcePluginRegistry();
      const plugin = new MockPlugin("github", "github:");

      expect(() => registry.register(plugin)).not.toThrow();
      expect(registry.hasType("github")).toBe(true);
    });

    it("throws error when registering duplicate plugin type", () => {
      const registry = new SourcePluginRegistry();
      const plugin1 = new MockPlugin("github", "github:");
      const plugin2 = new MockPlugin("github", "gh:");

      registry.register(plugin1);

      expect(() => registry.register(plugin2)).toThrow(
        'Plugin for source type "github" is already registered',
      );
    });

    it("allows registering different plugin types", () => {
      const registry = new SourcePluginRegistry();
      const githubPlugin = new MockPlugin("github", "github:");
      const fsPlugin = new MockPlugin("filesystem", "fs:");

      registry.register(githubPlugin);
      registry.register(fsPlugin);

      expect(registry.hasType("github")).toBe(true);
      expect(registry.hasType("filesystem")).toBe(true);
    });
  });

  describe("getPlugin", () => {
    it("returns correct plugin for matching source", () => {
      const registry = new SourcePluginRegistry();
      const githubPlugin = new MockPlugin("github", "github:");
      const fsPlugin = new MockPlugin("filesystem", "fs:");

      registry.register(githubPlugin);
      registry.register(fsPlugin);

      const plugin = registry.getPlugin("github:company/repo");
      expect(plugin).toBe(githubPlugin);
    });

    it("returns undefined for non-matching source", () => {
      const registry = new SourcePluginRegistry();
      const githubPlugin = new MockPlugin("github", "github:");

      registry.register(githubPlugin);

      const plugin = registry.getPlugin("http://example.com");
      expect(plugin).toBeUndefined();
    });

    it("returns first matching plugin when multiple could match", () => {
      const registry = new SourcePluginRegistry();
      const plugin1 = new MockPlugin("github", "github:");
      const plugin2 = new MockPlugin("filesystem", "git"); // Overly broad matcher

      registry.register(plugin1);
      registry.register(plugin2);

      // "github:test" matches plugin1 first
      const plugin = registry.getPlugin("github:test");
      expect(plugin).toBe(plugin1);
    });
  });

  describe("getSupportedTypes", () => {
    it("returns empty array when no plugins registered", () => {
      const registry = new SourcePluginRegistry();
      expect(registry.getSupportedTypes()).toEqual([]);
    });

    it("returns all registered plugin types", () => {
      const registry = new SourcePluginRegistry();
      const githubPlugin = new MockPlugin("github", "github:");
      const fsPlugin = new MockPlugin("filesystem", "fs:");

      registry.register(githubPlugin);
      registry.register(fsPlugin);

      const types = registry.getSupportedTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain("github");
      expect(types).toContain("filesystem");
    });
  });

  describe("hasType", () => {
    it("returns false for unregistered type", () => {
      const registry = new SourcePluginRegistry();
      expect(registry.hasType("github")).toBe(false);
    });

    it("returns true for registered type", () => {
      const registry = new SourcePluginRegistry();
      const plugin = new MockPlugin("github", "github:");

      registry.register(plugin);

      expect(registry.hasType("github")).toBe(true);
    });
  });

  describe("getAllPlugins", () => {
    it("returns empty array when no plugins registered", () => {
      const registry = new SourcePluginRegistry();
      expect(registry.getAllPlugins()).toEqual([]);
    });

    it("returns all registered plugins", () => {
      const registry = new SourcePluginRegistry();
      const githubPlugin = new MockPlugin("github", "github:");
      const fsPlugin = new MockPlugin("filesystem", "fs:");

      registry.register(githubPlugin);
      registry.register(fsPlugin);

      const plugins = registry.getAllPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(githubPlugin);
      expect(plugins).toContain(fsPlugin);
    });
  });
});
