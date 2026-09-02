/**
 * OpenCode Tool Provider
 *
 * OpenCode MCP config lives inside opencode.json under the "mcp" key.
 * It uses "environment" (not "env") and "command" as an array.
 * Ref: https://opencode.ai/docs/mcp-servers/
 */

import { lstat } from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { ConfigError } from "../core/errors.js";
import type { MCP } from "../core/mcp/tokens.js";
import type { StructuredStateClaim } from "../sync/structured-state.js";
import type { SyncMode } from "../sync/write-file.js";
import type { PermissionsConfigSchema } from "../types/schemas.js";
import { splitFrontmatter } from "../utils/frontmatter.js";
import { toPosixPath } from "../utils/path-normalization.js";
import { mergeIntoJsoncSettings } from "./mcp-helpers.js";
import type {
  AgentContentTransform,
  CanonicalRule,
  CommandContentTransform,
  ContentTransformResult,
  McpProjectTarget,
  McpProjectWriteEvidence,
  ToolProvider,
} from "./types.js";

type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;

/** Native Markdown frontmatter contracts for stable `opencode-ai` 1.x. */
const OpenCodePermissionActionSchema = z.enum(["ask", "allow", "deny"]);
const OpenCodePermissionRuleSchema = z.union([
  OpenCodePermissionActionSchema,
  z.record(z.string(), OpenCodePermissionActionSchema),
]);
const OpenCodePermissionSchema = z.union([
  OpenCodePermissionActionSchema,
  z
    .object({
      read: OpenCodePermissionRuleSchema.optional(),
      edit: OpenCodePermissionRuleSchema.optional(),
      glob: OpenCodePermissionRuleSchema.optional(),
      grep: OpenCodePermissionRuleSchema.optional(),
      list: OpenCodePermissionRuleSchema.optional(),
      bash: OpenCodePermissionRuleSchema.optional(),
      task: OpenCodePermissionRuleSchema.optional(),
      external_directory: OpenCodePermissionRuleSchema.optional(),
      todowrite: OpenCodePermissionActionSchema.optional(),
      question: OpenCodePermissionActionSchema.optional(),
      webfetch: OpenCodePermissionActionSchema.optional(),
      websearch: OpenCodePermissionActionSchema.optional(),
      lsp: OpenCodePermissionRuleSchema.optional(),
      doom_loop: OpenCodePermissionActionSchema.optional(),
      skill: OpenCodePermissionRuleSchema.optional(),
    })
    .catchall(OpenCodePermissionRuleSchema),
]);
const OpenCodeToolsSchema = z.record(z.string(), z.boolean());

const OpenCodeAgentFrontmatterSchema = z
  .object({
    model: z.string().optional(),
    variant: z.string().optional(),
    temperature: z.number().finite().optional(),
    top_p: z.number().finite().optional(),
    prompt: z.string().optional(),
    tools: OpenCodeToolsSchema.optional(),
    disable: z.boolean().optional(),
    description: z.string().optional(),
    mode: z.enum(["subagent", "primary", "all"]).optional(),
    hidden: z.boolean().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    color: z
      .union([
        z.string().regex(/^#[0-9a-fA-F]{6}$/),
        z.enum([
          "primary",
          "secondary",
          "accent",
          "success",
          "warning",
          "error",
          "info",
        ]),
      ])
      .optional(),
    steps: z.number().int().positive().optional(),
    maxSteps: z.number().int().positive().optional(),
    permission: OpenCodePermissionSchema.optional(),
  })
  .catchall(z.unknown());

const OpenCodeCommandFrontmatterSchema = z
  .object({
    description: z.string().optional(),
    agent: z.string().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
    subtask: z.boolean().optional(),
  })
  .strict();
const OPEN_CODE_COMMAND_FIELDS = new Set(
  Object.keys(OpenCodeCommandFrontmatterSchema.shape),
);

/** True for an OpenCode-native `tools: { name: boolean }` record. */
function isBooleanRecord(value: unknown): boolean {
  return OpenCodeToolsSchema.safeParse(value).success;
}

function invalidFrontmatterFields(error: z.ZodError): string {
  const fields = [
    ...new Set(
      error.issues.map((issue) => String(issue.path[0] ?? "frontmatter")),
    ),
  ].sort();
  return fields.map((field) => `'${field}'`).join(", ");
}

function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  eol: "\n" | "\r\n",
): string {
  const serialized = yaml
    .dump(frontmatter, { lineWidth: -1 })
    .trimEnd()
    .replaceAll("\n", eol);
  return `---${eol}${serialized}${eol}---${eol}${body}`;
}

