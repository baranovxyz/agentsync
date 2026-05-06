/**
 * GitHub resolver - clones repos to temp directory with SSH/HTTPS fallback
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { FileSystemError, getErrorMessage } from "../errors.js";
import { type GitHubSource, GitHubSourceParser } from "./github-source.js";

export class GitHubResolver {
  private parser = new GitHubSourceParser();

  /**
   * Resolve GitHub source to local path by cloning to a temp directory.
   * Cleanup is the caller's responsibility (or left to OS temp cleanup).
   */
  async resolve(sourceString: string): Promise<string> {
    const source = this.parser.parse(sourceString);
    const tmpDir = await mkdtemp(
      path.join(os.tmpdir(), `agentsync-github-${source.org}-${source.repo}-`),
    );
    return await this.clone(source, tmpDir);
  }

  /**
   * Clone repository with SSH/HTTPS fallback
   */
  private async clone(
    source: GitHubSource,
    targetPath: string,
  ): Promise<string> {
    const sshUrl = `git@github.com:${source.org}/${source.repo}.git`;
    const httpsUrl = `https://github.com/${source.org}/${source.repo}.git`;

    try {
      await execa("git", ["clone", "--branch", source.ref, sshUrl, targetPath]);
      return targetPath;
    } catch (sshError) {
      // SSH failed, try HTTPS
      try {
        await execa("git", [
          "clone",
          "--branch",
          source.ref,
          httpsUrl,
          targetPath,
        ]);
        return targetPath;
      } catch (httpsError) {
        const sshMessage = getErrorMessage(sshError);
        const httpsMessage = getErrorMessage(httpsError);
        throw new FileSystemError(
          `Failed to clone ${source.org}/${source.repo}`,
          targetPath,
          new Error(
            `Both SSH and HTTPS failed.\n\n` +
              `SSH error: ${sshMessage}\n` +
              `HTTPS error: ${httpsMessage}\n\n` +
              `Make sure:\n` +
              `1. Repository exists: https://github.com/${source.org}/${source.repo}\n` +
              `2. You have access (private repos require authentication)\n` +
              `3. Git is installed: git --version`,
          ),
        );
      }
    }
  }
}
