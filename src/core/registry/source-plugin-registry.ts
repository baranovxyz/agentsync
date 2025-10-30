/**
 * Registry for managing source plugins
 * Allows registration and lookup of plugins for different source types
 */

import type { SourcePlugin, SourceType } from "./source-plugin.js";

/**
 * Registry that manages source plugins
 * Plugins are registered by their source type and looked up by source string
 */
export class SourcePluginRegistry {
  private plugins = new Map<SourceType, SourcePlugin>();

  /**
   * Register a source plugin
   * @param plugin - Plugin to register
   * @throws Error if a plugin for this type is already registered
   */
  register(plugin: SourcePlugin): void {
    const type = plugin.getType();
    if (this.plugins.has(type)) {
      throw new Error(`Plugin for source type "${type}" is already registered`);
    }
    this.plugins.set(type, plugin);
  }

  /**
   * Get plugin that can handle the given source string
   * @param source - Source string to find plugin for
   * @returns Plugin that can handle the source, or undefined if none found
   */
  getPlugin(source: string): SourcePlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.canHandle(source)) {
        return plugin;
      }
    }
    return undefined;
  }

  /**
   * Get all registered source types
   * @returns Array of registered source types
   */
  getSupportedTypes(): SourceType[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Check if a source type is registered
   * @param type - Source type to check
   * @returns True if the type is registered
   */
  hasType(type: SourceType): boolean {
    return this.plugins.has(type);
  }

  /**
   * Get all registered plugins
   * @returns Array of all registered plugins
   */
  getAllPlugins(): SourcePlugin[] {
    return Array.from(this.plugins.values());
  }
}
