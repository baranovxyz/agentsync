/**
 * Docs Symlink Behavior Test
 * Tests CLAUDE.md and GEMINI.md symlink creation, overwrite of existing files,
 * behavior when AGENTS.md doesn't exist, and copy from .agents/.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncDocs } from "../../../src/sync/docs.js";
import { getToolProvider } from "../../../src/tools/index.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Docs Symlink Behavior", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-docs-symlink-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates CLAUDE.md when AGENTS.md exists", async () => {
    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Project\n\nTest project.",
    );

    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].docsFile).toBe("CLAUDE.md");
    expect(results[0].created).toBe(true);
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
  });

  it("creates GEMINI.md when AGENTS.md exists", async () => {
    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Project\n\nGemini test.",
    );

    const providers = [getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].docsFile).toBe("GEMINI.md");
    expect(results[0].created).toBe(true);
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(true);
  });

  it("does not create CLAUDE.md when AGENTS.md is missing", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(false);
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
  });

  it("does not create GEMINI.md when AGENTS.md is missing", async () => {
    const providers = [getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(false);
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(false);
  });

  it("creates CLAUDE.md directive when .agents/AGENTS.md exists", async () => {
    const docsContent = "# From Docs\n\nContent from .agents/.";
    await ensureDir(path.join(tmpDir, ".agents"));
    await outputFile(path.join(tmpDir, ".agents", "AGENTS.md"), docsContent);

    const providers = [getToolProvider("claude")];
    await syncDocs(providers, tmpDir);

    // CLAUDE.md should exist with @AGENTS.md directive
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    const claudeContent = await readFile(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );
    expect(claudeContent).toBe("@AGENTS.md\n");
  });

  it("overwrites existing CLAUDE.md file on re-sync", async () => {
    // Create initial CLAUDE.md
    await outputFile(path.join(tmpDir, "CLAUDE.md"), "Old content");
    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Updated\n\nNew content.",
    );

    const providers = [getToolProvider("claude")];
    await syncDocs(providers, tmpDir);

    // CLAUDE.md should still exist (replaced)
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
  });

  it("tools reading AGENTS.md natively report created status based on existence", async () => {
    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Project\n\nNative reading test.",
    );

    // Cursor reads AGENTS.md natively from root
    const providers = [getToolProvider("cursor")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].docsFile).toBe("AGENTS.md");
    expect(results[0].created).toBe(true);
  });

  it("creates both CLAUDE.md and GEMINI.md in multi-tool sync", async () => {
    await outputFile(
      path.join(tmpDir, "AGENTS.md"),
      "# Project\n\nMulti-tool docs.",
    );

    const providers = [
      getToolProvider("claude"),
      getToolProvider("gemini"),
      getToolProvider("cursor"),
    ];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(3);

    const claudeResult = results.find((r) => r.tool === "claude");
    const geminiResult = results.find((r) => r.tool === "gemini");
    const cursorResult = results.find((r) => r.tool === "cursor");

    expect(claudeResult?.docsFile).toBe("CLAUDE.md");
    expect(claudeResult?.created).toBe(true);
    expect(geminiResult?.docsFile).toBe("GEMINI.md");
    expect(geminiResult?.created).toBe(true);
    expect(cursorResult?.docsFile).toBe("AGENTS.md");
    expect(cursorResult?.created).toBe(true);
  });

  it("reports not-created for all tools when no AGENTS.md source exists", async () => {
    const providers = [
      getToolProvider("claude"),
      getToolProvider("gemini"),
      getToolProvider("cursor"),
    ];
    const results = await syncDocs(providers, tmpDir);

    for (const result of results) {
      expect(result.created).toBe(false);
    }
  });
});
