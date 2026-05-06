import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

export interface PresetFixtureSkill {
  name: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}

export interface PresetFixtureFile {
  name: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}

export interface PresetFixtureOptions {
  skills?: PresetFixtureSkill[];
  commands?: PresetFixtureFile[];
  agents?: PresetFixtureFile[];
}

function buildFrontmatter(fm: Record<string, unknown>): string {
  const lines = Object.entries(fm).map(
    ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
  );
  return `---\n${lines.join("\n")}\n---`;
}

export async function createPresetFixture(
  options: PresetFixtureOptions = {},
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "agentsync-preset-fixture-"));

  for (const skill of options.skills ?? []) {
    const skillDir = path.join(dir, "skills", skill.name);
    await mkdir(skillDir, { recursive: true });
    const fm = skill.frontmatter ?? { description: `${skill.name} skill` };
    const header = buildFrontmatter(fm);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      `${header}\n\n${skill.content}`,
    );
  }

  for (const cmd of options.commands ?? []) {
    await mkdir(path.join(dir, "commands"), { recursive: true });
    const fm = cmd.frontmatter ?? { description: `${cmd.name} command` };
    const header = buildFrontmatter(fm);
    await writeFile(
      path.join(dir, "commands", `${cmd.name}.md`),
      `${header}\n\n${cmd.content}`,
    );
  }

  for (const agent of options.agents ?? []) {
    await mkdir(path.join(dir, "agents"), { recursive: true });
    const fm = agent.frontmatter ?? { description: `${agent.name} agent` };
    const header = buildFrontmatter(fm);
    await writeFile(
      path.join(dir, "agents", `${agent.name}.md`),
      `${header}\n\n${agent.content}`,
    );
  }

  return dir;
}
