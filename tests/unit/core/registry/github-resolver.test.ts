/**
 * GitHubResolver Tests
 *
 * A `git clone` failure is ambiguous: the ref might not exist, or the remote
 * might be unreachable. Classification must come from `git`'s exit status
 * (via a direct `ls-remote --exit-code` probe), never from parsing clone's
 * stderr text, which varies with locale, git version, and transport.
 */
import { execa } from "execa";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileSystemError,
  PresetRefNotFoundError,
} from "../../../../src/core/errors.js";
import { GitHubResolver } from "../../../../src/core/registry/github-resolver.js";

vi.mock("execa", () => ({ execa: vi.fn() }));

const mockExeca = vi.mocked(execa);

/** Build an execa-shaped rejection without an `as` cast. */
function execaFailure(message: string, exitCode?: number): Error {
  return Object.assign(new Error(message), { exitCode });
}

describe("GitHubResolver", () => {
  let resolver: GitHubResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new GitHubResolver();
  });

  it("throws PresetRefNotFoundError when both clones fail and ls-remote exits 2", async () => {
    mockExeca.mockImplementation((_file, args) => {
      const subcommand = Array.isArray(args) ? args[0] : undefined;
      if (subcommand === "clone") {
        return Promise.reject(
          execaFailure(
            "fatal: Remote branch does-not-exist not found in upstream origin",
            128,
          ),
        );
      }
      if (subcommand === "ls-remote") {
        // The remote answered — exit code 2 means it enumerated refs and
        // none matched.
        return Promise.reject(execaFailure("no matching ref", 2));
      }
      return Promise.reject(new Error(`unexpected git invocation: ${args}`));
    });

    await expect(
      resolver.resolve("github:acme/widgets@does-not-exist"),
    ).rejects.toThrow(PresetRefNotFoundError);
  });

  it("throws FileSystemError when both clones fail and ls-remote fails for another reason", async () => {
    mockExeca.mockImplementation((_file, args) => {
      const subcommand = Array.isArray(args) ? args[0] : undefined;
      if (subcommand === "clone") {
        return Promise.reject(
          execaFailure("fatal: could not read from remote repository", 128),
        );
      }
      if (subcommand === "ls-remote") {
        // Never reached the remote at all — no exit code 2 to report.
        return Promise.reject(
          execaFailure("fatal: could not resolve host: github.com", 128),
        );
      }
      return Promise.reject(new Error(`unexpected git invocation: ${args}`));
    });

    await expect(resolver.resolve("github:acme/widgets@main")).rejects.toThrow(
      FileSystemError,
    );
  });

  it("probes ls-remote only after both clone attempts fail, not on the happy path", async () => {
    mockExeca.mockImplementation((_file, args) => {
      const subcommand = Array.isArray(args) ? args[0] : undefined;
      if (subcommand === "clone") return Promise.resolve();
      return Promise.reject(new Error(`unexpected git invocation: ${args}`));
    });

    await resolver.resolve("github:acme/widgets@main");

    const invokedSubcommands = mockExeca.mock.calls.map(([, args]) =>
      Array.isArray(args) ? args[0] : undefined,
    );
    expect(invokedSubcommands).not.toContain("ls-remote");
  });
});
