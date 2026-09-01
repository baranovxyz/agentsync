import { ConfigError } from "../core/errors.js";
import { hashSemanticValue } from "./semantic-ownership.js";

export interface ManagedKeysInput {
  /** Human-readable config surface used in errors and warnings. */
  context: string;
  /** Exact top-level keys this caller is permitted to manage. */
  declaredKeys: readonly string[];
  existing: Readonly<Record<string, unknown>>;
  /** Only keys AgentSync should own after this reconciliation. */
  desired: Readonly<Record<string, unknown>>;
  /** Semantic hashes captured after the last successful write. */
  previousReceipt?: Readonly<Record<string, string>>;
  /** Optional declaration-specific hashing for keys whose object order is semantic. */
  hashValue?: (key: string, value: unknown) => string;
  /** Keys whose desired claims and modified withdrawals are atomic. */
  withdrawalGroups?: readonly (readonly string[])[];
}

export interface ManagedKeysResult {
  nextConfig: Record<string, unknown>;
  nextReceipt: Record<string, string>;
  warnings: string[];
  /** Whether serialized config content must change; receipt-only changes do not count. */
  changed: boolean;
  /** Prior receipt keys intentionally dropped because they are no longer desired. */
  relinquishedKeys?: string[];
  /** Relinquished keys whose modified values were preserved in place. */
  modifiedWithdrawalKeys?: string[];
}

const SEMANTIC_HASH = /^sha256:[a-f0-9]{64}$/;

function sortedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).sort();
}

function hasKey(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  return Object.hasOwn(record, key);
}

function valueHash(
  input: ManagedKeysInput,
  key: string,
  value: unknown,
): string {
  return input.hashValue?.(key, value) ?? hashSemanticValue(value);
}

function receiptError(
  context: string,
  key: string,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Cannot safely reconcile ${context} key "${key}": ${detail}.`,
    undefined,
    "Repair or discard the invalid ownership receipt without changing user-authored configuration, then rerun AgentSync.",
  );
}

function collisionError(
  context: string,
  key: string,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Refusing to overwrite ${context} key "${key}": ${detail}.`,
    undefined,
    "Preserve the existing value, then move it aside if AgentSync should create and own this key; for receipt-owned state, restore the last generated value before retrying.",
  );
}

function assertDeclaredKeyAuthority(
  input: ManagedKeysInput,
  declared: ReadonlySet<string>,
): void {
  for (const key of sortedKeys(input.desired)) {
    if (!declared.has(key)) {
      throw receiptError(input.context, key, "the desired key is not declared");
    }
  }
  const previous = input.previousReceipt ?? {};
  for (const key of sortedKeys(previous)) {
    if (!declared.has(key)) {
      throw receiptError(input.context, key, "the receipt key is not declared");
    }
    if (!SEMANTIC_HASH.test(previous[key])) {
      throw receiptError(input.context, key, "the receipt hash is invalid");
    }
  }
}

function assertCompleteGroupRecord(
  input: ManagedKeysInput,
  group: readonly string[],
  record: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const present = group.filter((key) => hasKey(record, key));
  if (present.length === 0 || present.length === group.length) return;
  throw receiptError(
    input.context,
    present[0],
    `the atomic withdrawal group is incomplete in ${label}`,
  );
}

function assertWithdrawalGroups(
  input: ManagedKeysInput,
  declared: ReadonlySet<string>,
): void {
  const previous = input.previousReceipt ?? {};
  const grouped = new Set<string>();
  for (const group of input.withdrawalGroups ?? []) {
    if (group.length < 2) {
      throw receiptError(
        input.context,
        group[0] ?? "",
        "an atomic withdrawal group must contain at least two keys",
      );
    }
    for (const key of group) {
      if (!declared.has(key)) {
        throw receiptError(
          input.context,
          key,
          "an atomic withdrawal group key is not declared",
        );
      }
      if (grouped.has(key)) {
        throw receiptError(
          input.context,
          key,
          "the key appears in more than one atomic withdrawal group",
        );
      }
      grouped.add(key);
    }
    assertCompleteGroupRecord(input, group, input.desired, "desired claims");
    assertCompleteGroupRecord(input, group, previous, "ownership receipt");
  }
}

function assertReceiptAuthority(input: ManagedKeysInput): void {
  const declared = new Set(input.declaredKeys);
  assertDeclaredKeyAuthority(input, declared);
  assertWithdrawalGroups(input, declared);
}

