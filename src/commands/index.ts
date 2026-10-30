import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { resolveSources } from "../sources.js";
import { WORKSPACE_CONSTANTS, loadWorkspace } from "../workspace.js";

const { databaseFileName, internalDirName } = WORKSPACE_CONSTANTS;

export const COMMAND_INDEX_ERRORS = {
  noSourcesConfiguredError:
    "No sources configured. Add a source to diana.config.json or .diana/local.config.json.",
} as const;

const { noSourcesConfiguredError } = COMMAND_INDEX_ERRORS;

export async function indexWorkspace(workspaceRoot: string): Promise<void> {
  const workspace = await loadWorkspace(workspaceRoot);

  if (workspace.sources.length === 0) {
    throw new Error(noSourcesConfiguredError);
  }

  await resolveSources(workspace);

  const databasePath = join(workspace.root, internalDirName, databaseFileName);
  const database = new DatabaseSync(databasePath);

  database.close();
}
