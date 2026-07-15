import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CliResultSchema, SyncDataSchema } from "../../src/types/output.js";

const cliSkillPath = new URL(
  "../../src/bundled-skills/agentsync-cli/SKILL.md",
  import.meta.url,
);
const migrateSkillPath = new URL(
  "../../src/bundled-skills/agentsync-migrate/SKILL.md",
  import.meta.url,
);

describe("bundled public skills", () => {
  it("keeps the documented sync JSON example on the v1 envelope", async () => {
    const source = await readFile(cliSkillPath, "utf8");
    const match = source.match(
      /## Interpreting --json Output[\s\S]*?```json\n([\s\S]*?)\n```/u,
    );
    const json = match?.[1];
    expect(json).toBeDefined();
    if (json === undefined) return;

    const parsed: unknown = JSON.parse(json);
    const envelope = CliResultSchema.parse(parsed);
    expect(envelope.command).toBe("sync");
    expect(SyncDataSchema.safeParse(envelope.data).success).toBe(true);
  });

  it("documents the skill directory layout consumed by sync", async () => {
    const source = await readFile(migrateSkillPath, "utf8");
    expect(source).toContain(".agents/skills/<name>/SKILL.md");
    expect(source).toContain(
      "Flat files directly under `.agents/skills/` are skipped",
    );
    expect(source).not.toContain(".agents/skills/*.md");
  });
});