function assertDesiredWritesAreOwned(input: ManagedKeysInput): void {
  const previous = input.previousReceipt ?? {};
  for (const key of sortedKeys(input.desired)) {
    if (!hasKey(input.existing, key)) continue;
    if (!hasKey(previous, key)) {
      throw collisionError(
        input.context,
        key,
        "the occupied key has no prior AgentSync ownership receipt",
      );
    }
    if (valueHash(input, key, input.existing[key]) !== previous[key]) {
      throw collisionError(
        input.context,
        key,
        "the receipt-owned value was modified after the last successful sync",
      );
    }
  }
}

function modifiedWithdrawalWarning(context: string, key: string): string {
  return `[${context}] preserved modified key "${key}" and relinquished AgentSync ownership; review or remove it manually`;
}

interface WithdrawalPlan {
  removed: ReadonlySet<string>;
  warnings: string[];
  relinquishedKeys: string[];
  modifiedWithdrawalKeys: string[];
}

function modifiedWithdrawalKeySet(
  input: ManagedKeysInput,
  previous: Readonly<Record<string, string>>,
): Set<string> {
  const modified = new Set(
    sortedKeys(previous).filter(
      (key) =>
        !hasKey(input.desired, key) &&
        hasKey(input.existing, key) &&
        valueHash(input, key, input.existing[key]) !== previous[key],
    ),
  );
  for (const group of input.withdrawalGroups ?? []) {
    if (!group.some((key) => modified.has(key))) continue;
    for (const key of group) {
      if (hasKey(previous, key) && !hasKey(input.desired, key)) {
        modified.add(key);
      }
    }
  }
  return modified;
}

function planWithdrawals(input: ManagedKeysInput): WithdrawalPlan {
  const previous = input.previousReceipt ?? {};
  const removed = new Set<string>();
  const warnings: string[] = [];
  const relinquishedKeys: string[] = [];
  const modifiedWithdrawalKeys: string[] = [];
  const modified = modifiedWithdrawalKeySet(input, previous);
  for (const key of sortedKeys(previous)) {
    if (hasKey(input.desired, key)) continue;
    relinquishedKeys.push(key);
    if (!hasKey(input.existing, key)) continue;
    if (!modified.has(key)) {
      removed.add(key);
    } else {
      modifiedWithdrawalKeys.push(key);
      warnings.push(modifiedWithdrawalWarning(input.context, key));
    }
  }
  return {
    removed,
    warnings,
    relinquishedKeys,
    modifiedWithdrawalKeys,
  };
}

interface ConfigProjection {
  entries: Array<[string, unknown]>;
  changed: boolean;
}

function projectConfig(
  input: ManagedKeysInput,
  removed: ReadonlySet<string>,
): ConfigProjection {
  let changed = removed.size > 0;
  const entries: Array<[string, unknown]> = [];
  for (const [key, current] of Object.entries(input.existing)) {
    if (removed.has(key)) continue;
    if (!hasKey(input.desired, key)) {
      entries.push([key, current]);
      continue;
    }
    const desired = input.desired[key];
    const unchanged =
      valueHash(input, key, current) === valueHash(input, key, desired);
    entries.push([key, unchanged ? current : desired]);
    changed ||= !unchanged;
  }
  for (const key of sortedKeys(input.desired)) {
    if (hasKey(input.existing, key)) continue;
    entries.push([key, input.desired[key]]);
    changed = true;
  }
  return { entries, changed };
}

/**
 * Reconcile exact ownership of top-level structured-config keys.
 *
 * This function is deliberately pure. Callers perform parsing, serialization,
 * and writes only after every managed config surface has reconciled successfully.
 */
export function reconcileManagedKeys(
  input: ManagedKeysInput,
): ManagedKeysResult {
  assertReceiptAuthority(input);
  assertDesiredWritesAreOwned(input);
  const withdrawal = planWithdrawals(input);
  const projection = projectConfig(input, withdrawal.removed);
  const nextReceipt = Object.fromEntries(
    sortedKeys(input.desired).map((key) => [
      key,
      valueHash(input, key, input.desired[key]),
    ]),
  );
  return {
    nextConfig: Object.fromEntries(projection.entries),
    nextReceipt,
    warnings: withdrawal.warnings,
    changed: projection.changed,
    ...(withdrawal.relinquishedKeys.length > 0
      ? { relinquishedKeys: withdrawal.relinquishedKeys }
      : {}),
    ...(withdrawal.modifiedWithdrawalKeys.length > 0
      ? { modifiedWithdrawalKeys: withdrawal.modifiedWithdrawalKeys }
      : {}),
  };
}
