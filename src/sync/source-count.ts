import fg from "fast-glob";

/** Count markdown files across canonical source directories. */
export async function countMarkdownFiles(
  dirs: readonly string[],
): Promise<number> {
  const counts = await Promise.all(
    dirs.map(async (dir) => {
      const files = await fg("**/*.md", {
        cwd: dir,
        absolute: false,
        onlyFiles: true,
      });
      return files.length;
    }),
  );
  return counts.reduce((total, count) => total + count, 0);
}

/** Flatten preset source directories for a single content surface. */
export function flattenPresetDirs(presets?: Map<string, string[]>): string[] {
  return presets ? [...presets.values()].flat() : [];
}
