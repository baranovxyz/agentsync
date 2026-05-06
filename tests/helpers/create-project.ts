/**
 * TestProject builder — shared setup for integration tests
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { ensureDir, outputFile } from "../../src/utils/fs.js";

export interface TestProject {
  dir: string;
  cleanup(): Promise<void>;
  addSkill(name: string, content?: string): Promise<void>;
  addCommand(name: string, content?: string): Promise<void>;
  addAgent(name: string, content?: string): Promise<void>;
  addDocs(content?: string): Promise<void>;
  setConfig(toml: string): Promise<void>;
  addPresetSkill(
    namespace: string,
    name: string,
    content?: string,
  ): Promise<string>;
  getPresetMap(): Map<string, string[]>;
}

export async function createTestProject(
  tools?: string[],
): Promise<TestProject> {
  const dir = await mkdtemp(path.join(tmpdir(), "agentsync-test-"));
  const agentsDir = path.join(dir, ".agents");
  const presetDirs = new Map<string, string[]>();

  // Create .agents/ structure
  await ensureDir(path.join(agentsDir, "skills"));
  await ensureDir(path.join(agentsDir, "commands"));
  await ensureDir(path.join(agentsDir, "agents"));
  await ensureDir(path.join(agentsDir, "backups"));

  // Write default TOML config
  const toolsList = tools || ["claude", "cursor"];
  const toolsLine = `tools = [${toolsList.map((t) => `"${t}"`).join(", ")}]`;

  await outputFile(path.join(agentsDir, "agentsync.toml"), `${toolsLine}\n`);

  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
    async addSkill(name, content) {
      const skillDir = path.join(agentsDir, "skills", name);
      await ensureDir(skillDir);
      await outputFile(
        path.join(skillDir, "SKILL.md"),
        content ||
          `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n`,
      );
    },
    async addCommand(name, content) {
      await outputFile(
        path.join(agentsDir, "commands", `${name}.md`),
        content || `---\ndescription: ${name} command\n---\n\n# ${name}\n`,
      );
    },
    async addAgent(name, content) {
      await outputFile(
        path.join(agentsDir, "agents", `${name}.md`),
        content ||
          `---\nname: ${name}\ndescription: ${name} agent\n---\n\n# ${name}\n`,
      );
    },
    async addDocs(content) {
      await outputFile(
        path.join(agentsDir, "AGENTS.md"),
        content || "# Project\n\nProject documentation.\n",
      );
    },
    async setConfig(toml) {
      await outputFile(path.join(agentsDir, "agentsync.toml"), toml);
    },
    async addPresetSkill(namespace, name, content) {
      const presetBase = path.join(dir, `preset-${namespace}`);
      const skillDir = path.join(presetBase, "skills", name);
      await ensureDir(skillDir);
      await outputFile(
        path.join(skillDir, "SKILL.md"),
        content ||
          `---\nname: ${name}\ndescription: Preset ${namespace} ${name}\n---\n\n# ${name}\n`,
      );
      if (!presetDirs.has(namespace)) presetDirs.set(namespace, []);
      const dirs = presetDirs.get(namespace)!;
      const base = path.join(presetBase, "skills");
      if (!dirs.includes(base)) dirs.push(base);
      return presetBase;
    },
    getPresetMap() {
      return new Map(presetDirs);
    },
  };
}
