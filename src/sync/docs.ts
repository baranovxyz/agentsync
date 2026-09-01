/**
 * Docs Sync Module
 * Generates tool-specific docs files using an @AGENTS.md-style include directive
 * Tools with docsFormat=null read AGENTS.md natively (no action needed)
 *
 * The only canonical project instruction source is root AGENTS.md.
 */

import * as path from "node:path";
import type { ToolProvider } from "../tools/types.js";
import { pathExists } from "../utils/fs.js";
import { assertSafeProjectOutputFile } from "../utils/project-output.js";

/** Result of syncing docs (AGENTS.md directives) to a single tool */
export interface DocsSyncResult {
  tool: string;
  docsFile: string;
  created: boolean;
}

interface DocsSource {
  exists: boolean;
  path: string;
}

async function resolveDocsSource(cwd: string): Promise<DocsSource> {
  const agentsMd = path.join(cwd, "AGENTS.md");
  return {
    exists: await pathExists(agentsMd),
    path: agentsMd,
  };
}

function projectDocsResult(
  provider: ToolProvider,
  source: DocsSource,
): DocsSyncResult {
  return {
    tool: provider.name,
    docsFile: provider.paths.docsFile,
    created: source.exists,
  };
}

async function preflightDocsTargets(
  providers: readonly ToolProvider[],
  source: DocsSource,
  cwd: string,
): Promise<void> {
  if (!source.exists) return;
  await Promise.all(
    providers.flatMap((provider) =>
      provider.docsFormat
        ? [
            assertSafeProjectOutputFile(
              cwd,
              path.join(cwd, provider.paths.docsFile),
            ),
          ]
        : [],
    ),
  );
}

/** Read-only docs projection used by dry-run. */
export async function previewDocs(
  providers: ToolProvider[],
  cwd: string,
): Promise<DocsSyncResult[]> {
  const source = await resolveDocsSource(cwd);
  await preflightDocsTargets(providers, source, cwd);
  return providers.map((provider) => projectDocsResult(provider, source));
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
  const source = await resolveDocsSource(cwd);
  await preflightDocsTargets(providers, source, cwd);
  const results: DocsSyncResult[] = [];

  for (const provider of providers) {
    if (provider.docsFormat && source.exists) {
      // Delegate to tool-specific docs format (writes the include directive)
      await provider.docsFormat.writeDocs(source.path, cwd);
    }
    results.push(projectDocsResult(provider, source));
  }

  return results;
}
