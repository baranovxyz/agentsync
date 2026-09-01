import { stringify as stringifyToml } from "smol-toml";
import { type AST, parseTOML } from "toml-eslint-parser";
import { ConfigError, getErrorMessage } from "../../core/errors.js";

type EditableStringArrayKey = "tools" | "extends";

interface TomlArrayEdit {
  content: string;
  changed: boolean;
}

interface EditableArray {
  array: AST.TOMLArray;
  elements: AST.TOMLStringValue[];
  program: AST.TOMLProgram;
}

type SourceEdit = readonly [start: number, end: number, replacement: string];

function keyParts(node: AST.TOMLKeyValue): string[] {
  return node.key.keys.map((key) =>
    key.type === "TOMLBare" ? key.name : key.value,
  );
}

function declaresKey(
  node: AST.TOMLKeyValue | AST.TOMLTable,
  key: EditableStringArrayKey,
): boolean {
  const parts = node.type === "TOMLTable" ? node.resolvedKey : keyParts(node);
  return parts[0] === key;
}

function editError(
  key: EditableStringArrayKey,
  configPath: string,
  detail: string,
): ConfigError {
  return new ConfigError(
    `Cannot safely edit top-level ${key}: ${detail}`,
    configPath,
    `Keep exactly one top-level ${key} = [...] array containing only strings, then retry`,
  );
}

function parseEditableArray(
  content: string,
  key: EditableStringArrayKey,
  configPath: string,
): { program: AST.TOMLProgram; editable?: EditableArray } {
  let program: AST.TOMLProgram;
  try {
    program = parseTOML(content, { tomlVersion: "1.0" });
  } catch (error) {
    throw editError(key, configPath, getErrorMessage(error));
  }

  const declarations = program.body[0].body.filter((node) =>
    declaresKey(node, key),
  );
  if (declarations.length === 0) return { program };
  if (declarations.length !== 1) {
    throw editError(key, configPath, "the key is declared more than once");
  }

  const declaration = declarations[0];
  if (
    declaration.type !== "TOMLKeyValue" ||
    keyParts(declaration).length !== 1 ||
    declaration.value.type !== "TOMLArray"
  ) {
    throw editError(key, configPath, "the key is not a direct string array");
  }

  const elements: AST.TOMLStringValue[] = [];
  for (const element of declaration.value.elements) {
    if (element.type !== "TOMLValue" || element.kind !== "string") {
      throw editError(key, configPath, "the array contains a non-string value");
    }
    elements.push(element);
  }
  return {
    program,
    editable: { array: declaration.value, elements, program },
  };
}

function serializeTomlString(
  value: string,
  key: EditableStringArrayKey,
  configPath: string,
): string {
  try {
    const document = stringifyToml({ value });
    const program = parseTOML(document, { tomlVersion: "1.0" });
    const declaration = program.body[0].body[0];
    if (
      declaration?.type !== "TOMLKeyValue" ||
      declaration.value.type !== "TOMLValue" ||
      declaration.value.kind !== "string"
    ) {
      throw new Error("smol-toml did not serialize a scalar string");
    }
    return document.slice(
      declaration.value.range[0],
      declaration.value.range[1],
    );
  } catch (error) {
    throw editError(
      key,
      configPath,
      `the new value is invalid: ${getErrorMessage(error)}`,
    );
  }
}

function documentLineEnding(content: string): "\n" | "\r\n" {
  const firstLineFeed = content.indexOf("\n");
  return firstLineFeed > 0 && content[firstLineFeed - 1] === "\r"
    ? "\r\n"
    : "\n";
}

function appendMissingArray(
  content: string,
  program: AST.TOMLProgram,
  key: EditableStringArrayKey,
  serializedValue: string,
): string {
  const lineEnding = documentLineEnding(content);
  const declaration = `${key} = [${serializedValue}]${lineEnding}`;
  const firstTable = program.body[0].body.find(
    (node) => node.type === "TOMLTable",
  );
  if (firstTable) {
    const insertionPoint = lineStart(content, firstTable.range[0]);
    return `${content.slice(0, insertionPoint)}${declaration}${lineEnding}${content.slice(insertionPoint)}`;
  }
  const separator =
    content.length === 0 || content.endsWith(lineEnding) ? "" : lineEnding;
  return `${content}${separator}${declaration}`;
}

