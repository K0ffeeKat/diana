import { beforeEach, expect, afterEach, describe, it } from "vitest";
import { join } from "node:path";
import { mkdir, realpath } from "node:fs/promises";

import { Workspace } from "../src/types/workspace.types.js";
import { WORKSPACE_CONSTANTS } from "../src/workspace.js";
import { resolveSources } from "../src/sources.js";
import { createTempTestDir, removeTestDir } from "./utils.js";

const { configFileName } = WORKSPACE_CONSTANTS;

describe("resolveSources", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("resolves a shared relative source inside the workspace", async () => {
    const sourceDirectory = join(directory, "notes");
    await mkdir(sourceDirectory);

    const workspace: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [
        {
          id: "project",
          path: "notes",
          include: ["**/*.md"],
          exclude: [".git/**"],
          origin: "shared",
        },
      ],
    };

    const [source] = await resolveSources(workspace);

    expect(source).toMatchObject({
      ...workspace.sources[0],
      sourceRoot: await realpath(sourceDirectory),
    });
  });
});
