import type { z } from "zod";
import { ConfigError } from "../../core/errors.js";
import type {
  OutputStyleConfigSchema,
  PermissionsConfigSchema,
  StatuslineConfigSchema,
} from "../../types/schemas.js";
import type { ToolExtensionsInput } from "../types.js";
import {
  type CodexOwnership,
  codexConfigPath,
  hashValue,
  isRecord,
  optionalConfigTable,
  readCodexOwnership,
  readProjectTomlOrEmpty,
  validateCodexSharedState,
  withoutProperty,
  writeCodexOwnership,
  writeProjectToml,
} from "./shared.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;
type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;
type CodexConfigOwnershipKey = keyof CodexOwnership["config"];

async function recordCodexConfigOwnership(
  cwd: string,
  key: CodexConfigOwnershipKey,
  value: unknown,
): Promise<void> {
  const receipt = await readCodexOwnership(cwd);
  await writeCodexOwnership(cwd, {
    ...receipt,
    config: { ...receipt.config, [key]: hashValue(value) },
  });
}

function withdrawOwnedTopLevel(
  config: Record<string, unknown>,
  key: "default_permissions" | "personality",
  expectedHash: string | undefined,
): Record<string, unknown> {
  if (
    !expectedHash ||
    config[key] === undefined ||
    hashValue(config[key]) !== expectedHash
  ) {
    return config;
  }
  return withoutProperty(config, key);
}

function withdrawOwnedStatusLine(
  config: Record<string, unknown>,
  expectedHash: string | undefined,
): Record<string, unknown> {
  if (!(expectedHash && isRecord(config.tui))) return config;
  if (
    config.tui.status_line === undefined ||
    hashValue(config.tui.status_line) !== expectedHash
  ) {
    return config;
  }
  const tui = withoutProperty(config.tui, "status_line");
  return Object.keys(tui).length > 0
    ? { ...config, tui }
    : withoutProperty(config, "tui");
}

function modifiedExtensionWarning(key: string): string {
  return (
    `codex ${key} preserved after withdrawal because the prior ` +
    "AgentSync-owned value was modified; ownership was relinquished. " +
    "Remove the preserved value manually after review if it is no longer wanted."
  );
}

function desiredExtensionCollision(
  configFile: string,
  key: string,
  owned: boolean,
): ConfigError {
  const state = owned ? "modified" : "unowned";
  return new ConfigError(
    `Cannot overwrite ${state} Codex extension value "${key}" in "${configFile}".`,
    configFile,
    "Move the existing value aside, or restore the exact previously generated value and ownership receipt, then rerun agentsync sync.",
  );
}

function assertDesiredTopLevelWritable(
  config: Record<string, unknown>,
  configFile: string,
  key: "default_permissions" | "personality",
  expectedHash: string | undefined,
): void {
  if (!Object.hasOwn(config, key)) return;
  if (expectedHash && hashValue(config[key]) === expectedHash) return;
  throw desiredExtensionCollision(configFile, key, expectedHash !== undefined);
}

function assertDesiredStatusLineWritable(
  config: Record<string, unknown>,
  configFile: string,
  expectedHash: string | undefined,
): void {
  const tui = optionalConfigTable(config, "tui", configFile);
  if (!Object.hasOwn(tui, "status_line")) return;
  if (expectedHash && hashValue(tui.status_line) === expectedHash) return;
  throw desiredExtensionCollision(
    configFile,
    "tui.status_line",
    expectedHash !== undefined,
  );
}

interface CodexExtensionIntent {
  default_permissions: boolean;
  status_line: boolean;
  personality: boolean;
}

function assertDesiredCodexExtensionsWritable(
  config: Record<string, unknown>,
  configFile: string,
  receipt: CodexOwnership,
  intent: CodexExtensionIntent,
): void {
  if (intent.default_permissions) {
    assertDesiredTopLevelWritable(
      config,
      configFile,
      "default_permissions",
      receipt.config.default_permissions,
    );
  }
  if (intent.status_line) {
    assertDesiredStatusLineWritable(
      config,
      configFile,
      receipt.config.status_line,
    );
  }
  if (intent.personality) {
    assertDesiredTopLevelWritable(
      config,
      configFile,
      "personality",
      receipt.config.personality,
    );
  }
}

