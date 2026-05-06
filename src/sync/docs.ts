/**
 * Docs Sync Module
 * Generates tool-specific docs files using @AGENTS.md directive
 * Tools with docsFormat=null read AGENTS.md natively (no action needed)
 */

import * as path from "node:path";
import type { ToolProvider } from "../tools/types.js";
import { pathExists } from "../utils/fs.js";

/** Result of syncing docs (AGENTS.md directives) to a single tool */
export interface DocsSyncResult {
  tool: string;
  docsFile: string;
  created: boolean;
}

/**
 * Sync docs to all configured tools
 * Delegates to provider.docsFormat.writeDocs() for tools that need it
 * Tools with docsFormat=null read AGENTS.md from root natively
 */
export async function syncDocs(
  providers: ToolProvider[],
  cwd: string,
): Promise<DocsSyncResult[]> {
  const results: DocsSyncResult[] = [];
  const agentsMdPath = path.join(cwd, ".agents", "AGENTS.md");
  const rootAgentsMd = path.join(cwd, "AGENTS.md");

  // Resolve which AGENTS.md path actually exists
  const agentsDirExists = await pathExists(agentsMdPath);
  const rootExists = await pathExists(rootAgentsMd);
  const hasAgentsMd = agentsDirExists || rootExists;
  const resolvedPath = agentsDirExists ? agentsMdPath : rootAgentsMd;

  for (const provider of providers) {
    const docsFile = provider.paths.docsFile;

    if (!provider.docsFormat) {
      // Tool reads AGENTS.md natively — no action needed
      results.push({ tool: provider.name, docsFile, created: hasAgentsMd });
      continue;
    }

    if (hasAgentsMd) {
      // Delegate to tool-specific docs format (writes @AGENTS.md directive)
      await provider.docsFormat.writeDocs(resolvedPath, cwd);
      results.push({ tool: provider.name, docsFile, created: true });
    } else {
      results.push({ tool: provider.name, docsFile, created: false });
    }
  }

  return results;
}
