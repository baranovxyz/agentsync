import { mkdtemp, readFile, rm } from "node:fs/promises";
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

  it("creates the CLAUDE.md directive when AGENTS.md exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Project Documentation");

    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(true);

    const claudeMd = path.join(tmpDir, "CLAUDE.md");
    expect(await pathExists(claudeMd)).toBe(true);
  });

  it("creates the GEMINI.md directive when AGENTS.md exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Docs");

    const providers = [getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].created).toBe(true);
    expect(results[0].docsFile).toBe("GEMINI.md");

    const geminiMd = path.join(tmpDir, "GEMINI.md");
    expect(await pathExists(geminiMd)).toBe(true);
  });

  it("emits the canonical root directive for include-capable tools", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Project Documentation");

    const providers = [getToolProvider("claude"), getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    for (const result of results) {
      expect(result.created).toBe(true);
    }

    const claudeMd = await readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    const geminiMd = await readFile(path.join(tmpDir, "GEMINI.md"), "utf-8");
    expect(claudeMd).toBe("@AGENTS.md\n");
    expect(geminiMd).toBe("@AGENTS.md\n");
  });

  it("uses root AGENTS.md even when a noncanonical nested file exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Root Docs");
    await outputFile(
      path.join(tmpDir, ".agents", "AGENTS.md"),
      "# Agents Dir Docs",
    );

    const providers = [getToolProvider("claude"), getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    for (const result of results) {
      expect(result.created).toBe(true);
    }

    const claudeMd = await readFile(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    const geminiMd = await readFile(path.join(tmpDir, "GEMINI.md"), "utf-8");
    expect(claudeMd).toBe("@AGENTS.md\n");
    expect(geminiMd).toBe("@AGENTS.md\n");
  });

  it("ignores a nested AGENTS.md when the canonical root file is absent", async () => {
    const docsDir = path.join(tmpDir, ".agents");
    await outputFile(path.join(docsDir, "AGENTS.md"), "# From AgentSync Docs");

    const providers = [getToolProvider("claude"), getToolProvider("gemini")];
    const results = await syncDocs(providers, tmpDir);

    for (const result of results) {
      expect(result.created).toBe(false);
    }
    expect(await pathExists(path.join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(await pathExists(path.join(tmpDir, "GEMINI.md"))).toBe(false);
  });

  it("returns created=false when no AGENTS.md exists", async () => {
    const providers = [getToolProvider("claude")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].created).toBe(false);
  });

  it("reports created=true for tools that read AGENTS.md natively when root AGENTS.md exists", async () => {
    await outputFile(path.join(tmpDir, "AGENTS.md"), "# Docs");

    // Cursor reads AGENTS.md from root natively
    const providers = [getToolProvider("cursor")];
    const results = await syncDocs(providers, tmpDir);

    expect(results[0].docsFile).toBe("AGENTS.md");
    expect(results[0].created).toBe(true);
  });
});
