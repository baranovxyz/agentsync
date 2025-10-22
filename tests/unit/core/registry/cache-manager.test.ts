import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheManager } from "../../../../src/core/registry/cache-manager.js";
import * as fs from "../../../../src/utils/fs.js";

describe("CacheManager", () => {
  let tempDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "agentsync-test-"));
    cacheManager = new CacheManager(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("getCachePath", () => {
    it("returns correct cache path", () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const cachePath = cacheManager.getCachePath(source);
      expect(cachePath).toBe(path.join(tempDir, "github-company-standards"));
    });
  });

  describe("isCached", () => {
    it("returns false when not cached", async () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const isCached = await cacheManager.isCached(source);
      expect(isCached).toBe(false);
    });

    it("returns false when directory exists but no .git", async () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const cachePath = cacheManager.getCachePath(source);
      await fs.ensureDir(cachePath);

      const isCached = await cacheManager.isCached(source);
      expect(isCached).toBe(false);
    });

    it("returns true when .git directory exists", async () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const cachePath = cacheManager.getCachePath(source);
      await fs.ensureDir(path.join(cachePath, ".git"));

      const isCached = await cacheManager.isCached(source);
      expect(isCached).toBe(true);
    });
  });

  describe("clearAll", () => {
    it("removes all cache directories", async () => {
      // Create some fake cache directories
      await fs.ensureDir(path.join(tempDir, "github-org1-repo1", ".git"));
      await fs.ensureDir(path.join(tempDir, "github-org2-repo2", ".git"));

      await cacheManager.clearAll();

      const files = await fs.readdir(tempDir);
      expect(files).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes specific cache directory", async () => {
      const source1 = { org: "org1", repo: "repo1", ref: "main" };
      const source2 = { org: "org2", repo: "repo2", ref: "main" };

      await fs.ensureDir(path.join(tempDir, "github-org1-repo1", ".git"));
      await fs.ensureDir(path.join(tempDir, "github-org2-repo2", ".git"));

      await cacheManager.clear(source1);

      expect(await cacheManager.isCached(source1)).toBe(false);
      expect(await cacheManager.isCached(source2)).toBe(true);
    });
  });

  describe("getCacheMetadata", () => {
    it("returns exists: false when not cached", async () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const metadata = await cacheManager.getCacheMetadata(source);
      expect(metadata).toEqual({ exists: false });
    });

    it("returns metadata when cached", async () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      const cachePath = cacheManager.getCachePath(source);
      await fs.ensureDir(path.join(cachePath, ".git"));
      await fs.writeFile(path.join(cachePath, "test.txt"), "content");

      const metadata = await cacheManager.getCacheMetadata(source);
      expect(metadata.exists).toBe(true);
      expect(metadata.size).toBeGreaterThan(0);
      expect(metadata.lastUpdated).toBeInstanceOf(Date);
    });
  });
});