function reconcileOwnedTopLevel(
  config: Record<string, unknown>,
  warnings: string[],
  key: "default_permissions" | "personality",
  expectedHash: string | undefined,
  retained: boolean,
): Record<string, unknown> {
  if (retained) return config;
  if (
    expectedHash !== undefined &&
    config[key] !== undefined &&
    hashValue(config[key]) !== expectedHash
  ) {
    warnings.push(modifiedExtensionWarning(key));
  }
  return withdrawOwnedTopLevel(config, key, expectedHash);
}

function reconcileOwnedStatusLine(
  config: Record<string, unknown>,
  warnings: string[],
  expectedHash: string | undefined,
  retained: boolean,
): Record<string, unknown> {
  if (retained) return config;
  if (
    expectedHash !== undefined &&
    isRecord(config.tui) &&
    config.tui.status_line !== undefined &&
    hashValue(config.tui.status_line) !== expectedHash
  ) {
    warnings.push(modifiedExtensionWarning("tui.status_line"));
  }
  return withdrawOwnedStatusLine(config, expectedHash);
}

function reconcileCodexExtensionConfig(
  config: Record<string, unknown>,
  receipt: CodexOwnership,
  intent: CodexExtensionIntent,
): { config: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const withoutPermissions = reconcileOwnedTopLevel(
    config,
    warnings,
    "default_permissions",
    receipt.config.default_permissions,
    intent.default_permissions,
  );
  const withoutStatusLine = reconcileOwnedStatusLine(
    withoutPermissions,
    warnings,
    receipt.config.status_line,
    intent.status_line,
  );
  return {
    config: reconcileOwnedTopLevel(
      withoutStatusLine,
      warnings,
      "personality",
      receipt.config.personality,
      intent.personality,
    ),
    warnings,
  };
}

const CX_PERMISSION_DEFAULT: Record<string, string> = {
  allow: ":danger-full-access",
  ask: ":workspace",
  deny: ":read-only",
};

export function codexPermissionWarnings(
  permissions: NonNullable<PermissionsConfig>,
): string[] {
  const warnings = (permissions.rules ?? []).map(
    (rule) =>
      `permissions.rule ${rule.id} (${rule.tool}/${rule.pattern ?? "*"}) is not ` +
      "translatable to Codex and was dropped — cx only projects " +
      "permissions.default to default_permissions.",
  );
  if (permissions.default === "allow") {
    warnings.unshift(
      "permissions.default=allow maps to codex :danger-full-access — " +
        "verify this is intentional.",
    );
  }
  return warnings;
}

export async function writeCodexPermissions(
  permissions: NonNullable<PermissionsConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const warnings = codexPermissionWarnings(permissions);
  if (!permissions.default) return { warnings };
  const configFile = codexConfigPath(cwd);
  const existing = await readProjectTomlOrEmpty(cwd, configFile);
  const value = CX_PERMISSION_DEFAULT[permissions.default];
  await writeProjectToml(cwd, configFile, {
    ...existing,
    default_permissions: value,
  });
  await recordCodexConfigOwnership(cwd, "default_permissions", value);
  return { warnings };
}

const CODEX_STATUSLINE_ITEMS: Partial<
  Record<NonNullable<NonNullable<StatuslineConfig>["items"]>[number], string>
> = {
  model: "model",
  cwd: "current-dir",
  branch: "git-branch",
  tokens: "context-used",
  session: "thread-id",
};

function codexStatuslineProjection(statusline: NonNullable<StatuslineConfig>): {
  items: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const items: string[] = [];
  for (const canonicalItem of statusline.items ?? []) {
    const codexItem = CODEX_STATUSLINE_ITEMS[canonicalItem];
    if (!codexItem) {
      warnings.push(
        `statusline item ${canonicalItem} dropped on codex — cx tui.status_line has no equivalent.`,
      );
      continue;
    }
    if (!items.includes(codexItem)) items.push(codexItem);
  }
  if (statusline.custom_items?.length) {
    warnings.push(
      "statusline.custom_items dropped on codex — cx tui.status_line accepts " +
        "supported enum values only.",
    );
  }
  return { items, warnings };
}

export function codexStatuslineWarnings(
  statusline: NonNullable<StatuslineConfig>,
): string[] {
  return codexStatuslineProjection(statusline).warnings;
}