function followingCommaRange(
  editable: EditableArray,
  elementIndex: number,
): readonly [number, number] | undefined {
  const element = editable.elements[elementIndex];
  const nextElement = editable.elements[elementIndex + 1];
  const limit = nextElement?.range[0] ?? editable.array.range[1];
  const comma = editable.program.tokens.find(
    (token) =>
      token.type === "Punctuator" &&
      token.value === "," &&
      token.range[0] >= element.range[1] &&
      token.range[1] <= limit,
  );
  return comma?.range;
}

function lineStart(content: string, offset: number): number {
  return content.lastIndexOf("\n", offset - 1) + 1;
}

function indentationAt(content: string, offset: number): string | undefined {
  const indentation = content.slice(lineStart(content, offset), offset);
  return /^[\t ]*$/.test(indentation) ? indentation : undefined;
}

function applyEdits(content: string, edits: SourceEdit[]): string {
  return [...edits]
    .sort((left, right) => right[0] - left[0])
    .reduce(
      (updated, [start, end, replacement]) =>
        updated.slice(0, start) + replacement + updated.slice(end),
      content,
    );
}

function appendToArray(
  content: string,
  editable: EditableArray,
  serializedValue: string,
): string {
  const close = editable.array.range[1] - 1;
  const lastIndex = editable.elements.length - 1;
  const last = editable.elements[lastIndex];
  const comma = last ? followingCommaRange(editable, lastIndex) : undefined;
  const closingLineStart = lineStart(content, close);
  const closingOnOwnLine =
    closingLineStart > lineStart(content, editable.array.range[0]) &&
    (!last || closingLineStart >= last.range[1]);

  if (!closingOnOwnLine) {
    const insertion = last && !comma ? `, ${serializedValue}` : serializedValue;
    return applyEdits(content, [[close, close, insertion]]);
  }

  const lineEnding = documentLineEnding(content);
  const closingIndentation = indentationAt(content, close) ?? "";
  const itemIndentation = last
    ? (indentationAt(content, last.range[0]) ?? `${closingIndentation}  `)
    : `${closingIndentation}  `;
  const keepTrailingComma = !last || Boolean(comma);
  const edits: SourceEdit[] = [
    [
      closingLineStart,
      closingLineStart,
      `${itemIndentation}${serializedValue}${keepTrailingComma ? "," : ""}${lineEnding}`,
    ],
  ];
  if (last && !comma) {
    edits.push([last.range[1], last.range[1], ","]);
  }
  return applyEdits(content, edits);
}

export function addTomlStringArrayItem(
  content: string,
  key: EditableStringArrayKey,
  value: string,
  configPath: string,
): TomlArrayEdit {
  const { program, editable } = parseEditableArray(content, key, configPath);
  if (editable?.elements.some((element) => element.value === value)) {
    return { content, changed: false };
  }

  const serializedValue = serializeTomlString(value, key, configPath);
  return {
    content: editable
      ? appendToArray(content, editable, serializedValue)
      : appendMissingArray(content, program, key, serializedValue),
    changed: true,
  };
}

export function removeTomlStringArrayItem(
  content: string,
  key: EditableStringArrayKey,
  value: string,
  configPath: string,
): TomlArrayEdit {
  const { editable } = parseEditableArray(content, key, configPath);
  if (!editable) return { content, changed: false };

  const edits: SourceEdit[] = [];
  for (const [index, element] of editable.elements.entries()) {
    if (element.value !== value) continue;
    edits.push([element.range[0], element.range[1], ""]);
    const comma = followingCommaRange(editable, index);
    if (comma) {
      edits.push([comma[0], comma[1], ""]);
    }
  }
  if (edits.length === 0) return { content, changed: false };
  return { content: applyEdits(content, edits), changed: true };
}
