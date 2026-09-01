import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  getNodeValue,
  modify,
  type Node,
  type ParseError,
  parseTree,
  printParseErrorCode,
  SyntaxKind,
  visit,
} from "jsonc-parser";
import type { z } from "zod";

const JSONC_PARSE_OPTIONS = {
  allowTrailingComma: true,
  disallowComments: false,
};

interface JsoncFormatting {
  eol: "\n" | "\r\n";
  insertSpaces: boolean;
  tabSize: number;
}

interface JsoncDocument<T> {
  source: string;
  root: Node;
  value: T;
  formatting: JsoncFormatting;
}

function syntaxError(
  content: string,
  errors: readonly ParseError[],
): SyntaxError {
  const details = errors
    .map(
      (error) =>
        `${printParseErrorCode(error.error)} at offset ${error.offset}`,
    )
    .join(", ");
  const reason = details || (content.trim() === "" ? "empty document" : "");
  return new SyntaxError(`Invalid JSONC${reason ? `: ${reason}` : ""}`);
}

function lineIndentAt(content: string, offset: number): string {
  const lineStart = content.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const prefix = content.slice(lineStart, offset);
  return /^[\t ]*$/.test(prefix) ? prefix : "";
}

function detectFormatting(content: string, root: Node): JsoncFormatting {
  const firstChild = root.children?.[0];
  const indentation = firstChild
    ? lineIndentAt(content, firstChild.offset)
    : "";
  const insertSpaces = !indentation.includes("\t");
  return {
    eol: content.includes("\r\n") ? "\r\n" : "\n",
    insertSpaces,
    tabSize: insertSpaces ? Math.max(1, indentation.length || 2) : 1,
  };
}

function assertUniqueTopLevelKeys(root: Node): void {
  const seen = new Set<string>();
  for (const property of root.children ?? []) {
    const keyNode = property.children?.[0];
    const keyValue: unknown = keyNode ? getNodeValue(keyNode) : undefined;
    if (typeof keyValue !== "string") continue;
    if (seen.has(keyValue)) {
      throw new SyntaxError(
        `Invalid JSONC: duplicate top-level property "${keyValue}" cannot be edited safely`,
      );
    }
    seen.add(keyValue);
  }
}

function parseDocument<T>(
  content: string,
  schema: z.ZodSchema<T>,
): JsoncDocument<T> {
  // Stable OpenCode treats only an exact zero-byte config as an empty object.
  // Do not broaden this to whitespace or comment-only input: its native parser
  // rejects both shapes.
  const source = content === "" ? "{}" : content;
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, JSONC_PARSE_OPTIONS);
  if (!root || errors.length > 0) throw syntaxError(content, errors);
  if (root.type !== "object") {
    throw new SyntaxError("Invalid JSONC: the document root must be an object");
  }
  assertUniqueTopLevelKeys(root);
  const value: unknown = getNodeValue(root);
  return {
    source,
    root,
    value: schema.parse(value),
    formatting: detectFormatting(source, root),
  };
}

/** Parse JSON-with-comments without weakening strict JSON readers elsewhere. */
export function parseJsoncValidated<T>(
  content: string,
  schema: z.ZodSchema<T>,
): T {
  return parseDocument(content, schema).value;
}

function commentTexts(content: string): string[] {
  const comments: string[] = [];
  visit(
    content,
    {
      onComment(offset, length) {
        comments.push(content.slice(offset, offset + length));
      },
    },
    JSONC_PARSE_OPTIONS,
  );
  return comments;
}

