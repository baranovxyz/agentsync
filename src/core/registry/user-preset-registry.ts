/**
 * User Preset Registry System
 * Manages user-defined presets with metadata and persistence
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathExists } from "../../utils/fs.js";
import * as path from "path";
import * as os from "os";
import type {
  UserPreset,
  UserPresetRegistryData,
} from "../../types/schemas.js";
import {
  validateUserPreset,
  safeParseUserPresetRegistry,
} from "../../types/schemas.js";
import {
  UserPresetRegistryError,
  FileSystemError,
  ValidationError,
  ErrorHandler,
  ErrorCategory,
} from "../errors.js";

/**
 * Get the default user preset registry path
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
  private registryData: UserPresetRegistryData | null = null;

  constructor(registryPath?: string) {
    this.registryPath = registryPath || getUserPresetRegistryPath();
  }

  /**
   * Load registry data from disk
   */
  private async loadRegistry(): Promise<UserPresetRegistryData> {
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
          "load"
        );
      }

      if ((error as any).code === "ENOENT") {
        throw new UserPresetRegistryError("Registry file not found", "load");
      }

      if ((error as any).code === "EACCES") {
        throw new UserPresetRegistryError(
          "Permission denied accessing registry file",
          "load"
        );
      }

      throw ErrorHandler.wrap(
        error,
        `Failed to parse user preset registry at ${this.registryPath}`,
        ErrorCategory.FILE_SYSTEM,
        { registryPath: this.registryPath }
      );
    }

    // Validate registry structure
    const result = safeParseUserPresetRegistry(registry);
    if (!result.success) {
      throw new UserPresetRegistryError(
        `Invalid registry format: ${result.error.message}`,
        "load"
      );
    }

    this.registryData = result.data;
    return this.registryData;
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
        "save"
      );
    }

    // Update metadata
    this.registryData.metadata.updatedAt = new Date().toISOString();
    this.registryData.metadata.totalPresets = Object.keys(
      this.registryData.presets
    ).length;

    // Write to file
    try {
      const content = JSON.stringify(this.registryData, null, 2);
      await writeFile(this.registryPath, content, "utf-8");
    } catch (error) {
      if ((error as any).code === "EACCES") {
        throw new UserPresetRegistryError(
          "Permission denied writing to registry file",
          "save"
        );
      }

      if ((error as any).code === "ENOSPC") {
        throw new UserPresetRegistryError(
          "Insufficient disk space to save registry",
          "save"
        );
      }

      throw ErrorHandler.wrap(
        error,
        `Failed to save user preset registry to ${this.registryPath}`,
        ErrorCategory.FILE_SYSTEM,
        { registryPath: this.registryPath }
      );
    }
  }

  /**
   * Create an empty registry structure
   */
  private createEmptyRegistry(): UserPresetRegistryData {
    const now = new Date().toISOString();
    return {
      version: "1.0",
      presets: {},
      metadata: {
        createdAt: now,
        updatedAt: now,
        totalPresets: 0,
      },
    };
  }

  /**
   * Add a new preset to the registry
   */
  async add(preset: UserPreset): Promise<void> {
    try {
      // Validate preset structure
      const validatedPreset = validateUserPreset(preset);

      // Load registry
      const registry = await this.loadRegistry();

      // Check for duplicate
      if (registry.presets[validatedPreset.name]) {
        throw new UserPresetRegistryError(
          `Preset with name '${validatedPreset.name}' already exists`,
          "add",
          validatedPreset.name
        );
      }

      // Add timestamps to metadata
      const now = new Date().toISOString();
      const presetWithTimestamps = {
        ...validatedPreset,
        metadata: {
          ...validatedPreset.metadata,
          createdAt: validatedPreset.metadata?.createdAt || now,
          updatedAt: now,
        },
      };

      // Add to registry
      registry.presets[validatedPreset.name] = presetWithTimestamps;

      // Save changes
      await this.saveRegistry();
    } catch (error) {
      if (error instanceof UserPresetRegistryError) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        "Failed to add preset to registry",
        ErrorCategory.FILE_SYSTEM,
        { presetName: preset.name }
      );
    }
  }

  /**
   * Remove a preset from the registry
   */
  async remove(name: string): Promise<void> {
    if (!name || name.trim() === "") {
      throw new UserPresetRegistryError(
        "Preset name cannot be empty",
        "remove"
      );
    }

    try {
      // Load registry
      const registry = await this.loadRegistry();

      // Check if preset exists
      if (!registry.presets[name]) {
        throw new UserPresetRegistryError(
          `Preset '${name}' not found`,
          "remove",
          name
        );
      }

      // Remove from registry
      delete registry.presets[name];

      // Save changes
      await this.saveRegistry();
    } catch (error) {
      if (error instanceof UserPresetRegistryError) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        "Failed to remove preset from registry",
        ErrorCategory.FILE_SYSTEM,
        { presetName: name }
      );
    }
  }

  /**
   * Get a specific preset by name
   */
  async get(name: string): Promise<UserPreset> {
    if (!name || name.trim() === "") {
      throw new UserPresetRegistryError("Preset name cannot be empty", "get");
    }

    try {
      // Load registry
      const registry = await this.loadRegistry();

      // Get preset
      const preset = registry.presets[name];
      if (!preset) {
        throw new UserPresetRegistryError(
          `Preset '${name}' not found`,
          "get",
          name
        );
      }

      return preset;
    } catch (error) {
      if (error instanceof UserPresetRegistryError) {
        throw error;
      }

      throw ErrorHandler.wrap(
        error,
        "Failed to get preset from registry",
        ErrorCategory.FILE_SYSTEM,
        { presetName: name }
      );
    }
  }

  /**
   * List all presets in the registry
   */
  async list(): Promise<UserPreset[]> {
    // Load registry
    const registry = await this.loadRegistry();

    // Return all presets as array
    return Object.values(registry.presets);
  }

  /**
   * Update an existing preset
   */
  async update(name: string, updates: Partial<UserPreset>): Promise<void> {
    if (!name || name.trim() === "") {
      throw new Error("Preset name cannot be empty");
    }

    // Load registry
    const registry = await this.loadRegistry();

    // Check if preset exists
    const existingPreset = registry.presets[name];
    if (!existingPreset) {
      throw new Error(`Preset '${name}' not found`);
    }

    // Validate updates
    const updatedPreset = { ...existingPreset, ...updates };
    const validatedPreset = validateUserPreset(updatedPreset);

    // Update timestamp
    const now = new Date().toISOString();
    const presetWithTimestamp = {
      ...validatedPreset,
      metadata: {
        ...validatedPreset.metadata,
        createdAt: existingPreset.metadata?.createdAt || now,
        updatedAt: now,
      },
    };

    // Update registry
    registry.presets[name] = presetWithTimestamp;

    // Save changes
    await this.saveRegistry();
  }

  /**
   * Check if a preset exists
   */
  async exists(name: string): Promise<boolean> {
    if (!name || name.trim() === "") {
      return false;
    }

    // Load registry
    const registry = await this.loadRegistry();

    return name in registry.presets;
  }

  /**
   * Get registry metadata
   */
  async getMetadata(): Promise<UserPresetRegistryData["metadata"]> {
    // Load registry
    const registry = await this.loadRegistry();

    return { ...registry.metadata };
  }

  /**
   * Clear all presets from the registry
   */
  async clear(): Promise<void> {
    // Load registry
    const registry = await this.loadRegistry();

    // Clear all presets
    registry.presets = {};

    // Save changes
    await this.saveRegistry();
  }

  /**
   * Get the registry file path
   */
  getRegistryPath(): string {
    return this.registryPath;
  }
}
