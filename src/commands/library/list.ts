/**
 * List extended libraries command
 */

import picocolors from 'picocolors';
import { validateConfig, normalizeExtends } from '../../types/schemas.js';
import { CacheManager } from '../../core/registry/cache-manager.js';
import { GitHubSourceParser } from '../../core/registry/github-source.js';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

const pc = picocolors;

export async function listLibraries(): Promise<void> {
  console.log(pc.blue('📚 Extended Libraries\n'));

  const cwd = process.cwd();
  const configPath = path.join(cwd, '.agentsync', 'config.json');

  try {
    const configContent = await readFile(configPath, 'utf-8');
    const config = validateConfig(JSON.parse(configContent));
    const extendsEntries = normalizeExtends(config.extends);

    if (extendsEntries.length === 0) {
      console.log(pc.gray('No libraries extended'));
      console.log(pc.gray('\nAdd libraries to .agentsync/config.json:'));
      console.log(pc.cyan('  "extends": ["github:company/standards"]'));
      return;
    }

    const cacheManager = new CacheManager();
    const parser = new GitHubSourceParser();

    for (const entry of extendsEntries) {
      console.log(pc.bold(entry.source));
      console.log(pc.gray(`  Namespace: ${entry.namespace}`));

      if (entry.include) {
        console.log(pc.gray(`  Include: ${entry.include.join(', ')}`));
      }
      if (entry.exclude) {
        console.log(pc.gray(`  Exclude: ${entry.exclude.join(', ')}`));
      }

      // Check cache status
      const source = parser.parse(entry.source);
      const metadata = await cacheManager.getCacheMetadata(source);

      if (metadata.exists) {
        const sizeInMB = ((metadata.size || 0) / 1024 / 1024).toFixed(2);
        console.log(
          pc.green(`  ✓ Cached (${sizeInMB}MB, last updated: ${metadata.lastUpdated?.toLocaleDateString()})`)
        );
      } else {
        console.log(pc.yellow('  ⚠ Not cached (will be cloned on next sync)'));
      }

      console.log();
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(pc.red('✗ AgentSync not initialized'));
      console.log(pc.gray('\nRun: agentsync init'));
    } else {
      throw error;
    }
  }
}