/**
 * Translate a canonical agentsync agent .md into OpenCode-valid frontmatter.
 *
 * OpenCode parses each `.opencode/agents/<name>.md`'s known frontmatter fields
 * against its native schema and treats one bad file as a FATAL boot error.
 * agentsync's canonical frontmatter trips it on the `tools` field (a
 * comma-scalar / list where OpenCode demands `Record<string, boolean>`). This
 * rewrites the file OpenCode reads:
 *
 *  - `tools` allowlist (scalar/array) → dropped + warned. OpenCode's tools map
 *    is deny-by-explicit-`false` (not allowlist-by-omission) and is deprecated
 *    in favour of `permission`, so a positive translation would not restrict
 *    anything. An already-valid boolean record is kept as-authored.
 *  - bare `model` alias (no provider prefix) → dropped + warned. OpenCode
 *    resolves `provider/model` ids; an unqualified alias fails at runtime, so
 *    we fall back to the session's configured default. Qualified ids are kept.
 *  - `capability` / `skill_tags` (AgentSync-only) → dropped (meaningless to
 *    OpenCode; would otherwise land in `options`).
 *  - `mode` → defaulted to `subagent` when absent (OpenCode's canonical shape
 *    for a non-default role); an explicit mode is preserved.
 *
 * Files without parseable frontmatter pass through untouched.
 */
function translateOpenCodeAgentContent(
  content: string,
  name: string,
): ContentTransformResult {
  const { fm, body, eol } = splitFrontmatter(content);
  if (!fm) return { content, warnings: [] };
  const warnings: string[] = [];

  // Rebuild the frontmatter in one pass, omitting keys OpenCode can't accept.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    // AgentSync-only keys — no meaning to OpenCode.
    if (key === "capability" || key === "skill_tags") continue;

    // The agentsync `tools` allowlist (scalar/array) — drop unless it is
    // already a native OpenCode boolean record.
    if (key === "tools" && !isBooleanRecord(value)) {
      warnings.push(
        `[opencode] agent '${name}': dropped 'tools' allowlist — OpenCode does not enforce tool allowlists via the agent file (its tools map is deny-by-explicit-false; use 'permission' to restrict)`,
      );
      continue;
    }

    // A bare/unqualified model alias — OpenCode needs a provider-qualified id.
    if (key === "model" && typeof value === "string" && !value.includes("/")) {
      warnings.push(
        `[opencode] agent '${name}': dropped unqualified model '${value}' — OpenCode needs a provider-qualified id (e.g. anthropic/claude-...); falling back to the configured default`,
      );
      continue;
    }

    out[key] = value;
  }

  // Default mode to subagent (canonical shape for an injected role).
  if (!("mode" in out)) out.mode = "subagent";

  const validated = OpenCodeAgentFrontmatterSchema.safeParse(out);
  if (!validated.success) {
    warnings.push(
      `[opencode] agent '${name}': skipped — invalid OpenCode frontmatter fields: ${invalidFrontmatterFields(validated.error)}`,
    );
    return { skip: true, warnings };
  }

  return {
    content: serializeFrontmatter(out, body, eol),
    warnings,
  };
}

const agentContentTransform: AgentContentTransform = {
  transform: translateOpenCodeAgentContent,
};

function translateOpenCodeCommandContent(
  content: string,
  name: string,
): ContentTransformResult {
  const { fm, body, eol } = splitFrontmatter(content);
  if (!fm) return { content, warnings: [] };

  const unsupportedFields = Object.keys(fm)
    .filter((field) => !OPEN_CODE_COMMAND_FIELDS.has(field))
    .sort();
  const warnings = unsupportedFields.length
    ? [
        `[opencode] command '${name}': dropped unsupported frontmatter fields: ${unsupportedFields.join(", ")}`,
      ]
    : [];
  const projected = Object.fromEntries(
    Object.entries(fm).filter(([field]) => OPEN_CODE_COMMAND_FIELDS.has(field)),
  );
  const validated = OpenCodeCommandFrontmatterSchema.safeParse(projected);
  if (!validated.success) {
    warnings.push(
      `[opencode] command '${name}': skipped — invalid OpenCode frontmatter fields: ${invalidFrontmatterFields(validated.error)}`,
    );
    return { skip: true, warnings };
  }

  return {
    content: serializeFrontmatter(projected, body, eol),
    warnings,
  };
}

