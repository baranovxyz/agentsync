/**
 * Sync extensions module — orchestrates hooks, permissions, statusline,
 * output_style writers across providers.
 *
 * Each surface follows the same shape:
 *   - skip if provider lacks the capability flag
 *   - delegate to the provider's writer
 *   - collect warnings + dropped entries for surfacing via --json / doctor
 */

import type { z } from "zod";
import type { ToolProvider } from "../tools/types.js";
import type {
  HookSpec,
  OutputStyleConfigSchema,
  PermissionsConfigSchema,
  StatuslineConfigSchema,
} from "../types/schemas.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;
type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;

export interface ExtensionsSyncResult {
  tool: string;
  hooksWritten: number;
  permissionsWritten: boolean;
  statuslineWritten: boolean;
  outputStyleWritten: boolean;
  warnings: string[];
  droppedHooks: Array<{ event: string; id: string; reason: string }>;
}

export interface ExtensionsInput {
  hooks?: Record<string, HookSpec[]>;
  permissions?: NonNullable<PermissionsConfig>;
  statusline?: NonNullable<StatuslineConfig>;
  outputStyle?: NonNullable<OutputStyleConfig>;
}

async function applyHooks(
  provider: ToolProvider,
  hooks: Record<string, HookSpec[]>,
  cwd: string,
  result: ExtensionsSyncResult,
): Promise<void> {
  if (provider.capabilities.hooks && provider.hooksFormat) {
    const { dropped } = await provider.hooksFormat.writeHooks(hooks, cwd);
    result.droppedHooks = dropped;
    result.hooksWritten =
      Object.values(hooks).reduce((n, list) => n + list.length, 0) -
      dropped.length;
    return;
  }
  // Provider lacks hooks support — surface a drop per declaration so the
  // user sees that their canonical hooks did not reach this tool.
  for (const [event, specs] of Object.entries(hooks)) {
    for (const spec of specs) {
      result.droppedHooks.push({
        event,
        id: spec.id,
        reason: `${provider.name} does not support hooks`,
      });
    }
  }
}

export async function syncExtensions(
  providers: ToolProvider[],
  input: ExtensionsInput,
  cwd: string,
): Promise<ExtensionsSyncResult[]> {
  const results: ExtensionsSyncResult[] = [];
  for (const provider of providers) {
    const result: ExtensionsSyncResult = {
      tool: provider.name,
      hooksWritten: 0,
      permissionsWritten: false,
      statuslineWritten: false,
      outputStyleWritten: false,
      warnings: [],
      droppedHooks: [],
    };

    if (input.hooks && Object.keys(input.hooks).length > 0) {
      await applyHooks(provider, input.hooks, cwd, result);
    }

    if (
      input.permissions &&
      provider.capabilities.permissions &&
      provider.permissionsFormat
    ) {
      const { warnings } = await provider.permissionsFormat.writePermissions(
        input.permissions,
        cwd,
      );
      result.warnings.push(...warnings);
      result.permissionsWritten = true;
    }

    if (
      input.statusline &&
      provider.capabilities.statusline &&
      provider.statuslineFormat
    ) {
      const { warnings } = await provider.statuslineFormat.writeStatusline(
        input.statusline,
        cwd,
      );
      result.warnings.push(...warnings);
      result.statuslineWritten = true;
    }

    if (
      input.outputStyle &&
      provider.capabilities.outputStyle &&
      provider.outputStyleFormat
    ) {
      const { warnings } = await provider.outputStyleFormat.writeOutputStyle(
        input.outputStyle,
        cwd,
      );
      result.warnings.push(...warnings);
      result.outputStyleWritten = true;
    }

    results.push(result);
  }
  return results;
}
