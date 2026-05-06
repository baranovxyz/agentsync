import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncDocs } from "../../../src/sync/docs.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Docs Sync", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-docs-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates CLAUDE.md symlink when AGENTS.md exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Project Documentation");

    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(true);

    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    expect(await pathExists(claudeMd)).toBe(true);
  });

  it("creates GEMINI.md symlink when AGENTS.md exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Docs");

    const providers = [getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(true);
    expect(results[0].docsFile).toBe("GEMINI.md");

    const geminiMd = path.join(tmpDir, "GEMINI.md");
    expect(await pathExists(geminiMd)).toBe(true);
  });

  it("reports created for tools reading AGENTS.md natively when .agents/AGENTS.md exists", async () => {
    const docsDir = path.join(tmpDir, ".agents");
    await outputFile(path.join(docsDir, "AGENTS.md"), "# From AgentSync Docs");

    // Cursor reads AGENTS.md natively (docsFormat=null)
    const providers = [getToolProvider("cursor")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].created).toBe(true);
    expect(results[0].docsFile).toBe("AGENTS.md");
  });

  it("returns created=false when no AGENTS.md exists", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].created).toBe(false);
  });

  it("handles tools that read AGENTS.md natively", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Docs");

    // Cursor reads AGENTS.md from root natively
    const providers = [getToolProvider("cursor")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].docsFile).toBe("AGENTS.md");
    expect(results[0].created).toBe(true);
  });
});