const commandContentTransform: CommandContentTransform = {
  transform: translateOpenCodeCommandContent,
};

const OC_TOOL_MAP: Record<string, string> = {
  Bash: "bash",
  Shell: "bash",
  Read: "read",
  Edit: "edit",
  Write: "edit",
  ApplyPatch: "edit",
  Glob: "glob",
  Grep: "grep",
  List: "list",
  Task: "task",
  ExternalDirectory: "external_directory",
  LSP: "lsp",
  Skill: "skill",
  TodoWrite: "todowrite",
  TodoRead: "todowrite",
  WebFetch: "webfetch",
  WebSearch: "websearch",
  Question: "question",
  DoomLoop: "doom_loop",
};

const OC_ACTION_ONLY_PERMISSIONS = new Set([
  "todowrite",
  "webfetch",
  "websearch",
  "question",
  "doom_loop",
]);

type PermissionRule = NonNullable<
  NonNullable<PermissionsConfig>["rules"]
>[number];

type PermissionDecision = PermissionRule["decision"];
type OpenCodePermission =
  | PermissionDecision
  | Record<string, PermissionDecision>;

type OpenCodeMcpPermissionProjection = { key: string } | { reason: string };

function openCodeMcpPermissionKey(
  pattern: string | undefined,
): OpenCodeMcpPermissionProjection {
  if (!pattern || pattern === "*" || pattern === "*:*") {
    return {
      reason:
        "an all-MCP wildcard has no safe OpenCode equivalent because '*_*' also matches " +
        "built-in and custom tools",
    };
  }
  const parts = pattern.split(":");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    return { reason: "expected server:tool (or literal-server:*)" };
  }
  const [server, tool] = parts;
  if (/[*?[\]]/.test(server)) {
    return {
      reason:
        "a wildcard server segment is not safely MCP-only in OpenCode's flat tool namespace",
    };
  }
  if (tool !== "*" && /[*?[\]]/.test(tool)) {
    return {
      reason: "only an exact tool or a literal-server:* wildcard is supported",
    };
  }
  const sanitize = (part: string) => part.replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    key: `${sanitize(server)}_${tool === "*" ? "*" : sanitize(tool)}`,
  };
}

function setLastOpenCodePermission(
  projected: Record<string, OpenCodePermission>,
  tool: string,
  permission: OpenCodePermission,
): void {
  // OpenCode uses the last matching permission rule. Moving a repeated key to
  // the end preserves its canonical position relative to overlapping wildcard
  // identities such as `github_*` and `github_search`.
  delete projected[tool];
  projected[tool] = permission;
}

function projectOpenCodePermissionRule(
  projected: Record<string, OpenCodePermission>,
  warnings: string[],
  rule: PermissionRule,
): void {
  const mcpProjection =
    rule.tool === "MCP" ? openCodeMcpPermissionKey(rule.pattern) : undefined;
  if (mcpProjection && "reason" in mcpProjection) {
    warnings.push(
      `permissions.rule ${rule.id}: MCP pattern '${rule.pattern ?? "*"}' dropped on opencode — ` +
        `${mcpProjection.reason}.`,
    );
    return;
  }
  const tool =
    mcpProjection && "key" in mcpProjection
      ? mcpProjection.key
      : (OC_TOOL_MAP[rule.tool] ?? rule.tool.toLowerCase());
  if (mcpProjection && "key" in mcpProjection) {
    setLastOpenCodePermission(projected, tool, rule.decision);
    return;
  }

  const pattern = rule.pattern ?? "*";
  if (OC_ACTION_ONLY_PERMISSIONS.has(tool)) {
    if (pattern !== "*") {
      warnings.push(
        `permissions.rule ${rule.id} dropped on opencode — pattern '${pattern}' cannot be ` +
          `represented because OpenCode ${tool} accepts only a tool-level decision.`,
      );
      return;
    }
    setLastOpenCodePermission(projected, tool, rule.decision);
    return;
  }

  const current = projected[tool];
  const patterns: Record<string, PermissionDecision> =
    typeof current === "object" ? { ...current } : {};
  if (typeof current === "string") patterns["*"] = current;
  // OpenCode applies the last matching pattern. Replacing an existing JS
  // property does not move it, so delete first to preserve canonical order.
  delete patterns[pattern];
  patterns[pattern] = rule.decision;
  setLastOpenCodePermission(projected, tool, patterns);
}

