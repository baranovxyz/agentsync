import { assertSafeProjectOutputPath } from "../../utils/project-output.js";
import type { ProviderCleanResult } from "../types.js";
import { cleanCodexRoles } from "./agents.js";
import { cleanCodexExtensionConfig } from "./extensions.js";
import { reconcileCodexHomeMcp } from "./mcp.js";
import {
  type CodexOwnership,
  codexConfigPath,
  codexOwnershipPath,
  fileHashState,
  hasCodexOwnership,
  hashValue,
  readCodexOwnership,
  readProjectTomlOrEmpty,
  writeCodexOwnership,
  writeProjectToml,
} from "./shared.js";

export async function hasCodexGeneratedState(cwd: string): Promise<boolean> {
  return hasCodexOwnership(await readCodexOwnership(cwd));
}

export async function cleanCodexGeneratedState(
  cwd: string,
  dryRun: boolean,
): Promise<ProviderCleanResult> {
  const configFile = codexConfigPath(cwd);
  const receiptPath = codexOwnershipPath(cwd);
  const [config, receipt] = await Promise.all([
    readProjectTomlOrEmpty(cwd, configFile),
    readCodexOwnership(cwd),
  ]);
  const homeMcp = await reconcileCodexHomeMcp({}, receipt, dryRun);
  await assertSafeProjectOutputPath(cwd, receiptPath);
  const receiptState = await fileHashState(receiptPath);
  const roles = await cleanCodexRoles(cwd, configFile, config, receipt, dryRun);
  const extensions = cleanCodexExtensionConfig(roles.config, receipt);
  const configChanged = hashValue(extensions.config) !== hashValue(config);
  const nextReceipt: CodexOwnership = {
    ...homeMcp.receipt,
    roles: {},
    config: {},
  };
  const removesReceipt =
    receiptState.kind !== "missing" && !hasCodexOwnership(nextReceipt);

  if (!dryRun) {
    if (configChanged) {
      await writeProjectToml(cwd, configFile, extensions.config);
    }
    await writeCodexOwnership(cwd, nextReceipt);
  }

  return {
    removedFiles: [
      ...roles.removedFiles,
      ...homeMcp.removedFiles,
      ...(removesReceipt ? [receiptPath] : []),
    ],
    removedDirs: [...new Set(roles.removedDirs)],
    modifiedFiles: [
      ...(configChanged ? [configFile] : []),
      ...homeMcp.modifiedFiles,
    ],
    warnings: [...homeMcp.warnings, ...roles.warnings, ...extensions.warnings],
    handledManifestPaths: roles.handledManifestPaths,
    relinquishedManifestPaths: roles.relinquishedManifestPaths,
  };
}
