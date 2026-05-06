import { describe, expect, it } from "vitest";
import {
  sanitizeContent,
  sanitizeMcpConfig,
} from "../../../src/utils/sanitize.js";

describe("sanitizeContent", () => {
  it("passes clean markdown through unchanged", () => {
    const input = "# Hello\n\nSome **markdown** content.\n";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe(input);
    expect(warnings).toEqual([]);
  });

  it("preserves tabs, newlines, and carriage returns", () => {
    const input = "line1\n\tindented\r\nwindows-line\n";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe(input);
    expect(warnings).toEqual([]);
  });

  it("strips null bytes", () => {
    const input = "hello\x00world";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe("helloworld");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("control characters");
  });

  it("strips control characters below 0x20", () => {
    // \x01 (SOH), \x07 (BEL), \x1F (US)
    const input = "a\x01b\x07c\x1Fd";
    const { content } = sanitizeContent(input);
    expect(content).toBe("abcd");
  });

  it("strips ANSI escape sequences", () => {
    const input = "\x1b[31mred text\x1b[0m normal";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe("red text normal");
    expect(warnings.some((w) => w.includes("ANSI"))).toBe(true);
  });

  it("strips bidi override characters", () => {
    // U+202A (LRE), U+202E (RLO)
    const input = "hello\u202Aworld\u202E";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe("helloworld");
    expect(warnings.some((w) => w.includes("Unicode"))).toBe(true);
  });

  it("strips bidi isolate characters", () => {
    // U+2066 (LRI), U+2069 (PDI)
    const input = "hello\u2066world\u2069";
    const { content } = sanitizeContent(input);
    expect(content).toBe("helloworld");
  });

  it("strips zero-width characters", () => {
    // U+200B (ZWS), U+200D (ZWJ), U+FEFF (BOM)
    const input = "hello\u200Bworld\u200D\uFEFF";
    const { content } = sanitizeContent(input);
    expect(content).toBe("helloworld");
  });

  it("strips LRM and RLM markers", () => {
    // U+200E (LRM), U+200F (RLM)
    const input = "hello\u200Eworld\u200F";
    const { content } = sanitizeContent(input);
    expect(content).toBe("helloworld");
  });

  it("strips Tag Block characters (U+E0001-E007F)", () => {
    // U+E0001 = surrogate pair \uDB40\uDC01, U+E007F = \uDB40\uDC7F
    const input = "hello\uDB40\uDC01world\uDB40\uDC7F";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe("helloworld");
    expect(warnings.some((w) => w.includes("Unicode"))).toBe(true);
  });

  it("truncates content exceeding maxLength", () => {
    const input = "a".repeat(200);
    const { content, warnings } = sanitizeContent(input, { maxLength: 100 });
    expect(content).toHaveLength(100);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("truncated");
    expect(warnings[0]).toContain("200");
    expect(warnings[0]).toContain("100");
  });

  it("includes source in warning messages", () => {
    const input = "hello\x00world";
    const { warnings } = sanitizeContent(input, {
      source: "github:acme/rules/typescript.md",
    });
    expect(warnings[0]).toContain("github:acme/rules/typescript.md");
  });

  it("handles empty content", () => {
    const { content, warnings } = sanitizeContent("");
    expect(content).toBe("");
    expect(warnings).toEqual([]);
  });

  it("handles content with only valid markdown special characters", () => {
    const input =
      "# Title\n\n```typescript\nconst x = 1;\n```\n\n> blockquote\n\n- list\n";
    const { content, warnings } = sanitizeContent(input);
    expect(content).toBe(input);
    expect(warnings).toEqual([]);
  });

  it("accumulates multiple warning types", () => {
    // Content with both control chars and ANSI escapes
    const input = "hello\x00\x1b[31mworld\x1b[0m";
    const { warnings } = sanitizeContent(input);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("uses default 100KB maxLength", () => {
    const input = "a".repeat(100 * 1024 + 1);
    const { content, warnings } = sanitizeContent(input);
    expect(content).toHaveLength(100 * 1024);
    expect(warnings).toHaveLength(1);
  });
});

describe("sanitizeMcpConfig", () => {
  it("passes clean config through unchanged", () => {
    const input = {
      command: "npx",
      args: ["-y", "server"],
      env: { KEY: "val" },
    };
    const { config, warnings } = sanitizeMcpConfig(input, "test");
    expect(config).toEqual(input);
    expect(warnings).toEqual([]);
  });

  it("strips control characters from command", () => {
    const input = { command: "npx\x00", args: [] };
    const { config, warnings } = sanitizeMcpConfig(input, "test");
    expect(config.command).toBe("npx");
    expect(warnings.some((w) => w.includes("control characters"))).toBe(true);
  });

  it("strips ANSI from args", () => {
    const input = { command: "node", args: ["\x1b[31m./server.js\x1b[0m"] };
    const { config, warnings } = sanitizeMcpConfig(input, "test");
    expect((config.args as string[])[0]).toBe("./server.js");
    expect(warnings.some((w) => w.includes("ANSI"))).toBe(true);
  });

  it("strips dangerous Unicode from env values", () => {
    const input = { command: "node", args: [], env: { TOKEN: "abc\u202Edef" } };
    const { config, warnings } = sanitizeMcpConfig(input, "test");
    expect((config.env as Record<string, string>).TOKEN).toBe("abcdef");
    expect(warnings.some((w) => w.includes("Unicode"))).toBe(true);
  });

  it("handles URL-based config without command/args", () => {
    const input = { url: "https://example.com/mcp" };
    const { config, warnings } = sanitizeMcpConfig(input, "test");
    expect(config).toEqual(input);
    expect(warnings).toEqual([]);
  });

  it("includes source in warnings", () => {
    const input = { command: "npx\x00" };
    const { warnings } = sanitizeMcpConfig(input, "mcp.github");
    expect(warnings[0]).toContain("mcp.github");
  });
});
