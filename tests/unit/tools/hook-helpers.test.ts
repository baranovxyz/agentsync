import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../../src/core/errors.js";
import {
  materializeHookCommand,
  materializeProjectedHookCommand,
  previewHookCommandFile,
  previewHookCommandFiles,
  projectHookCommand,
} from "../../../src/tools/hook-helpers.js";
import { ensureDir, outputFile, pathExists } from "../../../src/utils/fs.js";

describe("hook script materialization", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "agentsync-hooks-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("preserves relative hierarchy for concurrent same-basename scripts", async () => {
    const commands = [
      ".agents/hooks/scripts/a/check.sh",
      ".agents/hooks/scripts/b/check.sh",
    ];
    await Promise.all(
      commands.map((command, index) =>
        outputFile(path.join(tmpDir, command), `#!/bin/sh\necho ${index}\n`),
      ),
    );

    const generated = await Promise.all(
      commands.map((command) =>
        materializeHookCommand(command, tmpDir, ".cursor/hooks"),
      ),
    );

    expect(generated).toEqual([
      ".cursor/hooks/a/check.sh",
      ".cursor/hooks/b/check.sh",
    ]);
    expect(await readFile(path.join(tmpDir, generated[0]), "utf-8")).toContain(
      "echo 0",
    );
    expect(await readFile(path.join(tmpDir, generated[1]), "utf-8")).toContain(
      "echo 1",
    );
  });

  it("leaves escaping and argument-bearing commands unchanged", async () => {
    expect(
      await materializeHookCommand("../outside.sh", tmpDir, ".cursor/hooks"),
    ).toBe("../outside.sh");
    expect(
      await materializeHookCommand(
        ".agents/hooks/scripts/check.sh --verbose",
        tmpDir,
        ".cursor/hooks",
      ),
    ).toBe(".agents/hooks/scripts/check.sh --verbose");
    expect(await pathExists(path.join(tmpDir, ".cursor", "hooks"))).toBe(false);
  });

  it("does not inspect a destination when its canonical source is missing", async () => {
    const command = ".agents/hooks/scripts/missing.sh";
    const destination = path.join(tmpDir, ".cursor", "hooks", "missing.sh");
    await mkdir(destination, { recursive: true });

    await expect(
      previewHookCommandFile(command, tmpDir, ".cursor/hooks"),
    ).resolves.toBeUndefined();
    await expect(
      materializeHookCommand(command, tmpDir, ".cursor/hooks"),
    ).resolves.toBe(command);
  });

  it("fails when a source disappears after its materialization was projected", async () => {
    const command = ".agents/hooks/scripts/audit.sh";
    const source = path.join(tmpDir, command);
    const destination = path.join(tmpDir, ".cursor/hooks/audit.sh");
    await outputFile(source, "#!/bin/sh\n");
    const projection = await projectHookCommand(
      command,
      tmpDir,
      ".cursor/hooks",
    );
    await rm(source);

    await expect(
      materializeProjectedHookCommand(projection, tmpDir, ".cursor/hooks"),
    ).rejects.toMatchObject({
      name: "ConfigError",
      suggestion: expect.stringContaining("Restore the projected hook source"),
    });
    expect(await pathExists(destination)).toBe(false);
  });

  it("leaves commands already inside the provider hook directory unowned", async () => {
    const command = ".cursor/hooks/manual.sh";
    await outputFile(path.join(tmpDir, command), "#!/bin/sh\necho manual\n");

    await expect(
      previewHookCommandFile(command, tmpDir, ".cursor/hooks"),
    ).resolves.toBeUndefined();
    await expect(
      materializeHookCommand(command, tmpDir, ".cursor/hooks"),
    ).resolves.toBe(command);
    expect(
      await pathExists(
        path.join(tmpDir, ".cursor", "hooks", ".cursor", "hooks", "manual.sh"),
      ),
    ).toBe(false);
  });

  it("rejects different sources that project to the same destination", async () => {
    const commands = [
      ".agents/hooks/scripts/scripts/audit.sh",
      "scripts/audit.sh",
    ];
    await Promise.all(
      commands.map((command) =>
        outputFile(path.join(tmpDir, command), "#!/bin/sh\n"),
      ),
    );

    await expect(
      previewHookCommandFiles(commands, tmpDir, ".cursor/hooks"),
    ).rejects.toThrow(
      'resolve to the same generated destination ".cursor/hooks/scripts/audit.sh"',
    );
  });

  it.runIf(process.platform !== "win32")(
    "does not follow a source symlink outside the project",
    async () => {
      const outsideDir = await mkdtemp(
        path.join(tmpdir(), "agentsync-secret-"),
      );
      try {
        const outside = path.join(outsideDir, "secret.txt");
        const command = ".agents/hooks/scripts/leak.sh";
        await outputFile(outside, "not project content");
        await ensureDir(path.dirname(path.join(tmpDir, command)));
        await symlink(outside, path.join(tmpDir, command));

        expect(
          await materializeHookCommand(command, tmpDir, ".cursor/hooks"),
        ).toBe(command);
        expect(
          await pathExists(path.join(tmpDir, ".cursor", "hooks", "leak.sh")),
        ).toBe(false);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "does not create directories through a destination-root symlink",
    async () => {
      const outsideDir = await mkdtemp(
        path.join(tmpdir(), "agentsync-hooks-out-"),
      );
      try {
        const command = ".agents/hooks/scripts/nested/check.sh";
        await outputFile(path.join(tmpDir, command), "#!/bin/sh\n");
        await ensureDir(path.join(tmpDir, ".cursor"));
        await symlink(outsideDir, path.join(tmpDir, ".cursor", "hooks"));

        await expect(
          materializeHookCommand(command, tmpDir, ".cursor/hooks"),
        ).rejects.toBeInstanceOf(ConfigError);
        expect(await pathExists(path.join(outsideDir, "nested"))).toBe(false);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    },
  );
});
