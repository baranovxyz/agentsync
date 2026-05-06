import { describe, expect, it } from "vitest";
import { filterChangedSubtrees } from "../../../src/core/monorepo.js";

describe("filterChangedSubtrees", () => {
  const root = "/repo";

  it("detects root .agents changes", () => {
    const subtrees = ["/repo", "/repo/frontend"];
    const changed = [".agents/skills/security.md", "README.md"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    // Root changed, so both root and frontend (child) need sync
    expect(result).toEqual(["/repo", "/repo/frontend"]);
  });

  it("detects team .agents changes without affecting siblings", () => {
    const subtrees = ["/repo", "/repo/frontend", "/repo/backend"];
    const changed = ["frontend/.agents/agentsync.toml"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    expect(result).toEqual(["/repo/frontend"]);
  });

  it("detects multiple changed subtrees", () => {
    const subtrees = ["/repo", "/repo/frontend", "/repo/backend"];
    const changed = [".agents/agentsync.toml", "backend/.agents/skills/go.md"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    // Root changed = all children need sync. Backend also directly changed.
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

  it("team change cascades to nested children only", () => {
    const subtrees = [
      "/repo",
      "/repo/frontend",
      "/repo/frontend/packages/ui",
      "/repo/backend",
    ];
    const changed = ["frontend/.agents/skills/react.md"];
    const result = filterChangedSubtrees(subtrees, changed, root);
    // frontend changed, so frontend and its child ui need sync, but not root or backend
    expect(result).toEqual(["/repo/frontend", "/repo/frontend/packages/ui"]);
  });
});
