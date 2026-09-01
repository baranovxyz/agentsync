import { ConfigError } from "../core/errors.js";
import { hashSemanticValue } from "./semantic-ownership.js";

export type ManagedArrayKeyState =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown };

export interface ManagedArraySliceInput {
  /** Human-readable config surface used in errors and warnings. */
  context: string;
  /** Exact structured-config key containing the partly managed array. */
  key: string;
  /** Distinguishes a missing key from a present key whose value is invalid. */
  existing: ManagedArrayKeyState;
  /** Entries AgentSync should own after this reconciliation. */
  desiredOwned: readonly unknown[];
  /** Semantic hash of the owned slice captured after the last successful write. */
  previousReceipt?: string;
  /** Defines the entries this caller is permitted to manage. */
  isOwned: (value: unknown) => boolean;
}

export interface ManagedArraySliceResult {
  /** The complete next key state, including all unrelated entries. */
  next: ManagedArrayKeyState;
  /** Semantic hash to persist after a successful write. */
  nextReceipt?: string;
  warnings: string[];
  /** Whether serialized config content must change; receipt-only changes do not count. */
  changed: boolean;
  /** A prior slice receipt was intentionally dropped because the slice is no longer desired. */
  relinquished?: true;
  /** The relinquished slice was modified, so its current entries were preserved. */
  modifiedWithdrawal?: true;
}

const SEMANTIC_HASH = /^sha256:[a-f0-9]{64}$/;

interface ClassifiedEntry {
  value: unknown;
  owned: boolean;
}

function receiptError(
  input: ManagedArraySliceInput,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Cannot safely reconcile ${input.context} key "${input.key}": ${detail}.`,
    undefined,
    "Repair or discard the invalid ownership receipt without changing user-authored configuration, then rerun AgentSync.",
  );
}

function collisionError(
  input: ManagedArraySliceInput,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Refusing to overwrite managed entries in ${input.context} key "${input.key}": ${detail}.`,
    undefined,
    "Preserve the existing entries, then move them aside if AgentSync should create and own this slice; for receipt-owned state, restore the last generated entries before retrying.",
  );
}

function assertReceipt(input: ManagedArraySliceInput): void {
  if (
    input.previousReceipt !== undefined &&
    !SEMANTIC_HASH.test(input.previousReceipt)
  ) {
    throw receiptError(input, "the ownership receipt hash is invalid");
  }
}

function assertDesiredOwnership(input: ManagedArraySliceInput): void {
  const invalidIndex = input.desiredOwned.findIndex(
    (entry) => !input.isOwned(entry),
  );
  if (invalidIndex !== -1) {
    throw receiptError(
      input,
      `desired entry at index ${invalidIndex} is outside the declared ownership predicate`,
    );
  }
}

function classify(
  values: readonly unknown[],
  isOwned: (value: unknown) => boolean,
): ClassifiedEntry[] {
  return values.map((value) => ({ value, owned: isOwned(value) }));
}

function ownedValues(entries: readonly ClassifiedEntry[]): unknown[] {
  return entries.filter((entry) => entry.owned).map((entry) => entry.value);
}

function replaceOwned(
  entries: readonly ClassifiedEntry[],
  desiredOwned: readonly unknown[],
): unknown[] {
  const next: unknown[] = [];
  let inserted = false;
  for (const entry of entries) {
    if (!entry.owned) {
      next.push(entry.value);
      continue;
    }
    if (inserted) continue;
    next.push(...desiredOwned);
    inserted = true;
  }
  if (!inserted) next.push(...desiredOwned);
  return next;
}

function present(value: unknown): ManagedArrayKeyState {
  return { present: true, value };
}

function result(
  next: ManagedArrayKeyState,
  changed: boolean,
  warnings: string[] = [],
  nextReceipt?: string,
  withdrawal: { relinquished?: true; modified?: true } = {},
): ManagedArraySliceResult {
  return {
    next,
    warnings,
    changed,
    ...(nextReceipt === undefined ? {} : { nextReceipt }),
    ...(withdrawal.relinquished ? { relinquished: true } : {}),
    ...(withdrawal.modified ? { modifiedWithdrawal: true } : {}),
  };
}

