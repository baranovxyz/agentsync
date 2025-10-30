/**
 * Tool Converters Registry Tests
 * Ensures that converters exist for all supported tools
 */

import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import {
  getConverterByName,
  getConvertersForTools,
} from "../../../src/targets/tools/index.js";

describe("Tool Converters Registry", () => {
  it("has converter for every supported tool", () => {
    for (const tool of SUPPORTED_TOOLS) {
      expect(() => getConverterByName(tool)).not.toThrow();
      const converter = getConverterByName(tool);
      expect(converter).toBeDefined();
      expect(converter).toHaveProperty("name");
      expect(converter).toHaveProperty("syncAgentsMd");
      expect(converter).toHaveProperty("syncRules");
      expect(converter).toHaveProperty("syncCommands");
      expect(converter).toHaveProperty("syncMCP");
      expect(converter).toHaveProperty("detect");
      expect(converter).toHaveProperty("importRules");
      expect(converter).toHaveProperty("importCommands");
      expect(converter).toHaveProperty("importMCP");
    }
  });

  it("getConvertersForTools returns converters for all supported tools", () => {
    const converters = getConvertersForTools([...SUPPORTED_TOOLS]);
    expect(converters).toHaveLength(SUPPORTED_TOOLS.length);

    for (const converter of converters) {
      expect(converter).toBeDefined();
      expect(converter).toHaveProperty("syncAgentsMd");
      expect(converter).toHaveProperty("syncRules");
      expect(converter).toHaveProperty("syncCommands");
      expect(converter).toHaveProperty("syncMCP");
      expect(converter).toHaveProperty("detect");
      expect(converter).toHaveProperty("importRules");
      expect(converter).toHaveProperty("importCommands");
      expect(converter).toHaveProperty("importMCP");
    }
  });

  it("each converter has required methods", () => {
    for (const tool of SUPPORTED_TOOLS) {
      const converter = getConverterByName(tool);

      // Verify converter has all required methods
      expect(typeof converter.syncAgentsMd).toBe("function");
      expect(typeof converter.syncRules).toBe("function");
      expect(typeof converter.syncCommands).toBe("function");
      expect(typeof converter.syncMCP).toBe("function");
      expect(typeof converter.detect).toBe("function");
      expect(typeof converter.importRules).toBe("function");
      expect(typeof converter.importCommands).toBe("function");
      expect(typeof converter.importMCP).toBe("function");
    }
  });

  it("converters are properly instantiated", () => {
    for (const tool of SUPPORTED_TOOLS) {
      const converter = getConverterByName(tool);

      // Verify it's an object (converter instance)
      expect(typeof converter).toBe("object");
      expect(converter).not.toBeNull();
    }
  });

  it("getConvertersForTools maintains order", () => {
    const toolOrder = ["cursor", "claude"] as const;
    const converters = getConvertersForTools([...toolOrder]);

    expect(converters).toHaveLength(2);
    expect(converters[0]).toBe(getConverterByName("cursor"));
    expect(converters[1]).toBe(getConverterByName("claude"));
  });

  it("handles single tool request", () => {
    const converters = getConvertersForTools(["cursor"]);

    expect(converters).toHaveLength(1);
    expect(converters[0]).toBe(getConverterByName("cursor"));
  });

  it("handles empty tools array", () => {
    const converters = getConvertersForTools([]);
    expect(converters).toHaveLength(0);
  });
});
