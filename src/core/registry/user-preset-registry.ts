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
      throw new Error(
        `Failed to parse user preset registry at ${this.registryPath}: ${(error as Error).message}`
      );
    }

    // Validate registry structure
    const result = safeParseUserPresetRegistry(registry);
    if (!result.success) {
      throw new Error(
        `Invalid user preset registry format at ${this.registryPath}: ${result.error.message}`
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
      throw new Error("No registry data to save");
    }

    // Ensure directory exists
    const dir = path.dirname(this.registryPath);
    await mkdir(dir, { recursive: true });

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
      throw new Error(
        `Failed to save user preset registry to ${this.registryPath}: ${(error as Error).message}`
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
    // Validate preset structure
    const validatedPreset = validateUserPreset(preset);

    // Load registry
    const registry = await this.loadRegistry();

    // Check for duplicate
    if (registry.presets[validatedPreset.name]) {
      throw new Error(
        `Preset with name '${validatedPreset.name}' already exists`
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
  }

  /**
   * Remove a preset from the registry
   */
  async remove(name: string): Promise<void> {
    if (!name || name.trim() === "") {
      throw new Error("Preset name cannot be empty");
    }

    // Load registry
    const registry = await this.loadRegistry();

    // Check if preset exists
    if (!registry.presets[name]) {
      throw new Error(`Preset '${name}' not found`);
    }

    // Remove from registry
    delete registry.presets[name];

    // Save changes
    await this.saveRegistry();
  }

  /**
   * Get a specific preset by name
   */
  async get(name: string): Promise<UserPreset> {
    if (!name || name.trim() === "") {
      throw new Error("Preset name cannot be empty");
    }

    // Load registry
    const registry = await this.loadRegistry();

    // Get preset
    const preset = registry.presets[name];
    if (!preset) {
      throw new Error(`Preset '${name}' not found`);
    }

    return preset;
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
