import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileByMode } from "../../../src/sync/write-file.js";
import { ensureDir, outputFile } from "../../../src/utils/fs.js";

describe("writeFileByMode", () => {
  let project: string;
  let outside: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), "agentsync-writer-project-"));
    outside = await mkdtemp(path.join(tmpdir(), "agentsync-writer-source-"));
  });

  afterEach(async () => {
    await Promise.all([
      rm(project, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  it.runIf(process.platform !== "win32")(
    "replaces its exact external source link idempotently",
    async () => {
      const source = path.join(outside, "review.md");
      const destination = path.join(
        project,
        ".claude",
        "commands",
        "review.md",
      );
      await outputFile(source, "review\n");

      await writeFileByMode(source, destination, "link", project);
      await writeFileByMode(source, destination, "link", project);

      expect((await lstat(destination)).isSymbolicLink()).toBe(true);
      expect(
        path.resolve(path.dirname(destination), await readlink(destination)),
      ).toBe(source);
      expect(await readFile(destination, "utf-8")).toBe("review\n");
    },
  );

  it.runIf(process.platform !== "win32")(
    "materializes bytes when changing an exact source link to copy mode",
    async () => {
      const source = path.join(outside, "review.md");
      const destination = path.join(
        project,
        ".claude",
        "commands",
        "review.md",
      );
      await outputFile(source, "review\n");
      await writeFileByMode(source, destination, "link", project);

      await writeFileByMode(source, destination, "copy", project);

      expect((await lstat(destination)).isSymbolicLink()).toBe(false);
      expect(await readFile(destination, "utf-8")).toBe("review\n");
      expect(await readFile(source, "utf-8")).toBe("review\n");
    },
  );

  it.runIf(process.platform !== "win32")(
    "materializes a symlinked source in copy mode",
    async () => {
      const target = path.join(outside, "target.md");
      const source = path.join(outside, "source.md");
      const destination = path.join(
        project,
        ".claude",
        "commands",
        "review.md",
      );
      await outputFile(target, "review\n");
      await symlink(target, source);

      await writeFileByMode(source, destination, "copy", project);

      expect((await lstat(destination)).isSymbolicLink()).toBe(false);
      expect(await readFile(destination, "utf-8")).toBe("review\n");
    },
  );

  it.runIf(process.platform !== "win32")(
    "rejects an unrelated external destination link",
    async () => {
      const source = path.join(outside, "source.md");
      const unrelated = path.join(outside, "unrelated.md");
      const destination = path.join(
        project,
        ".claude",
        "commands",
        "review.md",
      );
      await outputFile(source, "new\n");
      await outputFile(unrelated, "keep\n");
      await ensureDir(path.dirname(destination));
      await symlink(unrelated, destination);

      await expect(
        writeFileByMode(source, destination, "copy", project),
      ).rejects.toThrow(/outside the project/);

      expect(await readFile(unrelated, "utf-8")).toBe("keep\n");
      expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    },
  );
});
