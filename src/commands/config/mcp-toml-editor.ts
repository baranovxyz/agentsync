import { type AST, parseTOML } from "toml-eslint-parser";
import { ConfigError } from "../../core/errors.js";

function lineEnd(content: string, offset: number): number {
  if (content.startsWith("\r\n", offset)) return offset + 2;
  return content[offset] === "\n" ? offset + 1 : offset;
}

function keyParts(node: AST.TOMLKeyValue): string[] {
  return node.key.keys.map((key) =>
    key.type === "TOMLBare" ? key.name : key.value,
  );
}

function resolvedKey(
  node: AST.TOMLKeyValue | AST.TOMLTable,
): Array<string | number> {
  if (node.type === "TOMLTable") return node.resolvedKey;
  return keyParts(node);
}

function targetsServer(
  node: AST.TOMLKeyValue | AST.TOMLTable,
  serverName: string,
): boolean {
  const key = resolvedKey(node);
  return key.length >= 2 && key[0] === "mcp" && key[1] === serverName;
}

function parseEditableMcpDocument(content: string): AST.TOMLProgram {
  const program = parseTOML(content, { tomlVersion: "1.0" });
  const rootInlineMcp = program.body[0].body.some((node) => {
    if (node.type !== "TOMLKeyValue") return false;
    const key = keyParts(node);
    return (
      key.length === 1 &&
      key[0] === "mcp" &&
      node.value.type === "TOMLInlineTable"
    );
  });
  if (rootInlineMcp) {
    throw new ConfigError(
      "Cannot safely edit an inline root-level mcp table while preserving the TOML document",
      undefined,
      "Rewrite `mcp = { ... }` as `[mcp.<name>]` server tables, then retry the command",
    );
  }
  return program;
}

function targetRanges(
  program: AST.TOMLProgram,
  serverName: string,
): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  for (const node of program.body[0].body) {
    if (targetsServer(node, serverName)) ranges.push(node.range);
    const isRootMcpTable =
      node.type === "TOMLTable" &&
      node.resolvedKey.length === 1 &&
      node.resolvedKey[0] === "mcp";
    if (!isRootMcpTable) continue;

    for (const entry of node.body) {
      if (keyParts(entry)[0] === serverName) ranges.push(entry.range);
    }
  }
  return ranges;
}

/**
 * Remove one MCP server and its nested tables without reserializing the rest
 * of the document. The TOML parser supplies decoded keys and exact ranges, so
 * quoted/dotted keys, escaped quotes, comments, and multiline strings are not
 * interpreted by a second hand-written parser.
 */
export function removeTomlMcpServer(
  content: string,
  serverName: string,
): string {
  const program = parseEditableMcpDocument(content);
  const ranges = targetRanges(program, serverName).sort(
    (left, right) => right[0] - left[0],
  );

  return ranges.reduce(
    (updated, [start, end]) =>
      updated.slice(0, start) + updated.slice(lineEnd(content, end)),
    content,
  );
}

function documentLineEnding(content: string): "\n" | "\r\n" {
  const firstLineFeed = content.indexOf("\n");
  return firstLineFeed > 0 && content[firstLineFeed - 1] === "\r"
    ? "\r\n"
    : "\n";
}

/** Append a serialized TOML section while preserving every existing byte. */
export function appendTomlSection(content: string, section: string): string {
  parseEditableMcpDocument(content);
  const lineEnding = documentLineEnding(content);
  let separator = lineEnding.repeat(2);
  if (content.endsWith(lineEnding.repeat(2))) separator = "";
  else if (content.endsWith(lineEnding)) separator = lineEnding;
  const normalizedSection = section.replace(/\r?\n/g, lineEnding);
  return `${content}${separator}${normalizedSection}`;
}
