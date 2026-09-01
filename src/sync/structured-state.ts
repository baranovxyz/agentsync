import { readFile, unlink } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { ConfigError, getErrorMessage } from "../core/errors.js";
import {
  type ConfigFileFormat,
  parseConfigRecord,
  serializeConfigRecord,
} from "../tools/mcp-helpers.js";
import { ToolSettingsSchema } from "../types/schemas.js";
import { outputFile } from "../utils/fs.js";
import {
  editJsoncArraySlice,
  editJsoncTopLevelKey,
  hasJsoncComments,
  parseJsoncValidated,
} from "../utils/jsonc.js";
import { assertSafeProjectOutputFile } from "../utils/project-output.js";
import {
  type ManagedArrayKeyState,
  reconcileManagedArraySlice,
} from "./managed-array.js";
import { reconcileManagedKeys } from "./managed-keys.js";
import {
  ContentHashSchema,
  hashOrderedSemanticValue,
  hashSemanticValue,
  isCanonicalManifestPath,
} from "./semantic-ownership.js";

/** Exact semantic authority over one shared structured-config file. */
export const StructuredConfigReceiptSchema = z
  .object({
    format: z.enum(["json", "jsonc", "toml", "yaml"]),
    key_hashes: z.record(z.string().min(1), ContentHashSchema),
    array_slice_hashes: z.record(z.string().min(1), ContentHashSchema),
  })
  .strict();

export const StructuredStateReceiptsSchema = z
  .record(z.string().min(1), StructuredConfigReceiptSchema)
  .superRefine((receipts, context) => {
    for (const relativePath of Object.keys(receipts)) {
      if (isCanonicalManifestPath(relativePath)) continue;
      context.addIssue({
        code: "custom",
        message: `receipt path "${relativePath}" is not canonical`,
        path: [relativePath],
      });
    }
  });

export type StructuredConfigReceipt = z.infer<
  typeof StructuredConfigReceiptSchema
>;
export type StructuredStateReceipts = z.infer<
  typeof StructuredStateReceiptsSchema
>;

export interface StructuredKeyDeclaration {
  key: string;
  /** Artifact-group identifiers protected when a modified value is preserved. */
  dependencies?: readonly string[];
  /** Retain object insertion order when the provider evaluates rules in order. */
  semanticHash?: "property-order";
  /** Preserve and relinquish every member when one withdrawn member changed. */
  withdrawalGroup?: string;
}

export interface StructuredArraySliceDeclaration {
  key: string;
  /** AgentSync owns only string entries beginning with this exact prefix. */
  prefix: string;
  /** Artifact-group identifiers protected when a modified slice is preserved. */
  dependencies?: readonly string[];
}

/** Provider-declared authority for one exact project-relative config path. */
export interface StructuredConfigDeclaration {
  path: string;
  format: ConfigFileFormat;
  context: string;
  keys?: readonly StructuredKeyDeclaration[];
  arraySlices?: readonly StructuredArraySliceDeclaration[];
}

export type StructuredStateClaim =
  | {
      kind: "key";
      path: string;
      key: string;
      value: unknown;
    }
  | {
      kind: "array-slice";
      path: string;
      key: string;
      values: readonly string[];
    };

export type StructuredRelinquishmentReason =
  | "removed"
  | "missing"
  | "modified"
  | "incompatible";

/** Ownership dropped by this plan, including artifact dependencies to protect. */
export interface StructuredRelinquishment {
  path: string;
  kind: "config" | "key" | "array-slice";
  key?: string;
  reason: StructuredRelinquishmentReason;
  dependencies: string[];
}

export interface StructuredRecordInput {
  declaration: StructuredConfigDeclaration;
  existing: Readonly<Record<string, unknown>>;
  claims: readonly StructuredStateClaim[];
  previousReceipt?: StructuredConfigReceipt;
}

export interface StructuredRecordPlan {
  nextConfig: Record<string, unknown>;
  nextReceipt?: StructuredConfigReceipt;
  warnings: string[];
  configChanged: boolean;
  receiptChanged: boolean;
  changed: boolean;
  relinquishments: StructuredRelinquishment[];
  protectedDependencies: string[];
}

export interface StructuredStateRequest {
  cwd: string;
  declarations: readonly StructuredConfigDeclaration[];
  claims: readonly StructuredStateClaim[];
  previousReceipts?: Readonly<Record<string, StructuredConfigReceipt>>;
}

export type StructuredConfigAction = "none" | "write" | "delete";

export interface StructuredConfigPlan extends StructuredRecordPlan {
  declaration: StructuredConfigDeclaration;
  absolutePath: string;
  existed: boolean;
  /** Parsed state used to reject semantic drift during the final JSONC reread. */
  currentConfig?: Record<string, unknown>;
  /** Original source retained only for comment-aware JSONC action planning. */
  sourceContent?: string;
  action: StructuredConfigAction;
}

export interface StructuredStatePlan {
  request: StructuredStateRequest;
  configs: StructuredConfigPlan[];
  nextReceipts: StructuredStateReceipts;
  warnings: string[];
  configChanged: boolean;
  receiptChanged: boolean;
  changed: boolean;
  relinquishments: StructuredRelinquishment[];
  protectedDependencies: string[];
}

