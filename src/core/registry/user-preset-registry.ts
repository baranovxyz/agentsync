/**
 * User Preset Registry System
 * Manages user-defined presets with simplified schema and persistence
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { UserConfig, UserPresetEntry } from "../../types/schemas.js";
import {
  safeParseUserConfig,
  validateUserPresetEntry,
} from "../../types/schemas.js";
import { pathExists } from "../../utils/fs.js";
import {
  ErrorCategory,
  ErrorHandler,
  UserPresetRegistryError,
} from "../errors.js";

/**
 * Get the default user config path
 */
export function getUserConfigPath(): string {
  const home = os.homedir();
  return path.join(home, ".agentsync", "config.json");
}

/**
 * Get the default user preset registry path (legacy for backward compatibility)
 */
export function getUserPresetRegistryPath(): string {
  const home = os.homedir();
  return path.join(home, ".agentsync", "user-presets.json");
}

/**
 * User Preset Registry class
 * Provides CRUD operations for user presets with persistence
 */
export class UserPresetRegistry {
  private registryPath: string;
  private registryData: UserConfig | null = null;

  constructor(registryPath?: string) {
    this.registryPath = registryPath || getUserConfigPath();
  }

  /**
   * Get the registry path
   */
  getRegistryPath(): string {
    return this.registryPath;
  }

  /**
   * Load registry data from disk
   */
  private async loadRegistry(): Promise<UserConfig> {
    if (this.registryData) {
      return this.registryData;
    }

    // Check if file exists
    if (!(await pathExists(this.registryPath))) {
      // Create empty registry
      this.registryData = this.createEmptyRegistry();
      await this.saveRegistry();
      return this.registryData;
    }

    // Read and parse JSON
    let registry: unknown;
    try {
      const content = await readFile(this.registryPath, "utf-8");
      registry = JSON.parse(content);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new UserPresetRegistryError(
          `Registry file contains invalid JSON: ${error.message}`,
          "load",
        );
      }

      if ((error as unknown as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new UserPresetRegistryError("Registry file not found", "load");
      }

      if ((error as unknown as NodeJS.ErrnoException)?.code === "EACCES") {
        throw new UserPresetRegistryError(
          "Permission denied accessing registry file",
          "load",
        );
      }

      throw ErrorHandler.wrap(
        error,
        `Failed to parse user config at ${this.registryPath}`,
        ErrorCategory.FILE_SYSTEM,
        { registryPath: this.registryPath },
      );
    }

    // Parse as UserConfig schema
    const result = safeParseUserConfig(registry);
    if (result.success) {
      this.registryData = result.data;
      return this.registryData;
    }

    throw new UserPresetRegistryError(
      `Invalid registry format: ${result.error.message}`,
      "load",
    );
  }

  /**
   * Save registry data to disk
   */
  private async saveRegistry(): Promise<void> {
    if (!this.registryData) {
      throw new UserPresetRegistryError("No registry data to save", "save");
    }

    // Ensure directory exists
    const dir = path.dirname(this.registryPath);
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      throw new UserPresetRegistryError(
        `Failed to create registry directory: ${(error as Error).message}`,
        "save",
      );
    }

    // Write to file
    try {
      const content = JSON.stringify(this.registryData, null, 2);
      await writeFile(this.registryPath, content, "utf-8");
    } catch (error) {
      if ((error as unknown as NodeJS.ErrnoException)?.code === "EACCES") {
        throw new UserPresetRegistryError(
          "Permission denied writing to registry file",
          "save",
        );
      }

      if ((error as unknown as NodeJS.ErrnoException)?.code === "ENOSPC") {
        throw new UserPresetRegistryError(
          "Insufficient disk space to save registry",
          "save",
        );
      }

      throw ErrorHandler.wrap(
        error,
        `Failed to save user config to ${this.registryPath}`,
        ErrorCategory.FILE_SYSTEM,
        { registryPath: this.registryPath },
      );
    }
  }

  /**
   * Create an empty registry structure
   */
  private createEmptyRegistry(): UserConfig {
    return {
      version: "1.0",
      presets: {},
      tools: ["cursor", "claude"],
    };
  }

  /**
   * Add a preset to the registry
   */
  async add(namespace: string, entry: UserPresetEntry): Promise<void> {
    await this.loadRegistry();
    validateUserPresetEntry(entry);

    if (this.registryData?.presets[namespace]) {
      throw new UserPresetRegistryError(
        `Preset with name '${namespace}' already exists`,
        "add",
      );
    }

    if (this.registryData?.presets) {
      this.registryData.presets[namespace] = entry;
    }
    await this.saveRegistry();
  }

  /**
   * Remove a preset from the registry
   */
  async remove(name: string): Promise<void> {
    await this.loadRegistry();

    if (!this.registryData?.presets[name]) {
      throw new UserPresetRegistryError(
        `Preset with name '${name}' not found`,
        "remove",
      );
    }

    if (this.registryData?.presets) {
      delete this.registryData.presets[name];
    }
    await this.saveRegistry();
  }

  /**
   * Get a preset from the registry
   */
  async get(name: string): Promise<UserPresetEntry> {
    await this.loadRegistry();

    const entry = this.registryData?.presets[name];
    if (!entry) {
      throw new UserPresetRegistryError(
        `Preset with name '${name}' not found`,
        "get",
      );
    }

    return entry;
  }

  /**
   * List all presets in the registry
   */
  async list(): Promise<Record<string, UserPresetEntry>> {
    await this.loadRegistry();
    return this.registryData?.presets || {};
  }

  /**
   * Check if a preset exists in the registry
   */
  async exists(name: string): Promise<boolean> {
    await this.loadRegistry();
    return name in (this.registryData?.presets || {});
  }

  /**
   * Get registry metadata
   */
  async getMetadata(): Promise<{ version?: string; totalPresets: number }> {
    await this.loadRegistry();
    return {
      version: this.registryData?.version,
      totalPresets: Object.keys(this.registryData?.presets || {}).length,
    };
  }

  /**
   * Clear all presets from the registry
   */
  async clear(): Promise<void> {
    this.registryData = this.createEmptyRegistry();
    await this.saveRegistry();
  }
}