/** Detect comments with jsonc-parser's lexer. */
export function hasJsoncComments(content: string): boolean {
  return commentTexts(content).length > 0;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyMutation(
  path: readonly (string | number)[],
  value: unknown | undefined,
  document: JsoncDocument<Record<string, unknown>>,
  schema: z.ZodSchema<Record<string, unknown>>,
  isArrayInsertion = false,
  insertTopLevelProperty = false,
): string {
  const edits = modify(document.source, [...path], value, {
    formattingOptions: document.formatting,
    isArrayInsertion,
    ...(insertTopLevelProperty
      ? {
          getInsertionIndex: (properties: string[]) =>
            Math.min(1, properties.length),
        }
      : {}),
  });
  const edited = applyEdits(document.source, edits);
  parseDocument(edited, schema);
  return edited;
}

interface JsoncSpan {
  offset: number;
  length: number;
}

function retainedCommentTrivia(content: string, span: JsoncSpan): string {
  const scanner = createScanner(content, false);
  scanner.setPosition(span.offset);
  const trivia: string[] = [];
  let hasComment = false;
  const end = span.offset + span.length;
  while (scanner.scan() !== SyntaxKind.EOF) {
    const offset = scanner.getTokenOffset();
    if (offset >= end) break;
    const token = scanner.getToken();
    const isComment =
      token === SyntaxKind.LineCommentTrivia ||
      token === SyntaxKind.BlockCommentTrivia;
    if (isComment) hasComment = true;
    if (
      isComment ||
      token === SyntaxKind.LineBreakTrivia ||
      token === SyntaxKind.Trivia
    ) {
      trivia.push(content.slice(offset, offset + scanner.getTokenLength()));
    }
  }
  return hasComment ? trivia.join("") : "";
}

function commaBetween(
  content: string,
  start: number,
  end: number,
): JsoncSpan | undefined {
  const scanner = createScanner(content, false);
  scanner.setPosition(start);
  while (scanner.scan() !== SyntaxKind.EOF) {
    const offset = scanner.getTokenOffset();
    if (offset >= end) return undefined;
    if (scanner.getToken() === SyntaxKind.CommaToken) {
      return { offset, length: scanner.getTokenLength() };
    }
  }
  return undefined;
}

/**
 * Remove one parsed child plus only the comma needed by its parent.
 *
 * `jsonc-parser.modify()` intentionally owns surrounding trivia when it
 * deletes an element. That is useful for formatting, but unsafe for a shared
 * config because it can erase comments immediately before the owned node.
 * The parser's AST and scanner let us narrow deletion to the exact node and a
 * structural comma while leaving every surrounding comment token untouched.
 */
function removeNodePreservingComments(
  content: string,
  parent: Node,
  node: Node,
  schema: z.ZodSchema<Record<string, unknown>>,
): string {
  const children = parent.children ?? [];
  const index = children.findIndex(
    (candidate) =>
      candidate.offset === node.offset && candidate.length === node.length,
  );
  if (index < 0) {
    throw new SyntaxError("Invalid JSONC: managed node is not in its parent");
  }

  const next = children[index + 1];
  const followingComma = commaBetween(
    content,
    node.offset + node.length,
    next?.offset ?? parent.offset + parent.length - 1,
  );
  const previous = children[index - 1];
  const precedingComma = followingComma
    ? undefined
    : commaBetween(
        content,
        previous ? previous.offset + previous.length : parent.offset + 1,
        node.offset,
      );
  const comma = followingComma ?? precedingComma;
  const nodeSpan = { offset: node.offset, length: node.length };
  const edits = [
    {
      ...nodeSpan,
      content: retainedCommentTrivia(content, nodeSpan),
    },
    ...(comma ? [{ ...comma, content: "" }] : []),
  ];
  const edited = applyEdits(content, edits);
  parseDocument(edited, schema);
  return edited;
}

function topLevelPropertyNode(root: Node, key: string): Node | undefined {
  return root.children?.find((property) => {
    const keyNode = property.children?.[0];
    return keyNode ? getNodeValue(keyNode) === key : false;
  });
}

/** Set or remove one top-level JSONC property through jsonc-parser edits. */
export function editJsoncTopLevelKey(
  content: string,
  key: string,
  value: unknown | undefined,
  schema: z.ZodSchema<Record<string, unknown>>,
): string {
  const document = parseDocument(content, schema);
  const current = document.value[key];
  const present = Object.hasOwn(document.value, key);
  if ((!present && value === undefined) || sameJsonValue(current, value)) {
    return content;
  }
  if (value === undefined) {
    const property = topLevelPropertyNode(document.root, key);
    if (!property) {
      throw new SyntaxError(
        `Invalid JSONC: cannot locate managed top-level property "${key}"`,
      );
    }
    return removeNodePreservingComments(
      document.source,
      document.root,
      property,
      schema,
    );
  }
  return applyMutation(
    [key],
    value,
    document,
    schema,
    false,
    !present && value !== undefined,
  );
}

function arrayValueNode(root: Node, key: string): Node | undefined {
  const node = findNodeAtLocation(root, [key]);
  return node?.type === "array" ? node : undefined;
}

function removeOwnedIndexes(
  content: string,
  key: string,
  indexes: readonly number[],
  schema: z.ZodSchema<Record<string, unknown>>,
): string {
  let edited = content;
  for (const index of [...indexes].sort((left, right) => right - left)) {
    const document = parseDocument(edited, schema);
    if (!arrayValueNode(document.root, key)?.children?.[index]) {
      throw new SyntaxError(
        `Invalid JSONC: cannot locate managed array item ${index} in "${key}"`,
      );
    }
    const array = arrayValueNode(document.root, key);
    const item = array?.children?.[index];
    if (!(array && item)) {
      throw new SyntaxError(
        `Invalid JSONC: cannot locate managed array item ${index} in "${key}"`,
      );
    }
    edited = removeNodePreservingComments(edited, array, item, schema);
  }
  return edited;
}

function insertOwnedValues(
  content: string,
  key: string,
  index: number,
  values: readonly string[],
  schema: z.ZodSchema<Record<string, unknown>>,
): string {
  let edited = content;
  for (const [offset, value] of values.entries()) {
    const document = parseDocument(edited, schema);
    edited = applyMutation(
      [key, index + offset],
      value,
      document,
      schema,
      true,
    );
  }
  return edited;
}

export interface JsoncArraySliceEdit {
  key: string;
  desiredOwned: readonly string[];
  isOwned: (value: unknown) => boolean;
}

/** Replace only caller-owned array entries by AST index, retaining all others. */
export function editJsoncArraySlice(
  content: string,
  edit: JsoncArraySliceEdit,
  schema: z.ZodSchema<Record<string, unknown>>,
): string {
  const initial = parseDocument(content, schema);
  const currentValue = initial.value[edit.key];
  if (currentValue === undefined) {
    return edit.desiredOwned.length === 0
      ? content
      : editJsoncTopLevelKey(content, edit.key, [...edit.desiredOwned], schema);
  }
  if (!Array.isArray(currentValue)) {
    if (edit.desiredOwned.length === 0) return content;
    throw new SyntaxError(
      `Invalid JSONC: top-level property "${edit.key}" is not an array`,
    );
  }
  const ownedIndexes = currentValue.flatMap((value, index) =>
    edit.isOwned(value) ? [index] : [],
  );
  const currentOwned = ownedIndexes.map((index) => currentValue[index]);
  if (sameJsonValue(currentOwned, edit.desiredOwned)) return content;

  const insertionIndex =
    ownedIndexes.length === 0
      ? currentValue.length
      : currentValue
          .slice(0, ownedIndexes[0])
          .filter((value) => !edit.isOwned(value)).length;
  const withoutOwned = removeOwnedIndexes(
    content,
    edit.key,
    ownedIndexes,
    schema,
  );
  return insertOwnedValues(
    withoutOwned,
    edit.key,
    insertionIndex,
    edit.desiredOwned,
    schema,
  );
}
