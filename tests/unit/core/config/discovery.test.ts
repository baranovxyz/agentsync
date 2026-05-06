import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverConfigChain } from "../../../../src/core/config/discovery.js";

describe("discoverConfigChain", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agentsync-discovery-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns single config at root", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      '[agentsync]\nversion = "1.0"\n',
    );
    await mkdir(join(root, ".git"));

    const chain = await discoverConfigChain(root);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe(join(root, ".agents", "agentsync.toml"));
  });

  it("returns chain ordered from most-specific to root", async () => {
    await mkdir(join(root, ".git"));
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      '[agentsync]\nversion = "1.0"\n',
    );

    const teamDir = join(root, "frontend");
    await mkdir(join(teamDir, ".agents"), { recursive: true });
    await writeFile(
      join(teamDir, ".agents", "agentsync.toml"),
      '[agentsync]\nversion = "1.0"\n',
    );

    const serviceDir = join(root, "frontend", "packages", "checkout");
    await mkdir(join(serviceDir, ".agents"), { recursive: true });
    await writeFile(
      join(serviceDir, ".agents", "agentsync.toml"),
      '[agentsync]\nversion = "1.0"\n',
    );

    const chain = await discoverConfigChain(serviceDir);
    expect(chain).toEqual([
      join(serviceDir, ".agents", "agentsync.toml"),
      join(teamDir, ".agents", "agentsync.toml"),
      join(root, ".agents", "agentsync.toml"),
    ]);
  });

  it("stops at git root", async () => {
    await mkdir(join(root, ".git"));
    const subDir = join(root, "sub");
    await mkdir(join(subDir, ".agents"), { recursive: true });
    await writeFile(
      join(subDir, ".agents", "agentsync.toml"),
      '[agentsync]\nversion = "1.0"\n',
    );

    const chain = await discoverConfigChain(subDir);
    expect(chain).toHaveLength(1);
  });

  it("returns empty array when no configs found", async () => {
    await mkdir(join(root, ".git"));
    const chain = await discoverConfigChain(root);
    expect(chain).toEqual([]);
  });

  it("discovers TOML config at project root", async () => {
    await mkdir(join(root, ".git"));
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(
      join(root, ".agents", "agentsync.toml"),
      'tools = ["cursor"]\n',
    );

    const chain = await discoverConfigChain(root);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe(join(root, ".agents", "agentsync.toml"));
  });
});
