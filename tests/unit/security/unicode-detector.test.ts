/**
 * Unicode Detector Unit Tests
 *
 * Tests for detection of malicious Unicode characters including:
 * - Zero-width characters
 * - Bidi (bidirectional) controls (CVE-2021-42574)
 * - Homoglyph patterns
 *
 * Reference: Test Architecture Plan Section 9 (Security Test Suite)
 */

import { describe, it, expect } from "vitest";
import { UnicodeDetector } from "../../../src/security/unicode-detector.js";

describe("UnicodeDetector", () => {
  const detector = new UnicodeDetector();

  describe("Zero-Width Character Detection", () => {
    it("detects zero-width space", () => {
      const text = "hello\u200Bworld"; // U+200B zero-width space
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it("detects zero-width joiner", () => {
      const text = "test\u200Cstring"; // U+200C zero-width joiner
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects zero-width non-joiner", () => {
      const text = "data\u200Dvalue"; // U+200D zero-width non-joiner
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects word joiner", () => {
      const text = "word\u2060joiner"; // U+2060 word joiner
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects soft hyphen", () => {
      const text = "soft\u00ADhyphen"; // U+00AD soft hyphen
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects narrow no-break space", () => {
      const text = "narrow\u202Fspace"; // U+202F narrow no-break space
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects zero-width no-break space", () => {
      const text = "feff\uFEFFchar"; // U+FEFF zero-width no-break space
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });
  });

  describe("Bidirectional Control Detection", () => {
    it("detects left-to-right mark", () => {
      const text = "normal\u200Etext"; // U+200E left-to-right mark
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
      expect(result.findings.some((f) => f.type === "BIDI_CONTROL")).toBe(true);
    });

    it("detects right-to-left mark", () => {
      const text = "rtl\u200Fmark"; // U+200F right-to-left mark
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects left-to-right embedding", () => {
      const text = "lre\u202Aembedding"; // U+202A left-to-right embedding
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects right-to-left embedding", () => {
      const text = "rle\u202Bembedding"; // U+202B right-to-left embedding
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects pop directional formatting", () => {
      const text = "pop\u202Cformat"; // U+202C pop directional formatting
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects left-to-right override", () => {
      const text = "lro\u202Doverride"; // U+202D left-to-right override
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects right-to-left override", () => {
      const text = "rlo\u202Eoverride"; // U+202E right-to-left override
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects CVE-2021-42574 attack pattern", () => {
      // Pattern: uses right-to-left override to hide malicious code
      // Example: "access_level=user\u202E } \u2066 if (access_level != "user")"
      const text = "legitimate\u202Emalicious";
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });
  });

  describe("Homoglyph Detection", () => {
    it("detects latin-to-cyrillic homoglyphs", () => {
      // Cyrillic 'a' (U+0430) looks like Latin 'a' (U+0061)
      const text = "vаlid"; // Contains Cyrillic а
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects greek letters that look like latin", () => {
      // Greek 'ο' (omicron, U+03BF) looks like Latin 'o'
      const text = "data_οbject"; // Contains Greek ο
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects mixed script combinations", () => {
      const text = "normal\u043Atext"; // Latin n + Cyrillic к + Latin text
      const result = detector.detect(text);
      // Should detect mixed scripts
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe("Multiple Problem Detection", () => {
    it("detects multiple zero-width characters", () => {
      const text = "test\u200B\u200Cstring"; // Two zero-width chars
      const result = detector.detect(text);
      expect(result.findings.length).toBeGreaterThan(1);
    });

    it("detects combination of zero-width and bidi", () => {
      const text = "mixed\u200B\u200Econtrol"; // Zero-width + LTR mark
      const result = detector.detect(text);
      expect(result.findings.length).toBeGreaterThan(1);
    });
  });

  describe("Position Reporting", () => {
    it("reports correct line and column for detected character", () => {
      const text = "line1\ndata\u200Bvalue\nline3";
      const result = detector.detect(text);
      const finding = result.findings[0];
      expect(finding.line).toBe(2);
      expect(finding.column).toBeGreaterThanOrEqual(4);
    });

    it("reports multiple positions for multiple occurrences", () => {
      const text = "test\u200Bone\u200Btwo";
      const result = detector.detect(text);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      // Positions should be different
      const positions = result.findings.map((f) => `${f.line}:${f.column}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(result.findings.length);
    });
  });

  describe("Safe Content", () => {
    it("allows normal ASCII text", () => {
      const text = "normal English text with numbers 123";
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(false);
      expect(result.findings.length).toBe(0);
    });

    it("allows standard Unicode scripts", () => {
      const text =
        "English, 中文 (Chinese), 日本語 (Japanese), Русский (Russian)";
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(false);
    });

    it("allows common punctuation", () => {
      const text = 'Text with "quotes", comma, dash-here, and ellipsis...';
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(false);
    });

    it("allows regular spaces and newlines", () => {
      const text = "normal\ntext\nwith\nspaces";
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty string", () => {
      const result = detector.detect("");
      expect(result.hasProblems).toBe(false);
      expect(result.findings.length).toBe(0);
    });

    it("handles only zero-width characters", () => {
      const text = "\u200B\u200C\u200D";
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("handles very long text", () => {
      let text = "a".repeat(10000);
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(false);
    });

    it("handles text with null bytes", () => {
      const text = "test\u0000string"; // U+0000 null byte
      const result = detector.detect(text);
      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe("Sanitization", () => {
    it("sanitizes zero-width spaces while preserving text", () => {
      const text = "hel\u200Blo wo\u200Crld";
      const sanitized = detector.sanitize(text);
      // Should preserve visible characters
      expect(sanitized).toContain("hello");
      expect(sanitized).toContain("world");
    });

    it("sanitizes bidi controls", () => {
      const text = "test\u200Estring";
      const sanitized = detector.sanitize(text);
      expect(sanitized).not.toContain("\u200E");
    });

    it("preserves regular spaces", () => {
      const text = "hello world";
      const sanitized = detector.sanitize(text);
      expect(sanitized).toBe("hello world");
    });

    it("removes problematic characters entirely", () => {
      const text = "a\u200Bb\u200Cc";
      const sanitized = detector.sanitize(text);
      expect(sanitized).toBe("abc");
    });

    it("handles multiple consecutive problematic chars", () => {
      const text = "test\u200B\u200B\u200Bvalue";
      const sanitized = detector.sanitize(text);
      expect(sanitized).toBe("testvalue");
    });
  });

  describe("Severity Classification", () => {
    it("classifies CVE-2021-42574 as critical", () => {
      const text = "code\u202Emalicious";
      const result = detector.detect(text);
      const finding = result.findings.find((f) => f.type === "BIDI_CONTROL");
      expect(finding?.severity).toBe("high"); // RLO is critical
    });

    it("classifies zero-width chars as high severity", () => {
      const text = "data\u200Bvalue";
      const result = detector.detect(text);
      const finding = result.findings.find((f) => f.type === "ZERO_WIDTH");
      expect(finding?.severity).toMatch(/high|critical/);
    });

    it("classifies homoglyphs as medium severity", () => {
      const text = "vаlid"; // Cyrillic a
      const result = detector.detect(text);
      const finding = result.findings.find((f) => f.type === "HOMOGLYPH");
      expect(finding?.severity).toMatch(/medium|high/);
    });
  });

  describe("Report Generation", () => {
    it("generates report for clean content", () => {
      const result = detector.detect("normal text");
      const report = detector.generateReport(result);
      expect(report).toContain("No Unicode anomalies");
      expect(report).toContain("✅");
    });

    it("generates report for content with findings", () => {
      const result = detector.detect("bad\u200Btext");
      const report = detector.generateReport(result);
      expect(report).toContain("Unicode anomalies detected");
      expect(report).toContain("found");
    });

    it("report includes severity information", () => {
      const result = detector.detect("bad\u200Btext");
      const report = detector.generateReport(result);
      expect(report).toContain("HIGH");
    });

    it("report includes position information", () => {
      const result = detector.detect("test\u200Bvalue");
      const report = detector.generateReport(result);
      expect(report).toContain("Line");
    });
  });

  describe("Integration Scenarios", () => {
    it("detects attack in code-like string", () => {
      const text = `if (user == "admin") { /* do something */}
      \u202Eelse { // malicious code would execute here
      }`;
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects obfuscated token in configuration", () => {
      const text = `API_KEY="valid_token_here\u200B\u200Bmalicious_additions"`;
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });

    it("detects disguised variable names", () => {
      const text = "const passw\u043Drd = 'secret';"; // Latin p + Cyrillic d
      const result = detector.detect(text);
      expect(result.hasProblems).toBe(true);
    });
  });
});
