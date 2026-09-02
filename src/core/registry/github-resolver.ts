/**
 * GitHub resolver - clones repos to temp directory with SSH/HTTPS fallback
 */

import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import {
  FileSystemError,
  getErrorMessage,
  PresetRefNotFoundError,
} from "../errors.js";
import { type GitHubSource, GitHubSourceParser } from "./github-source.js";

/**
 * Exit status `git ls-remote --exit-code` returns when the remote answered
 * but no ref matched — see `man git-ls-remote`.
 */
const GIT_LS_REMOTE_REF_NOT_FOUND_EXIT_CODE = 2;

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
        // Both transports failed. `git clone`'s stderr text is not a stable
        // classifier (locale, git version, and transport all vary its
        // wording), so classify structurally instead: a direct `ls-remote`
        // probe against the same ref tells us whether the remote answered at
        // all — distinguishing "the ref doesn't exist" from "we can't reach
        // the remote" without parsing anything.
        if (await this.isRefMissing(httpsUrl, source.ref)) {
          throw new PresetRefNotFoundError(
            `github:${source.org}/${source.repo}`,
            source.ref,
          );
        }

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

  /**
   * True only when the remote answered and the ref does not exist there.
   * Any other outcome (network failure, auth failure, missing `git`) is left
   * for the caller to treat as an unreachable remote — probing here never
   * upgrades ambiguous failures into a false "not found".
   */
  private async isRefMissing(url: string, ref: string): Promise<boolean> {
    try {
      await execa("git", ["ls-remote", "--exit-code", url, ref]);
      return false;
    } catch (error) {
      return execaExitCode(error) === GIT_LS_REMOTE_REF_NOT_FOUND_EXIT_CODE;
    }
  }
}

/** Read `exitCode` off an execa rejection, structurally rather than via `as`. */
function execaExitCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("exitCode" in error)) {
    return undefined;
  }
  const { exitCode } = error;
  return typeof exitCode === "number" ? exitCode : undefined;
}