export interface ApplyStructuredStateOptions {
  dryRun?: boolean;
}

export interface AppliedStructuredState {
  plan: StructuredStatePlan;
  writtenFiles: string[];
  removedFiles: string[];
}

interface DeclarationIndex {
  declarations: Map<string, StructuredConfigDeclaration>;
  keys: Map<string, Map<string, StructuredKeyDeclaration>>;
  slices: Map<string, Map<string, StructuredArraySliceDeclaration>>;
}

interface ReceiptInspection {
  compatible: boolean;
  reason?: string;
}

function structuredError(
  message: string,
  filePath: string | undefined,
  recovery: string,
): ConfigError {
  return new ConfigError(message, filePath, recovery);
}

function declarationError(
  declaration: StructuredConfigDeclaration,
  detail: string,
): ConfigError {
  return structuredError(
    `Invalid structured-state declaration for "${declaration.path}": ${detail}.`,
    declaration.path,
    "Repair the provider declaration so it grants only exact project-relative structured-config authority.",
  );
}

function claimError(claim: StructuredStateClaim, detail: string): ConfigError {
  return structuredError(
    `Invalid structured-state ${claim.kind} claim for "${claim.path}" key "${claim.key}": ${detail}.`,
    claim.path,
    "Repair the provider projection so every claim matches one declared structured-config key or slice.",
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function validateDependencies(
  declaration: StructuredConfigDeclaration,
  dependencies: readonly string[] | undefined,
  owner: string,
): void {
  if (!dependencies) return;
  const invalid = dependencies.find((dependency) => dependency.trim() === "");
  if (invalid !== undefined) {
    throw declarationError(
      declaration,
      `${owner} contains a blank dependency identifier`,
    );
  }
  if (new Set(dependencies).size !== dependencies.length) {
    throw declarationError(
      declaration,
      `${owner} contains duplicate dependency identifiers`,
    );
  }
}

function validateDeclarationHeader(
  declaration: StructuredConfigDeclaration,
  existing: ReadonlyMap<string, StructuredConfigDeclaration>,
): void {
  if (!isCanonicalManifestPath(declaration.path)) {
    throw declarationError(declaration, "the path is not canonical");
  }
  if (
    declaration.format !== "json" &&
    declaration.format !== "jsonc" &&
    declaration.format !== "toml" &&
    declaration.format !== "yaml"
  ) {
    throw declarationError(
      declaration,
      `format "${declaration.format}" is unsupported`,
    );
  }
  if (declaration.context.trim() === "") {
    throw declarationError(declaration, "context must be nonblank");
  }
  if (existing.has(declaration.path)) {
    throw declarationError(declaration, "the path is declared more than once");
  }
}

function indexKeyDeclarations(
  declaration: StructuredConfigDeclaration,
): Map<string, StructuredKeyDeclaration> {
  const keys = new Map<string, StructuredKeyDeclaration>();
  for (const entry of declaration.keys ?? []) {
    if (entry.key.trim() === "") {
      throw declarationError(declaration, "a managed key is blank");
    }
    if (keys.has(entry.key)) {
      throw declarationError(
        declaration,
        `key "${entry.key}" is declared more than once`,
      );
    }
    validateDependencies(declaration, entry.dependencies, `key "${entry.key}"`);
    if (
      entry.withdrawalGroup !== undefined &&
      entry.withdrawalGroup.trim() === ""
    ) {
      throw declarationError(
        declaration,
        `key "${entry.key}" has a blank withdrawal group`,
      );
    }
    keys.set(entry.key, entry);
  }
  validateWithdrawalGroups(declaration, keys);
  return keys;
}

function withdrawalGroups(
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const entry of keys.values()) {
    if (!entry.withdrawalGroup) continue;
    const members = groups.get(entry.withdrawalGroup) ?? [];
    members.push(entry.key);
    groups.set(entry.withdrawalGroup, members);
  }
  return groups;
}

function validateWithdrawalGroups(
  declaration: StructuredConfigDeclaration,
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
): void {
  const groups = withdrawalGroups(keys);
  for (const [group, members] of groups) {
    if (members.length < 2) {
      throw declarationError(
        declaration,
        `withdrawal group "${group}" contains fewer than two keys`,
      );
    }
  }
}

function indexSliceDeclarations(
  declaration: StructuredConfigDeclaration,
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
): Map<string, StructuredArraySliceDeclaration> {
  const slices = new Map<string, StructuredArraySliceDeclaration>();
  for (const entry of declaration.arraySlices ?? []) {
    if (entry.key.trim() === "") {
      throw declarationError(declaration, "an array-slice key is blank");
    }
    if (entry.prefix === "") {
      throw declarationError(
        declaration,
        `array slice "${entry.key}" has an empty prefix`,
      );
    }
    if (keys.has(entry.key) || slices.has(entry.key)) {
      throw declarationError(
        declaration,
        `key "${entry.key}" has overlapping or duplicate authority`,
      );
    }
    validateDependencies(
      declaration,
      entry.dependencies,
      `array slice "${entry.key}"`,
    );
    slices.set(entry.key, entry);
  }
  return slices;
}

function indexDeclarations(
  declarations: readonly StructuredConfigDeclaration[],
): DeclarationIndex {
  const byPath = new Map<string, StructuredConfigDeclaration>();
  const keysByPath = new Map<string, Map<string, StructuredKeyDeclaration>>();
  const slicesByPath = new Map<
    string,
    Map<string, StructuredArraySliceDeclaration>
  >();

  for (const declaration of declarations) {
    validateDeclarationHeader(declaration, byPath);
    const keys = indexKeyDeclarations(declaration);
    const slices = indexSliceDeclarations(declaration, keys);

    if (keys.size === 0 && slices.size === 0) {
      throw declarationError(
        declaration,
        "it declares no keys or array slices",
      );
    }
    byPath.set(declaration.path, declaration);
    keysByPath.set(declaration.path, keys);
    slicesByPath.set(declaration.path, slices);
  }

  return { declarations: byPath, keys: keysByPath, slices: slicesByPath };
}

function validateClaim(
  claim: StructuredStateClaim,
  index: DeclarationIndex,
): void {
  if (!isCanonicalManifestPath(claim.path)) {
    throw claimError(claim, "the path is not canonical");
  }
  if (!index.declarations.has(claim.path)) {
    throw claimError(claim, "the path has no declaration");
  }
  if (claim.kind === "key") {
    if (!index.keys.get(claim.path)?.has(claim.key)) {
      throw claimError(claim, "the key is not declared as a whole-key output");
    }
    if (claim.value === undefined) {
      throw claimError(
        claim,
        "undefined cannot be serialized as an owned value",
      );
    }
    return;
  }
  const slice = index.slices.get(claim.path)?.get(claim.key);
  if (!slice) {
    throw claimError(claim, "the key is not declared as an array slice");
  }
  const invalid = claim.values.find(
    (value) => typeof value !== "string" || !value.startsWith(slice.prefix),
  );
  if (invalid !== undefined) {
    throw claimError(
      claim,
      `desired entry "${String(invalid)}" does not begin with prefix "${slice.prefix}"`,
    );
  }
}

function validateAndGroupClaims(
  claims: readonly StructuredStateClaim[],
  index: DeclarationIndex,
): Map<string, StructuredStateClaim[]> {
  const grouped = new Map<string, StructuredStateClaim[]>();
  const claimed = new Set<string>();

  for (const claim of claims) {
    validateClaim(claim, index);
    const identity = `${claim.path}\0${claim.key}`;
    if (claimed.has(identity)) {
      throw claimError(claim, "the key is claimed more than once");
    }
    claimed.add(identity);
    const entries = grouped.get(claim.path) ?? [];
    entries.push(claim);
    grouped.set(claim.path, entries);
  }

  assertAtomicClaimGroups(index, grouped);
  return grouped;
}

function assertAtomicClaimGroups(
  index: DeclarationIndex,
  grouped: ReadonlyMap<string, readonly StructuredStateClaim[]>,
): void {
  for (const [relativePath, keyDeclarations] of index.keys) {
    const claimedKeys = new Set(
      (grouped.get(relativePath) ?? [])
        .filter((claim) => claim.kind === "key")
        .map((claim) => claim.key),
    );
    for (const [group, members] of withdrawalGroups(keyDeclarations)) {
      const claimed = members.filter((key) => claimedKeys.has(key));
      if (claimed.length === 0 || claimed.length === members.length) continue;
      throw structuredError(
        `Invalid structured-state claims for "${relativePath}": withdrawal group "${group}" must be claimed all-or-none.`,
        relativePath,
        "Repair the provider projection so every atomic config group is claimed or withdrawn together.",
      );
    }
  }
}

function isContentHash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function keyReceiptIssue(
  receipt: StructuredConfigReceipt,
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
): string | undefined {
  for (const [key, hash] of Object.entries(receipt.key_hashes).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (!keys.has(key)) return `key "${key}" is not declared`;
    if (!isContentHash(hash)) return `key "${key}" has an invalid hash`;
    if (Object.hasOwn(receipt.array_slice_hashes, key)) {
      return `key "${key}" appears as both a whole key and array slice`;
    }
  }
  for (const [group, members] of withdrawalGroups(keys)) {
    const present = members.filter((key) =>
      Object.hasOwn(receipt.key_hashes, key),
    );
    if (present.length > 0 && present.length !== members.length) {
      return `withdrawal group "${group}" has an incomplete receipt`;
    }
  }
  return undefined;
}

function sliceReceiptIssue(
  receipt: StructuredConfigReceipt,
  slices: ReadonlyMap<string, StructuredArraySliceDeclaration>,
): string | undefined {
  for (const [key, hash] of Object.entries(receipt.array_slice_hashes).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (!slices.has(key)) return `array slice "${key}" is not declared`;
    if (!isContentHash(hash)) {
      return `array slice "${key}" has an invalid hash`;
    }
  }
  return undefined;
}

function inspectReceipt(
  declaration: StructuredConfigDeclaration,
  receipt: StructuredConfigReceipt | undefined,
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
  slices: ReadonlyMap<string, StructuredArraySliceDeclaration>,
): ReceiptInspection {
  if (!receipt) return { compatible: true };
  if (receipt.format !== declaration.format) {
    return {
      compatible: false,
      reason: `format "${receipt.format}" does not match declared format "${declaration.format}"`,
    };
  }
  if (
    Object.keys(receipt.key_hashes).length === 0 &&
    Object.keys(receipt.array_slice_hashes).length === 0
  ) {
    return {
      compatible: false,
      reason: "the receipt contains no ownership hashes",
    };
  }
  const issue =
    keyReceiptIssue(receipt, keys) ?? sliceReceiptIssue(receipt, slices);
  if (issue) return { compatible: false, reason: issue };
  return { compatible: true };
}

function allDependencies(
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
  slices: ReadonlyMap<string, StructuredArraySliceDeclaration>,
): string[] {
  return sortedUnique([
    ...[...keys.values()].flatMap((entry) => entry.dependencies ?? []),
    ...[...slices.values()].flatMap((entry) => entry.dependencies ?? []),
  ]);
}

function receiptRelinquishments(
  declaration: StructuredConfigDeclaration,
  receipt: StructuredConfigReceipt,
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
  slices: ReadonlyMap<string, StructuredArraySliceDeclaration>,
  reason: "modified" | "incompatible",
): StructuredRelinquishment[] {
  const fallback = allDependencies(keys, slices);
  const entries: StructuredRelinquishment[] = [];
  for (const key of Object.keys(receipt.key_hashes).sort()) {
    entries.push({
      path: declaration.path,
      kind: "key",
      key,
      reason,
      dependencies: sortedUnique(keys.get(key)?.dependencies ?? fallback),
    });
  }
  for (const key of Object.keys(receipt.array_slice_hashes).sort()) {
    entries.push({
      path: declaration.path,
      kind: "array-slice",
      key,
      reason,
      dependencies: sortedUnique(slices.get(key)?.dependencies ?? fallback),
    });
  }
  return entries.length > 0
    ? entries
    : [
        {
          path: declaration.path,
          kind: "config",
          reason,
          dependencies: fallback,
        },
      ];
}

function receiptChanged(
  previous: StructuredConfigReceipt | undefined,
  next: StructuredConfigReceipt | undefined,
): boolean {
  return (
    hashSemanticValue(previous ?? null) !== hashSemanticValue(next ?? null)
  );
}

function receiptFrom(
  format: ConfigFileFormat,
  keyHashes: Record<string, string>,
  sliceHashes: Record<string, string>,
): StructuredConfigReceipt | undefined {
  return Object.keys(keyHashes).length === 0 &&
    Object.keys(sliceHashes).length === 0
    ? undefined
    : {
        format,
        key_hashes: keyHashes,
        array_slice_hashes: sliceHashes,
      };
}

function desiredKeyValues(
  claims: readonly StructuredStateClaim[],
): Record<string, unknown> {
  return Object.fromEntries(
    claims
      .filter((claim) => claim.kind === "key")
      .map((claim) => [claim.key, claim.value]),
  );
}

function arrayClaim(
  claims: readonly StructuredStateClaim[],
  key: string,
): Extract<StructuredStateClaim, { kind: "array-slice" }> | undefined {
  return claims.find(
    (claim): claim is Extract<StructuredStateClaim, { kind: "array-slice" }> =>
      claim.kind === "array-slice" && claim.key === key,
  );
}

function keyWithdrawalReason(
  existing: Readonly<Record<string, unknown>>,
  key: string,
  modified: ReadonlySet<string>,
): StructuredRelinquishmentReason {
  if (modified.has(key)) return "modified";
  return Object.hasOwn(existing, key) ? "removed" : "missing";
}

function currentSliceOwnedEntries(
  state: ManagedArrayKeyState,
  prefix: string,
): unknown[] {
  return state.present && Array.isArray(state.value)
    ? state.value.filter(
        (value) => typeof value === "string" && value.startsWith(prefix),
      )
    : [];
}

function withArrayState(
  config: Readonly<Record<string, unknown>>,
  key: string,
  state: ManagedArrayKeyState,
): Record<string, unknown> {
  const next = { ...config };
  if (state.present) next[key] = state.value;
  else delete next[key];
  return next;
}

interface StructuredKeyProjection {
  nextConfig: Record<string, unknown>;
  nextHashes: Record<string, string>;
  warnings: string[];
  changed: boolean;
  relinquishments: StructuredRelinquishment[];
}

function reconcileStructuredKeys(
  input: StructuredRecordInput,
  claims: readonly StructuredStateClaim[],
  keys: ReadonlyMap<string, StructuredKeyDeclaration>,
  receipt: StructuredConfigReceipt | undefined,
): StructuredKeyProjection {
  const result = reconcileManagedKeys({
    context: input.declaration.context,
    declaredKeys: [...keys.keys()],
    existing: input.existing,
    desired: desiredKeyValues(claims),
    previousReceipt: receipt?.key_hashes,
    hashValue: (key, value) =>
      keys.get(key)?.semanticHash === "property-order"
        ? hashOrderedSemanticValue(value)
        : hashSemanticValue(value),
    withdrawalGroups: [
      ...new Set(
        [...keys.values()].flatMap((entry) =>
          entry.withdrawalGroup ? [entry.withdrawalGroup] : [],
        ),
      ),
    ].map((group) =>
      [...keys.values()]
        .filter((entry) => entry.withdrawalGroup === group)
        .map((entry) => entry.key),
    ),
  });
  const modified = new Set(result.modifiedWithdrawalKeys ?? []);
  const relinquishments = (result.relinquishedKeys ?? []).map(
    (key): StructuredRelinquishment => ({
      path: input.declaration.path,
      kind: "key",
      key,
      reason: keyWithdrawalReason(input.existing, key, modified),
      dependencies: sortedUnique(keys.get(key)?.dependencies ?? []),
    }),
  );
  return {
    nextConfig: result.nextConfig,
    nextHashes: result.nextReceipt,
    warnings: result.warnings,
    changed: result.changed,
    relinquishments,
  };
}

interface StructuredSliceProjection {
  nextConfig: Record<string, unknown>;
  nextHashes: Record<string, string>;
  warnings: string[];
  changed: boolean;
  relinquishments: StructuredRelinquishment[];
}

function sliceRelinquishment(
  input: StructuredRecordInput,
  declaration: StructuredArraySliceDeclaration,
  result: ReturnType<typeof reconcileManagedArraySlice>,
  currentOwned: readonly unknown[],
): StructuredRelinquishment | undefined {
  if (!result.relinquished) return undefined;
  return {
    path: input.declaration.path,
    kind: "array-slice",
    key: declaration.key,
    reason: result.modifiedWithdrawal
      ? "modified"
      : currentOwned.length > 0
        ? "removed"
        : "missing",
    dependencies: sortedUnique(declaration.dependencies ?? []),
  };
}

function reconcileStructuredSlices(
  input: StructuredRecordInput,
  claims: readonly StructuredStateClaim[],
  slices: ReadonlyMap<string, StructuredArraySliceDeclaration>,
  receipt: StructuredConfigReceipt | undefined,
  initialConfig: Readonly<Record<string, unknown>>,
): StructuredSliceProjection {
  let nextConfig = { ...initialConfig };
  let changed = false;
  const nextHashes: Record<string, string> = {};
  const warnings: string[] = [];
  const relinquishments: StructuredRelinquishment[] = [];
  for (const [key, declaration] of [...slices.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const desired = arrayClaim(claims, key)?.values ?? [];
    const previousHash = receipt?.array_slice_hashes[key];
    if (desired.length === 0 && previousHash === undefined) continue;
    const existingState: ManagedArrayKeyState = Object.hasOwn(nextConfig, key)
      ? { present: true, value: nextConfig[key] }
      : { present: false };
    const currentOwned = currentSliceOwnedEntries(
      existingState,
      declaration.prefix,
    );
    const result = reconcileManagedArraySlice({
      context: input.declaration.context,
      key,
      existing: existingState,
      desiredOwned: desired,
      previousReceipt: previousHash,
      isOwned: (value) =>
        typeof value === "string" && value.startsWith(declaration.prefix),
    });
    nextConfig = withArrayState(nextConfig, key, result.next);
    changed ||= result.changed;
    warnings.push(...result.warnings);
    if (result.nextReceipt) nextHashes[key] = result.nextReceipt;
    const relinquishment = sliceRelinquishment(
      input,
      declaration,
      result,
      currentOwned,
    );
    if (relinquishment) relinquishments.push(relinquishment);
  }
  return { nextConfig, nextHashes, warnings, changed, relinquishments };
}

function incompatibleReceiptWarning(
  declaration: StructuredConfigDeclaration,
  inspection: ReceiptInspection,
): string {
  return `[${declaration.context}] ignored incompatible ownership receipt for "${declaration.path}" and relinquished AgentSync ownership: ${inspection.reason}`;
}

/**
 * Pure reconciliation kernel for one already-parsed config record.
 *
 * Declarations grant authority, claims express desired state, and receipts
 * prove the current state is still replaceable. No filesystem access occurs.
 */
export function planStructuredRecord(
  input: StructuredRecordInput,
): StructuredRecordPlan {
  const index = indexDeclarations([input.declaration]);
  const grouped = validateAndGroupClaims(input.claims, index);
  const claims = grouped.get(input.declaration.path) ?? [];
  const keys = index.keys.get(input.declaration.path) ?? new Map();
  const slices = index.slices.get(input.declaration.path) ?? new Map();
  const inspection = inspectReceipt(
    input.declaration,
    input.previousReceipt,
    keys,
    slices,
  );

  const warnings: string[] = [];
  const relinquishments: StructuredRelinquishment[] = [];
  const compatibleReceipt = inspection.compatible
    ? input.previousReceipt
    : undefined;
  if (!inspection.compatible && input.previousReceipt) {
    warnings.push(incompatibleReceiptWarning(input.declaration, inspection));
    relinquishments.push(
      ...receiptRelinquishments(
        input.declaration,
        input.previousReceipt,
        keys,
        slices,
        "incompatible",
      ),
    );
  }

  const keyProjection = reconcileStructuredKeys(
    input,
    claims,
    keys,
    compatibleReceipt,
  );
  const sliceProjection = reconcileStructuredSlices(
    input,
    claims,
    slices,
    compatibleReceipt,
    keyProjection.nextConfig,
  );
  warnings.push(...keyProjection.warnings, ...sliceProjection.warnings);
  relinquishments.push(
    ...keyProjection.relinquishments,
    ...sliceProjection.relinquishments,
  );

  const nextReceipt = receiptFrom(
    input.declaration.format,
    keyProjection.nextHashes,
    sliceProjection.nextHashes,
  );
  const didReceiptChange = receiptChanged(input.previousReceipt, nextReceipt);
  const configChanged = keyProjection.changed || sliceProjection.changed;
  const protectedDependencies = sortedUnique(
    relinquishments
      .filter(
        (relinquishment) =>
          relinquishment.reason === "modified" ||
          relinquishment.reason === "incompatible",
      )
      .flatMap((relinquishment) => relinquishment.dependencies),
  );
  return {
    nextConfig: sliceProjection.nextConfig,
    ...(nextReceipt ? { nextReceipt } : {}),
    warnings,
    configChanged,
    receiptChanged: didReceiptChange,
    changed: configChanged || didReceiptChange,
    relinquishments,
    protectedDependencies,
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function readConfigOrEmpty(
  cwd: string,
  declaration: StructuredConfigDeclaration,
): Promise<{
  absolutePath: string;
  existed: boolean;
  value: Record<string, unknown>;
  content?: string;
}> {
  const absolutePath = path.join(cwd, ...declaration.path.split("/"));
  await assertSafeProjectOutputFile(cwd, absolutePath);
  try {
    const content = await readFile(absolutePath, "utf-8");
    return {
      absolutePath,
      existed: true,
      value: parseConfigRecord(content, declaration.format),
      content,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { absolutePath, existed: false, value: {} };
    }
    throw structuredError(
      `Cannot safely inspect ${declaration.context} "${absolutePath}": ${getErrorMessage(error)}`,
      absolutePath,
      `Repair the existing ${declaration.format.toUpperCase()}, or move it aside after preserving user-authored settings, then rerun AgentSync.`,
    );
  }
}

function incompatiblePlanWithoutRead(
  declaration: StructuredConfigDeclaration,
  absolutePath: string,
  receipt: StructuredConfigReceipt,
  index: DeclarationIndex,
  reason: string,
): StructuredConfigPlan {
  const keys = index.keys.get(declaration.path) ?? new Map();
  const slices = index.slices.get(declaration.path) ?? new Map();
  const relinquishments = receiptRelinquishments(
    declaration,
    receipt,
    keys,
    slices,
    "incompatible",
  );
  return {
    declaration,
    absolutePath,
    existed: false,
    action: "none",
    nextConfig: {},
    warnings: [
      `[${declaration.context}] ignored incompatible ownership receipt for "${declaration.path}" and relinquished AgentSync ownership: ${reason}`,
    ],
    configChanged: false,
    receiptChanged: true,
    changed: true,
    relinquishments,
    protectedDependencies: sortedUnique(
      relinquishments.flatMap((entry) => entry.dependencies),
    ),
  };
}

function preservingWithdrawalPlanWithoutRead(
  declaration: StructuredConfigDeclaration,
  absolutePath: string,
  receipt: StructuredConfigReceipt,
  index: DeclarationIndex,
  error: unknown,
): StructuredConfigPlan {
  const keys = index.keys.get(declaration.path) ?? new Map();
  const slices = index.slices.get(declaration.path) ?? new Map();
  const relinquishments = receiptRelinquishments(
    declaration,
    receipt,
    keys,
    slices,
    "modified",
  );
  return {
    declaration,
    absolutePath,
    existed: false,
    action: "none",
    nextConfig: {},
    warnings: [
      `[${declaration.context}] preserved "${declaration.path}" and relinquished AgentSync ownership because withdrawal could not inspect it safely: ${getErrorMessage(error)}`,
    ],
    configChanged: false,
    receiptChanged: true,
    changed: true,
    relinquishments,
    protectedDependencies: sortedUnique(
      relinquishments.flatMap((entry) => entry.dependencies),
    ),
  };
}

function actionFor(
  existed: boolean,
  plan: StructuredRecordPlan,
  declaration: StructuredConfigDeclaration,
  sourceContent: string | undefined,
): StructuredConfigAction {
  if (!plan.configChanged) return "none";
  if (Object.keys(plan.nextConfig).length > 0 || !existed) return "write";
  return declaration.format === "jsonc" &&
    sourceContent !== undefined &&
    hasJsoncComments(sourceContent)
    ? "write"
    : "delete";
}

function undeclaredReceiptWarning(relativePath: string): string {
  return `[structured state] ignored ownership receipt for undeclared path "${relativePath}" and relinquished AgentSync ownership`;
}

function validatePreviousReceiptPaths(
  previous: Readonly<Record<string, StructuredConfigReceipt>>,
): void {
  for (const relativePath of Object.keys(previous)) {
    if (isCanonicalManifestPath(relativePath)) continue;
    throw structuredError(
      `Invalid structured-state ownership receipt path "${relativePath}": the path is not canonical.`,
      relativePath,
      "Discard the invalid receipt only after preserving any user-authored configuration, then rerun AgentSync.",
    );
  }
}

function collectUndeclaredReceiptEffects(
  previous: Readonly<Record<string, StructuredConfigReceipt>>,
  index: DeclarationIndex,
): {
  warnings: string[];
  relinquishments: StructuredRelinquishment[];
} {
  const warnings: string[] = [];
  const relinquishments: StructuredRelinquishment[] = [];
  for (const relativePath of Object.keys(previous).sort()) {
    if (index.declarations.has(relativePath)) continue;
    warnings.push(undeclaredReceiptWarning(relativePath));
    relinquishments.push({
      path: relativePath,
      kind: "config",
      reason: "incompatible",
      dependencies: [],
    });
  }
  return { warnings, relinquishments };
}

async function planDeclaredConfig(
  request: StructuredStateRequest,
  index: DeclarationIndex,
  groupedClaims: ReadonlyMap<string, readonly StructuredStateClaim[]>,
  declaration: StructuredConfigDeclaration,
): Promise<StructuredConfigPlan | undefined> {
  const claims = groupedClaims.get(declaration.path) ?? [];
  const receipt = request.previousReceipts?.[declaration.path];
  if (claims.length === 0 && !receipt) return undefined;
  const keys = index.keys.get(declaration.path) ?? new Map();
  const slices = index.slices.get(declaration.path) ?? new Map();
  const inspection = inspectReceipt(declaration, receipt, keys, slices);
  const absolutePath = path.join(request.cwd, ...declaration.path.split("/"));
  if (claims.length === 0 && receipt && !inspection.compatible) {
    return incompatiblePlanWithoutRead(
      declaration,
      absolutePath,
      receipt,
      index,
      inspection.reason ?? "the receipt is incompatible",
    );
  }

  let current: Awaited<ReturnType<typeof readConfigOrEmpty>>;
  try {
    current = await readConfigOrEmpty(request.cwd, declaration);
  } catch (error) {
    if (claims.length === 0 && receipt) {
      return preservingWithdrawalPlanWithoutRead(
        declaration,
        absolutePath,
        receipt,
        index,
        error,
      );
    }
    throw error;
  }
  const recordPlan = planStructuredRecord({
    declaration,
    existing: current.value,
    claims,
    previousReceipt: receipt,
  });
  return {
    declaration,
    absolutePath: current.absolutePath,
    existed: current.existed,
    currentConfig: current.value,
    ...(current.content === undefined
      ? {}
      : { sourceContent: current.content }),
    action: actionFor(
      current.existed,
      recordPlan,
      declaration,
      current.content,
    ),
    ...recordPlan,
  };
}

/** Build a read-only, filesystem-aware plan for all declared config files. */
export async function planStructuredState(
  request: StructuredStateRequest,
): Promise<StructuredStatePlan> {
  const index = indexDeclarations(request.declarations);
  const groupedClaims = validateAndGroupClaims(request.claims, index);
  const previous = request.previousReceipts ?? {};
  const configs: StructuredConfigPlan[] = [];
  validatePreviousReceiptPaths(previous);
  const undeclared = collectUndeclaredReceiptEffects(previous, index);

  for (const declaration of [...index.declarations.values()].sort(
    (left, right) => left.path.localeCompare(right.path),
  )) {
    const config = await planDeclaredConfig(
      request,
      index,
      groupedClaims,
      declaration,
    );
    if (config) configs.push(config);
  }

  const warnings = [...undeclared.warnings];
  const relinquishments = [...undeclared.relinquishments];
  for (const config of configs) {
    warnings.push(...config.warnings);
    relinquishments.push(...config.relinquishments);
  }
  const nextReceipts = Object.fromEntries(
    configs.flatMap((config) =>
      config.nextReceipt ? [[config.declaration.path, config.nextReceipt]] : [],
    ),
  );
  const protectedDependencies = sortedUnique(
    configs.flatMap((config) => config.protectedDependencies),
  );
  const configChanged = configs.some((config) => config.configChanged);
  const didReceiptChange =
    configs.some((config) => config.receiptChanged) ||
    Object.keys(previous).some(
      (relativePath) => !index.declarations.has(relativePath),
    );
  return {
    request,
    configs,
    nextReceipts,
    warnings,
    configChanged,
    receiptChanged: didReceiptChange,
    changed: configChanged || didReceiptChange,
    relinquishments,
    protectedDependencies,
  };
}

async function applyConfigPlan(config: StructuredConfigPlan): Promise<{
  written?: string;
  removed?: string;
}> {
  if (config.action === "none") return {};
  if (config.declaration.format === "jsonc") {
    return applyJsoncConfigPlan(config);
  }
  if (config.action === "delete") {
    try {
      await unlink(config.absolutePath);
      return { removed: config.absolutePath };
    } catch (error) {
      if (isMissingFileError(error)) return {};
      throw error;
    }
  }
  await outputFile(
    config.absolutePath,
    serializeConfigRecord(config.nextConfig, config.declaration.format),
  );
  return { written: config.absolutePath };
}

async function readJsoncApplySource(
  config: StructuredConfigPlan,
): Promise<string> {
  let content: string;
  try {
    content = await readFile(config.absolutePath, "utf-8");
    if (!config.existed) {
      throw structuredError(
        `Refusing to update ${config.declaration.context} "${config.absolutePath}": the JSONC file appeared after preflight.`,
        config.absolutePath,
        "Preserve the new file, move it aside only if AgentSync should own the declared keys, then rerun AgentSync.",
      );
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    if (config.existed) {
      throw structuredError(
        `Refusing to update ${config.declaration.context} "${config.absolutePath}": the JSONC file disappeared after preflight.`,
        config.absolutePath,
        "Restore the preflighted file, then rerun AgentSync.",
      );
    }
    content = "{}\n";
  }
  const current = parseJsoncValidated(content, ToolSettingsSchema);
  if (
    !sameStructuredConfigSemantic(
      current,
      config.currentConfig ?? {},
      config.declaration,
    )
  ) {
    throw structuredError(
      `Refusing to update ${config.declaration.context} "${config.absolutePath}": its semantic state changed after preflight.`,
      config.absolutePath,
      "Preserve the concurrent edit, then rerun AgentSync against the new state.",
    );
  }
  return content;
}

function sameStructuredConfigSemantic(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
  declaration: StructuredConfigDeclaration,
): boolean {
  if (hashSemanticValue(left) !== hashSemanticValue(right)) return false;
  return (declaration.keys ?? [])
    .filter((entry) => entry.semanticHash === "property-order")
    .every(
      (entry) =>
        hashOrderedSemanticValue(left[entry.key]) ===
        hashOrderedSemanticValue(right[entry.key]),
    );
}

function desiredJsoncSlice(
  config: StructuredConfigPlan,
  declaration: StructuredArraySliceDeclaration,
): string[] | undefined {
  const value = config.nextConfig[declaration.key];
  if (!Object.hasOwn(config.nextConfig, declaration.key)) return [];
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.startsWith(declaration.prefix),
  );
}

function editJsoncConfig(source: string, config: StructuredConfigPlan): string {
  let content = source;
  for (const declaration of [...(config.declaration.keys ?? [])].sort(
    (left, right) => left.key.localeCompare(right.key),
  )) {
    content = editJsoncTopLevelKey(
      content,
      declaration.key,
      Object.hasOwn(config.nextConfig, declaration.key)
        ? config.nextConfig[declaration.key]
        : undefined,
      ToolSettingsSchema,
    );
  }
  for (const declaration of [...(config.declaration.arraySlices ?? [])].sort(
    (left, right) => left.key.localeCompare(right.key),
  )) {
    const desiredOwned = desiredJsoncSlice(config, declaration);
    if (!desiredOwned) continue;
    content = editJsoncArraySlice(
      content,
      {
        key: declaration.key,
        desiredOwned,
        isOwned: (value) =>
          typeof value === "string" && value.startsWith(declaration.prefix),
      },
      ToolSettingsSchema,
    );
    if (!Object.hasOwn(config.nextConfig, declaration.key)) {
      content = editJsoncTopLevelKey(
        content,
        declaration.key,
        undefined,
        ToolSettingsSchema,
      );
    }
  }
  const reparsed = parseJsoncValidated(content, ToolSettingsSchema);
  if (
    !sameStructuredConfigSemantic(
      reparsed,
      config.nextConfig,
      config.declaration,
    )
  ) {
    throw structuredError(
      `Cannot safely update ${config.declaration.context} "${config.absolutePath}": targeted JSONC edits did not match the planned semantic state.`,
      config.absolutePath,
      "Preserve the OpenCode configuration, repair its JSONC layout, then rerun AgentSync.",
    );
  }
  return content;
}

async function applyJsoncConfigPlan(
  config: StructuredConfigPlan,
): Promise<{ written?: string; removed?: string }> {
  const source = await readJsoncApplySource(config);
  if (config.action === "delete" && !hasJsoncComments(source)) {
    await unlink(config.absolutePath);
    return { removed: config.absolutePath };
  }
  await outputFile(config.absolutePath, editJsoncConfig(source, config));
  return { written: config.absolutePath };
}

/**
 * Apply a plan after rebuilding it from current disk state.
 *
 * The re-read preserves unrelated changes made after projection and rejects a
 * newly occupied or modified managed key before any config write begins.
 */
export async function applyStructuredStatePlan(
  plan: StructuredStatePlan,
  options: ApplyStructuredStateOptions = {},
  validateBeforeMutation?: () => Promise<void>,
): Promise<AppliedStructuredState> {
  if (options.dryRun) {
    return { plan, writtenFiles: [], removedFiles: [] };
  }
  const refreshed = await planStructuredState(plan.request);
  await validateBeforeMutation?.();
  const effects = await Promise.all(refreshed.configs.map(applyConfigPlan));
  return {
    plan: refreshed,
    writtenFiles: effects.flatMap((effect) =>
      effect.written ? [effect.written] : [],
    ),
    removedFiles: effects.flatMap((effect) =>
      effect.removed ? [effect.removed] : [],
    ),
  };
}