export async function writeCodexStatusline(
  statusline: NonNullable<StatuslineConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const { items, warnings } = codexStatuslineProjection(statusline);
  const configFile = codexConfigPath(cwd);
  const existing = await readProjectTomlOrEmpty(cwd, configFile);
  const tui = optionalConfigTable(existing, "tui", configFile);
  await writeProjectToml(cwd, configFile, {
    ...existing,
    tui: { ...tui, status_line: items },
  });
  await recordCodexConfigOwnership(cwd, "status_line", items);
  return { warnings };
}

const TONE_TO_CX: Record<string, string | null> = {
  terse: "none",
  pragmatic: "pragmatic",
  explanatory: null,
  friendly: "friendly",
  none: "none",
};

export function codexOutputStyleProjection(
  outputStyle: NonNullable<OutputStyleConfig>,
): { personality?: string; warnings: string[] } {
  const warnings = outputStyle.custom?.length
    ? ["output_style.custom dropped on codex — cx personality is enum-only."]
    : [];
  if (!outputStyle.tone) return { warnings };
  const personality = TONE_TO_CX[outputStyle.tone];
  if (personality === null) {
    warnings.push(
      `output_style.tone=${outputStyle.tone} has no codex personality equivalent`,
    );
    return { warnings };
  }
  return { personality, warnings };
}

export async function writeCodexOutputStyle(
  outputStyle: NonNullable<OutputStyleConfig>,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const { personality, warnings } = codexOutputStyleProjection(outputStyle);
  if (!personality) return { warnings };
  const configFile = codexConfigPath(cwd);
  const existing = await readProjectTomlOrEmpty(cwd, configFile);
  await writeProjectToml(cwd, configFile, { ...existing, personality });
  await recordCodexConfigOwnership(cwd, "personality", personality);
  return { warnings };
}

function codexExtensionOwnershipIntent(
  input: ToolExtensionsInput,
): CodexExtensionIntent {
  return {
    default_permissions: input.permissions?.default !== undefined,
    status_line: input.statusline !== undefined,
    personality:
      input.outputStyle !== undefined &&
      codexOutputStyleProjection(input.outputStyle).personality !== undefined,
  };
}

export async function reconcileCodexExtensions(
  input: ToolExtensionsInput,
  cwd: string,
): Promise<{ warnings: string[] }> {
  const configFile = codexConfigPath(cwd);
  const [existing, receipt] = await Promise.all([
    readProjectTomlOrEmpty(cwd, configFile),
    readCodexOwnership(cwd),
  ]);
  const intent = codexExtensionOwnershipIntent(input);
  assertDesiredCodexExtensionsWritable(existing, configFile, receipt, intent);
  const reconciliation = reconcileCodexExtensionConfig(
    existing,
    receipt,
    intent,
  );
  if (hashValue(reconciliation.config) !== hashValue(existing)) {
    await writeProjectToml(cwd, configFile, reconciliation.config);
  }

  const configOwnership: CodexOwnership["config"] = {
    ...(intent.default_permissions && receipt.config.default_permissions
      ? { default_permissions: receipt.config.default_permissions }
      : {}),
    ...(intent.status_line && receipt.config.status_line
      ? { status_line: receipt.config.status_line }
      : {}),
    ...(intent.personality && receipt.config.personality
      ? { personality: receipt.config.personality }
      : {}),
  };
  await writeCodexOwnership(cwd, { ...receipt, config: configOwnership });
  return { warnings: reconciliation.warnings };
}

export async function preflightCodexExtensions(
  input: ToolExtensionsInput,
  cwd: string,
): Promise<void> {
  const configFile = codexConfigPath(cwd);
  const { config, receipt } = await validateCodexSharedState(cwd);
  assertDesiredCodexExtensionsWritable(
    config,
    configFile,
    receipt,
    codexExtensionOwnershipIntent(input),
  );
}

export function cleanCodexExtensionConfig(
  config: Record<string, unknown>,
  receipt: CodexOwnership,
): { config: Record<string, unknown>; warnings: string[] } {
  return reconcileCodexExtensionConfig(config, receipt, {
    default_permissions: false,
    status_line: false,
    personality: false,
  });
}
