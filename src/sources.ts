import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConfiguredSource, Workspace } from "./types/workspace.types.js";
import type { ResolvedSource } from "./types/source.types.js";

export const SOURCE_ERRORS = {
  sourceMustBeDirError: (sourceId: string, sourceRoot: string) =>
    `Source ${sourceId} must be a directory: ${sourceRoot}.`,
} as const;

const { sourceMustBeDirError } = SOURCE_ERRORS;

export async function resolveSources(
  workspace: Workspace
): Promise<ResolvedSource[]> {
  const sourcePromises: Promise<ResolvedSource>[] = [];

  workspace.sources.forEach((source) => {
    sourcePromises.push(resolveSource(workspace.root, source));
  });

  return Promise.all(sourcePromises);
}

async function resolveSource(
  workspaceRoot: string,
  source: ConfiguredSource
): Promise<ResolvedSource> {
  const configuredPath = resolve(workspaceRoot, source.path);
  const sourceRoot = await realpath(configuredPath);
  const sourceStats = await stat(sourceRoot);

  if (!sourceStats.isDirectory()) {
    throw new Error(sourceMustBeDirError(source.id, sourceRoot));
  }

  return {
    ...source,
    sourceRoot,
  };
}
