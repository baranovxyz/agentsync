/**
 * Clear library cache command
 */

import picocolors from 'picocolors';
import { CacheManager } from '../../core/registry/cache-manager.js';
import { GitHubSourceParser } from '../../core/registry/github-source.js';
import { validateConfig, normalizeExtends } from '../../types/schemas.js';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

const pc = picocolors;

export interface CacheClearOptions {
  all?: boolean;
}

export async function clearCache(options: CacheClearOptions = {}): Promise<void> {
  const cacheManager = new CacheManager();

  if (options.all) {
    console.log(pc.yellow('⚠️  Clearing all library caches...'));
    await cacheManager.clearAll();
    console.log(pc.green('✓ All caches cleared\n'));
    return;
  }

  // Clear caches for current project's libraries
  const cwd = process.cwd();
  const configPath = path.join(cwd, '.agentsync', 'config.json');

  try {
    const configContent = await readFile(configPath, 'utf-8');
    const config = validateConfig(JSON.parse(configContent));
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      console.log(pc.gray('No libraries to clear (config has no extends)'));
      return;
    }

    const parser = new GitHubSourceParser();
    console.log(pc.yellow(`Clearing ${extendsEntries.length} library cache(s)...\n`));

    for (const entry of extendsEntries) {
      const source = parser.parse(entry.source);
      const metadata = await cacheManager.getCacheMetadata(source);

      if (metadata.exists) {
        await cacheManager.clear(source);
        console.log(pc.green(`✓ Cleared: ${entry.source}`));
      } else {
        console.log(pc.gray(`  Skipped: ${entry.source} (not cached)`));
      }
    }

    console.log(pc.green('\n✓ Cache cleanup complete\n'));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(pc.red('✗ AgentSync not initialized'));
      console.log(pc.gray('\nRun: agentsync init'));
    } else {
      throw error;
    }
  }
}
