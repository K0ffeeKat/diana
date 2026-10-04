import { beforeEach, expect, afterEach, describe, it } from "vitest";
import { join } from "node:path";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";

import type { Workspace } from "../src/types/workspace.types.js";
import { WORKSPACE_CONSTANTS } from "../src/workspace.js";
import { resolveSources, SOURCE_ERRORS } from "../src/sources.js";
import { createTempTestDir, removeTestDir } from "./utils.js";

const { configFileName } = WORKSPACE_CONSTANTS;
const {
  sourceDoesNotExistError,
  sourceMustBeDirError,
  sharedSourceOutsideWorkspaceError,
} = SOURCE_ERRORS;

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

  it("rejects a source path that does not exist", async () => {
    const sourcePath = join(
      await realpath(directory),
      "missing-notes"
    );

    const workspace: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [
        {
          id: "project",
          path: "missing-notes",
          include: ["**/*.md"],
          exclude: [".git/**"],
          origin: "shared",
        },
      ],
    };

    await expect(resolveSources(workspace)).rejects.toThrow(
      sourceDoesNotExistError("project", sourcePath)
    );
  });

  it("rejects a source path that is a file", async () => {
    const sourceFile = join(directory, "notes.md");
    await writeFile(sourceFile, "# Notes\n");

    const workspace: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [
        {
          id: "project",
          path: "notes.md",
          include: ["**/*.md"],
          exclude: [".git/**"],
          origin: "shared",
        },
      ],
    };

    const sourceRoot = await realpath(sourceFile);

    await expect(resolveSources(workspace)).rejects.toThrow(
      sourceMustBeDirError("project", sourceRoot)
    );
  });

  it("rejects a shared source outside the workspace", async () => {
    const sourceRoot = await realpath(join(directory, ".."));

    const workspace: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [
        {
          id: "project",
          path: "..",
          include: ["**/*.md"],
          exclude: [".git/**"],
          origin: "shared",
        },
      ],
    };

    await expect(resolveSources(workspace)).rejects.toThrow(
      sharedSourceOutsideWorkspaceError("project", sourceRoot)
    );
  });

  it("allows a local source outside the workspace", async () => {
    const sourceRoot = await realpath(join(directory, ".."));

    const workspace: Workspace = {
      root: directory,
      configPath: join(directory, configFileName),
      sources: [
        {
          id: "personal",
          path: "..",
          include: ["**/*.md"],
          exclude: [".git/**"],
          origin: "local",
        },
      ],
    };

    const [source] = await resolveSources(workspace);

    expect(source).toMatchObject({
      ...workspace.sources[0],
      sourceRoot,
    });
  });

  it("rejects a shared source symlink that escapes the workspace", async () => {
    const externalDirectory = await createTempTestDir();
    const sourcePath = join(directory, "linked-notes");
    const sourceRoot = await realpath(externalDirectory);

    try {
      await symlink(
        externalDirectory,
        sourcePath,
        process.platform === "win32" ? "junction" : "dir"
      );

      const workspace: Workspace = {
        root: directory,
        configPath: join(directory, configFileName),
        sources: [
          {
            id: "project",
            path: "linked-notes",
            include: ["**/*.md"],
            exclude: [".git/**"],
            origin: "shared",
          },
        ],
      };

      await expect(resolveSources(workspace)).rejects.toThrow(
        sharedSourceOutsideWorkspaceError("project", sourceRoot)
      );
    } finally {
      await removeTestDir(externalDirectory);
    }
  });
});
