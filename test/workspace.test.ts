import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadWorkspace,
  WORKSPACE_CONSTANTS,
  WORKSPACE_ERRORS,
} from "../src/workspace.js";
import type {
  ConfiguredSource,
  DianaConfig,
  Workspace,
} from "../src/types/workspace.types.js";
import { createTempTestDir, removeTestDir } from "./utils.js";

const { configFileName, localConfigFileName, internalDirName } =
  WORKSPACE_CONSTANTS;

const {
  noConfigFileError,
  invalidConfigError,
  invalidJsonError,
  duplicateSourceIdError,
} = WORKSPACE_ERRORS;

const validConfig: DianaConfig = {
  version: 1,
  sources: [],
};

describe("loadWorkspace", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("finds a config in the supplied directory", async () => {
    await writeFile(
      join(directory, configFileName),
      JSON.stringify(validConfig)
    );

    const workspace = await loadWorkspace(directory);

    const expectedOutput: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [],
    };

    expect(workspace).toMatchObject(expectedOutput);
  });

  it("throws when no config is found", async () => {
    const expectedError = noConfigFileError(directory);
    await expect(loadWorkspace(directory)).rejects.toThrow(expectedError);
  });

  it("throws a clear error for invalid JSON", async () => {
    const configPath = join(directory, configFileName);
    const expectedError = invalidJsonError(configPath);
    await writeFile(configPath, "{invalidJSON");

    await expect(loadWorkspace(directory)).rejects.toThrow(expectedError);
  });

  it("throws a clear error for invalid configuration shape", async () => {
    const configPath = join(directory, configFileName);
    const expectedError = invalidConfigError(configPath);

    const badConfig = {
      version: 2,
      sources: { someKey: "someValue" },
    };

    await writeFile(configPath, JSON.stringify(badConfig));

    await expect(loadWorkspace(directory)).rejects.toThrow(expectedError);
  });

  it("merges sources from an optional local config", async () => {
    const localConfig: DianaConfig = {
      version: 1,
      sources: [
        {
          id: "personal",
          path: "/personal-notes",
          include: ["**/*.md"],
          exclude: [".git/**"],
        },
      ],
    };

    const localConfigDirectory = join(directory, internalDirName);

    await mkdir(localConfigDirectory);

    await writeFile(
      join(directory, configFileName),
      JSON.stringify(validConfig)
    );
    await writeFile(
      join(localConfigDirectory, localConfigFileName),
      JSON.stringify(localConfig)
    );

    const workspace = await loadWorkspace(directory);

    expect(workspace.sources).toEqual([
      {
        ...localConfig.sources[0],
        origin: "local",
      },
    ]);
  });

  it("trows when shared and local configs reuse a source ID", async () => {
    const sharedConfig: DianaConfig = {
      version: 1,
      sources: [
        {
          id: "notes",
          path: "docs",
          include: ["**/*.md"],
          exclude: [".git/**"],
        },
      ],
    };

    const localConfig: DianaConfig = {
      version: 1,
      sources: [
        {
          id: "notes",
          path: "/personal-notes",
          include: ["**/*.md"],
          exclude: [".git/**"],
        },
      ],
    };

    const localConfigDirectory = join(directory, internalDirName);

    await mkdir(localConfigDirectory);

    await writeFile(
      join(directory, configFileName),
      JSON.stringify(sharedConfig)
    );
    await writeFile(
      join(localConfigDirectory, localConfigFileName),
      JSON.stringify(localConfig)
    );

    await expect(loadWorkspace(directory)).rejects.toThrow(
      duplicateSourceIdError("notes")
    );
  });
});