/** Translate ordered canonical rules to OpenCode's granular permission map. */
export function projectOpenCodePermissions(
  permissions: NonNullable<PermissionsConfig>,
): { value: Record<string, OpenCodePermission>; warnings: string[] } {
  const projected: Record<string, OpenCodePermission> = {};
  const warnings: string[] = [];
  if (permissions.default) projected["*"] = permissions.default;

  for (const rule of permissions.rules ?? []) {
    projectOpenCodePermissionRule(projected, warnings, rule);
  }

  return { value: projected, warnings };
}

async function writeOpenCodePermissions(
  permissions: NonNullable<PermissionsConfig>,
  _cwd: string,
): Promise<{ warnings: string[] }> {
  const projection = projectOpenCodePermissions(permissions);
  return { warnings: projection.warnings };
}

/**
 * Convert standard MCP format to OpenCode's format
 */
function toOpenCodeMCP(mcps: Record<string, MCP>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, mcp] of Object.entries(mcps)) {
    if ("command" in mcp) {
      result[name] = {
        type: "local",
        command: [mcp.command, ...(mcp.args || [])],
        enabled: true,
        ...(mcp.env ? { environment: mcp.env } : {}),
      };
    } else if ("url" in mcp) {
      result[name] = {
        type: "remote",
        url: mcp.url,
        enabled: true,
        ...(mcp.headers ? { headers: mcp.headers } : {}),
      };
    }
  }
  return result;
}

