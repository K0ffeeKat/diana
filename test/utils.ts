import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempTestDir() {
  return await mkdtemp(join(tmpdir(), "diana-workspace-"));
}

export async function removeTestDir(directory: string) {
  await rm(directory, { recursive: true, force: true });
}
