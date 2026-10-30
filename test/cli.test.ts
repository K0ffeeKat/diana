import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";

import { createTempTestDir, removeTestDir } from "./utils.js";
import { WORKSPACE_CONSTANTS } from "../src/workspace.js";
import { COMMAND_INIT_ERRORS } from "../src/commands/init.js";
import { COMMAND_INDEX_ERRORS } from "../src/commands/index.js";
import type { DianaConfig } from "../src/types/workspace.types.js";

const {
  configFileName,
  internalDirName,
  internalGitIgnoreName,
  localConfigFileName,
  databaseFileName,
} = WORKSPACE_CONSTANTS;

const { dianaWorkspaceExistsError } = COMMAND_INIT_ERRORS;
const { noSourcesConfiguredError } = COMMAND_INDEX_ERRORS;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(projectRoot, "dist", "cli.js");

describe("diana init", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("initializes diana correctly", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });

    const pathToConfig = join(directory, configFileName);
    const internalDirPath = join(directory, internalDirName);
    const pathToGitIgnore = join(internalDirPath, internalGitIgnoreName);
    const localConfigPath = join(internalDirPath, localConfigFileName);

    expect(existsSync(pathToConfig)).toBe(true);
    expect(existsSync(pathToGitIgnore)).toBe(true);
    expect(existsSync(localConfigPath)).toBe(true);

    expect(await readFile(pathToConfig, "utf8")).toBe(
      '{\n  "version": 1,\n  "sources": []\n}\n'
    );
    expect(await readFile(pathToGitIgnore, "utf8")).toBe(
      "index.sqlite\n*\n!.gitignore\n"
    );
    expect(await readFile(localConfigPath, "utf8")).toBe(
      '{\n  "version": 1,\n  "sources": []\n}\n'
    );
  });

  it("throws a clear error when configuration file is present", async () => {
    await writeFile(
      join(directory, configFileName),
      JSON.stringify({ version: 1, sources: [] })
    );

    const script = () => {
      execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    };

    expect(script).toThrow(
      dianaWorkspaceExistsError(await realpath(directory))
    );
  });

  it("throws a clear error when .diana/ is present", async () => {
    const internalDirPath = join(directory, internalDirName);
    await mkdir(internalDirPath);

    const script = () => {
      execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    };

    expect(script).toThrow(
      dianaWorkspaceExistsError(await realpath(directory))
    );
  });
});

describe("diana index", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("creates database correctly when config has valid sources", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const dummyKnoweldgeBasePath = join(directory, "notes");

    await mkdir(dummyKnoweldgeBasePath);
    await writeFile(
      join(dummyKnoweldgeBasePath, "DUMMY_NOTE.md"),
      "* DUMMY NOTE\n"
    );

    const configOverride: DianaConfig = {
      version: 1,
      sources: [
        {
          path: dummyKnoweldgeBasePath,
          include: ["**/*.md"],
          exclude: [],
        },
      ],
    };

    const pathToSharedConfig = join(directory, configFileName);

    await writeFile(
      pathToSharedConfig,
      JSON.stringify(configOverride, null, 2)
    );

    execFileSync(process.execPath, [cliPath, "index"], { cwd: directory });

    const pathToDatabase = join(directory, internalDirName, databaseFileName);

    expect(existsSync(pathToDatabase)).toBe(true);
  });

  it("throws when a configured source does not exist", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const dummyKnoweldgeBasePath = join(directory, "notes");

    const configOverride: DianaConfig = {
      version: 1,
      sources: [
        {
          path: dummyKnoweldgeBasePath,
          include: ["**/*.md"],
          exclude: [],
        },
      ],
    };

    const pathToSharedConfig = join(directory, configFileName);

    await writeFile(
      pathToSharedConfig,
      JSON.stringify(configOverride, null, 2)
    );

    const throwable = () => {
      execFileSync(process.execPath, [cliPath, "index"], { cwd: directory });
    };

    expect(throwable).toThrow("Source does not exist");
  });

  it("throws an error when config has empty sources", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });

    const throwable = () => {
      execFileSync(process.execPath, [cliPath, "index"], { cwd: directory });
    };

    expect(throwable).toThrow(noSourcesConfiguredError);
  });
});
