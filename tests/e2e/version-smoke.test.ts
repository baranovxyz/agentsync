/**
 * Version Command Smoke Tests (E2E)
 *
 * Exercises the prebuilt release artifact through npm's real pack path. The
 * package scripts build dist before Vitest starts, so this suite must never
 * rebuild dist while other built-CLI tests are reading it.
 */

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseJsonValidated,
  pathExists,
  readJsonValidated,
} from "../../src/utils/fs.js";

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const CLI_PATH = path.join(PACKAGE_ROOT, "dist", "cli.js");
const PACK_TIMEOUT_MS = 30_000;
const PACKAGE_DOCS = ["README.md", "CHANGELOG.md", "LICENSE"] as const;
const PACKAGE_RUNTIME_FILES = [
  "dist/cli.js",
  "templates/default.md",
  "templates/python-fastapi.md",
  "templates/typescript-react.md",
  "src/bundled-skills/agentsync-cli/SKILL.md",
  "src/bundled-skills/agentsync-migrate/SKILL.md",
] as const;

const PackageManifestSchema = z.object({
  version: z.string().min(1),
  files: z.array(z.string().min(1)),
});
const NpmPackOutputSchema = z
  .array(
    z.object({
      filename: z.string().min(1),
      files: z.array(
        z.object({
          path: z.string(),
          mode: z.number().int().optional(),
        }),
      ),
    }),
  )
  .length(1);

async function packPrebuiltArtifact(packDir: string): Promise<string> {
  const result = await execa(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
    {
      cwd: PACKAGE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: PACK_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      reject: false,
    },
  );

  if (result.failed) {
    throw new Error(
      `npm pack failed (exit ${result.exitCode ?? "unknown"}): ` +
        `stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  return result.stdout;
}

describe("Version Command E2E (Real-World Distribution)", () => {
  let version: string;
  let packagePath: string;
  let packedFiles: string[];
  let declaredFiles: string[];
  let packRoot: string | undefined;

  beforeAll(async () => {
    const cliStats = await stat(CLI_PATH);
    if (!cliStats.isFile()) {
      throw new Error(`Expected prebuilt CLI file at ${CLI_PATH}`);
    }

    const manifest = await readJsonValidated(
      path.join(PACKAGE_ROOT, "package.json"),
      PackageManifestSchema,
    );
    version = manifest.version;
    declaredFiles = manifest.files;

    packRoot = await mkdtemp(path.join(tmpdir(), "agentsync-pack-e2e-"));
    const output = parseJsonValidated(
      await packPrebuiltArtifact(packRoot),
      NpmPackOutputSchema,
    )[0];
    packagePath = path.join(packRoot, output.filename);
    packedFiles = output.files.map((file) => file.path);
  }, PACK_TIMEOUT_MS + 5_000);

  afterAll(async () => {
    if (packRoot) await rm(packRoot, { recursive: true, force: true });
  });

  it("packs the prebuilt executable into an isolated archive", async () => {
    const stats = await stat(packagePath);
    expect(stats.isFile()).toBe(true);
    expect(packedFiles).toEqual(expect.arrayContaining(PACKAGE_RUNTIME_FILES));
  });

  it("contains the package version", async () => {
    const manifest = await readJsonValidated(
      path.join(PACKAGE_ROOT, "package.json"),
      PackageManifestSchema,
    );
    expect(manifest.version).toBe(version);
  });

  it("declares the complete public release documentation set", () => {
    expect(declaredFiles).toEqual(expect.arrayContaining(PACKAGE_DOCS));
  });

  it("packs all release documents on a public-shaped source surface", async () => {
    const present = (
      await Promise.all(
        PACKAGE_DOCS.map(async (document) => ({
          document,
          exists: await pathExists(path.join(PACKAGE_ROOT, document)),
        })),
      )
    ).filter(({ exists }) => exists);
    expect([0, PACKAGE_DOCS.length]).toContain(present.length);
    for (const { document } of present) expect(packedFiles).toContain(document);
  });

  it("has an executable CLI file", async () => {
    const stats = await stat(CLI_PATH);
    expect(stats.isFile()).toBe(true);
    if (process.platform !== "win32") {
      expect(stats.mode & 0o111).toBe(0o111);
    }
  });

  it("has the Node shebang", async () => {
    const firstLine = (await readFile(CLI_PATH, "utf-8")).split("\n")[0];
    expect(firstLine).toBe("#!/usr/bin/env node");
  });
});
