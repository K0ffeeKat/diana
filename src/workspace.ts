import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DianaConfig, Workspace } from "./types/workspace.types.js";
import { configSchema } from "./types/workspace.types.js";
import { hasErrorCode } from "./utils/hasErrorCode.js";

export const WORKSPACE_CONSTANTS = {
  configFileName: "diana.config.json",
} as const;

const { configFileName } = WORKSPACE_CONSTANTS;

export async function loadWorkspace(
  startDirectory: string
): Promise<Workspace> {
  const directory = resolve(startDirectory);

  const configPath = join(directory, configFileName);
  const config = await readConfig(configPath);

  if (!config) {
    throw new Error(
      `No configuration file found at ${directory}. Run "diana init" to create ${configFileName}.`
    );
  }

  return {
    root: directory,
    configPath,
    config,
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

    if (checkResult instanceof Error) {
      throw checkResult;
    }

    if (checkResult) {
      return undefined;
    }

    throw e;
  }

  return parseConfig(contents, configPath);
}

function parseConfig(contents: string, configPath: string): DianaConfig {
  let value: unknown;

  const invalidJsonError = `Invalid Diana configuration at ${configPath}: invalid JSON.`;
  const invalidConfigError = `Invalid Diana configuration at ${configPath}`;

  try {
    value = JSON.parse(contents);
  } catch (e) {
    throw new Error(invalidJsonError);
  }

  const parsedConfig = configSchema.safeParse(value);

  if (!parsedConfig.success || parsedConfig.data.version !== 1) {
    throw new Error(invalidConfigError);
  }

  return parsedConfig.data;
}
