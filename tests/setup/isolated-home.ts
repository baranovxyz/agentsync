import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

export default async function setup(): Promise<() => Promise<void>> {
  const testHome = await mkdtemp(path.join(tmpdir(), "agentsync-vitest-home-"));
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;

  return async () => {
    await rm(testHome, { recursive: true, force: true });
  };
}
