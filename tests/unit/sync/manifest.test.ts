/**
 * Sync Manifest Tests
 * Verifies manifest writing, reading, and hashing.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getManifestPath,
  hashFile,
  readManifest,
  SyncManifestSchema,
  writeManifest,
} from "../../../src/sync/manifest.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("Sync Manifest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-manifest-"));
    await ensureDir(path.join(tmpDir, ".agents"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("hashFile", () => {
    it("returns sha256-prefixed hash of file contents", async () => {
      const filePath = path.join(tmpDir, "test.md");
      await outputFile(filePath, "hello world");

      const hash = await hashFile(filePath);

      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("returns different hashes for different content", async () => {
      const fileA = path.join(tmpDir, "a.md");
      const fileB = path.join(tmpDir, "b.md");
      await outputFile(fileA, "content A");
      await outputFile(fileB, "content B");

      const hashA = await hashFile(fileA);
      const hashB = await hashFile(fileB);

      expect(hashA).not.toBe(hashB);
    });

    it("returns identical hashes for identical content", async () => {
      const fileA = path.join(tmpDir, "a.md");
      const fileB = path.join(tmpDir, "b.md");
      await outputFile(fileA, "same content");
      await outputFile(fileB, "same content");

      const hashA = await hashFile(fileA);
      const hashB = await hashFile(fileB);

      expect(hashA).toBe(hashB);
    });
  });

  describe("writeManifest", () => {
    it("writes manifest with correct format", async () => {
      const fileA = path.join(tmpDir, ".cursor", "rules", "test.md");
      await ensureDir(path.dirname(fileA));
      await outputFile(fileA, "# Test skill");

      await writeManifest(tmpDir, [fileA]);

      const manifestPath = getManifestPath(tmpDir);
      expect(await pathExists(manifestPath)).toBe(true);

      const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
      const manifest = SyncManifestSchema.parse(raw);

      expect(manifest.files).toHaveProperty(".cursor/rules/test.md");
      expect(manifest.files[".cursor/rules/test.md"]).toMatch(
        /^sha256:[a-f0-9]{64}$/,
      );
      expect(manifest.timestamp).toBeTruthy();
      // Timestamp should be a valid ISO date
      expect(() => new Date(manifest.timestamp)).not.toThrow();
    });

    it("stores relative paths in the manifest", async () => {
      const fileA = path.join(tmpDir, ".claude", "rules", "ns", "foo.md");
      await ensureDir(path.dirname(fileA));
      await outputFile(fileA, "content");

      await writeManifest(tmpDir, [fileA]);

      const manifest = await readManifest(tmpDir);
      expect(manifest).toBeDefined();
      const keys = Object.keys(manifest!.files);
      expect(keys).toContain(".claude/rules/ns/foo.md");
      // No absolute paths in manifest
      for (const key of keys) {
        expect(path.isAbsolute(key)).toBe(false);
      }
    });

    it("skips files that do not exist on disk", async () => {
      const existing = path.join(tmpDir, "existing.md");
      const missing = path.join(tmpDir, "missing.md");
      await outputFile(existing, "data");

      await writeManifest(tmpDir, [existing, missing]);

      const manifest = await readManifest(tmpDir);
      expect(manifest).toBeDefined();
      expect(Object.keys(manifest!.files)).toHaveLength(1);
      expect(manifest!.files).toHaveProperty("existing.md");
    });
  });

  describe("readManifest", () => {
    it("returns undefined when no manifest exists", async () => {
      const result = await readManifest(tmpDir);
      expect(result).toBeUndefined();
    });

    it("reads a previously written manifest", async () => {
      const file = path.join(tmpDir, "test.md");
      await outputFile(file, "content");
      await writeManifest(tmpDir, [file]);

      const manifest = await readManifest(tmpDir);

      expect(manifest).toBeDefined();
      expect(manifest!.files).toHaveProperty("test.md");
      expect(manifest!.timestamp).toBeTruthy();
    });

    it("returns undefined for corrupted manifest", async () => {
      await outputFile(getManifestPath(tmpDir), "not valid json {{{");

      const result = await readManifest(tmpDir);
      expect(result).toBeUndefined();
    });
  });
});