function modifiedWithdrawalWarning(input: ManagedArraySliceInput): string {
  return `[${input.context}] preserved modified managed entries in "${input.key}" and relinquished AgentSync ownership; review or remove them manually`;
}

function reconcileWithoutReceipt(
  input: ManagedArraySliceInput,
  existing: readonly unknown[],
  entries: readonly ClassifiedEntry[],
  currentOwned: readonly unknown[],
): ManagedArraySliceResult {
  if (input.desiredOwned.length === 0) {
    return result(present(existing), false);
  }
  if (currentOwned.length > 0) {
    throw collisionError(
      input,
      "matching entries have no prior AgentSync ownership receipt",
    );
  }
  return result(
    present(replaceOwned(entries, input.desiredOwned)),
    true,
    [],
    hashSemanticValue(input.desiredOwned),
  );
}

function reconcileDesiredOwned(
  input: ManagedArraySliceInput,
  existing: readonly unknown[],
  entries: readonly ClassifiedEntry[],
  currentOwned: readonly unknown[],
): ManagedArraySliceResult {
  const nextReceipt = hashSemanticValue(input.desiredOwned);
  if (currentOwned.length === 0) {
    return result(
      present(replaceOwned(entries, input.desiredOwned)),
      true,
      [],
      nextReceipt,
    );
  }
  if (hashSemanticValue(currentOwned) !== input.previousReceipt) {
    throw collisionError(
      input,
      "the receipt-owned entries were modified after the last successful sync",
    );
  }
  if (hashSemanticValue(currentOwned) === nextReceipt) {
    return result(present(existing), false, [], nextReceipt);
  }
  return result(
    present(replaceOwned(entries, input.desiredOwned)),
    true,
    [],
    nextReceipt,
  );
}

function reconcileWithdrawal(
  input: ManagedArraySliceInput,
  existing: readonly unknown[],
  entries: readonly ClassifiedEntry[],
  currentOwned: readonly unknown[],
): ManagedArraySliceResult {
  if (currentOwned.length === 0) {
    return result(present(existing), false, [], undefined, {
      relinquished: true,
    });
  }
  if (hashSemanticValue(currentOwned) !== input.previousReceipt) {
    return result(
      present(existing),
      false,
      [modifiedWithdrawalWarning(input)],
      undefined,
      { relinquished: true, modified: true },
    );
  }
  const nextValue = replaceOwned(entries, []);
  return result(
    nextValue.length === 0 ? { present: false } : present(nextValue),
    true,
    [],
    undefined,
    { relinquished: true },
  );
}

/**
 * Reconcile ownership of a caller-defined slice within one structured-config array.
 *
 * The function is pure: callers parse and write only after all managed surfaces have
 * reconciled successfully. Matching entries form one semantic ownership slice even
 * when they are interspersed; replacements use the first matching position while
 * retaining the relative order and identity of every unrelated entry.
 */
export function reconcileManagedArraySlice(
  input: ManagedArraySliceInput,
): ManagedArraySliceResult {
  assertReceipt(input);
  assertDesiredOwnership(input);

  if (!input.existing.present) {
    if (input.desiredOwned.length === 0) {
      return result(
        { present: false },
        false,
        [],
        undefined,
        input.previousReceipt === undefined ? {} : { relinquished: true },
      );
    }
    return result(
      present([...input.desiredOwned]),
      true,
      [],
      hashSemanticValue(input.desiredOwned),
    );
  }
  if (!Array.isArray(input.existing.value)) {
    if (input.desiredOwned.length > 0) {
      throw collisionError(input, "the existing value is not an array");
    }
    if (input.previousReceipt !== undefined) {
      return result(
        input.existing,
        false,
        [modifiedWithdrawalWarning(input)],
        undefined,
        { relinquished: true, modified: true },
      );
    }
    return result(input.existing, false);
  }

  const existing: readonly unknown[] = input.existing.value;
  const entries = classify(existing, input.isOwned);
  const currentOwned = ownedValues(entries);
  if (input.previousReceipt === undefined) {
    return reconcileWithoutReceipt(input, existing, entries, currentOwned);
  }
  if (input.desiredOwned.length > 0) {
    return reconcileDesiredOwned(input, existing, entries, currentOwned);
  }
  return reconcileWithdrawal(input, existing, entries, currentOwned);
}
