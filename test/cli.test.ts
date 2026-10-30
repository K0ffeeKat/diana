import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
} = WORKSPACE_CONSTANTS;

const { dianaWorkspaceExistsError } = COMMAND_INIT_ERRORS;
const { noSourcesConfiguredError } = COMMAND_INDEX_ERRORS;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(projectRoot, "dist", "cli.js");

function expectCliFailure(directory: string, command: string, message: string) {
  const result = spawnSync(process.execPath, [cliPath, command], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(`Error: ${message.trim()}\n`);
}

describe("diana init", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("creates empty configs and explains how to configure and index the workspace", async () => {
    const result = spawnSync(process.execPath, [cliPath, "init"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(configFileName);
    expect(result.stdout).toContain(
      `${internalDirName}/${localConfigFileName}`
    );
    expect(result.stdout).toContain("diana index");

    const pathToConfig = join(directory, configFileName);
    const internalDirPath = join(directory, internalDirName);
    const pathToGitIgnore = join(internalDirPath, internalGitIgnoreName);
    const localConfigPath = join(internalDirPath, localConfigFileName);
    const expectedConfig = { version: 1, sources: [] };

    expect(JSON.parse(await readFile(pathToConfig, "utf8"))).toEqual(
      expectedConfig
    );
    expect(JSON.parse(await readFile(localConfigPath, "utf8"))).toEqual(
      expectedConfig
    );
    expect(await readFile(pathToGitIgnore, "utf8")).toBe(
      "index.sqlite\n*\n!.gitignore\n"
    );
  });

  it("reports a clear error when configuration file is present", async () => {
    await writeFile(
      join(directory, configFileName),
      JSON.stringify({ version: 1, sources: [] })
    );

    expectCliFailure(
      directory,
      "init",
      dianaWorkspaceExistsError(await realpath(directory))
    );
  });

  it("reports a clear error when .diana/ is present", async () => {
    const internalDirPath = join(directory, internalDirName);
    await mkdir(internalDirPath);

    expectCliFailure(
      directory,
      "init",
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

  it("throws an error when config has empty sources", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });

    expectCliFailure(directory, "index", noSourcesConfiguredError);
  });

  it("does not index protected or hidden directories", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const notesDirectory = join(directory, "notes");
    await mkdir(join(notesDirectory, ".git"), { recursive: true });
    await mkdir(join(notesDirectory, ".diana"), { recursive: true });
    await mkdir(join(notesDirectory, ".obsidian"), { recursive: true });
    await writeFile(
      join(notesDirectory, ".git", "secret.md"),
      "This mustneverbeindexed."
    );
    await writeFile(
      join(notesDirectory, ".diana", "secret.md"),
      "This mustneverbeindexed."
    );
    await writeFile(
      join(notesDirectory, ".obsidian", "secret.md"),
      "This mustneverbeindexed."
    );

    const config: DianaConfig = {
      version: 1,
      sources: [
        {
          path: notesDirectory,
          include: ["**/*.md"],
          exclude: [],
        },
      ],
    };

    await writeFile(
      join(directory, configFileName),
      JSON.stringify(config, null, 2)
    );

    execFileSync(process.execPath, [cliPath, "index"], { cwd: directory });

    const output = execFileSync(
      process.execPath,
      [cliPath, "search", "mustneverbeindexed"],
      { cwd: directory, encoding: "utf8" }
    );

    expect(JSON.parse(output)).toEqual([]);
  });
});
