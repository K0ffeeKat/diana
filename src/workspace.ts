import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ConfiguredSource,
  DianaConfig,
  Workspace,
} from "./types/workspace.types.js";
import { configSchema } from "./types/workspace.types.js";
import { hasErrorCode } from "./utils/hasErrorCode.js";

export const WORKSPACE_CONSTANTS = {
  configFileName: "diana.config.json",
  internalDirName: ".diana",
  localConfigFileName: "local.config.json",
  internalGitIgnoreName: ".gitignore",
  databaseFileName: "index.sqlite",
} as const;

const { configFileName, internalDirName, localConfigFileName } =
  WORKSPACE_CONSTANTS;

export const WORKSPACE_ERRORS = {
  noConfigFileError: (directory: string) =>
    `No configuration file found at ${directory}. Run "diana init" to create ${configFileName}.`,
  invalidJsonError: (configPath: string) =>
    `Invalid Diana configuration at ${configPath}: invalid JSON.`,
  invalidConfigError: (configPath: string) =>
    `Invalid Diana configuration at ${configPath}`,
} as const;

const { noConfigFileError, invalidJsonError, invalidConfigError } =
  WORKSPACE_ERRORS;

export async function loadWorkspace(
  startDirectory: string
): Promise<Workspace> {
  const directory = resolve(startDirectory);

  const configPath = join(directory, configFileName);
  const config = await readConfig(configPath);

  if (config === undefined) {
    throw new Error(noConfigFileError(directory));
  }

  const localConfigPath = join(directory, internalDirName, localConfigFileName);

  const localConfig = await readConfig(localConfigPath);

  const configuredSharedSources = config.sources.map(
    (source): ConfiguredSource => ({
      ...source,
      origin: "shared",
    })
  );

  const configuredLocalSources =
    localConfig?.sources.map((source): ConfiguredSource => ({
      ...source,
      origin: "local",
    })) ?? [];

  return {
    root: directory,
    configPath,
    sources: [...configuredSharedSources, ...configuredLocalSources],
  };
}

async function readConfig(
  configPath: string
): Promise<DianaConfig | undefined> {
  let contents: string;

  try {
    contents = await readFile(configPath, "utf-8");
  } catch (e: unknown) {
    const checkResult = hasErrorCode(e, "ENOENT");

    if (checkResult) {
      return undefined;
    }

    throw e;
  }

  return parseConfig(contents, configPath);
}

function parseConfig(contents: string, configPath: string): DianaConfig {
  let value: unknown;

  try {
    value = JSON.parse(contents);
  } catch (e) {
    throw new Error(invalidJsonError(configPath));
  }

  const parsedConfig = configSchema.safeParse(value);

  if (!parsedConfig.success || parsedConfig.data.version !== 1) {
    throw new Error(invalidConfigError(configPath));
  }

  return parsedConfig.data;
}
