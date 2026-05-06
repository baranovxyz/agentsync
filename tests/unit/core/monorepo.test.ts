import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  filterChangedSubtrees,
  findAgentsSubtrees,
} from "../../../src/core/monorepo.js";

describe("findAgentsSubtrees", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agentsync-monorepo-"));
    await mkdir(join(root, ".git"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds all .agents directories in repo", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(join(root, ".agents", "agentsync.toml"), "");
    await mkdir(join(root, "frontend", ".agents"), { recursive: true });
    await writeFile(join(root, "frontend", ".agents", "agentsync.toml"), "");
    await mkdir(join(root, "backend", ".agents"), { recursive: true });
    await writeFile(join(root, "backend", ".agents", "agentsync.toml"), "");

    const subtrees = await findAgentsSubtrees(root);
    expect(subtrees).toHaveLength(3);
    expect(subtrees).toContain(root);
    expect(subtrees).toContain(join(root, "frontend"));
    expect(subtrees).toContain(join(root, "backend"));
  });

  it("finds nested subtrees", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(join(root, ".agents", "agentsync.toml"), "");
    await mkdir(join(root, "frontend", "packages", "ui", ".agents"), {
      recursive: true,
    });
    await writeFile(
      join(root, "frontend", "packages", "ui", ".agents", "agentsync.toml"),
      "",
    );

    const subtrees = await findAgentsSubtrees(root);
    expect(subtrees).toHaveLength(2);
  });

  it("skips node_modules", async () => {
    await mkdir(join(root, ".agents"), { recursive: true });
    await writeFile(join(root, ".agents", "agentsync.toml"), "");
    await mkdir(join(root, "node_modules", "pkg", ".agents"), {
      recursive: true,
    });
    await writeFile(
      join(root, "node_modules", "pkg", ".agents", "agentsync.toml"),
      "",
    );

    const subtrees = await findAgentsSubtrees(root);
    expect(subtrees).toHaveLength(1);
  });
});

describe("filterChangedSubtrees", () => {
  const root = "/repo";

  it("detects root .agents changes", () => {
    const subtrees = ["/repo", "/repo/frontend"];
    const changed = [".agents/skills/security.md", "README.md"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual(["/repo", "/repo/frontend"]);
  });

  it("detects team .agents changes", () => {
    const subtrees = ["/repo", "/repo/frontend", "/repo/backend"];
    const changed = ["frontend/.agents/agentsync.toml"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual(["/repo/frontend"]);
  });

  it("detects multiple changed subtrees", () => {
    const subtrees = ["/repo", "/repo/frontend", "/repo/backend"];
    const changed = [".agents/agentsync.toml", "backend/.agents/skills/go.md"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual(["/repo", "/repo/frontend", "/repo/backend"]);
  });

  it("returns empty when no .agents files changed", () => {
    const subtrees = ["/repo", "/repo/frontend"];
    const changed = ["src/index.ts", "package.json"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual([]);
  });

  it("cascades parent changes to child subtrees", () => {
    const subtrees = ["/repo", "/repo/frontend", "/repo/frontend/packages/ui"];
    const changed = [".agents/agentsync.toml"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual([
      "/repo",
      "/repo/frontend",
      "/repo/frontend/packages/ui",
    ]);
  });
});
