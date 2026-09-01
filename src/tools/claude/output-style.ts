import { copyFile, mkdir, stat } from "node:fs/promises";
import * as path from "node:path";
import type { z } from "zod";
import type { OutputStyleConfigSchema } from "../../types/schemas.js";
import { assertSafeProjectOutputFile } from "../../utils/project-output.js";

type OutputStyleConfig = z.infer<typeof OutputStyleConfigSchema>;

export const CLAUDE_OUTPUT_STYLE_ARTIFACTS = "claude:output-style";
const OUTPUT_STYLES_DIR = ".claude/output-styles";
const BUILT_IN_TONES: Readonly<Record<string, string | undefined>> = {
  terse: "Concise",
  pragmatic: undefined,
  explanatory: "Explanatory",
  friendly: undefined,
  none: undefined,
};

async function sourceFileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function projectClaudeOutputStyle(
  outputStyle: NonNullable<OutputStyleConfig>,
  cwd: string,
): Promise<{ value?: string; warnings: string[]; generatedFiles: string[] }> {
  const checks = await Promise.all(
    (outputStyle.custom ?? []).map(async (custom) => {
      const source = path.resolve(cwd, custom.file);
      return {
        custom,
        source,
        destination: path.join(cwd, OUTPUT_STYLES_DIR, `${custom.name}.md`),
        exists: await sourceFileExists(source),
      };
    }),
  );
  const generated = checks.filter(
    ({ exists, source, destination }) =>
      exists && source !== path.resolve(destination),
  );
  await Promise.all(
    generated.map(({ destination }) =>
      assertSafeProjectOutputFile(cwd, destination),
    ),
  );

  const warnings = checks
    .filter(({ exists }) => !exists)
    .map(
      ({ custom }) =>
        `output_style custom ${custom.name}: source ${custom.file} not found`,
    );
  const customTone = checks.find(
    ({ custom }) => custom.name === outputStyle.tone,
  );
  let value: string | undefined;
  if (outputStyle.tone) {
    if (customTone?.exists) value = outputStyle.tone;
    else if (!customTone) value = BUILT_IN_TONES[outputStyle.tone];
  }

  if (outputStyle.tone && !(value || customTone)) {
    warnings.push(
      `output_style tone="${outputStyle.tone}" has no Claude Code built-in; ` +
        `define [[output_style.custom]] with name="${outputStyle.tone}" ` +
        `to ship one, or use tone="terse" or "explanatory".`,
    );
  }

  return {
    ...(value ? { value } : {}),
    warnings,
    generatedFiles: generated.map(({ destination }) => destination),
  };
}

export async function writeClaudeOutputStyle(
  outputStyle: NonNullable<OutputStyleConfig>,
  cwd: string,
): Promise<{ warnings: string[]; generatedFiles: string[] }> {
  const projection = await projectClaudeOutputStyle(outputStyle, cwd);
  const generated = new Set(projection.generatedFiles);

  for (const custom of outputStyle.custom ?? []) {
    const source = path.resolve(cwd, custom.file);
    const destination = path.join(cwd, OUTPUT_STYLES_DIR, `${custom.name}.md`);
    if (!generated.has(destination) || source === path.resolve(destination)) {
      continue;
    }
    await assertSafeProjectOutputFile(cwd, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  return {
    warnings: projection.warnings,
    generatedFiles: projection.generatedFiles,
  };
}
