import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { WORKSPACE_CONSTANTS } from "../workspace.js";
import { configTemplate } from "../templates/config.template.js";
import { gitIgnoreTemplate } from "../templates/gitignore.template.js";
import { pathExists } from "../utils/pathExists.js";

const {
  configFileName,
  internalDirName,
  internalGitIgnoreName,
  localConfigFileName,
} = WORKSPACE_CONSTANTS;

export const COMMAND_INIT_ERRORS = {
  dianaWorkspaceExistsError: (workspaceRoot: string) =>
    `\nDiana workspace already exists at ${workspaceRoot}.\nRemove ${configFileName} and ${internalDirName}/, then call <diana init> for re-initialization.\n`,
} as const;

const { dianaWorkspaceExistsError } = COMMAND_INIT_ERRORS;

export async function initializeWorkspace(
  workspaceRoot: string
): Promise<void> {
  const pathToSharedConfig = join(workspaceRoot, configFileName);
  const pathToInternalDir = join(workspaceRoot, internalDirName);
  const pathToGitIgnore = join(pathToInternalDir, internalGitIgnoreName);
  const pathToLocalConfig = join(pathToInternalDir, localConfigFileName);

  const [sharedConfigExists, internalDirExists] = await Promise.all([
    pathExists(pathToSharedConfig),
    pathExists(pathToInternalDir),
  ]);

  if (sharedConfigExists || internalDirExists) {
    throw new Error(dianaWorkspaceExistsError(workspaceRoot));
  }

  const sharedConfig = `${JSON.stringify(configTemplate, null, 2)}\n`;

  await writeFile(pathToSharedConfig, sharedConfig, {
    flag: "wx",
  });
  await mkdir(pathToInternalDir);
  await writeFile(pathToGitIgnore, gitIgnoreTemplate, {
    flag: "wx",
  });
  await writeFile(pathToLocalConfig, sharedConfig, {
    flag: "wx",
  });
}
