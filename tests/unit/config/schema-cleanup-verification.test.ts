import { describe, expect, it } from "vitest";
import { AgentSyncConfigSchema } from "../../../src/types/schemas.js";

describe("Schema Cleanup Verification", () => {
  it("does not accept security field", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
      tools: ["claude"],
      security: { secretScanning: { enabled: true } },
    });
    // Zod strips unknown fields — security should not appear in parsed output
    if (result.success) {
      expect(result.data).not.toHaveProperty("security");
    }
  });

  it("does not accept useSymlinks field", () => {
    const result = AgentSyncConfigSchema.safeParse({
      version: "1.0",
      tools: ["claude"],
      useSymlinks: true,
    });
    if (result.success) {
      expect(result.data).not.toHaveProperty("useSymlinks");
    }
  });
});
