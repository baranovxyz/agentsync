import { describe, expect, it } from "vitest";
import { Merger } from "../../../../src/core/registry/merger.js";
import type { Preset } from "../../../../src/types/preset.js";

describe("Merger", () => {
  const merger = new Merger();

  describe("merge", () => {
    it("merges presets with namespaces", () => {
      const preset1: Preset = {
        source: "github:company/base",
        namespace: "company",
        path: "/cache/company",
        commands: new Map([["commit.md", "content1"]]),
        rules: new Map([["typescript.md", "rules1"]]),
        mcps: { github: { command: "npx", args: [] } },
      };

      const preset2: Preset = {
        source: "github:team/standards",
        namespace: "team",
        path: "/cache/team",
        commands: new Map([["commit.md", "content2"]]),
        rules: new Map([["api.md", "rules2"]]),
        mcps: { postgres: { command: "npx", args: [] } },
      };

      const merged = merger.merge([preset1, preset2]);

      // Commands are namespaced
      expect(merged.commands.get("company:commit.md")).toBe("content1");
      expect(merged.commands.get("team:commit.md")).toBe("content2");

      // Rules are namespaced
      expect(merged.rules.get("company:typescript.md")).toBe("rules1");
      expect(merged.rules.get("team:api.md")).toBe("rules2");

      // MCPs are merged (no namespace)
      expect(merged.mcps).toEqual({
        github: { command: "npx", args: [] },
        postgres: { command: "npx", args: [] },
      });
    });

    it("merges empty presets", () => {
      const preset: Preset = {
        source: "github:company/empty",
        namespace: "company",
        path: "/cache/company",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      const merged = merger.merge([preset]);

      expect(merged.commands.size).toBe(0);
      expect(merged.rules.size).toBe(0);
      expect(Object.keys(merged.mcps).length).toBe(0);
    });

    it("last-wins for MCPs with same name", () => {
      const preset1: Preset = {
        source: "github:org1/repo1",
        namespace: "org1",
        path: "/cache/org1",
        commands: new Map(),
        rules: new Map(),
        mcps: { github: { command: "npx", args: ["--version", "1"] } },
      };

      const preset2: Preset = {
        source: "github:org2/repo2",
        namespace: "org2",
        path: "/cache/org2",
        commands: new Map(),
        rules: new Map(),
        mcps: { github: { command: "node", args: ["--version", "2"] } },
      };

      const merged = merger.merge([preset1, preset2]);

      // Last preset wins
      expect(merged.mcps.github).toEqual({
        command: "node",
        args: ["--version", "2"],
      });
    });

    it("handles multiple files in same namespace", () => {
      const preset: Preset = {
        source: "github:company/standards",
        namespace: "company",
        path: "/cache/company",
        commands: new Map([
          ["commit.md", "commit content"],
          ["test.md", "test content"],
          ["deploy.md", "deploy content"],
        ]),
        rules: new Map([
          ["typescript.md", "ts rules"],
          ["python.md", "py rules"],
        ]),
        mcps: {},
      };

      const merged = merger.merge([preset]);

      expect(merged.commands.size).toBe(3);
      expect(merged.commands.get("company:commit.md")).toBe("commit content");
      expect(merged.commands.get("company:test.md")).toBe("test content");
      expect(merged.commands.get("company:deploy.md")).toBe("deploy content");

      expect(merged.rules.size).toBe(2);
      expect(merged.rules.get("company:typescript.md")).toBe("ts rules");
      expect(merged.rules.get("company:python.md")).toBe("py rules");
    });
  });

  describe("validateNoCollisions", () => {
    it("passes when all namespaces are unique", () => {
      const preset1: Preset = {
        source: "github:org1/repo1",
        namespace: "org1",
        path: "/cache/org1",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      const preset2: Preset = {
        source: "github:org2/repo2",
        namespace: "org2",
        path: "/cache/org2",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      expect(() =>
        merger.validateNoCollisions([preset1, preset2]),
      ).not.toThrow();
    });

    it("throws when namespaces collide", () => {
      const preset1: Preset = {
        source: "github:company/repo1",
        namespace: "company",
        path: "/cache/company1",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      const preset2: Preset = {
        source: "github:company/repo2",
        namespace: "company",
        path: "/cache/company2",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      expect(() => merger.validateNoCollisions([preset1, preset2])).toThrow(
        "collision",
      );
    });

    it("passes with single preset", () => {
      const preset: Preset = {
        source: "github:company/repo",
        namespace: "company",
        path: "/cache/company",
        commands: new Map(),
        rules: new Map(),
        mcps: {},
      };

      expect(() => merger.validateNoCollisions([preset])).not.toThrow();
    });

    it("passes with empty array", () => {
      expect(() => merger.validateNoCollisions([])).not.toThrow();
    });
  });
});
