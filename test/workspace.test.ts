import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadWorkspace, WORKSPACE_CONSTANTS } from "../src/workspace";
import { DianaConfig, Workspace } from "../src/types/workspace.types";

const { configFileName } = WORKSPACE_CONSTANTS;

const validConfig: DianaConfig = {
  version: 1,
  sources: [],
};

describe("loadWorkspace", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "diana-workspace-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("finds a config in the supplied directory", async () => {
    await writeFile(
      join(directory, configFileName),
      JSON.stringify(validConfig)
    );

    const workspace = await loadWorkspace(directory);

    const expectedOutput: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      config: validConfig,
    };

    expect(workspace).toMatchObject(expectedOutput);
  });
});
