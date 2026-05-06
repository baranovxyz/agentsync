import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import { getToolProvider } from "../../../src/tools/index.js";

describe("ToolProvider interface", () => {
  for (const tool of SUPPORTED_TOOLS) {
    it(`${tool} has capabilities object`, () => {
      const p = getToolProvider(tool);
      expect(p.capabilities).toBeDefined();
      expect(typeof p.capabilities.skills).toBe("boolean");
      expect(typeof p.capabilities.commands).toBe("boolean");
      expect(typeof p.capabilities.agents).toBe("boolean");
      expect(typeof p.capabilities.mcpStdio).toBe("boolean");
      expect(typeof p.capabilities.mcpHttp).toBe("boolean");
      expect(typeof p.capabilities.nativeAgentsMd).toBe("boolean");
      expect(typeof p.capabilities.nativeSkillsDiscovery).toBe("boolean");
    });

    it(`${tool} has readsAgentsDir boolean`, () => {
      const p = getToolProvider(tool);
      expect(typeof p.readsAgentsDir).toBe("boolean");
    });

    it(`${tool} has agentFileExtension string`, () => {
      const p = getToolProvider(tool);
      expect(typeof p.agentFileExtension).toBe("string");
      expect([".md", ".agent.md"]).toContain(p.agentFileExtension);
    });
  }
});
