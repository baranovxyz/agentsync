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

    it("parses a named ref", () => {
      expect(parser.parse("github:company/standards@v1.0.0")).toEqual({
        org: "company",
        repo: "standards",
        ref: "v1.0.0",
      });
    });

    it("parses a slash-containing branch ref", () => {
      expect(
        parser.parse("github:company/standards@feature/source-parser"),
      ).toEqual({
        org: "company",
        repo: "standards",
        ref: "feature/source-parser",
      });
    });

    it("preserves punctuation in a ref", () => {
      expect(
        parser.parse("github:company/standards@release/2026.08+build-1"),
      ).toEqual({
        org: "company",
        repo: "standards",
        ref: "release/2026.08+build-1",
      });
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
      expect(() => parser.parse("github:/repo")).toThrow("Format:");
    });

    it("errors on empty repo", () => {
      expect(() => parser.parse("github:company/")).toThrow("Format:");
    });

    it("errors on an empty ref", () => {
      expect(() => parser.parse("github:company/standards@")).toThrow(
        "Format:",
      );
    });
  });
});
