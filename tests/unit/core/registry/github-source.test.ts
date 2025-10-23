import { describe, expect, it } from "vitest";
import { GitHubSourceParser } from "../../../../src/core/registry/github-source.js";

describe("GitHubSourceParser", () => {
  const parser = new GitHubSourceParser();

  describe("parse", () => {
    it("parses github:org/repo", () => {
      const result = parser.parse("github:company/standards");
      expect(result).toEqual({
        org: "company",
        repo: "standards",
        ref: "main",
      });
    });

    it("parses github:org/repo@main", () => {
      const result = parser.parse("github:company/standards@main");
      expect(result).toEqual({
        org: "company",
        repo: "standards",
        ref: "main",
      });
    });

    it("parses org with hyphens", () => {
      const result = parser.parse("github:acme-corp/backend-rules");
      expect(result).toEqual({
        org: "acme-corp",
        repo: "backend-rules",
        ref: "main",
      });
    });

    it("errors on non-main ref", () => {
      expect(() => parser.parse("github:company/standards@v1.0.0")).toThrow(
        "not supported",
      );
    });

    it("errors when missing github: prefix", () => {
      expect(() => parser.parse("company/standards")).toThrow(
        'Must start with "github:"',
      );
    });

    it("errors on invalid format (no slash)", () => {
      expect(() => parser.parse("github:company")).toThrow(
        "Format: github:org/repo",
      );
    });

    it("errors on invalid format (too many slashes)", () => {
      expect(() => parser.parse("github:company/repo/extra")).toThrow(
        "Format: github:org/repo",
      );
    });

    it("errors on empty org", () => {
      expect(() => parser.parse("github:/repo")).toThrow(
        "Both org and repo required",
      );
    });

    it("errors on empty repo", () => {
      expect(() => parser.parse("github:company/")).toThrow(
        "Both org and repo required",
      );
    });
  });

  describe("toString", () => {
    it("converts source to string", () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      expect(parser.toString(source)).toBe("github:company/standards@main");
    });

    it("handles hyphens in names", () => {
      const source = { org: "acme-corp", repo: "backend-rules", ref: "main" };
      expect(parser.toString(source)).toBe(
        "github:acme-corp/backend-rules@main",
      );
    });
  });

  describe("toCacheKey", () => {
    it("generates filesystem-safe cache key", () => {
      const source = { org: "company", repo: "standards", ref: "main" };
      expect(parser.toCacheKey(source)).toBe("github-company-standards");
    });

    it("handles hyphens in names", () => {
      const source = { org: "acme-corp", repo: "backend-rules", ref: "main" };
      expect(parser.toCacheKey(source)).toBe("github-acme-corp-backend-rules");
    });
  });
});
