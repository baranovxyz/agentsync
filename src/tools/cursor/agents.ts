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
const AgentMetadataSchema = z.object({
  description: NonblankStringSchema.optional(),
  model: NonblankStringSchema.optional(),
  readonly: z.boolean().optional(),
  is_background: z.boolean().optional(),
});
const SUPPORTED_FIELDS = new Set([
  "name",
  "description",
  "model",
  "readonly",
  "is_background",
]);

type AgentTransformResult = ReturnType<AgentContentTransform["transform"]>;

function skipAgent(name: string, reason: string): AgentTransformResult {
  return {
    skip: true,
    warnings: [`[cursor] agent '${name}' skipped: ${reason}`],
  };
}

function serializeAgent(
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

function projectAgent(content: string, name: string): AgentTransformResult {
  const { fm, body, eol } = splitFrontmatter(content);
  if (!fm) return skipAgent(name, "missing or invalid YAML frontmatter");
  if (body.trim().length === 0) return skipAgent(name, "prompt body is empty");

  const projectedName = AgentNameSchema.safeParse(name);
  if (!projectedName.success) {
    return skipAgent(
      name,
      `projected name ${projectedName.error.issues[0]?.message}`,
    );
  }

  const metadata = AgentMetadataSchema.safeParse(fm);
  if (!metadata.success) {
    const issue = metadata.error.issues[0];
    const field = issue?.path.join(".") || "frontmatter";
    return skipAgent(name, `frontmatter '${field}' ${issue?.message}`);
  }

  const unsupported = Object.keys(fm)
    .filter((key) => !SUPPORTED_FIELDS.has(key))
    .sort();
  return {
    content: serializeAgent(
      { name: projectedName.data, ...metadata.data },
      body,
      eol,
    ),
    warnings:
      unsupported.length === 0
        ? []
        : [
            `[cursor] agent '${name}': dropped unsupported frontmatter fields: ${unsupported.join(", ")}`,
          ],
  };
}

export const cursorAgentContentTransform: AgentContentTransform = {
  transform: projectAgent,
};
