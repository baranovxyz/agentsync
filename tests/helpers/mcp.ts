import * as path from "node:path";
import type { MCP } from "../../src/core/mcp/tokens.js";
import type { ToolProvider } from "../../src/tools/types.js";

/** Exercise the provider's current project-only MCP codec in format tests. */
export async function writeProjectMcp(
  provider: ToolProvider,
  mcps: Record<string, MCP>,
  projectRoot: string,
): Promise<void> {
  const format = provider.mcpFormat;
  if (!format) throw new Error(`${provider.name} has no MCP format`);
  if (format.projectPath === "static") {
    await format.writeProjectMCP(mcps, projectRoot);
    return;
  }
  const relativePath = await format.resolveProjectConfigPath(projectRoot);
  await format.writeProjectMCPAtPath(mcps, projectRoot, {
    relativePath,
    absolutePath: path.join(projectRoot, ...relativePath.split("/")),
    expectedOwnedValues:
      format.ownership.kind === "owned-keys"
        ? Object.fromEntries(
            format.ownership.keys.map((key) => [key, { present: false }]),
          )
        : undefined,
  });
}