/** Prefix identifying an `instructions` entry that agentsync owns. */
const RULES_INSTRUCTION_PREFIX = ".agents/rules/";
const OPENCODE_JSON_PATH = "opencode.json";
const OPENCODE_JSONC_PATH = "opencode.jsonc";
const OPENCODE_DIRECTORY_JSON_PATH = ".opencode/opencode.json";
const OPENCODE_DIRECTORY_JSONC_PATH = ".opencode/opencode.jsonc";
const OPENCODE_CONFIG_PATHS: readonly string[] = [
  OPENCODE_JSON_PATH,
  OPENCODE_JSONC_PATH,
  OPENCODE_DIRECTORY_JSON_PATH,
  OPENCODE_DIRECTORY_JSONC_PATH,
];
const OPENCODE_CONFIG_PRECEDENCE: readonly string[] = [
  OPENCODE_DIRECTORY_JSONC_PATH,
  OPENCODE_DIRECTORY_JSON_PATH,
  OPENCODE_JSONC_PATH,
  OPENCODE_JSON_PATH,
];

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** OpenCode loads JSONC after JSON in one directory, so it has precedence. */
export async function resolveOpenCodeConfigPath(cwd: string): Promise<string> {
  for (const configPath of OPENCODE_CONFIG_PRECEDENCE) {
    try {
      await lstat(path.join(cwd, configPath));
      return configPath;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }
  return OPENCODE_JSON_PATH;
}

async function writeOpenCodeMcpAtTarget(
  mcps: Record<string, MCP>,
  cwd: string,
  target: McpProjectTarget,
): Promise<McpProjectWriteEvidence> {
  const currentPath = await resolveOpenCodeConfigPath(cwd);
  if (currentPath !== target.relativePath) {
    throw new ConfigError(
      `Refusing to update OpenCode MCP configuration "${target.absolutePath}": the active config path changed after preflight.`,
      target.absolutePath,
      "Preserve the newly active OpenCode config, then rerun agentsync sync against its current precedence.",
    );
  }
  const value = toOpenCodeMCP(mcps);
  await mergeIntoJsoncSettings(
    target.absolutePath,
    value,
    "mcp",
    cwd,
    target.expectedOwnedValues?.mcp,
  );
  return { ownedValues: { mcp: value } };
}

/**
 * OpenCode has no conditional instruction channel: every entry in
 * `instructions` is resolved and concatenated into the system prompt on every
 * session (packages/opencode/src/session/instruction.ts). So only rules
 * WITHOUT a `paths:` condition are written; a path-scoped rule is withheld and
 * reported, never widened to always-on.
 *
 * Entries are enumerated per rule rather than written as a directory glob:
 * `.agents/rules/*.md` would sweep the path-scoped rules back in and make them
 * unconditional, which is the exact outcome the filter above prevents.
 *
 * Entries the user wrote themselves are preserved — only the ones agentsync
 * owns (prefixed `.agents/rules/`) are replaced, so a hand-added
 * `CONTRIBUTING.md` survives a sync.
 */
export function projectOpenCodeRules(rules: readonly CanonicalRule[]): {
  written: string[];
  warnings: string[];
  instructions: string[];
} {
  const unconditional = rules.filter((r) => !r.paths);
  const warnings = rules
    .filter((r) => r.paths)
    .map(
      (r) =>
        `rule "${r.name}" is path-scoped; opencode loads every instruction ` +
        `unconditionally — skipped rather than widened to always-on`,
    );
  return {
    written: unconditional.map((rule) => rule.name),
    warnings,
    instructions: unconditional.map(
      (rule) => `${RULES_INSTRUCTION_PREFIX}${toPosixPath(rule.relPath)}`,
    ),
  };
}

async function writeOpenCodeRules(
  rules: CanonicalRule[],
  _cwd: string,
  _mode: SyncMode,
): Promise<{ written: string[]; warnings: string[] }> {
  return projectOpenCodeRules(rules);
}

function openCodeStructuredDeclaration(
  configPath: string,
): NonNullable<ToolProvider["structuredConfig"]>["declarations"][number] {
  return {
    path: configPath,
    format: "jsonc",
    context: "opencode settings",
    keys: [{ key: "permission", semanticHash: "property-order" }],
    arraySlices: [{ key: "instructions", prefix: RULES_INSTRUCTION_PREFIX }],
  };
}

const opencodeStructuredConfig: NonNullable<ToolProvider["structuredConfig"]> =
  {
    declarations: OPENCODE_CONFIG_PATHS.map(openCodeStructuredDeclaration),
    artifactDependencies: [],
    resolveProjectConfigPath: resolveOpenCodeConfigPath,
    async project(input, _cwd, projectConfigPath) {
      if (!projectConfigPath) {
        throw new ConfigError(
          "OpenCode structured projection has no preflighted active config path.",
          undefined,
          "Repair the structured lifecycle so it binds the active OpenCode path before projection.",
        );
      }
      const configPath = projectConfigPath;
      const claims: StructuredStateClaim[] = [];
      if (input.extensions.permissions) {
        claims.push({
          kind: "key",
          path: configPath,
          key: "permission",
          value: projectOpenCodePermissions(input.extensions.permissions).value,
        });
      }
      const rules = projectOpenCodeRules(input.rules);
      if (rules.instructions.length > 0) {
        claims.push({
          kind: "array-slice",
          path: configPath,
          key: "instructions",
          values: rules.instructions,
        });
      }
      return { claims };
    },
  };

export const opencodeProvider: ToolProvider = {
  name: "opencode",
  displayName: "OpenCode",
  paths: {
    skillsDir: ".agents/skills",
    commandsDir: ".opencode/commands",
    agentsDir: ".opencode/agents",
    mcpConfigPath: "opencode.json",
    docsFile: "AGENTS.md",
  },
  capabilities: {
    skills: true,
    commands: true,
    agents: true,
    mcpStdio: true,
    mcpHttp: true,
    nativeAgentsMd: true,
    nativeSkillsDiscovery: true,
    permissions: true,
    rules: true,
  },
  manifestCleanSurfaces: ["commands", "agents"],
  readsGlobalAgentsDir: true,
  agentFileExtension: ".md",
  agentContentTransform,
  commandContentTransform,
  structuredConfig: opencodeStructuredConfig,
  mcpFormat: {
    projectPath: "dynamic",
    // Only `mcp` — the key THIS writer assigns. `permission` and
    // `instructions` come from writers that run only when the project
    // configures those features, so stripping them on clean would delete
    // blocks a user hand-wrote and AgentSync never touched.
    ownership: { kind: "owned-keys", keys: ["mcp"], format: "jsonc" },
    projectConfigPaths: OPENCODE_CONFIG_PATHS,
    resolveProjectConfigPath: resolveOpenCodeConfigPath,
    async writeProjectMCPAtPath(mcps, cwd, target) {
      if (!target.expectedOwnedValues?.mcp) {
        throw new ConfigError(
          `Refusing to update OpenCode MCP configuration "${target.absolutePath}": the managed target has no preflight key expectation.`,
          target.absolutePath,
          "Repair the managed MCP lifecycle so it carries exact preflight state into the writer.",
        );
      }
      return writeOpenCodeMcpAtTarget(mcps, cwd, target);
    },
  },
  docsFormat: null,
  permissionsFormat: {
    previewPermissions: async (permissions, _cwd) => {
      return { warnings: projectOpenCodePermissions(permissions).warnings };
    },
    writePermissions: writeOpenCodePermissions,
  },
  rulesFormat: {
    previewRules: projectOpenCodeRules,
    writeRules: writeOpenCodeRules,
  },
};
