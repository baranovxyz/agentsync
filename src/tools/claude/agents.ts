import yaml from "js-yaml";
import { z } from "zod";
import { splitFrontmatter } from "../../utils/frontmatter.js";
import type { AgentContentTransform } from "../types.js";

const AgentNameSchema = z
  .string()
  .regex(
    /^[a-z](?:[a-z-]*[a-z])?$/,
    "must contain lowercase letters and hyphens only",
  );
const NonblankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "must be a nonempty string");
const AgentModelSchema = z.union([
  z.enum(["sonnet", "opus", "haiku", "fable", "inherit"]),
  z.string().regex(/^claude-[a-z0-9][a-z0-9._-]*$/),
]);
const StringListSchema = z.union([
  NonblankStringSchema,
  z.array(NonblankStringSchema),
]);
const McpServerSchema = z.union([
  NonblankStringSchema,
  z.record(z.string(), z.unknown()),
]);
const OPTIONAL_FIELD_SCHEMAS: Record<string, z.ZodType> = {
  tools: StringListSchema,
  disallowedTools: StringListSchema,
  permissionMode: z.enum([
    "default",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions",
    "plan",
    "manual",
  ]),
  maxTurns: z.number().int().positive(),
  skills: z.array(NonblankStringSchema),
  mcpServers: z.array(McpServerSchema),
  hooks: z.record(z.string(), z.unknown()),
  memory: z.enum(["user", "project", "local"]),
  background: z.boolean(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  isolation: z.literal("worktree"),
  color: z.enum([
    "red",
    "blue",
    "green",
    "yellow",
    "purple",
    "orange",
    "pink",
    "cyan",
  ]),
  initialPrompt: z.string(),
  experimental: z
    .object({ cacheTtl: z.enum(["5m", "1h"]).optional() })
    .strict(),
};
const SUPPORTED_FIELDS = new Set([
  "name",
  "description",
  "model",
  ...Object.keys(OPTIONAL_FIELD_SCHEMAS),
]);

type AgentTransformResult = ReturnType<AgentContentTransform["transform"]>;

function skipAgent(name: string, reason: string): AgentTransformResult {
  return {
    skip: true,
    warnings: [`[claude] agent '${name}' skipped: ${reason}`],
  };
}

function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  eol: "\n" | "\r\n",
): string {
  const serialized = yaml
    .dump(frontmatter, { lineWidth: -1, noRefs: true })
    .trimEnd()
    .replaceAll("\n", eol);
  return `---${eol}${serialized}${eol}---${eol}${body}`;
}

function projectOptionalFields(
  frontmatter: Record<string, unknown>,
  name: string,
): { fields: Record<string, unknown>; warnings: string[] } {
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    const schema = OPTIONAL_FIELD_SCHEMAS[key];
    if (!schema) continue;

    const field = schema.safeParse(value);
    if (field.success) {
      fields[key] = field.data;
    } else {
      warnings.push(
        `[claude] agent '${name}': dropped invalid '${key}' frontmatter value`,
      );
    }
  }
  return { fields, warnings };
}

function projectModel(
  value: unknown,
  name: string,
): { model?: string; warnings: string[] } {
  if (value === undefined) return { warnings: [] };

  const model = AgentModelSchema.safeParse(value);
  if (model.success) return { model: model.data, warnings: [] };

  return {
    warnings: [
      `[claude] agent '${name}': dropped invalid model '${String(value)}' — ` +
        "use sonnet, opus, haiku, fable, inherit, or a full claude-* model ID",
    ],
  };
}

function unsupportedFieldWarnings(
  frontmatter: Record<string, unknown>,
  name: string,
): string[] {
  const unsupported = Object.keys(frontmatter)
    .filter((key) => !SUPPORTED_FIELDS.has(key))
    .sort();
  return unsupported.length === 0
    ? []
    : [
        `[claude] agent '${name}': dropped unsupported frontmatter fields: ${unsupported.join(", ")}`,
      ];
}

function projectAgent(content: string, name: string): AgentTransformResult {
  const { fm, body, eol } = splitFrontmatter(content);
  if (!fm) return skipAgent(name, "missing or invalid YAML frontmatter");

  const projectedName = AgentNameSchema.safeParse(name);
  if (!projectedName.success) {
    return skipAgent(
      name,
      `projected name ${projectedName.error.issues[0]?.message}`,
    );
  }

  const description = NonblankStringSchema.safeParse(fm.description);
  if (!description.success) {
    return skipAgent(
      name,
      "frontmatter 'description' must be a nonempty string",
    );
  }

  const optional = projectOptionalFields(fm, name);
  const model = projectModel(fm.model, name);
  return {
    content: serializeFrontmatter(
      {
        name: projectedName.data,
        description: description.data,
        ...optional.fields,
        ...(model.model ? { model: model.model } : {}),
      },
      body,
      eol,
    ),
    warnings: [
      ...optional.warnings,
      ...model.warnings,
      ...unsupportedFieldWarnings(fm, name),
    ],
  };
}

export const claudeAgentContentTransform: AgentContentTransform = {
  transform: projectAgent,
};
