/**
 * Sync Manifest Tests
 * Verifies manifest writing, reading, and hashing.
 */
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import {
  getManifestPath,
  hashFile,
  hashSemanticValue,
  inspectManagedWrite,
  type McpOwnership,
  readManifest,
  SyncManifestSchema,
  validatedOwnedFiles,
  writeOwnedManifest,
} from "../../../src/sync/manifest.js";
import type { StructuredStateReceipts } from "../../../src/sync/structured-state.js";
import { getToolProvider } from "../../../src/tools/index.js";
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

  async function writeDiagnosticManifest(filePaths: string[]): Promise<void> {
    await writeOwnedManifest(tmpDir, new Map([["diagnostic", filePaths]]), {
      preserveUnselected: false,
    });
  }

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

  describe("current manifest publication", () => {
    it("writes manifest with correct format", async () => {
      const fileA = path.join(tmpDir, ".cursor", "rules", "test.md");
      await ensureDir(path.dirname(fileA));
      await outputFile(fileA, "# Test skill");

      await writeDiagnosticManifest([fileA]);

      const manifestPath = getManifestPath(tmpDir);
      expect(await pathExists(manifestPath)).toBe(true);

      const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
      const manifest = SyncManifestSchema.parse(raw);

      expect(manifest.files).toHaveProperty(".cursor/rules/test.md");
      expect(manifest.owners).toEqual({});
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

      await writeDiagnosticManifest([fileA]);

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

      await writeDiagnosticManifest([existing, missing]);

      const manifest = await readManifest(tmpDir);
      expect(manifest).toBeDefined();
      expect(Object.keys(manifest!.files)).toHaveLength(1);
      expect(manifest!.files).toHaveProperty("existing.md");
    });
  });

  describe("writeOwnedManifest", () => {
    it("records every generated skill file under its provider", async () => {
      const entryPoint = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "company--review",
        "SKILL.md",
      );
      const supportFile = path.join(
        tmpDir,
        ".cursor",
        "skills",
        "company--review",
        "references",
        "checklist.md",
      );
      await outputFile(entryPoint, "# Review");
      await outputFile(supportFile, "# Checklist");

      await writeOwnedManifest(
        tmpDir,
        new Map([["cursor", [entryPoint, supportFile]]]),
        { preserveUnselected: false },
      );

      const manifest = await readManifest(tmpDir);
      expect(manifest?.owners?.cursor).toEqual([
        ".cursor/skills/company--review/SKILL.md",
        ".cursor/skills/company--review/references/checklist.md",
      ]);
      expect(Object.keys(manifest?.files ?? {})).toEqual(
        manifest?.owners?.cursor,
      );
    });

    it("preserves unselected hashes without blessing later edits", async () => {
      const cursorFile = path.join(tmpDir, ".cursor", "commands", "review.md");
      const codexFile = path.join(
        tmpDir,
        ".codex",
        "skills",
        "company--review",
        "SKILL.md",
      );
      await outputFile(cursorFile, "original cursor");
      await outputFile(codexFile, "original codex");
      await writeOwnedManifest(
        tmpDir,
        new Map([
          ["cursor", [cursorFile]],
          ["codex", [codexFile]],
        ]),
        { preserveUnselected: false },
      );
      const originalCursorHash = (await readManifest(tmpDir))?.files[
        ".cursor/commands/review.md"
      ];
      await outputFile(cursorFile, "edited cursor");
      await outputFile(codexFile, "updated codex");

      await writeOwnedManifest(tmpDir, new Map([["codex", [codexFile]]]), {
        preserveUnselected: true,
      });

      const manifest = await readManifest(tmpDir);
      expect(manifest?.owners?.cursor).toEqual([".cursor/commands/review.md"]);
      expect(manifest?.files[".cursor/commands/review.md"]).toBe(
        originalCursorHash,
      );
      expect(manifest?.files[".codex/skills/company--review/SKILL.md"]).toBe(
        await hashFile(codexFile),
      );
    });

    it("does not roll back a newer unselected structured receipt", async () => {
      const receipt = (
        relativePath: string,
        key: string,
        value: unknown,
      ): StructuredStateReceipts => ({
        [relativePath]: {
          format: "json",
          key_hashes: { [key]: hashSemanticValue(value) },
          array_slice_hashes: {},
        },
      });
      const cursorOld = receipt(".cursor/hooks.json", "hooks", ["old"]);
      const cursorFresh = receipt(".cursor/hooks.json", "hooks", ["fresh"]);
      const claudeFresh = receipt(".claude/settings.json", "permissions", {
        allow: [],
      });
      await writeOwnedManifest(tmpDir, new Map(), {
        preserveUnselected: false,
        replaceTools: ["cursor"],
        structuredOwners: { cursor: cursorOld },
      });
      const staleFilteredPublication = {
        preserveUnselected: true,
        replaceTools: ["claude"],
        structuredOwners: { cursor: cursorOld, claude: claudeFresh },
      };
      await writeOwnedManifest(tmpDir, new Map(), {
        preserveUnselected: true,
        replaceTools: ["cursor"],
        structuredOwners: { cursor: cursorFresh },
      });

      await writeOwnedManifest(tmpDir, new Map(), staleFilteredPublication);

      expect((await readManifest(tmpDir))?.structured_owners).toEqual({
        claude: claudeFresh,
        cursor: cursorFresh,
      });
    });

    it("preserves an incompatible unselected MCP receipt verbatim during filtered publication", async () => {
      const incompatibleOpenCodeReceipt: McpOwnership = {
        kind: "owned-keys",
        path: "opencode.json",
        format: "json",
        key_hashes: { mcp: hashSemanticValue({ tracker: {} }) },
      };
      await outputFile(
        getManifestPath(tmpDir),
        JSON.stringify({
          files: {},
          symlink_targets: {},
          owners: {},
          mcp_owners: { opencode: incompatibleOpenCodeReceipt },
          timestamp: new Date().toISOString(),
        }),
      );

      await writeOwnedManifest(tmpDir, new Map(), {
        preserveUnselected: true,
        replaceTools: ["claude"],
      });

      expect((await readManifest(tmpDir))?.mcp_owners?.opencode).toEqual(
        incompatibleOpenCodeReceipt,
      );
    });

    it("tracks config drift without granting exact-file deletion ownership", async () => {
      const cursorMcp = path.join(tmpDir, ".cursor", "mcp.json");
      const codexConfig = path.join(tmpDir, ".codex", "config.toml");
      await outputFile(cursorMcp, '{"mcpServers":{}}');
      await outputFile(codexConfig, 'model = "gpt-5"\n');

      await writeOwnedManifest(
        tmpDir,
        new Map([
          ["cursor", [cursorMcp]],
          ["codex", [codexConfig]],
        ]),
        { preserveUnselected: false },
      );

      const manifest = await readManifest(tmpDir);
      expect(manifest?.files).toHaveProperty(".cursor/mcp.json");
      expect(manifest?.files).toHaveProperty(".codex/config.toml");
      expect(manifest?.owners?.cursor).toBeUndefined();
      expect(manifest?.owners?.codex).toBeUndefined();
    });

    it("publishes no temporary manifest files", async () => {
      const file = path.join(tmpDir, ".cursor", "commands", "review.md");
      await outputFile(file, "content");

      await writeOwnedManifest(tmpDir, new Map([["cursor", [file]]]), {
        preserveUnselected: false,
      });

      expect(await readdir(path.join(tmpDir, ".agents"))).toEqual([
        ".sync-manifest.json",
      ]);
    });

    it.runIf(process.platform !== "win32")(
      "refuses manifest publication through an escaping .agents symlink",
      async () => {
        const externalDir = await mkdtemp(
          path.join(tmpdir(), "agentsync-manifest-external-"),
        );
        const externalManifest = path.join(externalDir, ".sync-manifest.json");
        const original = '{"sentinel":"outside"}\n';
        try {
          await outputFile(externalManifest, original);
          await rm(path.join(tmpDir, ".agents"), {
            recursive: true,
            force: true,
          });
          await symlink(externalDir, path.join(tmpDir, ".agents"), "dir");

          await expect(
            writeOwnedManifest(tmpDir, new Map(), {
              preserveUnselected: false,
            }),
          ).rejects.toBeInstanceOf(ConfigError);
          expect(await readFile(externalManifest, "utf-8")).toBe(original);
        } finally {
          await rm(externalDir, { recursive: true, force: true });
        }
      },
    );
  });

  describe("owned path validation", () => {
    it("does not promote a flat drift hash into provider ownership", async () => {
      const command = path.join(tmpDir, ".cursor", "commands", "review.md");
      await outputFile(command, "# Review\n");
      await writeDiagnosticManifest([command]);

      expect(
        await inspectManagedWrite(
          tmpDir,
          getToolProvider("cursor"),
          ".cursor/commands/review.md",
          await readManifest(tmpDir),
        ),
      ).toBe("unowned");
    });

    it("rejects root-level skill entries and orphan support files", async () => {
      const hash = `sha256:${"a".repeat(64)}`;
      const manifest = SyncManifestSchema.parse({
        files: {
          ".cursor/skills/SKILL.md": hash,
          ".cursor/skills/company--review/references/checklist.md": hash,
        },
        symlink_targets: {},
        owners: {
          cursor: [
            ".cursor/skills/SKILL.md",
            ".cursor/skills/company--review/references/checklist.md",
          ],
        },
        timestamp: new Date().toISOString(),
      });

      const validated = validatedOwnedFiles(
        tmpDir,
        getToolProvider("cursor"),
        manifest,
      );

      expect(validated.files).toEqual([]);
      expect(validated.rejected).toEqual(manifest.owners?.cursor);
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
      await writeDiagnosticManifest([file]);

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

    it("rejects a manifest missing the current receipt fields", async () => {
      await outputFile(
        getManifestPath(tmpDir),
        JSON.stringify({ files: {}, timestamp: new Date().toISOString() }),
      );

      expect(await readManifest(tmpDir)).toBeUndefined();
    });
  });
});
