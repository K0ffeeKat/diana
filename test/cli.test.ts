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

  it("indexes Markdown sections for search", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const notesDirectory = join(directory, "notes");
    await mkdir(notesDirectory);
    await writeFile(
      join(notesDirectory, "architecture.md"),
      "# Architecture\n\n## Token Rotation\n\nTamarind is the unique retrieval term.\n"
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
      [cliPath, "search", "tamarind"],
      { cwd: directory, encoding: "utf8" }
    );
    const results = JSON.parse(output);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "architecture.md",
      title: "Architecture",
      heading: "Token Rotation",
      anchor: "token-rotation",
    });
    expect(results[0].excerpt).toContain("Tamarind");
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

  it("applies include and exclude patterns", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const notesDirectory = join(directory, "notes");
    await mkdir(join(notesDirectory, "nested"), { recursive: true });
    await writeFile(
      join(notesDirectory, "included.md"),
      "This includableterm should be searchable."
    );
    await writeFile(
      join(notesDirectory, "excluded.md"),
      "This excludedterm should not be searchable."
    );
    await writeFile(
      join(notesDirectory, "nested", "excluded.md"),
      "This excludedterm should not be searchable."
    );

    const config: DianaConfig = {
      version: 1,
      sources: [
        {
          path: notesDirectory,
          include: ["**/*.md"],
          exclude: ["excluded.md", "nested/**"],
        },
      ],
    };

    await writeFile(
      join(directory, configFileName),
      JSON.stringify(config, null, 2)
    );

    execFileSync(process.execPath, [cliPath, "index"], { cwd: directory });

    const includedOutput = execFileSync(
      process.execPath,
      [cliPath, "search", "includableterm"],
      { cwd: directory, encoding: "utf8" }
    );
    const excludedOutput = execFileSync(
      process.execPath,
      [cliPath, "search", "excludedterm"],
      { cwd: directory, encoding: "utf8" }
    );

    expect(JSON.parse(includedOutput)).toHaveLength(1);
    expect(JSON.parse(excludedOutput)).toEqual([]);
  });
});

describe("diana read", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempTestDir();
  });

  afterEach(async () => await removeTestDir(directory));

  it("returns a faithful requested section", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const notesDirectory = join(directory, "notes");
    const notePath = join(notesDirectory, "architecture.md");
    await mkdir(notesDirectory);
    await writeFile(
      notePath,
      "# Architecture\n\nIntroduction text.\n\n## Token Rotation\n\nTamarind is the rotation term.\n\n## Unrelated\n\nThis must not be returned.\n"
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

    const output = execFileSync(
      process.execPath,
      [cliPath, "read", notePath, "--section", "token-rotation"],
      { cwd: directory, encoding: "utf8" }
    );
    const result = JSON.parse(output);

    expect(result).toMatchObject({
      path: "architecture.md",
      truncated: false,
    });
    expect(result.content).toContain("## Token Rotation");
    expect(result.content).toContain("Tamarind is the rotation term.");
    expect(result.content).not.toContain("## Unrelated");
  });

  it("bounds read output", async () => {
    execFileSync(process.execPath, [cliPath, "init"], { cwd: directory });
    const notesDirectory = join(directory, "notes");
    const notePath = join(notesDirectory, "large.md");
    await mkdir(notesDirectory);
    await writeFile(notePath, "x".repeat(70 * 1024));

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

    const output = execFileSync(process.execPath, [cliPath, "read", notePath], {
      cwd: directory,
      encoding: "utf8",
    });
    const result = JSON.parse(output);

    expect(result.truncated).toBe(true);
    expect(result.content).toHaveLength(64 * 1024);
  });
});
